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

  /**
   * @param {{W:number,H:number,frames:{data:Uint8ClampedArray,ms:number}[]}} timeline
   * @returns {Promise<Blob>} image/webp
   */
  async function encode({ W, H, frames }, opts = {}) {
    if (!frames.length) throw new Error('nothing to encode');
    const quality = opts.quality ?? QUALITY;

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    const body = [];
    let anyAlpha = false;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      ctx.clearRect(0, 0, W, H);
      ctx.putImageData(new ImageData(f.data, W, H), 0, 0);
      const blob = await new Promise(r => cv.toBlob(r, 'image/webp', quality));
      if (!blob) throw new Error('this browser cannot encode WebP');
      const { data, hasAlpha } = frameChunks(new Uint8Array(await blob.arrayBuffer()));
      anyAlpha = anyAlpha || hasAlpha;
      body.push(anmf(W, H, Math.max(10, Math.round(f.ms)), data));
      if (opts.onProgress && i % 8 === 0) opts.onProgress(i / frames.length);
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

  return { encode, supported, QUALITY };
})();
