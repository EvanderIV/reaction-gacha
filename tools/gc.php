<?php
/**
 * Housekeeping sweep — run from cron.
 *
 * Embed images are normally retired lazily (on the next request or mint), so
 * a link that is opened once and then never touched again would keep its
 * bytes on disk. This makes the grace-window expiry actually punctual.
 *
 *   php tools/gc.php
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../lib/embed.php';

$dir    = rg_storage_dir() . '/embeds';
$before = count(glob($dir . '/*.bin') ?: []);

rg_gc();

foreach (glob(rg_storage_dir() . '/rl/*.json') ?: [] as $f) {
    if (filemtime($f) < time() - RG_RATE_WINDOW * 2) @unlink($f);
}

$after = count(glob($dir . '/*.bin') ?: []);
if (($opt = getopt('v')) !== false && isset($opt['v'])) {
    printf("embed images: %d -> %d (%d reclaimed)%s", $before, $after, $before - $after, PHP_EOL);
}
