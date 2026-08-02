/* Card component: DOM builder, 3D tilt, expand-to-center, context menu. */
window.RG = window.RG || {};

(() => {
  const FINE_POINTER = matchMedia('(hover: hover) and (pointer: fine)');

  /* ---------------- build ---------------- */

  /**
   * Build a card element.
   * opts: { interactive=true, locked=false }
   */
  RG.buildCard = function (card, rank, opts = {}) {
    const { interactive = true, locked = false } = opts;
    const rk = RG.rarityKey(rank);
    const type = RG.typeInfo(card);
    // Cosmic deliberately keeps the standard frame — only Full Art is full-bleed
    const fullLayout = !locked && rk === 'fullart';

    const el = document.createElement('article');
    el.className = `card r-${rk}` + (fullLayout ? ' full' : '') + (locked ? ' locked' : '');
    el.dataset.id = card.id;
    el.dataset.rank = rank;
    el.style.setProperty('--type-color', type.color);
    if (!locked && interactive) el.tabIndex = 0;

    if (locked) {
      el.innerHTML = `
        <div class="card-inner"></div>
        <div class="locked-face"><span>❔</span>???</div>`;
      return el;
    }

    el.innerHTML = `
      <div class="card-inner">
        <div class="foil foil-frame"></div>
        <div class="card-body">
          <header class="card-head">
            <h3 class="card-title"></h3>
            <span class="type-pill"></span>
          </header>
          <div class="card-art">
            <div class="foil foil-art"></div>
          </div>
          <div class="card-bottom">
            <p class="card-usage"></p>
            <footer class="card-stats">
              <span class="stat">PWR<b></b></span>
              <span class="stat">WIT<b></b></span>
              <span class="stat">CHS<b></b></span>
              <span class="rarity-gem"></span>
            </footer>
            <p class="card-sig"></p>
          </div>
        </div>
        <div class="foil foil-full"></div>
        <div class="cosmic-layer"></div>
        <div class="glare"></div>
      </div>`;

    el.querySelector('.card-title').textContent = card.title;
    // three-letter badge keeps the header narrow so long titles fit
    const pill = el.querySelector('.type-pill');
    pill.textContent = type.abbr || type.name;
    pill.title = type.name;

    // Art fills its window and crops, whatever its native aspect ratio, unless
    // the card asks to be shown whole (cards.php `fit`) — see main.css.
    const art = el.querySelector('.card-art');
    if (card.fit) art.dataset.fit = card.fit;
    let media;
    if (card.vid) {
      /* Video art is painted into a <canvas> from a video element that never
         enters the document. Browsers decorate <video> with their own floating
         controls — Chrome offers picture-in-picture and cast, Opera GX adds a
         video pop-out button — and those hover over the artwork looking like
         part of the card. disablePictureInPicture only covers Chromium's own;
         Opera's is proprietary and ignores it. A canvas is not a media element,
         so there is nothing for any of them to attach to.
         The clip still decodes normally; it just isn't in the DOM. */
      media = document.createElement('canvas');
      media.setAttribute('role', 'img');
      media.setAttribute('aria-label', card.title);
      observePlayback(paintVideoInto(media, card.img));
    } else {
      media = document.createElement('img');
      media.loading = 'lazy';
      media.alt = card.title;
      media.src = card.img;
    }
    media.draggable = false;
    art.insertBefore(media, art.firstChild);

    el.querySelector('.card-usage').textContent = card.usage;
    const stats = el.querySelectorAll('.stat b');
    stats[0].textContent = card.pwr;
    stats[1].textContent = card.wit;
    stats[2].textContent = card.chs;
    const gem = el.querySelector('.rarity-gem');
    gem.dataset.r = rk;
    gem.title = RG.rarityName(rank);

    // illustrator credit line — mirrors the watermark burned into exports
    const sig = (RG.state.signature || '').trim();
    const sigEl = el.querySelector('.card-sig');
    sigEl.textContent = sig ? `Illus. ${sig}` : '';
    sigEl.hidden = !sig;

    // The cosmic starfield is the card's own emoji — it's the one glyph chosen
    // for that specific joke. The type symbol is the fallback for a card that
    // never got one, since a blank starfield would just look broken.
    if (rk === 'cosmic') sprinkleCosmic(el.querySelector('.cosmic-layer'), card.emoji || type.sym);
    if (interactive) attachTilt(el);
    return el;
  };

  /* canvas -> the detached video driving it. Keyed weakly so a card removed
     from the grid takes its decoder with it. */
  const painters = new WeakMap();

  /**
   * Drive `canvas` from a video element that is never added to the document.
   *
   * Painting per decoded frame rather than per animation frame: the source is
   * 24-30 fps, so a plain requestAnimationFrame loop would blit the same
   * picture twice out of every three calls on a 60 Hz display.
   */
  function paintVideoInto(canvas, src) {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = src;

    const ctx = canvas.getContext('2d');
    const perFrame = typeof video.requestVideoFrameCallback === 'function';
    let handle = 0, running = false;

    const paint = () => {
      if (video.videoWidth && canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      if (video.readyState >= 2) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (!running) return;
      handle = perFrame ? video.requestVideoFrameCallback(paint)
                        : requestAnimationFrame(paint);
    };

    painters.set(canvas, {
      start() {
        if (running) return;
        running = true;
        video.play?.().catch(() => {});
        paint();
      },
      stop() {
        running = false;
        video.pause?.();
        if (!handle) return;
        if (perFrame) video.cancelVideoFrameCallback(handle);
        else cancelAnimationFrame(handle);
        handle = 0;
      },
    });

    // paint a first frame even before playback starts, so the card is never blank
    video.addEventListener('loadeddata', () => { if (!running) paint(); }, { once: true });
    return canvas;
  }

  /* A collection grid can hold a lot of video art, and decoding all of it at
     once is wasteful — only play what's actually on screen. */
  const playObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        for (const { target, isIntersecting } of entries) {
          const painter = painters.get(target);
          if (isIntersecting) painter?.start();
          else painter?.stop();
        }
      }, { rootMargin: '200px' })
    : null;

  function observePlayback(canvas) {
    if (playObserver) playObserver.observe(canvas);
    else painters.get(canvas)?.start();   // no observer: just let it run
  }

  function sprinkleCosmic(layer, sym) {
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'sym';
      s.textContent = sym;
      s.style.left = (4 + Math.random() * 86) + '%';
      s.style.top = (4 + Math.random() * 88) + '%';
      /* cqw, not px: the card is a size container (see main.css), so the
         starfield scales with it like everything else. 4.35-13.04cqw is the
         old 10-30px measured against the 230px reference card. */
      s.style.fontSize = (4.35 + Math.random() * 8.7).toFixed(2) + 'cqw';
      s.style.setProperty('--dur', (2.2 + Math.random() * 3.4).toFixed(2) + 's');
      s.style.setProperty('--delay', (Math.random() * 4).toFixed(2) + 's');
      s.style.setProperty('--peak', (0.5 + Math.random() * 0.45).toFixed(2));
      layer.appendChild(s);
    }
  }

  /* ---------------- Balatro tilt ---------------- */

  const MAX_TILT = 11;

  function attachTilt(el) {
    if (!FINE_POINTER.matches) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;      // target / current rotation
    let tpx = 50, tpy = 35, cpx = 50, cpy = 35; // glare position %

    function frame() {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      cpx += (tpx - cpx) * 0.2;
      cpy += (tpy - cpy) * 0.2;
      el.style.setProperty('--rx', cy.toFixed(2) + 'deg');
      el.style.setProperty('--ry', cx.toFixed(2) + 'deg');
      el.style.setProperty('--px', cpx.toFixed(1));
      el.style.setProperty('--py', cpy.toFixed(1));
      if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05 || el.classList.contains('tilting')) {
        raf = requestAnimationFrame(frame);
      } else raf = 0;
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    el.addEventListener('pointerenter', () => {
      el.classList.add('tilting');
      el.style.setProperty('--s', '1.045');
      kick();
    });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width * 2 - 1;  // -1..1
      const ny = (e.clientY - r.top) / r.height * 2 - 1;
      tx = nx * MAX_TILT;
      ty = -ny * MAX_TILT;
      tpx = (nx + 1) * 50;
      tpy = (ny + 1) * 50;
      kick();
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('tilting');
      el.style.setProperty('--s', '1');
      tx = ty = 0; tpx = 50; tpy = 35;
      kick();
    });
  }

  /* ---------------- expand to center ---------------- */

  const overlay = document.getElementById('expand-overlay');
  const slot = document.getElementById('expand-slot');
  let expandOpen = false;

  RG.expandCard = function (card, rank, srcEl) {
    if (expandOpen) return;
    expandOpen = true;
    slot.innerHTML = '';
    const big = RG.buildCard(card, rank);
    slot.appendChild(big);
    overlay.hidden = false;
    overlay.classList.remove('closing');

    // FLIP: fly from the source card's position/scale into center
    if (srcEl) {
      const from = srcEl.getBoundingClientRect();
      const to = big.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const ds = from.width / to.width;
      big.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${ds})` },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        { duration: 380, easing: 'cubic-bezier(.22,1.25,.36,1)' }
      );
    } else {
      big.animate(
        [{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 300, easing: 'cubic-bezier(.22,1.25,.36,1)' }
      );
    }
  };

  /**
   * Rebuild every on-screen preview of one card, in place.
   *
   * Scoped to the collection grid and the expanded overlay on purpose. A card
   * in the reveal stack is showing the tier that was actually pulled, and
   * repainting that from a view preference would rewrite the pull in front of
   * the person who just made it.
   */
  RG.refreshCard = function (id) {
    const card = RG.cardById[id];
    const rank = card && RG.shownRank(card);
    if (rank == null) return;
    const sel = `.card[data-id="${CSS.escape(id)}"]`;
    for (const scope of [document.getElementById('coll-grid'), slot]) {
      for (const old of scope ? scope.querySelectorAll(sel) : []) {
        old.replaceWith(RG.buildCard(card, rank));
      }
    }
  };

  function closeExpand() {
    if (!expandOpen) return;
    expandOpen = false;
    overlay.classList.add('closing');
    const big = slot.firstElementChild;
    if (big) big.animate(
      [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.82)', opacity: 0 }],
      { duration: 200, easing: 'ease-in' }
    );
    setTimeout(() => { overlay.hidden = true; slot.innerHTML = ''; }, 210);
  }
  RG.closeExpand = closeExpand;

  overlay.addEventListener('click', e => {
    if (!e.target.closest('.card')) closeExpand();
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeExpand(); hideCtx(); } });

  // delegated open: any interactive card click expands it
  document.addEventListener('click', e => {
    const el = e.target.closest('.card[data-id]');
    if (!el || el.classList.contains('locked')) return;
    if (el.closest('.expand-slot') || el.closest('.flipcard')) return; // reveal stack handles its own clicks
    const card = RG.cardById[el.dataset.id];
    if (card) RG.expandCard(card, +el.dataset.rank, el);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('.card[data-id]');
    if (!el || el.closest('.expand-slot') || el.closest('.flipcard')) return;
    e.preventDefault();
    RG.expandCard(RG.cardById[el.dataset.id], +el.dataset.rank, el);
  });

  /* ---------------- context menu ---------------- */

  const menu = document.getElementById('ctx-menu');
  const ctxTitle = document.getElementById('ctx-title');
  const ctxRarity = document.getElementById('ctx-rarity');
  let ctxCard = null;
  let exporting = false;

  function hideCtx() { menu.hidden = true; ctxCard = null; }
  RG.hideCtx = hideCtx;

  function showCtx(x, y, card, shownRank) {
    // exporting is collection-gated: owning a tier unlocks it and every tier below
    const ownedRank = RG.state.owned[card.id];
    if (ownedRank == null) return;

    ctxCard = card;
    ctxTitle.textContent = card.title;

    ctxRarity.innerHTML = '';
    for (const r of RG.supportedRanks(card).filter(r => r <= ownedRank)) {
      const opt = document.createElement('option');
      opt.value = RG.rarityKey(r);
      opt.textContent = RG.rarityName(r) + (r === ownedRank ? ' • owned' : '');
      ctxRarity.appendChild(opt);
    }
    /* Default to the tier on screen, not the tier owned. The grid can be
       pinned to a lower tier, and an export that quietly ignored that would
       hand back a card the user isn't looking at. Resolved the same way the
       grid resolves it, so the value always matches an option that exists. */
    const want = Math.min(shownRank ?? ownedRank, ownedRank);
    const pick = RG.supportedRanks(card).filter(r => r <= want).pop() ?? 0;
    ctxRarity.value = RG.rarityKey(pick);

    menu.querySelector('[data-act="share"]').style.display = navigator.share ? '' : 'none';

    menu.hidden = false;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, innerWidth - mw - 10) + 'px';
    menu.style.top = Math.min(y, innerHeight - mh - 10) + 'px';

    /* Start rendering now. Opening this menu is the strongest signal of intent
       there is short of the click, and the render is seconds of work — the time
       spent reading the menu is time it doesn't have to cost later. It runs at
       idle priority and the click attaches to the same job. */
    RG.exporter.prerender(card, ctxRarity.value);
  }

  /* Picking a tier here repaints the card behind the menu, so the choice is
     visible before it's acted on — the menu stays open and the export buttons
     below now refer to what's on screen. */
  ctxRarity.addEventListener('change', () => {
    if (!ctxCard) return;
    const rank = RG.RARITIES.findIndex(r => r.key === ctxRarity.value);
    if (rank >= 0) RG.setViewOverride(ctxCard.id, rank);
    RG.exporter.prerender(ctxCard, ctxRarity.value);   // warm the new tier too
  });

  document.addEventListener('contextmenu', e => {
    const el = e.target.closest('.card[data-id]');
    if (!el || el.classList.contains('locked')) { hideCtx(); return; }
    const fc = el.closest('.flipcard');
    if (fc && fc.classList.contains('facedown')) return; // no peeking
    e.preventDefault();
    showCtx(e.clientX, e.clientY, RG.cardById[el.dataset.id], +el.dataset.rank);
  });
  document.addEventListener('pointerdown', e => {
    if (!menu.hidden && !e.target.closest('.ctx-menu')) hideCtx();
  });
  addEventListener('scroll', hideCtx, { passive: true });
  addEventListener('resize', hideCtx);

  menu.addEventListener('click', async e => {
    const btn = e.target.closest('.ctx-item');
    if (!btn || !ctxCard) return;
    const act = btn.dataset.act;
    const card = ctxCard;
    const rankKey = ctxRarity.value;
    hideCtx();

    // re-validate against the save, in case the dropdown was tampered with
    const owned = RG.state.owned[card.id];
    const rank = RG.RARITIES.findIndex(r => r.key === rankKey);
    if (owned == null || rank < 0 || rank > owned) {
      RG.toast('You don’t own that version of this card yet.');
      return;
    }
    if (exporting) return;

    // Every card is stamped with the owner's signature, so make sure there is
    // one before rendering.
    if (!(await RG.requireSignature())) return;

    exporting = true;

    /* Everything ships as animated WebP — embeds, shares and downloads alike.
       It wins on every axis that mattered: 24-bit colour instead of a 255-entry
       palette (no banding, none of the morphing artefacts the GIF encoder has
       to fight), a real alpha channel so the rounded corners stay transparent,
       and roughly a quarter of the bytes. Verified rendering inline and looping
       in Discord.

       MP4 is not used despite compressing comparably, because Discord renders a
       .mp4 link as a click-to-play video player — the autoplay-loop treatment
       Tenor gets is Discord's provider allowlist, not something a URL or meta
       tag can opt into.

       GIF survives only as the fallback for browsers that can't encode WebP. */
    const exportFmt = await RG.exporter.format();

    /* Goes through the export cache, so this either returns a render that was
       started when the menu opened, attaches to one still in flight, or hands
       back a finished blob outright when the same card was exported before. */
    const build = fmt => {
      RG.toast('Rendering card…');
      return RG.exporter.exportBlob(card, rankKey, fmt, {
        onProgress: p => RG.toast(`Rendering card… ${Math.round(p * 100)}%`),
      });
    };

    try {
      if (act === 'link') {
        const blob = await build(exportFmt);
        RG.toast('Minting embed link…');
        const url = await RG.share.mint(card, rank, blob, exportFmt);
        if (await RG.copyText(url)) RG.toast('Embed link copied — paste it in Discord 🔗');
        else RG.promptLink(url);   // never strand a link we've already minted
      } else if (act === 'save') {
        const blob = await build(exportFmt);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = RG.exporter.filename(card, rankKey, exportFmt);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        RG.toast(`Saved “${card.title}” 🎞️`);
      } else if (act === 'share') {
        const blob = await build(exportFmt);
        const file = new File([blob], RG.exporter.filename(card, rankKey, exportFmt),
                             { type: blob.type });
        if (navigator.canShare && !navigator.canShare({ files: [file] })) {
          await navigator.share({ title: card.title, text: card.usage });
        } else {
          await navigator.share({ files: [file], title: card.title, text: card.usage });
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(err);
        RG.toast('That didn’t work — ' + (err.message || 'unknown error'));
      }
    } finally {
      exporting = false;
    }
  });

})();
