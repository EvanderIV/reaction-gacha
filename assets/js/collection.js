/* Collection grid: fuzzy search, sorting, owned + locked cards. */
window.RG = window.RG || {};

RG.collection = (() => {
  const grid = document.getElementById('coll-grid');
  const emptyMsg = document.getElementById('coll-empty');
  const searchEl = document.getElementById('coll-search');
  const sortEl = document.getElementById('coll-sort');
  const countPill = document.getElementById('coll-count');

  const statTotal = c => c.pwr + c.wit + c.chs;

  const SORTS = {
    alpha:  (a, b) => a.card.title.localeCompare(b.card.title),
    rarity: (a, b) => b.rank - a.rank || a.card.title.localeCompare(b.card.title),
    type:   (a, b) => RG.typeInfo(a.card).name.localeCompare(RG.typeInfo(b.card).name)
                      || a.card.title.localeCompare(b.card.title),
    stats:  (a, b) => statTotal(b.card) - statTotal(a.card)
                      || a.card.title.localeCompare(b.card.title),
  };

  function render() {
    const query = searchEl.value.trim();
    const sort = SORTS[sortEl.value] || SORTS.alpha;

    let owned = [];
    const locked = [];
    for (const card of RG_CONFIG.cards) {
      const rank = RG.state.owned[card.id];
      if (rank != null) owned.push({ card, rank });
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

  let debounce = 0;
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(render, 120);
  });
  sortEl.addEventListener('change', render);

  return { render };
})();
