<?php
/**
 * POST: mint a single-use embed link for a card.
 *
 * Expects multipart/form-data:
 *   card    — card id
 *   rarity  — rank index 0..4
 *   theme   — pokemon | mtg
 *   image   — the client-rendered GIF/PNG of the card
 *
 * Returns { url, token, expires }.
 */

declare(strict_types=1);
require __DIR__ . '/../lib/embed.php';

header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    rg_json(405, ['error' => 'POST required']);
}

// When the body exceeds post_max_size PHP discards it entirely, leaving both
// superglobals empty — without this you'd get a baffling "Missing image".
if (empty($_POST) && empty($_FILES) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    rg_json(413, [
        'error' => 'Upload exceeded the server limit (post_max_size = '
                 . ini_get('post_max_size') . ').',
    ]);
}

$wait = rg_rate_limit(rg_client_ip());
if ($wait > 0) {
    header('Retry-After: ' . $wait);
    rg_json(429, ['error' => 'Too many links minted. Try again in ' . ceil($wait / 60) . ' min.']);
}
rg_rate_gc();

$cards  = rg_cards();
$cardId = (string) ($_POST['card'] ?? '');
$rank   = filter_input(INPUT_POST, 'rarity', FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 4]]);
$theme  = ($_POST['theme'] ?? 'pokemon') === 'mtg' ? 'mtg' : 'pokemon';

if (!isset($cards[$cardId]) || $cardId === '__types') {
    rg_json(400, ['error' => 'Unknown card']);
}
if ($rank === null || $rank === false) {
    rg_json(400, ['error' => 'Bad rarity']);
}
// Full Art only exists for cards that support the taller frame
if ($rank === 3 && empty($cards[$cardId]['fullArt'])) {
    rg_json(400, ['error' => 'That card has no Full Art frame']);
}

$file = $_FILES['image'] ?? null;
$err  = $file['error'] ?? UPLOAD_ERR_NO_FILE;
if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
    rg_json(413, [
        'error' => 'Image exceeded upload_max_filesize (' . ini_get('upload_max_filesize') . ').',
    ]);
}
if (!$file || $err !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) {
    rg_json(400, ['error' => 'Missing image']);
}
if (($file['size'] ?? 0) <= 0 || $file['size'] > RG_MAX_IMG) {
    rg_json(413, ['error' => 'Image too large']);
}

$bytes = (string) file_get_contents($file['tmp_name']);
$magicGif = str_starts_with($bytes, 'GIF87a') || str_starts_with($bytes, 'GIF89a');
$magicPng = str_starts_with($bytes, "\x89PNG\r\n\x1a\n");
$magicMp4 = substr($bytes, 4, 4) === 'ftyp';
if (!$magicGif && !$magicPng && !$magicMp4) {
    rg_json(415, ['error' => 'Only GIF, PNG or MP4 accepted']);
}

// pull real dimensions out of the header rather than trusting the client
if ($magicGif) {
    $w = unpack('v', substr($bytes, 6, 2))[1];
    $h = unpack('v', substr($bytes, 8, 2))[1];
    $mime = 'image/gif';
} elseif ($magicPng) {
    $w = unpack('N', substr($bytes, 16, 4))[1];
    $h = unpack('N', substr($bytes, 20, 4))[1];
    $mime = 'image/png';
} else {
    [$w, $h] = rg_mp4_dimensions($bytes);
    if ($w === 0) {
        rg_json(415, ['error' => 'Unreadable MP4 — no video track found']);
    }
    $mime = 'video/mp4';
}
if ($w < 1 || $h < 1 || $w > 4000 || $h > 4000) {
    rg_json(400, ['error' => 'Bad image dimensions']);
}

rg_gc();

$jti     = bin2hex(random_bytes(8));
$expires = time() + RG_TTL_DAYS * 86400;

if (file_put_contents(rg_image_path($jti), $bytes, LOCK_EX) === false) {
    rg_json(500, ['error' => 'Could not store image']);
}
rg_record_save($jti, [
    'created' => time(),
    'burned'  => false,
    'mime'    => $mime,
    'w'       => $w,
    'h'       => $h,
    'bytes'   => strlen($bytes),
]);

$token = rg_token_encode([
    'j' => $jti,
    'c' => $cardId,
    'r' => $rank,
    't' => $theme,
    'x' => $expires,
]);

/* `url` is what the user copies, so it's the direct image link: chat clients
   only render a link inline and animated when the path itself looks like an
   image. `page` keeps the human-facing card page available for anywhere that
   wants the title and flavour text alongside it. */
rg_json(200, [
    'url'     => rg_image_url($token, $mime),
    'page'    => rg_base_url() . '/e.php?c=' . $token,
    'token'   => $token,
    'expires' => $expires,
]);
