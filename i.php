<?php
/**
 * Image endpoint for embed tokens — this is what og:image points at.
 *
 * Deliberately does NOT consume the link's single use. Discord (and every
 * other unfurler) proxies and re-fetches this for each viewer; burning here
 * would rot the picture in the channel the moment one person clicked.
 * The single use lives on the human-facing page in e.php.
 */

declare(strict_types=1);
require __DIR__ . '/lib/embed.php';

$data = rg_token_decode((string) ($_GET['c'] ?? ''));
if ($data === null) {
    http_response_code(404);
    header('Content-Type: text/plain');
    exit('Not found');
}

$jti  = (string) $data['j'];
$rec  = rg_record_load($jti);
$path = rg_image_path($jti);

// Past its post-view grace window: bin the bytes and stop serving. Chat
// platforms that proxy (Discord, Slack, Telegram) have long since cached
// their own copy, so the posted embed is unaffected.
if ($rec !== null && rg_image_expired($rec)) {
    rg_image_retire($jti);
    $rec = rg_record_load($jti);
}

if ($rec === null || !empty($rec['retired']) || !is_file($path)) {
    http_response_code(410);
    header('Content-Type: text/plain');
    header('Cache-Control: no-store');
    exit('This card image has expired');
}

$mime = ($rec['mime'] ?? 'image/gif') === 'image/png' ? 'image/png' : 'image/gif';
$etag = '"' . substr(hash_file('sha256', $path), 0, 32) . '"';

header('Content-Type: ' . $mime);
header('Content-Length: ' . (string) filesize($path));
// Encourage proxies to grab their own copy immediately and keep it — that is
// what lets the source expire without the chat embed rotting.
header('Cache-Control: public, max-age=31536000, immutable');
header('X-Content-Type-Options: nosniff');
header('ETag: ' . $etag);

if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
    http_response_code(304);
    exit;
}

readfile($path);
