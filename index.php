<?php
header('Content-Type: text/html; charset=utf-8');

$db = require __DIR__ . '/data/cards.php';

// Resolve each card's art file. Real art dropped into assets/images/ takes
// priority over the generated SVG placeholders, video first — an .mp4 is the
// most deliberate thing someone can drop in.
$exts = ['mp4', 'webm', 'gif', 'webp', 'png', 'jpg', 'jpeg', 'svg'];
$videoExts = ['mp4' => 'video/mp4', 'webm' => 'video/webm'];
foreach ($db['cards'] as &$card) {
    $card['img'] = null;
    $card['vid'] = null;
    foreach ($exts as $ext) {
        $rel = 'assets/images/' . $card['id'] . '.' . $ext;
        if (file_exists(__DIR__ . '/' . $rel)) {
            $card['img'] = $rel;
            $card['vid'] = $videoExts[$ext] ?? null;
            break;
        }
    }
}
unset($card);
$db['cards'] = array_values(array_filter($db['cards'], fn($c) => $c['img'] !== null));

// Scan the sound library so new files are picked up automatically.
$soundDir = static function (string $dir): array {
    $found = [];
    foreach (['mp3', 'ogg', 'wav'] as $ext) {
        $found = array_merge($found, glob(__DIR__ . '/assets/sounds/packs/' . $dir . '/*.' . $ext) ?: []);
    }
    return array_map(fn($p) => 'assets/sounds/packs/' . $dir . '/' . basename($p), $found);
};

