/* Embed links: upload a rendered card and get back a single-use share URL. */
window.RG = window.RG || {};

RG.share = (() => {
  /**
   * Mint a share link for a card at a given rank.
   * The server encrypts the card definition into the token with a secret
   * unique to that install, so the link only resolves on this instance.
   */
  async function mint(card, rank, blob, ext = 'gif') {
    const body = new FormData();
    body.append('card', card.id);
    body.append('rarity', String(rank));
    body.append('theme', RG.state.theme);
    body.append('image', blob, `${card.id}.${ext}`);

    const res = await fetch('api/share.php', { method: 'POST', body });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Share endpoint returned ${res.status}`);
    }
    if (!res.ok) throw new Error(data.error || `Share failed (${res.status})`);
    return data.url;
  }

  return { mint };
})();
