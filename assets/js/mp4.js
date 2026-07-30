/* H.264/MP4 encoder for card exports.
   WebCodecs does the compression; the muxing is from scratch, same as the GIF
   encoder next door. Produces a plain progressive MP4 with the moov box ahead
   of the mdat so players can start without fetching the whole file. */
window.RG = window.RG || {};

RG.mp4 = (() => {
  /* Frame durations arrive as whole milliseconds, so a 1000 Hz timescale
     represents every one of them exactly and stts never accumulates drift. */
  const TIMESCALE = 1000;

  /* Constrained Baseline, level 4.0.
     Deliberately not High: the higher profiles let the encoder emit B-frames,
     which decouples decode order from presentation order and would oblige us
     to write a ctts table and carry separate dts/pts. Baseline has neither
     problem — output order matches input order — and costs maybe 15% size
     against a format we're already beating by 4x. */
  const CODEC = 'avc1.42E028';

  /* Rounded corners are transparent in the source frames and H.264 has no
     alpha, so they get composited onto this. Discord's dark-theme message
     background, which makes the matte invisible where most people will see it. */
  const MATTE = { r: 0x31, g: 0x33, b: 0x38 };

  /* ---------- box writing ---------- */

  const concat = parts => {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };

  const u8  = v => new Uint8Array([v & 0xff]);
  const u16 = v => { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, v & 0xffff); return a; };
  const u32 = v => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, v >>> 0); return a; };
  const zeros = n => new Uint8Array(n);
  const fourcc = s => new Uint8Array([s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)]);

  /** size + type + payload */
  const box = (type, ...parts) => {
    const payload = concat(parts);
    return concat([u32(payload.length + 8), fourcc(type), payload]);
  };
  /** a box whose payload opens with a version/flags word */
  const fullBox = (type, version, flags, ...parts) =>
    box(type, u8(version), new Uint8Array([(flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);

  // identity transform, 16.16 fixed point except the last cell (2.30)
  const UNITY_MATRIX = concat([
    u32(0x00010000), u32(0), u32(0),
    u32(0), u32(0x00010000), u32(0),
    u32(0), u32(0), u32(0x40000000),
  ]);

  /* ---------- the container ---------- */

  function mux(samples, { width, height, avcC, durationMs }) {
    const dur = Math.max(1, Math.round(durationMs * TIMESCALE / 1000));

    // stts: run-length encoded (count, delta) pairs
    const runs = [];
    for (const s of samples) {
      const d = Math.max(1, Math.round(s.ms));
      const last = runs[runs.length - 1];
      if (last && last.delta === d) last.count++;
      else runs.push({ count: 1, delta: d });
    }
    const stts = fullBox('stts', 0, 0, u32(runs.length),
      ...runs.flatMap(r => [u32(r.count), u32(r.delta)]));

    const syncs = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
    const stss = fullBox('stss', 0, 0, u32(syncs.length), ...syncs.map(u32));

    const stsz = fullBox('stsz', 0, 0, u32(0), u32(samples.length),
      ...samples.map(s => u32(s.bytes.length)));

    // everything in one chunk keeps stsc/stco to a single entry each
    const stsc = fullBox('stsc', 0, 0, u32(1), u32(1), u32(samples.length), u32(1));

    const avc1 = box('avc1',
      zeros(6), u16(1),                    // reserved, data_reference_index
      u16(0), u16(0), zeros(12),           // pre_defined, reserved, pre_defined[3]
      u16(width), u16(height),
      u32(0x00480000), u32(0x00480000),    // 72 dpi horizontal / vertical
      u32(0), u16(1),                      // reserved, frame_count
      zeros(32),                           // compressorname (unset)
      u16(0x0018), u16(0xffff),            // depth, pre_defined
      box('avcC', avcC));

    const stsd = fullBox('stsd', 0, 0, u32(1), avc1);

    /* stco holds absolute file offsets, which depend on the size of the moov
       box that contains it. Build it once with a placeholder to learn moov's
       length, then rebuild — the offset field is a fixed four bytes, so the
       second pass is guaranteed to be the same size as the first. */
    const buildMoov = mdatOffset => {
      const stbl = box('stbl', stsd, stts, stss, stsc, stsz,
        fullBox('stco', 0, 0, u32(1), u32(mdatOffset)));
      const minf = box('minf',
        fullBox('vmhd', 0, 1, u16(0), zeros(6)),
        box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
        stbl);
      const mdia = box('mdia',
        fullBox('mdhd', 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(dur),
          u16(0x55c4), u16(0)),            // language 'und'
        box('hdlr', zeros(4), u32(0), fourcc('vide'), zeros(12),
          new Uint8Array([...'VideoHandler'].map(c => c.charCodeAt(0)).concat(0))),
        minf);
      const trak = box('trak',
        fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(dur),
          zeros(8), u16(0), u16(0), u16(0), u16(0),
          UNITY_MATRIX, u32(width << 16), u32(height << 16)),
        mdia);
      return box('moov',
        fullBox('mvhd', 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(dur),
          u32(0x00010000), u16(0x0100), zeros(10), UNITY_MATRIX, zeros(24), u32(2)),
        trak);
    };

    const ftyp = box('ftyp', fourcc('isom'), u32(0x200),
      fourcc('isom'), fourcc('iso2'), fourcc('avc1'), fourcc('mp41'));

    const probe = buildMoov(0);
    const moov = buildMoov(ftyp.length + probe.length + 8);   // +8 = mdat header
    const mdat = box('mdat', ...samples.map(s => s.bytes));

    return new Blob([concat([ftyp, moov, mdat])], { type: 'video/mp4' });
  }

  /* ---------- pixels in, file out ---------- */

  /**
   * Flatten one RGBA frame onto the matte and pad to even dimensions.
   * H.264 chroma subsampling requires both axes even, and premultiplying here
   * means the encoder never sees the alpha channel it would silently drop.
   */
  function flatten(rgba, W, H, EW, EH, matte) {
    const out = new Uint8Array(EW * EH * 4);
    for (let y = 0; y < EH; y++) {
      const sy = y < H ? y : H - 1;
      for (let x = 0; x < EW; x++) {
        const sx = x < W ? x : W - 1;
        const s = (sy * W + sx) * 4, d = (y * EW + x) * 4;
        const a = rgba[s + 3] / 255;
        out[d]     = Math.round(rgba[s]     * a + matte.r * (1 - a));
        out[d + 1] = Math.round(rgba[s + 1] * a + matte.g * (1 - a));
        out[d + 2] = Math.round(rgba[s + 2] * a + matte.b * (1 - a));
        out[d + 3] = 255;
      }
    }
    return out;
  }

  const supported = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

  /**
   * @param {{W:number,H:number,frames:{data:Uint8ClampedArray,ms:number}[]}} timeline
   * @returns {Promise<Blob>} video/mp4
   */
  async function encode({ W, H, frames }, opts = {}) {
    if (!supported()) throw new Error('WebCodecs video encoding is unavailable');
    if (!frames.length) throw new Error('nothing to encode');

    const EW = W + (W & 1), EH = H + (H & 1);
    const matte = opts.matte || MATTE;
    const bitrate = opts.bitrate || 2_000_000;
    const durationMs = frames.reduce((s, f) => s + f.ms, 0);
    const fps = Math.max(1, Math.round(frames.length / (durationMs / 1000)));

    const samples = [];
    let avcC = null, failure = null;

    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const desc = meta?.decoderConfig?.description;
        if (desc && !avcC) avcC = new Uint8Array(desc);
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        samples.push({ bytes, key: chunk.type === 'key', ms: 0 });
      },
      error: e => { failure = e; },
    });

    encoder.configure({
      codec: CODEC, width: EW, height: EH, bitrate, framerate: fps,
      avc: { format: 'avc' },            // length-prefixed NALs, as mdat wants
      latencyMode: 'quality',
    });

    let ts = 0;
    for (let i = 0; i < frames.length; i++) {
      if (failure) break;
      const f = frames[i];
      const frame = new VideoFrame(flatten(f.data, W, H, EW, EH, matte), {
        format: 'RGBA', codedWidth: EW, codedHeight: EH,
        timestamp: Math.round(ts * 1000), duration: Math.round(f.ms * 1000),
      });
      encoder.encode(frame, { keyFrame: i === 0 });
      frame.close();
      ts += f.ms;

      // keep the encoder queue short so a long clip doesn't balloon memory
      if (encoder.encodeQueueSize > 12) {
        await new Promise(r => {
          const tick = () => (encoder.encodeQueueSize <= 4 ? r() : setTimeout(tick, 4));
          tick();
        });
      }
      if (opts.onProgress && i % 8 === 0) opts.onProgress(i / frames.length);
    }

    await encoder.flush();
    encoder.close();
    if (failure) throw failure;
    if (!avcC) throw new Error('encoder never produced a decoder configuration');
    if (samples.length !== frames.length) {
      throw new Error(`encoder returned ${samples.length} of ${frames.length} frames`);
    }

    // Baseline profile means no reordering, so sample i is frame i.
    for (let i = 0; i < samples.length; i++) samples[i].ms = frames[i].ms;

    return mux(samples, { width: EW, height: EH, avcC, durationMs });
  }

  return { encode, supported, MATTE, CODEC };
})();
