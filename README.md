# Reaction Gacha 🎴

Pull reaction-image cards from packs like they're Pokémon cards. Two themes
(Poké / Arcane), five rarities, foil shaders, encrypted saves. Gloriously stupid.

## Run it

Serve the folder with PHP — under XAMPP it's already live at:

```
http://localhost/apps/reaction-gacha/
```

or standalone: `php -S localhost:8080` from this directory.

## How it works

| Piece | Where |
|---|---|
| Card definitions (title, usage text, types, stats, full-art support) | `data/cards.php` |
| Placeholder art generator | `tools/generate-art.php` (run: `php tools/generate-art.php`) |
| Card art | `assets/images/{card-id}.{mp4,webm,gif,webp,png,jpg,svg}` |
| Pack sounds (picked at random) | `assets/sounds/packs/interact/`, `assets/sounds/packs/open/` |
| Page shell + manifest | `index.php` |
| Frontend | `assets/js/*.js`, `assets/css/main.css` |
| Embed links | `e.php` (page), `i.php` (image), `api/share.php` (mint), `lib/embed.php` |
| Deployment | `install.sh`, `config.local.example.php`, `tools/gc.php` |
| Generated at runtime | `storage/` — instance secret, embed images, rate limits |

`storage/` is created automatically and holds the instance secret. **Don't
commit it**, and don't delete it unless you're happy invalidating every share
link ever minted.

### Replacing placeholder art with real reaction GIFs or video

Drop a file named after the card id into `assets/images/` — e.g.
`this-is-fine.gif` or `galaxy-brain.mp4`. Extension priority is
**mp4 → webm → gif → webp → png → jpg → svg**, so real art automatically beats
the generated SVG placeholder. No other changes needed.

**Video works like an animated GIF, only better.** MP4/WebM art plays in the
card (muted, looping, and paused while off-screen so a full grid doesn't decode
everything at once) and is sampled frame-by-frame into the export.

Sampling seeks a `<video>`, and the clip is **buffered through a `blob:` URL
first** rather than seeked over the network. Seeking a streamed video needs the
server to honour HTTP Range requests; PHP's built-in `php -S` doesn't, and
Chrome's response is to silently pin `currentTime` at 0 — every sample returns
frame zero and the art exports completely static, with no error raised
anywhere. A blob is in memory and always seekable. The exporter also warns if
widely separated samples come back byte-identical, because that failure is
otherwise invisible until someone looks closely at a finished card.

Up to `ART_SECONDS` (12 s) is sampled at 20 fps, so playback keeps its natural
speed rather than being squashed into the foil loop; shorter clips repeat to
fill it, and longer ones are truncated. See **Export** below for how the foil
keeps its own period across a long clip.

**Video art is painted into a `<canvas>`, from a video element that never
enters the document.** Browsers decorate `<video>` with their own floating
controls that hover over the artwork looking like part of the card: Chromium
offers picture-in-picture and cast, Opera GX adds a video pop-out button.
`disablePictureInPicture` and `controlsList` only cover Chromium's own — Opera's
is proprietary and ignores them, and it appears at the loop point rather than on
hover, so there's no interaction to suppress either. A canvas is not a media
element, so nothing has anything to attach to.

Painting is driven by `requestVideoFrameCallback` where available rather than
`requestAnimationFrame`: source clips run at 24-30 fps, so a plain rAF loop
would blit the same picture twice out of every three calls on a 60 Hz display.
The IntersectionObserver stops the paint loop *and* pauses the decoder when a
card scrolls off-screen. Art is also `pointer-events: none` so it never steals
the pointer from the tilt and click-to-expand handlers.

GIF and still art stay plain `<img>` — they have no media element to decorate.

**Art is always cover-cropped** — it fills its frame completely and overflows
are trimmed, never letterboxed or squashed. That's `object-fit: cover` on the
page and the equivalent maths in the canvas exporter, so both match. A wide
source in a Full Art frame therefore gets cropped hard to a tall portrait
slice: a 640×360 clip shows roughly its middle third. Art intended for Full
Art should be tall, or at least have its subject centred.

Media that won't load never breaks a render: the card falls back to a flat
gradient and logs a warning, and the failure isn't cached, so the next attempt
retries. Metadata loads and seeks are both bounded by timeouts so a stalled
fetch can't hang an export.

### One card, many faces

If `assets/images/{card-id}/` is a **directory** rather than a file, `index.php`
treats its contents as a pool and draws one at random. `pukeko-bird` uses this:
42 captioned birds, a different one per page load.

