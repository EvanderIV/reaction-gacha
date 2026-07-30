/* Game-state core + encrypted localStorage persistence (AES-GCM via WebCrypto). */
window.RG = window.RG || {};

/* ---------- shared game constants ---------- */

RG.RARITIES = [
  { key: 'standard', name: 'Standard' },
  { key: 'reverse',  name: 'Reverse Holofoil' },
  { key: 'holo',     name: 'Holofoil' },
  { key: 'fullart',  name: 'Full Art' },
  { key: 'cosmic',   name: 'Cosmic' },
];
RG.MAX_RANK = RG.RARITIES.length - 1;
RG.rarityKey  = r => RG.RARITIES[r].key;
RG.rarityName = r => RG.RARITIES[r].name;

/** Next rarity step for a card (skips Full Art when unsupported). */
RG.nextRank = (card, rank) => {
  let n = rank + 1;
  if (n === 3 && !card.fullArt) n = 4;
  return Math.min(n, RG.MAX_RANK);
};

/** Ranks a card can exist at. */
RG.supportedRanks = card =>
  [0, 1, 2, 3, 4].filter(r => r !== 3 || card.fullArt);

/* live state (replaced by loaded save at boot) */
RG.state = { theme: 'pokemon', owned: {}, opened: 0, signature: '' };

RG.cardById = {};
for (const c of RG_CONFIG.cards) RG.cardById[c.id] = c;

RG.typeInfo = card =>
  RG.state.theme === 'pokemon'
    ? RG_CONFIG.ptypes[card.ptype]
    : RG_CONFIG.mtypes[card.mtype];

/* ---------- encrypted persistence ---------- */

RG.store = (() => {
  const SALT_KEY = 'rg.salt';
  const SAVE_KEY = 'rg.save';
  // localStorage-bound key material: this protects the save from casual
  // reading/tampering, not from someone with devtools and determination.
  const PASSPHRASE = 'reaction-gacha//spoon-counter//v1';

  let key = null;          // CryptoKey when WebCrypto is available
  let saveTimer = null;

  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = str => Uint8Array.from(atob(str), ch => ch.charCodeAt(0));

  async function init() {
    if (!(window.crypto && crypto.subtle)) return; // fallback mode
    let salt;
    const stored = localStorage.getItem(SALT_KEY);
    if (stored) {
      salt = unb64(stored);
    } else {
      salt = crypto.getRandomValues(new Uint8Array(16));
      localStorage.setItem(SALT_KEY, b64(salt));
    }
    const material = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(PASSPHRASE), 'PBKDF2', false, ['deriveKey']);
    key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt', 'decrypt']);
  }

  async function load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw);
      if (payload.v === 1 && key) {
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.ct));
        return JSON.parse(new TextDecoder().decode(plain));
      }
      if (payload.v === 0) { // plaintext fallback save
        return JSON.parse(atob(payload.data));
      }
    } catch (err) {
      console.warn('Save could not be decrypted; starting fresh.', err);
    }
    return null;
  }

  async function persist() {
    const json = JSON.stringify(RG.state);
    try {
      if (key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv }, key, new TextEncoder().encode(json));
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) }));
      } else {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 0, data: btoa(json) }));
      }
    } catch (err) {
      console.error('Failed to save progress', err);
    }
  }

  /** Debounced save of RG.state. */
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  }

  return { init, load, save, persistNow: persist };
})();

RG.save = () => RG.store.save();
