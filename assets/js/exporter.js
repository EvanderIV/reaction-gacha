/* Renders a card at a chosen rarity to an animated GIF for embed links.
   Fully self-contained: ImageDecoder for animated source art, median-cut
   palette quantization, and a from-scratch GIF89a/LZW encoder. */
window.RG = window.RG || {};

RG.exporter = (() => {
  /* ---------- output tuning ----------
     Discord's attachment/embed ceiling is 10 MB; 7 MB leaves comfortable room
     for the palette and frame-count variance between cards. */
  const TARGET_BYTES = 7 * 1024 * 1024;
  const MAX_BYTES    = 9 * 1024 * 1024;

  /* Foil takes this long to complete one seamless cycle. The old 1.4 s loop
     read as frantic — this is roughly a third of that speed. */
  const LOOP_SECONDS = 4.0;

  /* GIF delays are centiseconds, so stick to divisors of 100. 20 fps = 5 cs;
     going faster risks decoders that clamp very short delays. */
  const FPS = 20;

  /* Ceiling on frames per export. Frame count drives both file size and encode
     time almost linearly, so this is the real brake on how long a clip can be:
     LOOP_SECONDS x FPS must fit under it or the sampling rate drops to
     compensate (the loop keeps its requested duration either way). */
  const MAX_FRAMES = 80;

  /* Cards render natively at 750px wide, so 640 is close to 1:1 while landing
     the heaviest rarities (cosmic / full art) right around TARGET_BYTES. */
  const DEFAULT_WIDTH = 640;
  /* Art that animates on its own (GIF/video) shares far less between frames
     than a still does, so the same width would roughly double the file. Start
     narrower rather than encoding twice and throwing the first attempt away. */
  const MOVING_ART_WIDTH = 500;
  const MIN_WIDTH        = 260;
  const THEMES = {
    pokemon: {
      frameTop: '#ffffff', frameBot: '#dfe4ec', edge: '#c9d2de',
      title: '#17202b', boxBg: 'rgba(255,255,255,0.92)', boxText: '#2a3442',
      boxEdge: 'rgba(28,36,48,0.25)', titleFont: '800 %px "Segoe UI", sans-serif',
      bodyFont: '%px "Segoe UI", sans-serif',
    },
    mtg: {
      frameTop: '#2b2118', frameBot: '#120d09', edge: '#c9a54c',
      title: '#f0e2bd', boxBg: '#e4d5ae', boxText: '#241a10',
      boxEdge: '#8f7434', titleFont: '700 %px Georgia, serif',
      bodyFont: 'italic %px Georgia, serif',
    },
  };

  /* ---------- small utils ---------- */

  const imgCache = {};
  function loadImg(src) {
    if (imgCache[src]) return imgCache[src];
    imgCache[src] = new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
    return imgCache[src];
  }

  const withTimeout = (promise, ms, what) => Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms)),
  ]);

  /** Last-resort art so a card still renders when its media won't load. */
  function placeholderArt(card) {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 896;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, c.width, c.height);
    grd.addColorStop(0, `hsl(${card.hue ?? 220} 60% 20%)`);
    grd.addColorStop(1, `hsl(${card.hue2 ?? 260} 65% 38%)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /** One frame of a video, without decoding the whole loop. */
  async function videoStill(src) {
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    await withTimeout(new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('media error on ' + src));
    }), 10000, 'video metadata');
    // a hair into the clip: frame zero is often a black lead-in
    await seekTo(video, Math.min(0.1, (video.duration || 1) * 0.05));
    const c = fitCanvas(video.videoWidth || 640, video.videoHeight || 360);
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    video.src = '';
    return c;
  }

  /**
   * A single drawable still for the card's art. An <img> can't load an mp4, so
   * video art gets one seeked frame instead.
   *
   * This never rejects: a card that can't load its media still renders on a
   * flat gradient rather than failing the whole export.
   */
  const stillCache = new Map();
  function artStill(card) {
    const key = card.img;
    if (stillCache.has(key)) return stillCache.get(key);

    const job = (isVideo(key) ? videoStill(key) : loadImg(key)).catch(err => {
      // a transient failure must not be cached forever
      stillCache.delete(key);
      console.warn('Falling back to placeholder art for', key, err);
      return placeholderArt(card);
    });
    stillCache.set(key, job);
    return job;
  }

  function seededRng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return s / 4294967296;
    };
  }
  const hashStr = str => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCover(ctx, im, x, y, w, h) {
    const iw = im.width, ih = im.height;
    const s = Math.max(w / iw, h / ih);
    const dw = iw * s, dh = ih * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function wrap(ctx, text, x, y, maxW, lineH, maxLines = 10) {
    const words = text.split(' ');
    let line = '', lines = 0;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y); y += lineH; line = word;
        if (++lines >= maxLines - 1) { line += '…'; break; }
      } else line = test;
    }
    ctx.fillText(line, x, y);
    return y + lineH;
  }

  /* ---------- foil / cosmic (parameterized by loop phase t ∈ [0,1)) ---------- */

  /* `radius` clips the foil to the card's rounded silhouette — without it the
     overlay bleeds past the corners and leaves a semi-opaque smudge where the
     export should be fully transparent. */
  function applyFoil(ctx, x, y, w, h, t = 0, radius = 0) {
    ctx.save();
    ctx.beginPath();
    if (radius > 0) rr(ctx, x, y, w, h, radius); else ctx.rect(x, y, w, h);
    ctx.clip();

    // rainbow overlay — hues rotate with t so a full loop is seamless
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    const N = 6;
    for (let k = 0; k <= N; k++) {
      g.addColorStop(k / N, `hsl(${(k * 300 / N + t * 360) % 360} 95% 64%)`);
    }
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    // diagonal glare streaks — translate by one period over the loop
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffffff';
    const spacing = w / 3;
    const offset = t * spacing;
    for (let i = -3; i < 7; i++) {
      ctx.save();
      ctx.translate(x + i * spacing + offset, y);
      ctx.transform(1, 0, -0.45, 1, 0, 0);
      ctx.fillRect(0, 0, w / 14, h);
      ctx.restore();
    }

    // roaming glare hotspot
    const gx = x + w * (0.5 + 0.26 * Math.cos(t * Math.PI * 2));
    const gy = y + h * (0.4 + 0.22 * Math.sin(t * Math.PI * 2));
    const rad = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.5);
    rad.addColorStop(0, 'rgba(255,255,255,0.5)');
    rad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = rad;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  /* A glowing glyph costs a shadowBlur text draw, and cosmic paints 22 of them
     per frame — 1760 over a full loop, which dominated encode time. Draw it
     once into a sprite and blit that instead; only alpha varies per frame. */
  const SPRITE_PX = 128;
  const spriteCache = new Map();
  function symbolSprite(sym) {
    let cv = spriteCache.get(sym);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = cv.height = SPRITE_PX;
    const c = cv.getContext('2d');
    c.font = `${SPRITE_PX * 0.62}px "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    c.shadowColor = '#fff';
    c.shadowBlur = SPRITE_PX * 0.13;
    c.fillText(sym, SPRITE_PX / 2, SPRITE_PX / 2);
    spriteCache.set(sym, cv);
    return cv;
  }

  function drawCosmicSymbols(ctx, sym, w, h, t, seed, radius = 0) {
    const rand = seededRng(seed);
    const sprite = symbolSprite(sym);
    ctx.save();
    if (radius > 0) { ctx.beginPath(); rr(ctx, 0, 0, w, h, radius); ctx.clip(); }
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 22; i++) {
      const size = 22 + rand() * 44;
      const px = rand() * (w - size);
      const py = size + rand() * (h - size * 2);
      const phase = rand();
      const base = 0.25 + rand() * 0.4;
      // twinkle with individual phase; static render (t=0) still varies per symbol
      ctx.globalAlpha = base * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin((t + phase) * Math.PI * 2)));
      // sprite includes the glow, so draw it larger than the nominal glyph box
      const box = size * 1.9;
      ctx.drawImage(sprite, px - box * 0.24, py - box * 0.62, box, box);
    }
    ctx.restore();
  }

  /* ---------- frame renderer ----------
     Split in two: everything static is drawn once into a base canvas, and
     each frame just copies that and paints the foil on top. With 80 frames
     per loop, re-running the text and box work every time is most of the
     encode cost for no benefit. */

  /**
   * Draw the card minus its animated layers.
   * `artOverride` supplies one frame of an animated GIF source.
   */
  async function renderBase(card, rankKey, artOverride) {
    const theme = THEMES[RG.state.theme] || THEMES.pokemon;
    const type = RG.typeInfo(card);
    // Only Full Art uses the full-bleed frame. Cosmic keeps the standard
    // frame so its symbol layer reads against the art window instead of
    // competing with a full-bleed image.
    const isFullLayout = rankKey === 'fullart';
    // Every rarity is the same 5:7 card. Full art differs by letting the
    // artwork fill the frame edge to edge, not by being a taller card.
    const W = 750, H = 1050;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const im = artOverride || await artStill(card);

    const R = 40, B = 28; // corner radius, border
    rr(ctx, 0, 0, W, H, R);
    ctx.fillStyle = theme.edge; ctx.fill();
    const inner = ctx.createLinearGradient(0, 0, W * 0.4, H);
    inner.addColorStop(0, theme.frameTop); inner.addColorStop(1, theme.frameBot);
    rr(ctx, B, B, W - B * 2, H - B * 2, R - 14);
    ctx.fillStyle = inner; ctx.fill();

    const pad = 54;
    const uy = 660, uh = 250;              // usage box (standard layout)
    const sy = H - 132, sh = 66;           // stats row; clear band beneath for credits
    const sw = (W - pad * 2 - 40) / 3;

    if (isFullLayout) {
      ctx.save(); rr(ctx, B, B, W - B * 2, H - B * 2, R - 14); ctx.clip();
      drawCover(ctx, im, B, B, W - B * 2, H - B * 2);
      let g = ctx.createLinearGradient(0, B, 0, 220);
      g.addColorStop(0, 'rgba(0,0,0,0.68)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(B, B, W - B * 2, 220);
      g = ctx.createLinearGradient(0, H - 400, 0, H - B);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, 'rgba(0,0,0,0.74)');
      ctx.fillStyle = g; ctx.fillRect(B, H - 400, W - B * 2, 400 - B);
      ctx.restore();
    } else {
      const ax = pad, ay = 150, aw = W - pad * 2, ah = 470;
      ctx.save(); rr(ctx, ax, ay, aw, ah, 14); ctx.clip();
      drawCover(ctx, im, ax, ay, aw, ah);
      ctx.restore();
      ctx.lineWidth = 5; ctx.strokeStyle = theme.boxEdge;
      rr(ctx, ax, ay, aw, ah, 14); ctx.stroke();

      rr(ctx, pad, uy, W - pad * 2, uh, 16);
      ctx.fillStyle = theme.boxBg; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = theme.boxEdge; ctx.stroke();
    }

    // stat box shells only — their labels are painted above the foil
    for (let i = 0; i < 3; i++) {
      const sx = pad + i * (sw + 20);
      rr(ctx, sx, sy, sw, sh, 12);
      ctx.fillStyle = isFullLayout ? 'rgba(255,255,255,0.16)' : theme.boxBg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isFullLayout ? 'rgba(255,255,255,0.3)' : theme.boxEdge;
      ctx.stroke();
    }

    return {
      cv, W, H, R, pad, im, theme, type, isFullLayout,
      uy, uh, sy, sh, sw,
      artRect: isFullLayout ? [B, B, W - B * 2, H - B * 2] : [pad, 150, W - pad * 2, 470],
      artRadius: isFullLayout ? R - 14 : 14,
      seed: hashStr(card.id),
    };
  }

  /**
   * Draw something with a compounded dark shadow.
   *
   * Full-art text lies straight on the artwork, so a single canvas shadow is
   * far too faint over bright images. Repeating the draw stacks the shadow
   * into a proper halo — widest pass first, tightening on each repeat, which
   * gives a soft outer glow with a crisp dark edge against the glyphs.
   * Costs nothing per frame because the text layer is rendered once and
   * reused for the whole loop.
   */
  function shadowed(ctx, draw, { blur = 10, alpha = 0.9, passes = 3 } = {}) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${alpha})`;
    ctx.shadowOffsetY = 1;
    for (let i = 0; i < passes; i++) {
      ctx.shadowBlur = blur * (1 - i / (passes + 1));
      draw();
    }
    ctx.restore();
  }

  /**
   * Everything that has to stay readable: title, flavour text, stat values,
   * type badge and credits. Painted AFTER the foil so the shimmer passes
   * behind the words instead of washing them out.
   */
  function drawText(ctx, geo, card, rankKey) {
    const { W, H, pad, theme, type, isFullLayout, uy, sy, sw } = geo;

    // type badge first — the title's width budget depends on how wide it is
    const badge = type.abbr || type.name;
    ctx.font = '800 23px "Segoe UI", sans-serif';
    const bw = Math.max(64, ctx.measureText(badge).width + 26);
    const bh = 44, bx = W - pad - bw, by = 84;
    shadowed(ctx, () => {
      rr(ctx, bx, by, bw, bh, 10);
      ctx.fillStyle = type.color;
      ctx.fill();
    }, { blur: isFullLayout ? 9 : 4, alpha: isFullLayout ? 0.8 : 0.45, passes: isFullLayout ? 2 : 1 });
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    rr(ctx, bx, by, bw, bh, 10); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    shadowed(ctx, () => ctx.fillText(badge, bx + bw / 2, by + 31),
      { blur: 3, alpha: 0.6, passes: 1 });
    ctx.textAlign = 'left';

    const titleMax = bx - pad - 18;

    if (isFullLayout) {
      ctx.fillStyle = '#ffffff';
      ctx.font = theme.titleFont.replace('%', '48');
      shadowed(ctx, () => ctx.fillText(card.title, pad, 112, titleMax),
        { blur: 14, alpha: 0.95 });

      ctx.font = theme.bodyFont.replace('%', '28');
      ctx.fillStyle = '#f4f6fa';
      // 4 lines max: any more would run into the stats row on the 5:7 frame
      shadowed(ctx, () => wrap(ctx, card.usage, pad, H - 290, W - pad * 2, 38, 4),
        { blur: 10, alpha: 0.95 });
    } else {
      ctx.fillStyle = theme.title;
      ctx.font = theme.titleFont.replace('%', '44');
      ctx.fillText(card.title, pad, 118, titleMax);

      ctx.fillStyle = theme.boxText;
      ctx.font = theme.bodyFont.replace('%', '29');
      wrap(ctx, card.usage, pad + 26, uy + 56, W - pad * 2 - 52, 40, 5);
    }

    const stats = [['PWR', card.pwr], ['WIT', card.wit], ['CHS', card.chs]];
    ctx.font = '800 26px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isFullLayout ? '#fff' : theme.boxText;
    stats.forEach(([label, val], i) => {
      const draw = () => ctx.fillText(`${label} ${val}`, pad + i * (sw + 20) + sw / 2, sy + 43);
      if (isFullLayout) shadowed(ctx, draw, { blur: 8, alpha: 0.9 });
      else draw();
    });
    ctx.textAlign = 'left';

    paintCredits(ctx, geo, rankKey);
  }

  /**
   * The text never changes across the loop, so render it once onto a
   * transparent layer and blit that per frame. Keeps the heavier multi-pass
   * shadows free.
   */
  function buildTextLayer(card, rankKey, geo) {
    const cv = document.createElement('canvas');
    cv.width = geo.W; cv.height = geo.H;
    drawText(cv.getContext('2d'), geo, card, rankKey);
    return cv;
  }

  /** Paint the animated foil for this rarity at loop phase `t`. */
  function paintFoil(ctx, geo, rankKey, t) {
    const { W, H, R, im, theme, type, artRect, artRadius, seed } = geo;
    if (rankKey === 'reverse') {
      applyFoil(ctx, 0, 0, W, H, t, R);
      // re-draw art so the foil reads as "everything but the image"
      ctx.save(); rr(ctx, ...artRect, artRadius); ctx.clip();
      drawCover(ctx, im, ...artRect); ctx.restore();
      ctx.lineWidth = 5; ctx.strokeStyle = theme.boxEdge;
      rr(ctx, ...artRect, artRadius); ctx.stroke();
    } else if (rankKey === 'holo') {
      applyFoil(ctx, ...artRect, t, artRadius);
    } else if (rankKey === 'fullart' || rankKey === 'cosmic') {
      applyFoil(ctx, 0, 0, W, H, t, R);
      if (rankKey === 'cosmic') drawCosmicSymbols(ctx, type.sym, W, H, t, seed, R);
    }
  }

  /**
   * Credits line: rarity on the right, and the owner's signature on the left
   * where a card would normally credit its illustrator. Drawn above the foil
   * so the watermark stays legible through the shimmer.
   */
  function paintCredits(ctx, geo, rankKey) {
    const { W, H, pad, isFullLayout } = geo;
    const light = isFullLayout || RG.state.theme === 'mtg';
    // on full art these sit on bare artwork, so they get the halo treatment
    const shade = isFullLayout ? { blur: 7, alpha: 0.9, passes: 2 }
                               : { blur: 3, alpha: 0.5, passes: 1 };
    ctx.save();
    ctx.font = '800 20px "Segoe UI", sans-serif';
    ctx.fillStyle = light ? 'rgba(255,255,255,0.85)' : 'rgba(23,32,43,0.55)';

    ctx.textAlign = 'right';
    const rarity = RG.RARITIES.find(r => r.key === rankKey).name.toUpperCase();
    if (light) shadowed(ctx, () => ctx.fillText(rarity, W - pad, H - 38), shade);
    else ctx.fillText(rarity, W - pad, H - 38);

    const sig = (RG.state.signature || '').trim();
    if (sig) {
      ctx.textAlign = 'left';
      // Deliberately no brush/pen emoji: this is baked in on the creator's
      // machine, and a box without an emoji font would be permanent.
      ctx.font = RG.state.theme === 'mtg'
        ? 'italic 20px Georgia, serif'
        : '600 20px "Segoe UI", sans-serif';
      ctx.fillStyle = light ? 'rgba(255,255,255,0.88)' : 'rgba(23,32,43,0.62)';
      const label = `Illus. ${sig}`;
      // hard clip so a long nickname can't run under the rarity label
      ctx.beginPath();
      ctx.rect(pad, H - 60, W - pad * 2 - 200, 34);
      ctx.clip();
      if (light) shadowed(ctx, () => ctx.fillText(label, pad, H - 38), shade);
      else ctx.fillText(label, pad, H - 38);
    }
    ctx.restore();
  }

  /**
   * Render one complete frame. opts: { t, art, base } — pass `base` to reuse
   * a previously rendered static layer.
   */
  async function renderFrame(card, rankKey, opts = {}) {
    const geo = opts.base || await renderBase(card, rankKey, opts.art);
    const text = opts.textLayer || buildTextLayer(card, rankKey, geo);
    const cv = document.createElement('canvas');
    cv.width = geo.W; cv.height = geo.H;
    const ctx = cv.getContext('2d');
    // backdrop -> foil -> text, so the glint never sits over the words
    ctx.drawImage(geo.cv, 0, 0);
    paintFoil(ctx, geo, rankKey, opts.t || 0);
    ctx.drawImage(text, 0, 0);
    return cv;
  }

  const render = (card, rankKey) => renderFrame(card, rankKey);

  /* ================= animated GIF export ================= */

  const isVideo = src => /\.(mp4|webm|mov|m4v)$/i.test(src);
  /** Anything whose own pixels move, independent of the foil. */
  const artAnimates = src => /\.gif$/i.test(src) || isVideo(src);

  /* Decoded art frames are expensive to produce and get reused across every
     re-export of the same card, so cache the promise. Capped in size because
     these are full-resolution canvases. */
  const artFrameCache = new Map();
  const MAX_ART_PX = 900;

  /** Scale so the long edge is at most MAX_ART_PX — art gets cropped and
      downscaled into the card anyway, so full source resolution is waste. */
  function fitCanvas(srcW, srcH) {
    const s = Math.min(1, MAX_ART_PX / Math.max(srcW, srcH));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(srcW * s));
    c.height = Math.max(1, Math.round(srcH * s));
    return c;
  }

  function seekTo(video, t) {
    return new Promise(resolve => {
      let timer = 0;
      const done = () => {
        clearTimeout(timer);
        video.removeEventListener('seeked', done);
        resolve();
      };
      video.addEventListener('seeked', done);
      // don't wedge the whole export if a seek never reports back
      timer = setTimeout(done, 3000);
      video.currentTime = t;
    });
  }

  /**
   * Sample a video into canvases by seeking. Only the first `windowSec` is
   * used so playback keeps its natural speed rather than being compressed
   * into the foil loop; buildTimeline then repeats it as needed.
   */
  async function decodeVideoFrames(src, windowSec, fps, cap) {
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    await withTimeout(new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('could not load ' + src));
    }), 15000, 'video metadata');

    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration : windowSec;
    const win = Math.min(duration, windowSec);

    /* GIF stores delays in whole centiseconds, so choose the delay FIRST and
       derive the frame count from it. Picking the count first and dividing
       leaves a fractional delay that gets rounded at encode time, and the loop
       silently plays back longer than asked for (6s at 20fps, capped to 80
       frames, came out as 6.4s). */
    let delayCs = Math.max(2, Math.round(100 / fps));
    let n = Math.max(2, Math.round((win * 100) / delayCs));
    if (n > cap) {
      // too many frames for the budget: keep the duration, slow the sampling
      n = cap;
      delayCs = Math.max(2, Math.round((win * 100) / n));
    }

    const frames = [];
    for (let i = 0; i < n; i++) {
      await seekTo(video, (i / n) * win);
      const c = fitCanvas(video.videoWidth || 640, video.videoHeight || 360);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      frames.push({ img: c, ms: delayCs * 10 });
    }
    video.src = '';
    return frames;
  }

  /** Decode an animated GIF source into canvases + per-frame delays. */
  async function decodeGifFrames(src, maxFrames) {
    const buf = await (await fetch(src)).arrayBuffer();
    const dec = new ImageDecoder({ data: buf, type: 'image/gif' });
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack.frameCount;
    if (count < 2) return null;
    const stride = Math.max(1, Math.ceil(count / maxFrames));
    const frames = [];
    for (let i = 0; i < count; i += stride) {
      const { image } = await dec.decode({ frameIndex: i });
      const c = fitCanvas(image.displayWidth, image.displayHeight);
      c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
      // duration is µs; multiply by stride since we skip frames
      const ms = Math.max(20, ((image.duration || 70000) / 1000) * stride);
      image.close();
      frames.push({ img: c, ms });
    }
    return frames;
  }

  /** One loop of the card's own animation, or null for static art. */
  function decodeArtFrames(card, windowSec, fps, cap = MAX_FRAMES) {
    const src = card.img;
    if (!artAnimates(src)) return Promise.resolve(null);

    const key = `${src}|${windowSec}|${fps}|${cap}`;
    if (artFrameCache.has(key)) return artFrameCache.get(key);

    const job = (async () => {
      try {
        if (isVideo(src)) return await decodeVideoFrames(src, windowSec, fps, cap);
        if (!('ImageDecoder' in window)) return null;
        return await decodeGifFrames(src, cap);
      } catch (err) {
        console.warn('Falling back to a still frame for', src, err);
        return null;
      }
    })();
    artFrameCache.set(key, job);
    // Never cache a failure — one stalled fetch would otherwise leave this
    // card permanently un-animated for the rest of the session.
    job.then(frames => { if (!frames || !frames.length) artFrameCache.delete(key); },
             () => artFrameCache.delete(key));
    return job;
  }

  /* ---- median-cut palette quantization ---- */

  function buildPalette(samples, maxColors = 256) {
    // samples: array of 0xRRGGBB ints
    let boxes = [samples];
    const rangeOf = box => {
      let lo = [255, 255, 255], hi = [0, 0, 0];
      for (const c of box) {
        const ch = [c >> 16 & 255, c >> 8 & 255, c & 255];
        for (let i = 0; i < 3; i++) {
          if (ch[i] < lo[i]) lo[i] = ch[i];
          if (ch[i] > hi[i]) hi[i] = ch[i];
        }
      }
      const spans = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      const axis = spans.indexOf(Math.max(...spans));
      return { axis, span: spans[axis] };
    };
    while (boxes.length < maxColors) {
      let bestI = -1, bestSpan = 0, bestAxis = 0;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].length < 2) continue;
        const { axis, span } = rangeOf(boxes[i]);
        if (span > bestSpan) { bestSpan = span; bestI = i; bestAxis = axis; }
      }
      if (bestI < 0 || bestSpan === 0) break;
      const shift = bestAxis === 0 ? 16 : bestAxis === 1 ? 8 : 0;
      const box = boxes[bestI].slice().sort((a, b) => (a >> shift & 255) - (b >> shift & 255));
      const mid = box.length >> 1;
      boxes.splice(bestI, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.map(box => {
      let r = 0, g = 0, b = 0;
      for (const c of box) { r += c >> 16 & 255; g += c >> 8 & 255; b += c & 255; }
      const n = box.length || 1;
      return [(r / n) | 0, (g / n) | 0, (b / n) | 0];
    });
  }

  function makeQuantizer(palette) {
    const cache = new Map();
    return (r, g, b) => {
      const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
      let idx = cache.get(key);
      if (idx === undefined) {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < palette.length; i++) {
          const p = palette[i];
          const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
          if (d < bestD) { bestD = d; best = i; }
        }
        cache.set(key, idx = best);
      }
      return idx;
    };
  }

  /* ---- GIF89a / LZW encoder ---- */

  function lzwEncode(indices, out) {
    const MIN = 8, CLEAR = 256, EOI = 257;
    let codeSize, dict, next;
    let cur = 0, curBits = 0;
    const bytes = [];
    const emit = code => {
      cur |= code << curBits;
      curBits += codeSize;
      while (curBits >= 8) { bytes.push(cur & 255); cur >>= 8; curBits -= 8; }
    };
    // canonical ordering (ImageMagick/jsgif): emit, THEN widen using the
    // pre-add `next`, THEN add the entry — decoders lag one entry behind
    const bump = () => { if (next > (1 << codeSize) - 1 && codeSize < 12) codeSize++; };
    const reset = () => { dict = new Map(); next = EOI + 1; codeSize = MIN + 1; };
    reset();
    emit(CLEAR);
    let prev = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prev << 8) | k;
      const found = dict.get(key);
      if (found !== undefined) { prev = found; continue; }
      emit(prev);
      bump();
      if (next < 4096) {
        dict.set(key, next++);
      } else {
        emit(CLEAR);
        reset();
      }
      prev = k;
    }
    emit(prev);
    bump();
    emit(EOI);
    if (curBits > 0) bytes.push(cur & 255);

    out.push(MIN); // LZW minimum code size
    for (let i = 0; i < bytes.length; i += 255) {
      const chunk = bytes.slice(i, i + 255);
      out.push(chunk.length, ...chunk);
    }
    out.push(0); // block terminator
  }

  function encodeGif(w, h, palette, frames /* [{indices, ms}] */) {
    const out = [];
    const u16 = v => out.push(v & 255, (v >> 8) & 255);
    for (const ch of 'GIF89a') out.push(ch.charCodeAt(0));
    u16(w); u16(h);
    out.push(0xF7, 0, 0); // global palette, 256 entries
    for (let i = 0; i < 256; i++) {
      const p = palette[i] || [0, 0, 0];
      out.push(p[0], p[1], p[2]);
    }
    if (frames.length > 1) {
      // NETSCAPE loop-forever extension
      out.push(0x21, 0xFF, 0x0B);
      for (const ch of 'NETSCAPE2.0') out.push(ch.charCodeAt(0));
      out.push(3, 1, 0, 0, 0);
    }
    for (const { indices, ms } of frames) {
      // GCE: disposal=1 (keep) | transparency flag; index 255 is transparent
      out.push(0x21, 0xF9, 4, 0x05, 0, 0, 255, 0);
      out[out.length - 4] = Math.round(ms / 10) & 255;
      out[out.length - 3] = (Math.round(ms / 10) >> 8) & 255;
      out.push(0x2C); u16(0); u16(0); u16(w); u16(h); out.push(0); // image descriptor
      lzwEncode(indices, out);
    }
    out.push(0x3B);
    return new Uint8Array(out);
  }

  /* ---- shared animation pipeline ---- */

  /** Does anything on this card move? Foil animates above Standard. */
  function animatable(card, rankKey) {
    const rank = RG.RARITIES.findIndex(r => r.key === rankKey);
    return rank >= 1 || artAnimates(card.img);
  }

  /**
   * Build the frame timeline: [{t, art, ms}].
   *
   * The foil always takes LOOP_SECONDS to complete one cycle. When the source
   * art is itself an animated GIF, its loop is repeated as many times as it
   * takes to fill that window — that keeps both animations seamless at the
   * wrap point instead of forcing the foil to race the art.
   */
  async function buildTimeline(card, rankKey, opts) {
    const { loopSeconds, fps } = opts;
    const rank = RG.RARITIES.findIndex(r => r.key === rankKey);
    const hasFoil = rank >= 1;
    const artFrames = await decodeArtFrames(card, loopSeconds, fps, opts.maxFrames);
    const delayMs = Math.round(100 / fps) * 10;  // snap to whole centiseconds

    if (artFrames) {
      const artLoop = artFrames.reduce((s, f) => s + f.ms, 0);
      // repeat the art loop to reach the foil period (capped so a very short
      // source GIF can't explode the frame count)
      const reps = hasFoil && artLoop > 0
        ? Math.max(1, Math.min(8, Math.round((loopSeconds * 1000) / artLoop)))
        : 1;
      const total = artLoop * reps;
      const out = [];
      let cum = 0;
      for (let r = 0; r < reps; r++) {
        for (const f of artFrames) {
          out.push({ t: total ? cum / total : 0, art: f.img, ms: f.ms });
          cum += f.ms;
        }
      }
      return out;
    }
    if (hasFoil) {
      const n = Math.max(2, Math.round(loopSeconds * fps));
      return Array.from({ length: n }, (_, i) => ({ t: i / n, art: null, ms: delayMs }));
    }
    return [{ t: 0, art: null, ms: 1000 }]; // nothing animates: single frame
  }

  /** Render a timeline down to RGBA pixel buffers at export resolution. */
  async function renderTimeline(card, rankKey, timeline, width, onProgress) {
    // Static art means the base layer never changes, so build it once.
    const sharedBase = timeline[0].art ? null : await renderBase(card, rankKey, null);
    const probe = sharedBase || await renderBase(card, rankKey, timeline[0].art);
    const W = width, H = Math.round(probe.H * (width / probe.W));

    const small = document.createElement('canvas');
    small.width = W; small.height = H;
    const sctx = small.getContext('2d', { willReadFrequently: true });

    // identical on every frame — build it once for the whole loop
    const textLayer = buildTextLayer(card, rankKey, probe);

    const frames = [];
    for (const entry of timeline) {
      const full = await renderFrame(card, rankKey, { ...entry, base: sharedBase, textLayer });
      sctx.clearRect(0, 0, W, H);
      sctx.drawImage(full, 0, 0, W, H);
      frames.push({ data: sctx.getImageData(0, 0, W, H).data, ms: entry.ms });
      if (onProgress && frames.length % 8 === 0) {
        onProgress(frames.length / timeline.length);
        // yield so the progress toast can actually paint
        await new Promise(r => setTimeout(r, 0));
      }
    }
    return { W, H, frames };
  }

  /**
   * Render an animated GIF of the card. Animates the foil for any rarity
   * above Standard, and the art itself when the source image is a GIF.
   * Palette index 255 is reserved for transparency so the rounded corners
   * don't export as black blocks.
   */
  async function encodeGifAt(card, rankKey, width, loopSeconds, fps, onProgress) {
    const timeline = await buildTimeline(card, rankKey, { loopSeconds, fps });
    const { W, H, frames: frameData } =
      await renderTimeline(card, rankKey, timeline, width, onProgress);

    // global palette from samples spread across frames (opaque pixels only)
    const samples = [];
    const step = Math.max(1, Math.floor(frameData.length / 3));
    for (let f = 0; f < frameData.length; f += step) {
      const d = frameData[f].data;
      for (let i = 0; i < d.length; i += 16) {
        if (d[i + 3] >= 128) samples.push(d[i] << 16 | d[i + 1] << 8 | d[i + 2]);
      }
    }
    const palette = buildPalette(samples, 255); // 255 colors; 255 = transparent
    const quant = makeQuantizer(palette);

    const frames = frameData.map(({ data, ms }) => {
      const indices = new Uint8Array(data.length / 4);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        indices[j] = data[i + 3] < 128 ? 255 : quant(data[i], data[i + 1], data[i + 2]);
      }
      return { indices, ms };
    });

    return new Blob([encodeGif(W, H, palette, frames)], { type: 'image/gif' });
  }

  /**
   * Render an animated GIF of the card, aiming for TARGET_BYTES and never
   * exceeding MAX_BYTES. Frame count varies by card (animated source art
   * brings its own timing), so overshoot is possible — when it happens the
   * width is scaled by the square root of the overshoot, since GIF size
   * tracks pixel count fairly closely, and re-encoded.
   */
  async function toGifBlob(card, rankKey, opts = {}) {
    const loopSeconds = opts.loopSeconds ?? LOOP_SECONDS;
    const fps         = opts.fps ?? FPS;
    const maxBytes    = opts.maxBytes ?? MAX_BYTES;
    const onProgress  = opts.onProgress;
    let width         = opts.width
      ?? (artAnimates(card.img) ? MOVING_ART_WIDTH : DEFAULT_WIDTH);

    let blob = await encodeGifAt(card, rankKey, width, loopSeconds, fps, onProgress);
    for (let attempt = 0; attempt < 2 && blob.size > maxBytes; attempt++) {
      const next = Math.max(MIN_WIDTH,
        Math.round(width * Math.sqrt(TARGET_BYTES / blob.size)));
      if (next >= width) break;
      width = next;
      blob = await encodeGifAt(card, rankKey, width, loopSeconds, fps, onProgress);
    }
    return blob;
  }


  const filename = (card, rankKey) => `${card.id}-${rankKey}.gif`;

  return { render, toGifBlob, animatable, filename, TARGET_BYTES, MAX_BYTES };
})();
