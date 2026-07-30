/* Pack selection, ripping, and the card-by-card reveal stack. */
window.RG = window.RG || {};

RG.gacha = (() => {
  const PACK_SIZE = 5;
  // weights per slot: [standard, reverse, holo, fullart, cosmic]
  const SLOT_WEIGHTS = [
    [56, 22, 13, 6, 3],
    [56, 22, 13, 6, 3],
    [48, 26, 15, 7, 4],
    [30, 36, 21, 9, 4],
    [0, 44, 30, 16, 10], // final slot always shines
  ];

  const shelf = document.getElementById('pack-shelf');
  const stage = document.getElementById('pack-stage');
  const stageSlot = stage.querySelector('.stage-pack-slot');
  const revealStage = document.getElementById('reveal-stage');
  const stackEl = document.getElementById('reveal-stack');
  const counterEl = document.getElementById('reveal-counter');
  const doneEl = document.getElementById('reveal-done');
  const summaryEl = document.getElementById('reveal-summary');

  let results = [];   // [{card, rank, badge}]
  let idx = 0;        // current top card index
  let busy = false;
  let lastPackIndex = 0;

  /* ---------- rolling ---------- */

  function rollRank(weights) {
    let total = 0;
    for (const w of weights) total += w;
    let roll = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll < 0) return i;
    }
    return 0;
  }

  function buildPack() {
    const pool = [...RG_CONFIG.cards];
    const pulls = [];
    for (let slot = 0; slot < PACK_SIZE; slot++) {
      const card = pool.splice((Math.random() * pool.length) | 0, 1)[0];
      let rank = rollRank(SLOT_WEIGHTS[slot]);
      if (rank === 3 && !card.fullArt) rank = 2; // no Full Art frame → Holo
      pulls.push({ card, rank });
    }
    pulls.sort((a, b) => a.rank - b.rank); // rarest at the back
    return pulls;
  }

  /** Apply pulls to the save immediately (refresh-proof) and tag outcomes. */
  function applyPulls(pulls) {
    return pulls.map(({ card, rank }) => {
      const owned = RG.state.owned[card.id];
      let badge;
      if (owned == null) {
        RG.state.owned[card.id] = rank;
        badge = 'new';
      } else if (rank === owned && owned < RG.MAX_RANK) {
        RG.state.owned[card.id] = RG.nextRank(card, owned);
        badge = 'upgraded';
      } else if (rank > owned) {
        RG.state.owned[card.id] = rank;
        badge = 'upgraded';
      } else {
        badge = owned >= RG.MAX_RANK ? 'maxed' : 'dupe';
      }
      return { card, rank, badge };
    });
  }

  /* ---------- flow ---------- */

  function show(el) {
    for (const s of [shelf, stage, revealStage]) s.hidden = s !== el;
  }

  function onPackPicked(btn) {
    lastPackIndex = +btn.dataset.pack || 0;
    RG.audio.packInteract();
    stageSlot.innerHTML = '';
    const clone = btn.cloneNode(true);
    clone.disabled = false;
    stageSlot.appendChild(clone);
    show(stage);
    clone.addEventListener('click', () => rip(clone), { once: true });
  }

  function rip(packEl) {
    if (busy) return;
    busy = true;
    RG.audio.packOpen();
    packEl.classList.add('ripping');

    results = applyPulls(buildPack());
    RG.state.opened++;
    RG.save();

    setTimeout(() => {
      busy = false;
      renderStack();
      show(revealStage);
      RG.updateShelfStats?.();
    }, 560);
  }

  function renderStack() {
    idx = 0;
    doneEl.hidden = true;
    stackEl.innerHTML = '';
    // build stack back-to-front so the first pull is on top
    for (let i = results.length - 1; i >= 0; i--) {
      stackEl.appendChild(buildFlipcard(results[i], i));
    }
    updateCounter();
  }

  function buildFlipcard({ card, rank, badge }, i) {
    const fc = document.createElement('div');
    fc.className = 'flipcard facedown';
    fc.dataset.i = i;
    const depth = i - idx;
    fc.style.transform = stackOffset(depth);

    const inner = document.createElement('div');
    inner.className = 'flip-inner';

    const front = document.createElement('div');
    front.className = 'flip-front';
    front.appendChild(RG.buildCard(card, rank, { interactive: false }));

    const badgeEl = document.createElement('span');
    badgeEl.className = `badge b-${badge}`;
    badgeEl.textContent = badge.toUpperCase();
    badgeEl.style.animationPlayState = 'paused';
    front.appendChild(badgeEl);

    const back = document.createElement('div');
    back.className = 'flip-back';

    inner.append(front, back);
    fc.appendChild(inner);
    fc.addEventListener('click', () => onStackClick(fc));
    return fc;
  }

  const stackOffset = depth =>
    `translate(${depth * 7}px, ${depth * -6}px) rotateZ(${depth * 1.6}deg)`;

  function updateCounter() {
    counterEl.textContent = `CARD ${Math.min(idx + 1, results.length)} / ${results.length}`;
  }

  function onStackClick(fc) {
    if (+fc.dataset.i !== idx) return; // only the top card responds

    if (fc.classList.contains('facedown')) {
      // flip it face-up
      fc.classList.remove('facedown');
      const { rank } = results[idx];
      RG.audio.flip();
      RG.audio.sting(rank);
      const badge = fc.querySelector('.badge');
      badge.style.animationPlayState = 'running';
      return;
    }

    // send it flying, advance the stack
    RG.audio.tick();
    fc.classList.add('flyoff');
    setTimeout(() => fc.remove(), 450);
    idx++;

    if (idx >= results.length) {
      finishReveal();
      return;
    }
    updateCounter();
    // ease remaining cards forward
    for (const other of stackEl.querySelectorAll('.flipcard:not(.flyoff)')) {
      other.style.transform = stackOffset(+other.dataset.i - idx);
    }
    // auto-flip the next card so it's one click per card
    const next = stackEl.querySelector(`.flipcard[data-i="${idx}"]`);
    if (next) setTimeout(() => {
      if (next.classList.contains('facedown')) onStackClick(next);
    }, 180);
  }

  function finishReveal() {
    counterEl.textContent = 'PACK COMPLETE';
    summaryEl.innerHTML = '';
    for (const { card, rank, badge } of results) {
      const chip = document.createElement('div');
      chip.className = 'sum-chip';
      chip.innerHTML = `<span class="r-tag"></span><span class="c-name"></span><span class="badge-mini"></span>`;
      chip.querySelector('.r-tag').textContent = RG.rarityName(rank).toUpperCase();
      chip.querySelector('.c-name').textContent = card.title;
      chip.querySelector('.badge-mini').textContent =
        badge === 'new' ? '✨' : badge === 'upgraded' ? '⬆️' : badge === 'maxed' ? '👑' : '';
      summaryEl.appendChild(chip);
    }
    doneEl.hidden = false;
    RG.collection.render();
  }

  /* ---------- wiring ---------- */

  shelf.addEventListener('click', e => {
    const btn = e.target.closest('.pack');
    if (btn) onPackPicked(btn);
  });
  document.getElementById('stage-cancel').addEventListener('click', () => show(shelf));
  document.getElementById('btn-again').addEventListener('click', () => {
    // straight back into the same pack for fast chain-opening
    const btn = shelf.querySelectorAll('.pack')[lastPackIndex];
    onPackPicked(btn);
  });
  document.getElementById('btn-to-coll').addEventListener('click', () => {
    show(shelf);
    RG.switchTab('collection');
  });

  /** Rebuild visible reveal cards (e.g. after a theme switch). */
  function retheme() {
    if (revealStage.hidden || !results.length || idx >= results.length) return;
    const flipped = new Set();
    for (const fc of stackEl.querySelectorAll('.flipcard:not(.facedown)')) flipped.add(+fc.dataset.i);
    stackEl.innerHTML = '';
    for (let i = results.length - 1; i >= idx; i--) {
      const fc = buildFlipcard(results[i], i);
      if (flipped.has(i)) {
        fc.classList.remove('facedown');
        const b = fc.querySelector('.badge');
        b.style.animationPlayState = 'running';
        b.style.animationDelay = '0s';
      }
      stackEl.appendChild(fc);
    }
  }

  return { retheme, backToShelf: () => show(shelf) };
})();
