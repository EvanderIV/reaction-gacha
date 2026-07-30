<?php
/**
 * Generates placeholder SVG card art into assets/images/.
 * Run:  php tools/generate-art.php
 *
 * Placeholders are big-emoji gradient scenes; "animated" cards get SMIL idle
 * animation so they behave like GIFs. Replace any of them by dropping a real
 * {id}.gif (or .webp/.png/.jpg) into assets/images/ — index.php prefers those.
 */

$db   = require __DIR__ . '/../data/cards.php';
$out  = __DIR__ . '/../assets/images';
if (!is_dir($out)) mkdir($out, 0777, true);

function svgArt(array $c): string
{
    // Full-art placeholders are drawn tall (roughly the card's own 5:7) so the
    // cover-crop into a full-bleed frame keeps the subject; square suits the
    // smaller art window on the standard frame.
    $full = $c['fullArt'];
    $w = 480;
    $h = $full ? 672 : 480;
    $cx = $w / 2;
    $cy = $h * ($full ? 0.44 : 0.48);
    $h1 = $c['hue'];
    $h2 = $c['hue2'];
    $anim = $c['animated'];
    $emojiSize = $full ? 230 : 200;

    // deterministic pseudo-random decorations per card
    $seed = crc32($c['id']);
    $rand = function ($min, $max) use (&$seed) {
        $seed = ($seed * 1103515245 + 12345) & 0x7fffffff;
        return $min + ($seed / 0x7fffffff) * ($max - $min);
    };

    $rays = '';
    for ($i = 0; $i < 12; $i++) {
        $a = $i * 30 + $rand(-6, 6);
        $rw = $rand(14, 34);
        $rays .= sprintf(
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%d" rx="%d" fill="hsl(%d 90%% 70%%)" opacity="0.10" transform="rotate(%.1f %f %f)"/>',
            $cx - $rw / 2, $cy - $h, $rw, $h * 2, 9, $h1, $a, $cx, $cy
        );
    }
    $raysAnim = $anim
        ? '<animateTransform attributeName="transform" type="rotate" from="0 ' . $cx . ' ' . $cy . '" to="360 ' . $cx . ' ' . $cy . '" dur="60s" repeatCount="indefinite"/>'
        : '';

    $bubbles = '';
    for ($i = 0; $i < 9; $i++) {
        $bx = $rand(30, $w - 30);
        $by = $rand(30, $h - 30);
        $br = $rand(8, 30);
        $bo = $rand(0.06, 0.2);
        $bub = sprintf('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="hsl(%d 90%% 80%%)" opacity="%.2f">', $bx, $by, $br, $h2, $bo);
        if ($anim) {
            $dur = round($rand(4, 9), 1);
            $dy  = round($rand(8, 26), 1);
            $bub .= sprintf('<animate attributeName="cy" values="%1$.1f;%2$.1f;%1$.1f" dur="%3$ss" repeatCount="indefinite"/>', $by, $by - $dy, $dur);
        }
        $bubbles .= $bub . '</circle>';
    }

    $emojiAnim = $anim
        ? '<animateTransform attributeName="transform" type="translate" values="0 0; 0 -12; 0 0" dur="3.2s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"/>'
        : '';
    $glowAnim = $anim
        ? '<animate attributeName="opacity" values="0.65;1;0.65" dur="3.2s" repeatCount="indefinite"/>'
        : '';

    $fontStack = "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";

    return <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="$w" height="$h" viewBox="0 0 $w $h">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl($h1 70% 16%)"/>
      <stop offset="1" stop-color="hsl($h2 75% 34%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.45" r="0.6">
      <stop offset="0" stop-color="hsl($h1 95% 72%)" stop-opacity="0.55"/>
      <stop offset="1" stop-color="hsl($h1 95% 72%)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="$w" height="$h" fill="url(#bg)"/>
  <g>$rays$raysAnim</g>
  <rect width="$w" height="$h" fill="url(#glow)" opacity="0.9">$glowAnim</rect>
  $bubbles
  <g>
    <text x="$cx" y="$cy" text-anchor="middle" dominant-baseline="central" font-size="$emojiSize"
          font-family="$fontStack" opacity="0.35" fill="#000" transform="translate(6 10)">{$c['emoji']}</text>
    <g>
      <text x="$cx" y="$cy" text-anchor="middle" dominant-baseline="central" font-size="$emojiSize"
            font-family="$fontStack">{$c['emoji']}</text>
      $emojiAnim
    </g>
  </g>
</svg>
SVG;
}

$count = 0;
foreach ($db['cards'] as $card) {
    $path = $out . '/' . $card['id'] . '.svg';
    file_put_contents($path, svgArt($card));
    $count++;
    echo $card['id'] . ($card['animated'] ? ' (animated)' : '') . PHP_EOL;
}
echo "Wrote $count placeholder art files to assets/images/" . PHP_EOL;
