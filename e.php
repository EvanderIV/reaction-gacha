<?php
/**
 * Embed page — the human-facing side of a share link.
 *
 * Single-use is enforced HERE, and only for real visitors: link-preview
 * crawlers get the page without spending the use, otherwise Discord's
 * unfurler would burn the link before anyone could click it.
 */

declare(strict_types=1);
require __DIR__ . '/lib/embed.php';

header('Cache-Control: no-store, must-revalidate');
header('Referrer-Policy: no-referrer');

$token = (string) ($_GET['c'] ?? '');
$data  = rg_token_decode($token);

/** Minimal error page. */
function rg_fail(int $code, string $title, string $msg): never
{
    http_response_code($code);
    ?><!DOCTYPE html>
    <html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= htmlspecialchars($title) ?> · Reaction Gacha</title>
    <link rel="stylesheet" href="assets/css/main.css">
    <link rel="stylesheet" href="assets/css/embed.css">
    </head><body data-theme="pokemon"><div class="embed-wrap">
      <div class="embed-fail">
        <div class="fail-glyph" aria-hidden="true">🃏</div>
        <h1><?= htmlspecialchars($title) ?></h1>
        <p><?= htmlspecialchars($msg) ?></p>
        <a class="cta-btn" href="index.php">Open Reaction Gacha</a>
      </div>
    </div></body></html><?php
    exit;
}

if ($data === null) {
    rg_fail(404, 'Card not found',
        'This link is invalid, has expired, or was minted by a different installation.');
}

$jti  = (string) $data['j'];
$rec  = rg_record_load($jti);
if ($rec === null) {
    rg_fail(410, 'This card has gone',
        'The image behind this link has expired and been cleaned up.');
}

// The image may have outlived its grace window even though the record stands;
// the page still renders so it can say what happened rather than just 404.
if (rg_image_expired($rec)) {
    rg_image_retire($jti);
    $rec = rg_record_load($jti) ?? $rec;
}
$hasImage = empty($rec['retired']) && is_file(rg_image_path($jti));

$cards = rg_cards();
$card  = $cards[$data['c']] ?? null;
if ($card === null) {
    rg_fail(410, 'Unknown card', 'This card is no longer part of the set.');
}

$rarities = ['standard' => 'Standard', 'reverse' => 'Reverse Holofoil',
             'holo' => 'Holofoil', 'fullart' => 'Full Art', 'cosmic' => 'Cosmic'];
$rarityKeys = array_keys($rarities);
$rankKey  = $rarityKeys[(int) $data['r']] ?? 'standard';
$rankName = $rarities[$rankKey];

$theme = $data['t'] === 'mtg' ? 'mtg' : 'pokemon';
$types = $cards['__types'];
$type  = $theme === 'mtg'
    ? ($types['mtypes'][$card['mtype']] ?? ['name' => '—', 'sym' => '◈', 'color' => '#888'])
    : ($types['ptypes'][$card['ptype']] ?? ['name' => '—', 'sym' => '⭐', 'color' => '#888']);

$imgUrl = rg_base_url() . '/i.php?c=' . rawurlencode($token);

/* ---- the single use ---- */
$isCrawler = rg_is_crawler();
$spentNow  = false;
$alreadySpent = !empty($rec['burned']);

if (!$isCrawler && !$alreadySpent) {
    $spentNow = rg_record_burn($jti);
    $alreadySpent = !$spentNow;   // lost the race → someone else got it
}

$h = fn(?string $s): string => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $h($card['title']) ?> · <?= $h($rankName) ?></title>

<!-- Link preview: these stay present even after the link is spent so an
     already-posted embed doesn't turn into a broken image in the channel. -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Reaction Gacha">
<meta property="og:title" content="<?= $h($card['title']) ?> — <?= $h($rankName) ?>">
<meta property="og:description" content="<?= $h($card['usage']) ?>">
<?php if ($hasImage): /* omit once retired so a fresh unfurl isn't a broken image */ ?>
<meta property="og:image" content="<?= $h($imgUrl) ?>">
<meta property="og:image:type" content="<?= $h($rec['mime'] ?? 'image/gif') ?>">
<meta property="og:image:width" content="<?= (int) ($rec['w'] ?? 0) ?>">
<meta property="og:image:height" content="<?= (int) ($rec['h'] ?? 0) ?>">
<meta property="og:image:alt" content="<?= $h($card['title']) ?> reaction card">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="<?= $h($imgUrl) ?>">
<?php else: ?>
<meta name="twitter:card" content="summary">
<?php endif; ?>
<meta name="twitter:title" content="<?= $h($card['title']) ?> — <?= $h($rankName) ?>">
<meta name="twitter:description" content="<?= $h($card['usage']) ?>">
<meta name="theme-color" content="<?= $h($type['color']) ?>">
<meta name="robots" content="noindex, nofollow">

<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='80' font-size='80'>🎴</text></svg>">
<link rel="stylesheet" href="assets/css/main.css">
<link rel="stylesheet" href="assets/css/embed.css">
</head>
<body data-theme="<?= $h($theme) ?>">

<div class="embed-wrap">
  <header class="embed-head">
    <span class="logo-orb" aria-hidden="true"></span>
    <span class="logo-text">REACTION<b>GACHA</b></span>
  </header>

  <?php if ($hasImage): ?>
    <figure class="embed-card">
      <img src="<?= $h($imgUrl) ?>" alt="<?= $h($card['title']) ?>"
           width="<?= (int) ($rec['w'] ?? 0) ?>" height="<?= (int) ($rec['h'] ?? 0) ?>">
    </figure>
  <?php else: ?>
    <figure class="embed-card embed-card-gone" aria-label="Image expired">
      <div class="gone-face"><span aria-hidden="true">⌛</span>Image expired</div>
    </figure>
  <?php endif; ?>

  <div class="embed-meta">
    <h1 class="embed-title"><?= $h($card['title']) ?></h1>
    <p class="embed-usage"><?= $h($card['usage']) ?></p>
    <div class="embed-chips">
      <span class="embed-chip" style="--type-color: <?= $h($type['color']) ?>">
        <?= $h($type['sym']) ?> <?= $h($type['name']) ?>
      </span>
      <span class="embed-chip r-chip" data-r="<?= $h($rankKey) ?>"><?= $h($rankName) ?></span>
      <span class="embed-chip">PWR <?= (int) $card['pwr'] ?></span>
      <span class="embed-chip">WIT <?= (int) $card['wit'] ?></span>
      <span class="embed-chip">CHS <?= (int) $card['chs'] ?></span>
    </div>

    <?php if ($isCrawler): ?>
      <p class="embed-note">Preview.</p>
    <?php elseif (!$hasImage): ?>
      <p class="embed-note burn-done">
        ⌛ <b>This link has expired.</b> The picture stays where it was posted,
        but it's no longer served from here.
      </p>
    <?php elseif ($spentNow): ?>
      <p class="embed-note burn-now">
        🔥 <b>This link has now been used.</b> The picture stays visible where it
        was posted, but opening the link again won't work.
      </p>
    <?php else: ?>
      <p class="embed-note burn-done">
        ✋ <b>This link was already opened by someone else.</b> You're seeing the
        preview only.
      </p>
    <?php endif; ?>

    <a class="cta-btn" href="index.php">Rip your own packs</a>
  </div>
</div>

</body>
</html>