The draw happens **server-side, once per request**. That matters — the preview,
the expanded view and every export all read the same `card['img']`, so picking
per render would let the card you're looking at disagree with the file you just
downloaded. Reload for a different one.

Two extras come with a pool:

- `card['variant']` — the chosen filename, humanised (`neuron-activation` →
  `Neuron Activation`). Put `{variant}` anywhere in a card's `usage` text and it
  resolves to whatever was drawn.
- `card['variants']` — how many are in the pool.

A pool also tends to want `'fit' => 'contain'` (see below): 42 images means 42
aspect ratios, and one crop rectangle can't be right for all of them.

### Cover vs. contain

Art fills its window and crops the overflow, because a card frame is a fixed
aspect and source images are not. Set `'fit' => 'contain'` on a card to
letterbox instead, showing the whole image against the art window's backdrop.

Use it when the edges of an image carry meaning — `pukeko-bird`'s captions are
baked into the pixels, and a crop eventually eats a punchline. The preview and
the export share the letterbox colour (`.card-art` background in `main.css`,
`ART_BACKDROP` in `exporter.js`), so what you download matches what you saw.

Full Art ignores `fit`: a full-bleed frame has no window to letterbox inside.

A directory beats a same-named file, extensions are matched case-insensitively
(Debian's filesystem is case-sensitive; a `.JPG` that works on Windows would
otherwise vanish in production), and mixing stills with video in one pool is
fine — `vid` is set per pick.

### Adding a card

Add an entry to `data/cards.php` and provide art (drop in an image, or re-run the
generator for a placeholder). Cards with `fullArt => false` skip the Full Art
rarity when upgrading (standard → reverse → holo → cosmic).

Types live in the same file and carry both a full `name` and a three-letter
`abbr`. The card frame prints the abbreviation — `PSY`, `GRN`, `FGT` — so the
badge stays small and long titles get the width; the full name survives as the
badge's tooltip and on the embed page.

### Rarities

`Standard → Reverse Holofoil → Holofoil → Full Art → Cosmic`

- **Reverse Holofoil** — animated foil on everything *except* the image
- **Holofoil** — foil on the image only
- **Full Art** — art fills the frame edge to edge, text overlaid, foil everywhere
- **Cosmic** — foil on frame *and* image, plus twinkling element symbols

**Every rarity is the same 5:7 card** (750×1050 when exported). Full Art isn't a
taller card; it's the same frame with the artwork behind the text instead of in
a window. `fullArt => false` opts a card out because not every image survives
having text laid over it.

### One design, any size

The card renders at wildly different widths — 420px expanded, 178–258px in the
grid depending on the viewport, 230px in the reveal stack. So `.card` is a
**size container**, and every length inside it is a multiple of `--u`, where
1u is one pixel of the 230px reference design:

```css
.card { container-type: inline-size; --u: calc(100cqw / 230); }
.card-title { font-size: calc(14.5 * var(--u)); }   /* still reads as "14.5px" */
```

They used to be fixed pixels, so the expanded card kept grid-sized text in a
frame nearly twice as wide and read as sparse and under-filled. Now every
proportion is identical at every size — measured as a fraction of card width,
type, padding and radii come out **0.0% apart** between a 230px tile and the
420px expanded card.

Three things that are easy to get wrong here:

- **`cqw` in a container's own properties resolves against its *ancestor*
  container, not itself.** `--u` is declared on `.card` but only ever consumed
  by descendants, where it resolves against that card.
- **The card's own `border-radius` therefore can't use `--u`.** It's a
  percentage pair instead — `6.087% / 4.348%` — which resolves against the
  box's own width and height, and because the card is always 5:7 those two
  figures stay a circular 14px-at-230 corner at every size.
- **Border widths are floored to whole pixels**, so a 229.6px card computed
  2.99 and painted a 2px frame edge where 3px was intended. They go through
  `round(…, 1px)`, declared after the shorthand so an engine without `round()`
  keeps the plain `calc`.

The starfield sizes its glyphs from JS, so those are set in `cqw` directly
rather than px.

Two things container queries deliberately **can't** see, both of which are
correct: the reveal stack's cards are rotated in 3D and the expand animation
scales its card, so both have painted bounding boxes wider than the boxes they
were laid out in. Container units use the layout box. Measure with
`offsetWidth`, not `getBoundingClientRect`, or you will chase a drift that
isn't there.

