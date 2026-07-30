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
everything at once) and is sampled frame-by-frame into the exported GIF. The
first 4 seconds are used at 20 fps so playback keeps its natural speed rather
than being squashed into the foil loop; shorter clips repeat to fill it.

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

**Cosmic always uses the standard frame**, never the full-bleed one — its symbol
layer needs an art window to read against. A Full-Art-capable card upgraded to
Cosmic therefore goes back to the standard frame. Cosmic foils the frame and the
artwork as two separate layers rather than one overlay, because the light Pokémon
frame wants a soft film while the darker artwork wants colour-dodge; a single
pass across both leaves the art looking milky.

**Text always renders above the foil.** On the page the card body deliberately
avoids creating a stacking context so the title, flavour text, stats and credits
can sit at a layer above the glint; the canvas exporter mirrors this by drawing
in three passes — backdrop, foil, then text. Without it the shimmer washes out
exactly the words you need to read.

**Full-art text also carries a dark halo**, since it sits straight on the
artwork with no box behind it. In CSS that's a two-part `text-shadow` — one
tight opaque layer for edge definition, one wide soft layer to darken whatever
is behind. Canvas has no equivalent of stacked shadows, so `shadowed()` draws
the same text two or three times with a shrinking blur, which compounds into
the same effect. That costs nothing per frame because the text layer is
rendered once and blitted for the whole loop.

Duplicates of a card at your **exact owned rarity** upgrade it one step; pulling a
higher rarity than you own replaces it.

### Saves

Progress lives in `localStorage`, AES-GCM encrypted via WebCrypto (PBKDF2-derived
key, per-install random salt). This is tamper-resistance, not Fort Knox — the key
material necessarily lives client-side. Clear site data to wipe your collection.

### Interactions

- **Hover** a card — Balatro-style 3D tilt with a tracked glare
- **Click** — expands to center, dims background (Esc / click-away closes)
- **Right-click** — copy embed link / save / share, with a rarity picker. Only
  owned tiers are exportable — owning a tier unlocks it plus every tier below
  it, never above.

### Export

Two formats, chosen by destination:

| Path | Format | Typical size | Why |
|---|---|---|---|
| Embed link, share | **H.264 MP4** | ~0.9–1.0 MB | 5–7× smaller, so it loads instantly in chat |
| Save to disk | **Animated GIF** | ~4.7–6.8 MB | the file you can drop anywhere without thinking |

Both render 640px wide, 80 frames at 20 fps, one 4-second foil loop, from the
identical pipeline — only the final compression differs. Cards whose art is
itself animated have that loop repeated to fill the same 4 seconds, so art and
foil stay seamless together.

**The MP4 has no transparency.** H.264 has no alpha channel, so the rounded
corners are composited onto a matte, defaulting to Discord's dark message
background (`#313338`) where it's invisible. On a light background the corners
show as four small dark notches. The GIF still exports true transparency.
Override with `RG.mp4.encode(…, { matte })` if you need a different one.

MP4 encoding uses WebCodecs; the muxer in
[assets/js/mp4.js](assets/js/mp4.js) is written from scratch, same as the GIF
encoder. It targets Constrained Baseline deliberately — the higher H.264
profiles emit B-frames, which decouple decode order from presentation order and
would require a `ctts` table and separate dts/pts for maybe 15% size against a
format already being beaten by 5×. Browsers without WebCodecs fall back to GIF
for everything.

Encoding takes ~0.8–1.2 s (MP4) or ~1.4–1.9 s (GIF) per card and reports
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
