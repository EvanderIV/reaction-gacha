/* Boot: load save, wire tabs + theme switch, global helpers. */
window.RG = window.RG || {};

(() => {
  const toastEl = document.getElementById('toast');
  let toastTimer = 0;
  RG.toast = msg => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  };

  /* ---- clipboard text, with fallbacks ----
     navigator.clipboard only exists in secure contexts, so serving this app
     over plain http on a LAN (exactly when you'd want to share links) has no
     async clipboard at all. Fall back to execCommand, then to showing the
     link so a minted URL is never lost. */
  RG.copyText = async text => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const done = document.execCommand('copy');
      ta.remove();
      if (done) return true;
    } catch { /* fall through */ }
    return false;
  };

  const linkModal = document.getElementById('link-modal');
  const linkInput = document.getElementById('link-input');
  RG.promptLink = url => {
    linkInput.value = url;
    linkModal.hidden = false;
    linkInput.focus();
    linkInput.select();
  };
  const closeLink = () => { linkModal.hidden = true; };
  document.getElementById('link-close').addEventListener('click', closeLink);
  document.getElementById('link-copy').addEventListener('click', async () => {
    linkInput.select();
    RG.toast(await RG.copyText(linkInput.value) ? 'Copied 🔗' : 'Press Ctrl+C to copy');
  });
  linkModal.addEventListener('click', e => { if (e.target === linkModal) closeLink(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeLink(); });

  /* ---- signature ----
     The nickname stamped onto every exported card, and shown in the header.
     Lives in RG.state, so it rides along in the encrypted localStorage save. */

  const SIG_MAX = 24;
  const sigModal  = document.getElementById('sig-modal');
  const sigForm   = document.getElementById('sig-form');
  const sigInput  = document.getElementById('sig-input');
  const sigError  = document.getElementById('sig-error');
  const sigNameEl = document.getElementById('sig-name');
  let sigResolve = null;

  /** Strip control characters and collapse whitespace; cap the length. */
  const cleanSig = raw => raw
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SIG_MAX);

  function paintSignature() {
    const sig = (RG.state.signature || '').trim();
    sigNameEl.textContent = sig || 'unsigned';
    sigNameEl.classList.toggle('is-unset', !sig);
  }
  RG.paintSignature = paintSignature;

  function openSigModal() {
    sigInput.value = RG.state.signature || '';
    sigError.hidden = true;
    sigModal.hidden = false;
    sigInput.focus();
    sigInput.select();
  }

  function closeSigModal(value) {
    sigModal.hidden = true;
    const done = sigResolve;
    sigResolve = null;
    if (done) done(value);
  }

  sigForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = cleanSig(sigInput.value);
    if (!name) {
      sigError.textContent = 'Pick something — even one character will do.';
      sigError.hidden = false;
      return;
    }
    RG.state.signature = name;
    RG.save();
    paintSignature();
    // rebuild visible cards so the credit line updates everywhere
    RG.collection.render();
    RG.gacha.retheme();
    closeSigModal(name);
  });

  document.getElementById('sig-cancel').addEventListener('click', () => closeSigModal(null));
  sigModal.addEventListener('click', e => { if (e.target === sigModal) closeSigModal(null); });
  document.getElementById('sig-edit').addEventListener('click', openSigModal);
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !sigModal.hidden) closeSigModal(null);
  });

  /**
   * Resolve to true once a signature exists. Prompts if there isn't one, and
   * resolves false if the user backs out — callers should then do nothing.
   */
  RG.requireSignature = () => {
    if ((RG.state.signature || '').trim()) return Promise.resolve(true);
    return new Promise(resolve => {
      sigResolve = v => resolve(Boolean(v));
      openSigModal();
    });
  };

  /* tabs */
  const tabBtns = document.querySelectorAll('.tab-btn');
  RG.switchTab = name => {
    for (const b of tabBtns) b.classList.toggle('active', b.dataset.tab === name);
    for (const p of document.querySelectorAll('.tab-panel'))
      p.classList.toggle('active', p.id === 'tab-' + name);
    RG.hideCtx?.();
  };
  for (const b of tabBtns) b.addEventListener('click', () => RG.switchTab(b.dataset.tab));

  /* theme */
  const thmBtns = document.querySelectorAll('.thm-btn');
  function setTheme(theme, persist = true) {
    RG.state.theme = theme;
    document.body.dataset.theme = theme;
    for (const b of thmBtns) b.classList.toggle('active', b.dataset.thm === theme);
    RG.collection.render();
    RG.gacha.retheme();
    if (persist) RG.save();
  }
  for (const b of thmBtns) b.addEventListener('click', () => setTheme(b.dataset.thm));

  /* shelf stats line */
  RG.updateShelfStats = () => {
    const total = RG_CONFIG.cards.length;
    const ownedCount = Object.keys(RG.state.owned).length;
    const cosmic = Object.entries(RG.state.owned)
      .filter(([, r]) => r === RG.MAX_RANK).length;
    document.getElementById('shelf-stats').textContent =
      `${ownedCount} / ${total} collected · ${RG.state.opened} pack${RG.state.opened === 1 ? '' : 's'} opened` +
      (cosmic ? ` · ${cosmic} cosmic ✹` : '');
  };

  /* audio unlock on first interaction (browser autoplay policy) */
  addEventListener('pointerdown', () => RG.audio.unlock(), { once: true });

  /* flush pending save when leaving */
  addEventListener('beforeunload', () => RG.store.persistNow());

  /* boot */
  (async () => {
    try {
      await RG.store.init();
      const loaded = await RG.store.load();
      if (loaded && typeof loaded === 'object') {
        RG.state.owned = loaded.owned || {};
        RG.state.opened = loaded.opened || 0;
        RG.state.theme = loaded.theme === 'mtg' ? 'mtg' : 'pokemon';
        RG.state.signature = cleanSig(loaded.signature || '');
      }
    } catch (err) {
      console.error('Storage init failed; running without persistence.', err);
    }
    paintSignature();
    setTheme(RG.state.theme, false);
    RG.updateShelfStats();
  })();
})();