**Foil over artwork uses `screen`; foil over the frame uses `color-dodge`.**
Not a stylistic split — color-dodge is `base / (1 - blend)`, so it clips to pure
white the moment the blend approaches 1 *and* multiplies whatever noise the
source already has. The highlight peaked at `.8`, i.e. a 5× gain on the grain
in a dark, heavily compressed reaction GIF, which read as coloured speckle and
crushed blacks rather than as foil. Card stock has no grain to amplify, so the
frame keeps it.

Measured on `popcorn-time` (dark, grainy source), artwork region:

| | color-dodge | screen |
|---|---|---|
| high-frequency energy (grain) | 11.5 | **5.6** |
| mean brightness | 73 | **87** (export renders 79) |
| blown-out pixels | present | **0%** |

Screen only ever lightens, so it can't amplify anything — but it also can't
produce color-dodge's intense iridescence. That's bought back with
`--foil-sat`, which saturates the foil layer *before* it blends and therefore
never touches the artwork. It's a custom property rather than a literal so the
`foil-hue` keyframe can carry per-layer saturation without forking the
animation.

**Cosmic always uses the standard frame**, never the full-bleed one — its symbol
layer needs an art window to read against. A Full-Art-capable card upgraded to
Cosmic therefore goes back to the standard frame. Cosmic foils the frame and the
artwork as two separate layers rather than one overlay — which is also what lets
each use the blend mode it needs (see above): a soft film on the light Pokémon
frame, `screen` on the photography. A single pass across both leaves the art
looking milky.

**The pointer-tracked sheen must never slide off its own box.** The foil is an
oversized gradient moved around by `--px`/`--py`. For a background image larger
than its box, `background-position: P%` puts it at an offset of
`-(S-100)·P/100`, so the image only still covers the box while `P` stays inside
0–100%. A `1.6` multiplier meant any `--px` or `--py` above **62.5** pushed it
off, the browser tiled it, and the tile edge crossed the card as a hard seam —
visible as a quadrant split whenever the pointer sat in the lower-right.

