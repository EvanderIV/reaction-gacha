/* Collection grid: fuzzy search, sorting, owned + locked cards. */
window.RG = window.RG || {};

RG.collection = (() => {
  const grid = document.getElementById('coll-grid');
  const emptyMsg = document.getElementById('coll-empty');
  const searchEl = document.getElementById('coll-search');
  const sortEl = document.getElementById('coll-sort');
  const displayEl = document.getElementById('coll-display');
  const countPill = document.getElementById('coll-count');

  const statTotal = c => c.pwr + c.wit + c.chs;

  const SORTS = {
    alpha:  (a, b) => a.card.title.localeCompare(b.card.title),
    // by the tier owned, not the tier shown: pinning the grid to Standard
    // shouldn't flatten this sort into a tie-break on titles
    rarity: (a, b) => b.owned - a.owned || a.card.title.localeCompare(b.card.title),
    type:   (a, b) => RG.typeInfo(a.card).name.localeCompare(RG.typeInfo(b.card).name)
                      || a.card.title.localeCompare(b.card.title),
    stats:  (a, b) => statTotal(b.card) - statTotal(a.card)
                      || a.card.title.localeCompare(b.card.title),
  };

  function render() {
    const query = searchEl.value.trim();
    const sort = SORTS[sortEl.value] || SORTS.alpha;
    // The save loads after this module initialises, so mirror the stored tier
    // into the control on every render rather than only at startup.
    displayEl.value = RG.state.displayRank == null ? 'owned' : String(RG.state.displayRank);

    let owned = [];
    const locked = [];
    for (const card of RG_CONFIG.cards) {
      const rank = RG.shownRank(card);
      if (rank != null) owned.push({ card, rank, owned: RG.state.owned[card.id] });
      else locked.push(card);
    }
    countPill.textContent = owned.length;

    if (query) {
      const typeName = c => RG.typeInfo(c).name;
      owned = owned
        .map(o => ({ ...o, score: RG.fuzzy.score(query, `${o.card.title} ${o.card.usage} ${typeName(o.card)}`) }))
        .filter(o => o.score !== null)
        .sort((a, b) => a.score - b.score || sort(a, b));
    } else {
      owned.sort(sort);
    }

    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const { card, rank } of owned) frag.appendChild(RG.buildCard(card, rank));
    if (!query) for (const card of locked) frag.appendChild(RG.buildCard(card, 0, { locked: true }));
    grid.appendChild(frag);

    emptyMsg.hidden = !(owned.length === 0 && (query ? true : locked.length === 0));
    if (owned.length === 0 && query) {
      emptyMsg.textContent = 'Nothing matches that search.';
      emptyMsg.hidden = false;
    } else if (owned.length === 0 && locked.length > 0 && !query) {
      emptyMsg.hidden = true; // locked silhouettes already tell the story
    } else {
      emptyMsg.textContent = 'No cards yet. Go rip some packs.';
    }
  }

  for (let r = 0; r <= RG.MAX_RANK; r++) {
    const opt = document.createElement('option');
    opt.value = String(r);
    opt.textContent = RG.rarityName(r);
    displayEl.appendChild(opt);
  }

  let debounce = 0;
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(render, 120);
  });
  sortEl.addEventListener('change', render);
  displayEl.addEventListener('change', () => {
    RG.state.displayRank = displayEl.value === 'owned' ? null : +displayEl.value;
    /* A new global tier re-baselines the whole grid, so per-card pins go with
       it — left in place they'd survive invisibly and contradict the dropdown
       the user just set. */
    RG.clearViewOverrides();
    RG.save();
    render();
  });

  return { render };
})();
