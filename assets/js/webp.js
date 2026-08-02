/* Animated WebP encoder for card exports.
   The browser does the actual compression — canvas.toBlob('image/webp') gives
   us one compressed still per frame — so all this has to do is unwrap those
   stills and re-wrap them as a RIFF animation. Simpler than the MP4 muxer next
   door, and unlike H.264 it keeps 24-bit colour AND an alpha channel, which is
   what the GIF palette and the MP4 matte were each costing us. */
window.RG = window.RG || {};

RG.webp = (() => {
  /* Chrome's own WebP quality scale. 0.75 measured smaller than the 255-colour
     GIF of the same frames while carrying full colour. */
  const QUALITY = 0.75;

  const fourcc = s => new Uint8Array([s.charCodeAt(0), s.charCodeAt(1),
                                      s.charCodeAt(2), s.charCodeAt(3)]);

  const concat = parts => {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };

  const u32 = v => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, v >>> 0, true); return a; };
  const u16 = v => { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, v & 0xffff, true); return a; };
  // 24-bit little endian, which RIFF uses for sizes and durations
  const u24 = v => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255]);

  /** RIFF chunk: tag, little-endian size, payload, padded to an even length. */
  const chunk = (tag, payload) => concat([
    fourcc(tag), u32(payload.length), payload,
    payload.length & 1 ? new Uint8Array(1) : new Uint8Array(0),
  ]);

  /**
   * Pull the pieces we want out of a single-image WebP.
   *
   * Chrome emits VP8X / ICCP / ALPH / VP8 for a canvas with transparency, and
   * a bare VP8 when there isn't any. An animation frame wants only the alpha
   * and image chunks — the per-frame VP8X is replaced by one for the whole
   * file, and ICCP is a 456-byte colour profile repeated on every frame that
   * nothing in a chat client will ever read.
   */
  function frameChunks(buf) {
    const tagAt = o => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    if (tagAt(0) !== 'RIFF' || tagAt(8) !== 'WEBP') {
      throw new Error('canvas did not return a WebP');
    }
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const keep = [];
    let hasAlpha = false, off = 12;
    while (off + 8 <= buf.length) {
      const tag = tagAt(off);
      const size = dv.getUint32(off + 4, true);
      const total = 8 + size + (size & 1);
      if (tag === 'ALPH' || tag === 'VP8 ' || tag === 'VP8L') {
        keep.push(buf.subarray(off, off + total));
        if (tag === 'ALPH') hasAlpha = true;
        if (tag === 'VP8L') hasAlpha = true;   // lossless carries its own alpha
      }
      off += total;
    }
    if (!keep.length) throw new Error('no image chunk in WebP frame');
    return { data: concat(keep), hasAlpha };
  }

  /**
   * One ANMF (animation frame) chunk.
   * Full-canvas frames with blending disabled: each frame simply replaces what
   * was there, so a transparent corner stays transparent instead of compositing
   * over the previous frame and never clearing.
   */
  const anmf = (w, h, ms, data) => chunk('ANMF', concat([
    u24(0), u24(0),                    // x, y — in 2px units, both zero here
    u24(w - 1), u24(h - 1),
    u24(ms),
    new Uint8Array([0x02]),            // bit1 = do not blend, bit0 = no disposal
    data,
  ]));

  const supported = async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.8));
    return !!blob && blob.type === 'image/webp';
  };

  /* ---------------- encode pool ----------------

     Compressing one frame costs ~16 ms and a card is 80-120 frames, so the
     encode alone is ~2 s of the export — and on the main thread it also runs
     one frame at a time while the page can't do anything else. The work is
     embarrassingly parallel (frames don't reference each other), so hand it to
     a pool of workers: OffscreenCanvas.convertToBlob is the worker-side
     equivalent of canvas.toBlob and comes from the same encoder, so the bytes
     are identical to what the single-threaded path produced.

     Everything here degrades to the inline path if workers or OffscreenCanvas
     aren't available. */

  const WORKER_SRC = `
    self.onmessage = async (e) => {
      const { id, W, H, data, quality } = e.data;
      try {
        const cv = new OffscreenCanvas(W, H);
        const ctx = cv.getContext('2d');
        ctx.putImageData(new ImageData(data, W, H), 0, 0);
        const blob = await cv.convertToBlob({ type: 'image/webp', quality });
        const buf = await blob.arrayBuffer();
        self.postMessage({ id, buf }, [buf]);
      } catch (err) {
        self.postMessage({ id, error: String(err && err.message || err) });
      }
    };`;

  const poolSize = () =>
    Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));

  let pool = null;        // { workers, jobs, nextId } once started, false if unavailable

  function startPool() {
    if (pool !== null) return pool;
    pool = false;
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' ||
          !OffscreenCanvas.prototype.convertToBlob) return pool;
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      const jobs = new Map();
      const workers = [];
      for (let i = 0; i < poolSize(); i++) {
        const w = new Worker(url);
        w.onmessage = (e) => {
          const { id, buf, error } = e.data;
          const job = jobs.get(id);
          if (!job) return;
          jobs.delete(id);
          error ? job.reject(new Error(error)) : job.resolve(new Uint8Array(buf));
        };
        // A worker that dies takes its in-flight frame with it; fail that frame
        // so the caller can fall back rather than hanging forever.
        w.onerror = () => { for (const [, j] of jobs) j.reject(new Error('encode worker failed')); jobs.clear(); };
        workers.push(w);
      }
      URL.revokeObjectURL(url);
      pool = { workers, jobs, nextId: 1 };
    } catch {
      pool = false;
    }
    return pool;
  }

  /**
   * Compress `frames` in parallel, resolving to raw WebP bytes per frame in
   * the original order. Rejects if the pool can't be used, so callers fall
   * back to the inline encoder.
   *
   * Frames are structured-cloned rather than transferred: transferring detaches
   * the caller's buffers, and the size-retry loop re-encodes the very same
   * frames at a lower quality. A 2 MB memcpy per frame is nothing next to a
   * 16 ms compress.
   */
  function encodeFramesPooled({ W, H, frames }, quality, onProgress) {
    const p = startPool();
    if (!p) return Promise.reject(new Error('no encode pool'));

    const out = new Array(frames.length);
    let next = 0, done = 0;

    const runOne = (worker) => {
      if (next >= frames.length) return Promise.resolve();
      const i = next++;
      const id = p.nextId++;
      return new Promise((resolve, reject) => {
        p.jobs.set(id, { resolve, reject });
        worker.postMessage({ id, W, H, data: frames[i].data, quality });
      }).then(bytes => {
        out[i] = bytes;
        if (onProgress && ++done % 8 === 0) onProgress(done / frames.length);
        return runOne(worker);           // this worker takes the next frame
      });
    };

    return Promise.all(p.workers.map(runOne)).then(() => out);
  }

  /**
   * @param {{W:number,H:number,frames:{data:Uint8ClampedArray,ms:number}[]}} timeline
   * @returns {Promise<Blob>} image/webp
   */
  async function encode({ W, H, frames }, opts = {}) {
    if (!frames.length) throw new Error('nothing to encode');
    const quality = opts.quality ?? QUALITY;

    /* Compressed stills, one per frame. The pool does this in parallel; if it
       isn't available (or falls over) the inline encoder produces the same
       bytes, just serially. */
    let stills = null;
    if (opts.pooled !== false) {
      try {
        stills = await encodeFramesPooled({ W, H, frames }, quality, opts.onProgress);
      } catch (err) {
        console.warn('WebP encode pool unavailable; encoding inline.', err);
        stills = null;
      }
    }

    if (!stills) {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      stills = [];
      for (let i = 0; i < frames.length; i++) {
        ctx.clearRect(0, 0, W, H);
        ctx.putImageData(new ImageData(frames[i].data, W, H), 0, 0);
        const blob = await new Promise(r => cv.toBlob(r, 'image/webp', quality));
        if (!blob) throw new Error('this browser cannot encode WebP');
        stills.push(new Uint8Array(await blob.arrayBuffer()));
        if (opts.onProgress && i % 8 === 0) opts.onProgress(i / frames.length);
      }
    }

    const body = [];
    let anyAlpha = false;
    for (let i = 0; i < frames.length; i++) {
      const { data, hasAlpha } = frameChunks(stills[i]);
      anyAlpha = anyAlpha || hasAlpha;
      body.push(anmf(W, H, Math.max(10, Math.round(frames[i].ms)), data));
    }

    /* VP8X advertises the canvas size and which optional features follow.
       0x02 = animation, 0x10 = alpha. Without the alpha bit some decoders
       ignore the ALPH chunks and render the corners opaque. */
    const vp8x = chunk('VP8X', concat([
      new Uint8Array([0x02 | (anyAlpha ? 0x10 : 0), 0, 0, 0]),
      u24(W - 1), u24(H - 1),
    ]));
    const anim = chunk('ANIM', concat([
      u32(0x00000000),                 // background: transparent
      u16(0),                          // loop count, 0 = forever
    ]));

    const payload = concat([fourcc('WEBP'), vp8x, anim, ...body]);
    return new Blob([concat([fourcc('RIFF'), u32(payload.length), payload])],
                    { type: 'image/webp' });
  }

  return { encode, supported, QUALITY, poolSize };
})();