$config = [
    'cards'  => $db['cards'],
    'ptypes' => $db['ptypes'],
    'mtypes' => $db['mtypes'],
    'sounds' => [
        'interact' => $soundDir('interact'),
        'open'     => $soundDir('open'),
    ],
];
$configJson = json_encode($config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reaction Gacha</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='80' font-size='80'>🎴</text></svg>">
<link rel="stylesheet" href="assets/css/main.css">
</head>
<body data-theme="pokemon">

<div id="app">
  <header class="topbar">
    <div class="logo" aria-label="Reaction Gacha">
      <span class="logo-orb" aria-hidden="true"></span>
      <span class="logo-text">REACTION<b>GACHA</b></span>
    </div>
    <nav class="tabs" role="tablist">
      <button class="tab-btn active" data-tab="packs" role="tab">Packs</button>
      <button class="tab-btn" data-tab="collection" role="tab">Collection <span id="coll-count" class="pill"></span></button>
    </nav>
    <div class="signature" id="signature">
      <span class="sig-pen" aria-hidden="true">✒</span>
      <span class="sig-name" id="sig-name"></span>
      <button class="sig-edit" id="sig-edit" title="Change your signature"
              aria-label="Change your signature">✏️</button>
    </div>

    <div class="theme-switch" role="group" aria-label="Theme">
      <button class="thm-btn active" data-thm="pokemon">Poké</button>
      <button class="thm-btn" data-thm="mtg">Arcane</button>
    </div>
  </header>

  <main>
    <!-- ============ PACKS ============ -->
    <section id="tab-packs" class="tab-panel active">
      <div id="pack-shelf" class="pack-shelf">
        <h1 class="shelf-title">Choose your pack</h1>
        <p class="shelf-sub">5 cards per pack &middot; the rarest waits at the back</p>
        <div class="shelf-row">
          <button class="pack" data-pack="0" aria-label="Open a pack">
            <span class="pack-crimp top"></span>
            <span class="pack-body"><span class="pack-art" aria-hidden="true">🎴</span><span class="pack-name">REACTION<br>PACK</span></span>
            <span class="pack-crimp bottom"></span>
            <span class="pack-shine"></span>
          </button>
          <button class="pack" data-pack="1" aria-label="Open a pack">
            <span class="pack-crimp top"></span>
            <span class="pack-body"><span class="pack-art" aria-hidden="true">💀</span><span class="pack-name">CHAOS<br>PACK</span></span>
            <span class="pack-crimp bottom"></span>
            <span class="pack-shine"></span>
          </button>
          <button class="pack" data-pack="2" aria-label="Open a pack">
            <span class="pack-crimp top"></span>
            <span class="pack-body"><span class="pack-art" aria-hidden="true">✨</span><span class="pack-name">DRAMA<br>PACK</span></span>
            <span class="pack-crimp bottom"></span>
            <span class="pack-shine"></span>
          </button>
        </div>
        <p class="shelf-stats" id="shelf-stats"></p>
      </div>

      <div id="pack-stage" class="pack-stage" hidden>
        <div class="stage-pack-slot"></div>
        <p class="stage-hint">Click the pack to <b>rip it open</b></p>
        <button id="stage-cancel" class="ghost-btn">Put it back</button>
      </div>

      <div id="reveal-stage" class="reveal-stage" hidden>
        <p class="reveal-counter" id="reveal-counter"></p>
        <div class="reveal-stack" id="reveal-stack"></div>
        <div class="reveal-done" id="reveal-done" hidden>
          <div class="reveal-summary" id="reveal-summary"></div>
          <div class="reveal-actions">
            <button id="btn-again" class="cta-btn">Open another</button>
            <button id="btn-to-coll" class="ghost-btn">View collection</button>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ COLLECTION ============ -->
    <section id="tab-collection" class="tab-panel">
      <div class="coll-toolbar">
        <input id="coll-search" class="coll-search" type="search" placeholder="Fuzzy search cards…" autocomplete="off">
        <select id="coll-sort" class="coll-sort" aria-label="Sort collection">
          <option value="alpha">Alphabetical</option>
          <option value="rarity">Rarity</option>
          <option value="type">Type</option>
          <option value="stats">Stats</option>
        </select>
      </div>
      <div id="coll-grid" class="coll-grid"></div>
      <p id="coll-empty" class="coll-empty" hidden>No cards yet. Go rip some packs.</p>
    </section>
  </main>
</div>

<!-- Expanded card overlay -->
<div id="expand-overlay" class="expand-overlay" hidden>
  <div class="expand-slot" id="expand-slot"></div>
</div>

<!-- Custom right-click menu -->
<div id="ctx-menu" class="ctx-menu" hidden>
  <div class="ctx-title" id="ctx-title"></div>
  <label class="ctx-rarity-row">
    <span>Rarity</span>
    <select id="ctx-rarity"></select>
  </label>
  <button class="ctx-item" data-act="link"><span aria-hidden="true">🔗</span> <span class="act-label">Copy embed link</span></button>
  <button class="ctx-item" data-act="save"><span aria-hidden="true">💾</span> <span class="act-label">Save to disk</span></button>
  <button class="ctx-item" data-act="share"><span aria-hidden="true">📤</span> <span class="act-label">Share…</span></button>
</div>

<!-- Signature prompt: every exported card is stamped with this -->
<div id="sig-modal" class="link-modal" hidden>
  <!-- novalidate: the handler's own check also catches whitespace-only and
       control-character-only input, which `required` happily accepts -->
  <form class="link-box" id="sig-form" novalidate
        role="dialog" aria-modal="true" aria-labelledby="sig-modal-title">
    <h2 id="sig-modal-title">Stamp your card</h2>
    <p>
      Cards you share are credited to you, printed where a card normally credits
      its illustrator. Pick the name you want on them.
    </p>
    <input id="sig-input" type="text" maxlength="24" autocomplete="nickname"
           placeholder="Your nickname" aria-label="Your nickname"
           aria-describedby="sig-error">
    <p class="sig-hint" id="sig-error" hidden></p>
    <div class="link-actions">
      <button type="button" id="sig-cancel" class="ghost-btn">Cancel</button>
      <button type="submit" class="cta-btn">Stamp it</button>
    </div>
  </form>
</div>

<!-- Shown when the clipboard is unavailable (plain-http LAN, older browsers) -->
<div id="link-modal" class="link-modal" hidden>
  <div class="link-box" role="dialog" aria-modal="true" aria-labelledby="link-modal-title">
    <h2 id="link-modal-title">Your embed link</h2>
    <p>Copy this and paste it into Discord — it unfurls into the animated card.</p>
    <input id="link-input" type="text" readonly>
    <div class="link-actions">
      <button id="link-copy" class="cta-btn">Copy</button>
      <button id="link-close" class="ghost-btn">Done</button>
    </div>
  </div>
</div>

<div id="toast" class="toast" role="status"></div>

<script>window.RG_CONFIG = <?= $configJson ?>;</script>
<script src="assets/js/fuzzy.js"></script>
<script src="assets/js/storage.js"></script>
<script src="assets/js/audio.js"></script>
<script src="assets/js/mp4.js"></script>
<script src="assets/js/webp.js"></script>
<script src="assets/js/exporter.js"></script>
<script src="assets/js/share.js"></script>
<script src="assets/js/cards.js"></script>
<script src="assets/js/gacha.js"></script>
<script src="assets/js/collection.js"></script>
<script src="assets/js/app.js"></script>
</body>
</html>
