/* Levenshtein-based fuzzy search. */
window.RG = window.RG || {};

RG.fuzzy = (() => {
  // Classic two-row Levenshtein with an early-out cap.
  function levenshtein(a, b, cap = 64) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (Math.abs(a.length - b.length) > cap) return cap + 1;

    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      let rowMin = i;
      const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= b.length; j++) {
        const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        if (curr[j] < rowMin) rowMin = curr[j];
      }
      if (rowMin > cap) return cap + 1;
      [prev, curr] = [curr, prev];
    }
    return prev[b.length];
  }

  // Best distance of `token` against any word of `text`, with substring bonus.
  function tokenScore(token, words) {
    let best = Infinity;
    for (const w of words) {
      if (w === token) return 0;
      if (w.startsWith(token)) best = Math.min(best, 0.1);
      else if (w.includes(token)) best = Math.min(best, 0.35);
      else {
        // compare against a same-length prefix too, so "invali" ~ "invalidate"
        const d = Math.min(
          levenshtein(token, w, 6),
          levenshtein(token, w.slice(0, token.length + 1), 6) + 0.2
        );
        best = Math.min(best, d);
      }
    }
    return best;
  }

  /**
   * Score a card against a query. Returns null when it doesn't match,
   * otherwise a number (lower = better) for ranking.
   */
  function score(query, haystack) {
    const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return 0;
    const words = haystack.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

    let total = 0;
    for (const t of tokens) {
      const s = tokenScore(t, words);
      const allowed = t.length <= 3 ? 1 : Math.ceil(t.length / 3);
      if (s > allowed) return null;
      total += s;
    }
    return total;
  }

  return { levenshtein, score };
})();
