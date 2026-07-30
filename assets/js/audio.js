/* Sound: random pack MP3s from assets/sounds + tiny WebAudio UI cues. */
window.RG = window.RG || {};

RG.audio = (() => {
  let ctx = null;
  const pick = list => list[(Math.random() * list.length) | 0];

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function playFile(list, volume = 0.85) {
    if (!list || !list.length) return;
    const a = new Audio(pick(list));
    a.volume = volume;
    a.play().catch(() => {}); // autoplay policy: ignore until first gesture
  }

  /* short filtered blip — card advance */
  function tick() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(680 + Math.random() * 160, t);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.09);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + 0.12);
  }

  /* soft paper flick — card flip reveal */
  function flip() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const len = 0.07;
    const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800 + Math.random() * 900;
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = 0.35;
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  }

  /* ascending sparkle sting for rare pulls; bigger with rank */
  function sting(rank) {
    const c = ac(); if (!c || rank < 2) return;
    const base = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const notes = base.slice(0, 2 + rank);
    const t0 = c.currentTime + 0.05;
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = rank >= 4 ? 'sawtooth' : 'sine';
      o.frequency.value = f * (rank >= 4 ? 1 : 1);
      const t = t0 + i * 0.085;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(rank >= 4 ? 0.10 : 0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + 0.65);
    });
  }

  return {
    unlock: () => { ac(); },
    packInteract: () => playFile(RG_CONFIG.sounds.interact, 0.9),
    packOpen:     () => playFile(RG_CONFIG.sounds.open, 0.95),
    tick, flip, sting,
  };
})();