The multiplier is now `1`, so `P` cannot leave the safe range whatever the size
is, and the travel is bought back with a bigger image (`460%` gives 360% of
movement against the broken version's 384%) with the stripe stops scaled by
`340/460` so the bands keep the width they were tuned at. `background-repeat`
is `no-repeat` as a backstop: with nothing left to tile, a future regression
shows up immediately instead of as a seam subtle enough to need reporting.

Measured as the largest single-step jump in mean column/row luma with the
artwork differenced out — a gradient is smooth everywhere, so any large jump
*is* a seam:

| `--px`/`--py` | before | after |
|---|---|---|
| 50 / 50 | 1.1 | 1.1 |
| 70 / 70 | **8.5** | 0.9 |
| 85 / 85 | **10.7** | 0.8 |
| worst over a full 0–100 sweep of both axes | **10.7** | **1.2** |

Note the seam vanished again at 100/100, which is why it needed a sweep rather
than spot checks: the tile edge enters the card around 62.5 and leaves it again
before the extreme, so testing only the corners finds nothing.

**Glare streaks are soft-edged gradients, not solid bars.** The foil is smooth
everywhere else, so a flat `fillRect` streak made its two edges the only hard
transitions in the whole layer — which reads as bands ruled across the artwork
rather than as light falling on it. Measured on a holo card with the artwork
differenced out so only the foil remained:

| | solid bar | soft gradient |
|---|---|---|
| max luma jump between neighbouring pixels | 55.0 | **16.2** |
| 99.9th percentile | 47.0 | **7.9** |
| jumps over 6 | 96 | **19** |
| mean brightness the foil adds | 38.5 | 42.2 |

Brightness is tracked alongside because "smoother" must not quietly mean
"fainter" — the soft version is marginally brighter, since it's wider and more
opaque to compensate for spreading the same light over a falloff. The CSS foil
never had this problem: it was already built from interpolated gradient stops,
so this brings the export closer to what the page shows.

**Text always renders above the foil.** On the page the card body deliberately
avoids creating a stacking context so the title, flavour text, stats and credits
can sit at a layer above the glint; the canvas exporter mirrors this by drawing
in three passes — backdrop, foil, then text. Without it the shimmer washes out
exactly the words you need to read.

**The full-art bottom stack shares one backdrop.** Flavour text, stats and the
credit line live in a single `.card-bottom` wrapper that carries the scrim and
sizes itself to its contents. They were previously three separately positioned
bands (`bottom: 48px / 14px / 0`) each painting its own `rgba(0,0,0,.72)`; the
offsets were hand-tuned and didn't actually meet, so a few pixels of bright
artwork showed through between the stats and the credit, reading as a stray
horizontal rule — and the seams moved whenever a font size changed. In the
standard frame the same wrapper is a transparent pass-through.

**Full-art text also carries a dark halo**, since it sits straight on the
artwork with no box behind it. In CSS that's a two-part `text-shadow` — one
tight opaque layer for edge definition, one wide soft layer to darken whatever
is behind. Canvas has no equivalent of stacked shadows, so `shadowed()` draws
the same text two or three times with a shrinking blur, which compounds into
the same effect. That costs nothing per frame because the text layer is
rendered once and blitted for the whole loop.

Duplicates of a card at your **exact owned rarity** upgrade it one step; pulling a
higher rarity than you own replaces it.

### Viewing the collection at a chosen tier

`owned[id]` stores only the *highest* tier held, and holding a tier implies
every tier below it. So the grid can be re-pointed at any tier — the **Show
cards as** dropdown, right of the sort control.

It's a **ceiling, not an assignment**. A card owned at Standard stays Standard
however high the dropdown goes; the grid never shows a tier that hasn't been
earned. And because Full Art doesn't exist for every card, a `fullArt => false`
card asked for Full Art steps *down* to Holofoil rather than rendering in a
frame it was never drawn for. `RG.shownRank(card)` resolves both rules and is
the single place that decides what a card displays as.

Two consequences worth knowing:

- **Exports follow the view.** The right-click menu defaults to the tier on
  screen rather than the tier owned, so an embed link is the card you're
  looking at. Every owned tier is still in that dropdown — the setting changes
  the default, not the options.
- **Picking a tier there repaints the card immediately**, in the grid and in the
  expanded overlay, with the menu left open so the choice is visible before
  it's acted on. Those per-card pins are session-only and are cleared whenever
  the global dropdown changes, since a new global tier re-baselines everything.

Cards in the **reveal stack are never repainted** — they show the tier that was
actually pulled, and rewriting that from a view preference would edit the pull
in front of the person who just made it. Sorting by Rarity likewise ranks by
the tier owned, or pinning the grid to Standard would flatten the sort into a
tie-break on titles.

### Saves

Progress lives in `localStorage`, AES-GCM encrypted via WebCrypto (PBKDF2-derived
key, per-install random salt). This is tamper-resistance, not Fort Knox — the key
material necessarily lives client-side. Clear site data to wipe your collection.

The save carries the collection, packs opened, theme, signature and the display
tier. Anything loaded from it is validated before use — a `displayRank` that
doesn't index `RG.RARITIES` falls back to "highest owned" rather than rendering
a tier that doesn't exist.

### Interactions

- **Hover** a card — Balatro-style 3D tilt with a tracked glare
- **Click** — expands to center, dims background (Esc / click-away closes)
- **Right-click** — copy embed link / save / share, with a rarity picker that
  repaints the card as you change it. Only owned tiers are exportable — owning
  a tier unlocks it plus every tier below it, never above.
- **Show cards as** — pin the whole grid to a tier, capped by what you own

**Nothing in the app is selectable.** Clicking through a pack is repeated clicks
in one spot, and the browser reads the second as a double-click and selects the
word beneath it — Opera GX then pops its Search/Copy/Snapshot bar over the card.
The cards had already opted out, but everything they sit on top of (the counter,
"PACK COMPLETE", the buttons that appear right where you were clicking) had not,
so the selection landed there instead. `user-select: none` goes on `body` rather
than `#app`, because the overlays, context menu and modals are all siblings of
it; `input`, `textarea` and `[contenteditable]` opt back in, which is what keeps
the minted embed link copyable.

Testing note: `page.mouse.click(x, y, {clickCount: 2})` does **not** produce a
text selection in headless Chrome — verified against a plain `<p>`. Only an
explicit `down`/`up` sequence with an escalating `clickCount`, or a drag, does.
A selection test built on `clickCount` alone passes against a page that is
still broken.

### Export

Everything ships as **animated WebP** — embed links, shares and downloads
alike, 1.4–3.0 MB per card. GIF survives only as the fallback for browsers that
can't encode WebP.

All three encoders render 640px wide at 20 fps from the identical pipeline —
only the final compression differs.

**The foil period and the art window are separate.** Foil sweeps every
`LOOP_SECONDS` (4 s); animated art plays up to `ART_SECONDS` (12 s) and sets
the loop length itself, with the foil completing a whole number of sweeps
across it. Whole is the important part — the phase has to land back at 0 for
the wrap to be seamless. Clips shorter than the foil period repeat instead, so
a one-second GIF doesn't give the foil a one-second sweep, and clips longer
than 12 s are truncated rather than sped up.

That decoupling is what makes long art usable: stretching one foil sweep across
a 12-second card reads as broken rather than slow. A ~6 s clip gets 2 sweeps of
3.0 s; a 12 s clip gets 3 of 4.0 s.

`MAX_FRAMES` (240 = 12 s at 20 fps) is the real brake, since size and encode
time both scale almost linearly with frame count. Past it the sampling rate
drops and the clip keeps its full duration at a lower frame rate.

### Making exports fast

A cold export is ~120 frames of card to draw and then compress, and profiling
put it at roughly half each — neither half has a trick that makes it vanish.
So the work is attacked three ways: do it in parallel, do it earlier, and never
do it twice.

**Frames are compressed in a worker pool.** `canvas.toBlob('image/webp')` is one
frame at a time on the main thread; `OffscreenCanvas.convertToBlob` is the same
encoder available inside a worker, and frames don't reference each other, so
`webp.js` runs `min(4, cores-1)` of them. Frames are structured-cloned rather
than transferred — transferring detaches the caller's buffers and the
size-retry loop re-encodes the very same frames at a lower quality, and a 2 MB
memcpy is nothing beside a 16 ms compress. The whole thing degrades to the
inline encoder if workers or `OffscreenCanvas` aren't there.

Measured on `galaxy-brain` / Cosmic (121 frames, 640px), 4 workers:

| | inline | pooled |
|---|---|---|
| full export | 5257 ms | **1779 ms** |
| output | 3 080 498 bytes | **identical, byte for byte** |

End to end, per card: Cosmic 4.5 s → **1.9 s**, Holofoil 2.6 s → **0.85 s**.

**Renders start when the right-click menu opens**, not when the button is
clicked — that's the strongest signal of intent available before the click
itself, and the seconds spent reading a menu are seconds the render doesn't
have to cost. Changing the tier in that menu warms the new tier too.
Speculation is skipped entirely when there's no signature yet, since the render
would be thrown away the moment the user is prompted for one.

Only **one speculative render runs at a time** — right-clicking three cards
would otherwise leave three multi-second jobs fighting for the same core, and
the newest is the one being looked at. A superseded job is abandoned at its
next frame boundary. A job someone has actually asked for is never abandoned,
and a click that lands mid-warmup attaches to the running job and promotes it
to full speed rather than starting a duplicate.

Speculative renders yield through `requestIdleCallback` instead of
`setTimeout(0)`. That's the whole reason the tilt animation survives them —
measured during a background Cosmic render, rAF gaps stayed at a 4.2 ms median
with a 31 ms worst case.

**Finished blobs are cached**, keyed on card id, *art file*, tier, format,
theme and signature. The art file is in there because a pool-backed card draws
different art per page load, so the id alone would serve yesterday's bird.
Six entries, oldest evicted, failures never cached; anything passing a tuning
option (`width`, `quality`, `fps`…) bypasses the cache in both directions so a
tuning run can't poison what the UI reads. A repeat export drops from ~1300 ms
to 0.

**Why WebP everywhere.** GIF is the more familiar download format, but the
quality doesn't justify its size: 255 palette entries against WebP's full
24-bit colour, no alpha, and roughly four times the bytes for the same frames.
All three candidates were tested in Discord:

| Link ends in | Discord renders it as |
|---|---|
| `.webp` | inline, animated, looping ✅ |
| `.gif` | inline, animated, looping ✅ |
| `.mp4` | video player with a click-to-play button ❌ |

The autoplay-loop treatment Tenor gets is Discord's **provider allowlist**,
keyed on the domain — not something a URL shape or meta tag can opt into, so
MP4 is out however well it compresses. Between the two that work, WebP wins
outright: 24-bit colour instead of a 255-entry palette (no banding, none of the
"morphing" artefacts the GIF encoder has to fight), a real alpha channel so the
rounded corners stay transparent, and roughly a quarter of the bytes.

| Card | GIF | WebP |
|---|---|---|
| vibe-check / reverse | 1.51 MB | **1.42 MB** |
| galaxy-brain / cosmic | 4.52 MB | **1.95 MB** |
| this-is-fine / fullart | 6.50 MB | **1.71 MB** |
| touch-grass / standard | 0.06 MB | **0.02 MB** |

WebP encoding lives in [assets/js/webp.js](assets/js/webp.js): the browser
compresses each frame via `canvas.toBlob('image/webp')` and the module unwraps
those stills and re-wraps them as a RIFF animation (`VP8X` + `ANIM` +
per-frame `ANMF`). It drops the 456-byte `ICCP` colour profile Chrome attaches
to every frame — 36 KB of waste across a loop.

The H.264 encoder and from-scratch MP4 muxer in
[assets/js/mp4.js](assets/js/mp4.js) (`RG.exporter.toMp4Blob`) are still wired
up for anywhere that does autoplay video. `embedFmt` in
[assets/js/cards.js](assets/js/cards.js) selects between all three.

Everything below about palettes applies to the **GIF fallback** only — WebP has
no palette to manage.

### Keeping the GIF small

Frames are written with **inter-frame diffing**: disposal is `1` (do not
dispose), so any pixel identical to the one already on the canvas is written as
the transparent index and left showing through. 87–97% of pixels are unchanged
between consecutive frames, and a long run of one repeated index is exactly
what LZW collapses to nothing.

Costs no visual quality at all, unlike dropping resolution or frame rate. The
one transition "do not dispose" can't express is opaque → transparent, which
never arises here: the card silhouette is identical on every frame.

### Palettes are rebuilt every 4 frames

GIF's Local Color Table lets each frame carry its own palette. Using one shared
table for the whole loop is what produced the "morphing instead of moving"
look: the foil sweeps the entire hue wheel, so 255 entries had to cover every
hue at every luminance across all 80 frames. Each individual frame got a thin
slice of them, banded hard, and the band edges *snapped* between frames.

Measured on vibe-check / reverse, where `meanJump` is the average colour change
among pixels that changed — low is smooth motion, high is regions flipping:

| Palette rebuilt | Size | Unique colours | Pixels changed | meanJump |
|---|---|---|---|---|
| once for the loop | 0.85 MB | 189 | 3.0% | 7.0 |
| every 8 frames | 1.31 MB | 189 | 11.4% | 3.2 |
| **every 4 frames** | **1.51 MB** | **206** | **15.1%** | **3.1** |
| every 2 frames | 2.02 MB | 209 | 19.8% | 3.2 |
| every frame | 2.74 MB | 206 | 27.1% | 2.2 |

Every 4 frames takes essentially all the available smoothness (7.0 → 3.1) for
+0.66 MB and no extra encode time. Per-frame buys a little more but costs
another 1.2 MB and doubles encoding, because rebuilding the palette shifts
colours slightly even in *static* regions, which defeats the inter-frame diff.
Grouping keeps the table fixed within a group, so static pixels quantise
identically and only get rewritten at group boundaries.

Net against the original encoder — smoother *and* smaller on every card:

| Card | Before | After |
|---|---|---|
| vibe-check / reverse | 4.89 MB | **1.51 MB** (−69%) |
| deploy-on-friday / holo | 4.79 MB | **3.89 MB** (−19%) |
| galaxy-brain / cosmic | 6.13 MB | **5.37 MB** (−12%) |
| this-is-fine / fullart | 6.78 MB | **6.50 MB** (−4%) |

Full Art gains least on both counts because its foil sweeps the entire card,
leaving little unchanged between frames.

**Dithering is implemented but off** (`DITHER = 0`). It's the wrong tool here:
against grouped palettes it left `meanJump` unchanged while adding 2.2 MB, and
against a shared palette it made it *worse* (5.9 → 6.7). Dithering only shuffles
error between neighbouring pixels; it can't conjure colours the palette lacks.
Kept as a knob for much smaller palettes, where it would start to pay.

**If you switch to MP4, note it has no transparency.** H.264 has no alpha
channel, so the rounded corners get composited onto a matte, defaulting to
Discord's dark message background (`#313338`) where it's invisible; on a light
background they show as four small dark notches. GIF exports true
transparency. Override with `RG.mp4.encode(…, { matte })`.

MP4 encoding uses WebCodecs and the muxer is written from scratch, same as the
GIF encoder. It targets Constrained Baseline deliberately — the higher H.264
profiles emit B-frames, which decouple decode order from presentation order and
would require a `ctts` table and separate dts/pts for maybe 15% size against a
format already being beaten by 5×. Browsers without WebCodecs fall back to GIF
for everything.

Encoding takes ~1.5–2.0 s (GIF) or ~0.8–1.2 s (MP4) per card and reports
progress. Tuning constants live at the top of
[assets/js/exporter.js](assets/js/exporter.js). The GIF path scales width down
and re-encodes if a card overshoots its 9 MB hard cap; the MP4 path needs no
such retry because bitrate is a direct dial on file size.

GIF exports of self-animating art start at 500px instead of 640px: consecutive
frames share much less, so the same width would roughly double the file. MP4
has no such problem and renders everything at full width.

There is no clipboard image copy, because **animated images cannot be
copy-pasted at all** — a browser limitation, not a bug. Chromium re-encodes
anything written to the clipboard as a still (verified: an APNG written to
`image/png` comes back with its `acTL`/`fdAT` chunks stripped and a frame count
of 1) and rejects `image/gif` on write outright. To get animation into Discord,
use **embed links** below: a link is plain text, which the clipboard handles
perfectly.

### Why embed links are direct image URLs

The copied link points straight at the media (`/i/<token>.mp4`), not at a page.
The extension is load-bearing: chat clients decide how to unfurl a link from
its path. A URL ending in `.mp4`/`.gif` is rendered inline; anything else is
fetched as a page, and a page carrying `og:title`/`og:description` becomes a
bordered rich-embed card with a flattened still for a picture — verified in
Discord, which is why this changed.

`e.php` still serves the human-facing card page with title, flavour text and
stats, and `api/share.php` returns it as `page` alongside the media `url`.

The rewrite that makes `/i/<token>.mp4` work is generated into the vhost by
[install.sh](install.sh); [.htaccess](.htaccess) carries the same rule for
development. Where no rewrite is available, `/i.php/<token>.mp4` (PATH_INFO)
resolves identically. **Because the copied link bypasses `e.php`, the
single-use burn no longer fires** — what remains is the grace-window expiry on
the media itself.

## Signatures

Cards are stamped with the owner's nickname, printed bottom-left as
`Illus. <nickname>` where a real card credits its illustrator. It's burned into
the exported frames, so it travels with the image in either format.

The nickname lives in the encrypted save and appears in the header as your
signature — hover it and a pencil appears to change it. The first export
prompts for one if it isn't set yet.

Deliberately no brush or pen emoji in the credit line: it's rasterised on the
creator's machine, so a system without an emoji font would bake in a permanent
tofu box.

## Embed links (Tenor-style)

**Copy embed link** in the right-click menu uploads the rendered card and
copies back a URL like:

```
https://your-host/e.php?c=mhz2d2Nb-CjXi4CMmZOn_PVzTL8XOFvyaOOO6etc…
```

Paste that in Discord and it unfurls into the animated card via OpenGraph
tags. This is the only route that gets animation into a chat from a paste.

### How the token works

The card definition (id, rarity, theme, a random 64-bit id, expiry) is
JSON-encoded and encrypted with **AES-256-GCM** under a 32-byte secret
generated once per install and stored in `storage/secret.key.php`. Because
GCM is authenticated, a tampered token fails to decrypt rather than decoding
to something else — you cannot forge a card you don't own, edit a rarity, or
replay a token against a different installation. That per-install secret is
what "only works for that instance" means; copy the app elsewhere without the
key file and every existing link 404s.

The secret lives in a `.php` file that *returns* the key rather than a raw
`.key` file, so requesting it over HTTP executes it and yields nothing. This
holds even on servers that ignore `.htaccess` (the built-in `php -S` does).

### What "single use" means

A link that dies on first fetch could never embed at all — Discord's unfurler
would spend the use before any human saw it. So the single use is enforced on
the **human-facing page**, and the image gets a short grace window after it:

| Request | Effect |
|---|---|
| Link-preview crawler (Discordbot, Slack, Telegram, …) hits `e.php` | Renders preview, **does not** spend the use or start any clock |
| First real visitor opens the link | Spends it, and starts the image's grace window |
| Any later visitor | Refused, shown the preview only |
| `i.php` during the grace window | Serves normally |
| `i.php` after it | `410 Gone` — the bytes are deleted from disk |

`RG_GRACE_SECONDS` (default **120**) is how long the image keeps serving after
that first human view. Every client in a chat has pulled it long before then,
so the window mostly exists to stop the raw `i.php` URL being passed around or
used as free CDN bandwidth afterwards. An *unopened* link keeps its image until
the normal 30-day TTL. Set it to `0` to disable expiry.

The image is deliberately not killed the instant the link burns: platforms
render at their own pace, and it would risk a broken image in the channel.
Concurrent opens are resolved with an exclusive `flock`, so exactly one visitor
wins the use.

Storage is capped at 500 embeds / 512 MB, oldest evicted first, and minting is
rate-limited to 40 links per IP per hour. `tools/gc.php` runs from cron every
5 minutes to retire expired images promptly, since retirement is otherwise lazy.
All of it is tunable — copy `config.local.example.php` to `config.local.php`.

At ~7 MB per card the **byte budget binds long before the count does** (~70
links, not 500). That's mostly moot in practice, because an opened link's image
is deleted two minutes later — only *unviewed* links accumulate. The effect is
that a flood of unopened links self-limits at 512 MB instead of filling the
disk. Raise `RG_MAX_BYTES` if you'd rather keep more unopened links alive.

### What this does *not* do

**It does not stop anyone reposting the picture, and nothing could.** Worth
being blunt, because it's easy to assume otherwise:

- Discord fetches your image once, then **caches it on its own CDN** and serves
  that copy to every viewer. Your link expiring doesn't remove it from the
  channel — which is exactly why the grace window is safe, but also means the
  image is permanently out of your hands the moment it's posted.
- Anyone who can see an image can screenshot or save it. There is no DRM for a
  GIF in a chat embed; even real video DRM gets broken.

What you actually get is **link control**: the URL can't be reused, replayed,
forged, edited to a rarity the sender doesn't own, or made to work on another
installation. If you want something genuinely scarce, make it the card in
someone's collection rather than the pixels — see the note at the end of this
section.

> **A better model, if you want one:** treat the image as advertising (let it
> spread; every repost links back), and put the one-time value in a **claim** —
> the first person to open the link gets that card added to *their* collection.
> That's enforceable server-side because it changes state you own, rather than
> trying to control bytes on someone else's machine. The ledger and single-use
> plumbing here already support it; it just needs the claim UI.

## Deploying (Debian 13)

```bash
sudo ./install.sh --domain cards.example.com --email you@example.com
```

That installs and updates the required packages, deploys the app to
`/var/www/reaction-gacha`, applies the PHP and web-server settings it needs,
locks down `storage/`, installs the housekeeping cron job, and obtains a
Let's Encrypt certificate.

```bash
./install.sh --dry-run --domain example.com      # show every change, make none
RG_SHOW_FILES=1 ./install.sh --dry-run …         # also print generated configs
sudo ./install.sh --server nginx --no-tls        # nginx + php-fpm, HTTP only
sudo ./install.sh --dir /srv/gacha --no-upgrade
```

It's safe to re-run: every step is idempotent, replaced files are backed up
with a timestamp, and `storage/` is excluded from the sync so re-installing
never invalidates links that are already out in the world.

### What it changes

| | |
|---|---|
| Packages | `apache2` + `libapache2-mod-php` (or `nginx` + `php-fpm`), `php-cli`, `certbot`, `rsync` |
| PHP | `conf.d/99-reaction-gacha.ini` — `upload_max_filesize 12M`, `post_max_size 14M`, `display_errors Off`, `expose_php Off` |
| Vhost | Serves the app, denies `/storage/` and dotfiles, caps request bodies at 14 MB |
| Permissions | Code `root:root` 644/755; `storage/` `www-data` 0700 |
| Cron | `/etc/cron.d/reaction-gacha` runs `tools/gc.php` every 5 min |
| Firewall | Opens the web profile if `ufw` is active |

Debian's stock `upload_max_filesize` is 2 MB, far below the ~7 MB each card
renders to, so without that ini drop-in every share would fail. Both limits are
reported back verbatim when hit, so the failure is at least legible.

The installer finishes by verifying that PHP has `aes-256-gcm`, that the web
user can create the instance secret, that a token survives an encrypt/decrypt
round trip, and that `/storage/` is **not** reachable over HTTP.

### Manual notes

- **Back up `storage/`.** Losing `secret.key.php` invalidates every embed link
  ever minted.
- **Behind an additional proxy** (CDN, load balancer), set `RG_TRUST_PROXY` in
  `config.local.php` — otherwise every request shares one rate-limit bucket.
  Leave it off when the app is directly exposed, or clients can spoof
  `X-Forwarded-For` past the limiter. The installer's own vhost doesn't need it.
- **`config.local.php` must have no BOM** and no blank line before `<?php`, or
  PHP emits it as output and headers are already sent.
- **HTTPS matters beyond the obvious:** `navigator.clipboard` only exists in a
  secure context, so on plain HTTP the app falls back to `execCommand` and then
  to a dialog showing the link. All three work; HTTPS gets the clean one.
- Discord can only unfurl a host it can reach, so embed links do nothing from
  `localhost`.
