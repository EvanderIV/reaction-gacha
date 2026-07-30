<?php
/**
 * Embed-link plumbing: instance key, encrypted card tokens, and the
 * single-use ledger.
 *
 * A share link carries the whole card definition encrypted with a secret that
 * is generated once per install, so a token minted here is undecryptable
 * anywhere else — that is what binds links to this instance. The server-side
 * ledger holds only usage state plus the rendered image.
 */

declare(strict_types=1);

// Optional deployment overrides — anything defined here wins over the
// defaults below. The installer writes one; it is not in version control.
if (is_file(__DIR__ . '/../config.local.php')) require __DIR__ . '/../config.local.php';

/** @var int Links expire after this long. */
defined('RG_TTL_DAYS')    || define('RG_TTL_DAYS', 30);
/** @var int Hard cap on stored embeds (oldest evicted). */
defined('RG_MAX_EMBEDS')  || define('RG_MAX_EMBEDS', 500);
/** @var int Total disk budget for embed images. */
defined('RG_MAX_BYTES')   || define('RG_MAX_BYTES', 512 * 1024 * 1024);
/** @var int Upload ceiling. The client targets ~7 MB per card; this leaves headroom. */
defined('RG_MAX_IMG')     || define('RG_MAX_IMG', 10 * 1024 * 1024);
/** @var int Mints allowed per IP... */
defined('RG_RATE_MAX')    || define('RG_RATE_MAX', 40);
/** @var int ...within this many seconds. */
defined('RG_RATE_WINDOW') || define('RG_RATE_WINDOW', 3600);

/**
 * Seconds the image stays fetchable AFTER the link's first human view, then
 * the bytes are deleted. Long enough for every client in a chat to have
 * pulled it; short enough that the URL is useless afterwards.
 *
 * This is link control, not content control — Discord proxies and caches the
 * image on its own CDN, so the embed in chat keeps working (and stays
 * saveable) regardless. What it stops is your server being reused as a CDN.
 * Set to 0 to keep images forever.
 */
defined('RG_GRACE_SECONDS') || define('RG_GRACE_SECONDS', 120);

/**
 * Set to true ONLY when this app sits behind a reverse proxy you control
 * (nginx/Apache on the same host). Otherwise a client can spoof its IP and
 * walk straight past the rate limiter.
 */
defined('RG_TRUST_PROXY') || define('RG_TRUST_PROXY', false);

function rg_app_dir(): string
{
    return dirname(__DIR__);
}

function rg_storage_dir(): string
{
    $dir = rg_app_dir() . '/storage';
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    // Apache: deny outright. Other servers: at least kill directory listing.
    if (!is_file($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
    }
    if (!is_file($dir . '/index.php')) {
        @file_put_contents($dir . '/index.php', "<?php http_response_code(404);\n");
    }
    $emb = $dir . '/embeds';
    if (!is_dir($emb)) mkdir($emb, 0700, true);
    if (!is_file($emb . '/index.php')) {
        @file_put_contents($emb . '/index.php', "<?php http_response_code(404);\n");
    }
    return $dir;
}

/**
 * 32-byte instance secret, created on first use.
 *
 * Stored as a PHP file that RETURNS the key rather than a raw .key file:
 * anyone who requests it over HTTP gets it executed, not printed, so the
 * secret stays private even on a server that ignores .htaccess (the built-in
 * `php -S` does exactly that).
 */
function rg_secret(): string
{
    static $cached = null;
    if ($cached !== null) return $cached;

    $path = rg_storage_dir() . '/secret.key.php';

    // Read the bytes and parse, rather than include(): avoids any opcache
    // staleness while another process is still writing the file.
    $read = static function (string $p): ?string {
        if (!is_file($p)) return null;
        $txt = @file_get_contents($p);
        if ($txt === false) return null;
        return preg_match("/return '([a-f0-9]{64})'/", $txt, $m) ? hex2bin($m[1]) : null;
    };

    if (($key = $read($path)) !== null) return $cached = $key;

    $key  = random_bytes(32);
    $body = "<?php // Reaction Gacha instance secret. Do not share, commit, or regenerate.\n"
          . "return '" . bin2hex($key) . "';\n";

    // O_CREAT|O_EXCL — fails if the file exists on BOTH Windows and POSIX.
    // (rename() would silently clobber on Linux, letting a second process
    // replace a key that already has live tokens minted against it.)
    $fh = @fopen($path, 'xb');
    if ($fh !== false) {
        fwrite($fh, $body);
        fflush($fh);
        fclose($fh);
        @chmod($path, 0600);
        return $cached = $key;
    }

    // another request is mid-create; give it a moment to finish
    for ($i = 0; $i < 50; $i++) {
        clearstatcache(true, $path);
        if (($existing = $read($path)) !== null) return $cached = $existing;
        usleep(20000);
    }
    throw new RuntimeException('Cannot establish instance secret');
}

function rg_b64url_encode(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function rg_b64url_decode(string $txt): string
{
    $b64 = strtr($txt, '-_', '+/');
    $pad = strlen($b64) % 4;
    if ($pad) $b64 .= str_repeat('=', 4 - $pad);
    $out = base64_decode($b64, true);
    return $out === false ? '' : $out;
}

/** Encrypt a card definition into a URL-safe token. */
function rg_token_encode(array $payload): string
{
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $iv   = random_bytes(12);
    $tag  = '';
    $ct   = openssl_encrypt($json, 'aes-256-gcm', rg_secret(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($ct === false) throw new RuntimeException('Encryption failed');
    return rg_b64url_encode($iv . $tag . $ct);
}

/** Decrypt a token. Returns null when forged, corrupt, or from another install. */
function rg_token_decode(string $token): ?array
{
    $raw = rg_b64url_decode($token);
    if (strlen($raw) < 29) return null;
    $iv  = substr($raw, 0, 12);
    $tag = substr($raw, 12, 16);
    $ct  = substr($raw, 28);
    $json = openssl_decrypt($ct, 'aes-256-gcm', rg_secret(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($json === false) return null;                 // GCM tag rejected it
    $data = json_decode($json, true);
    if (!is_array($data) || !isset($data['j'], $data['c'], $data['r'])) return null;
    if (!preg_match('/^[a-f0-9]{16}$/', (string) $data['j'])) return null;
    if (isset($data['x']) && time() > (int) $data['x']) return null;
    return $data;
}

/* ---------------- ledger ---------------- */

function rg_record_path(string $jti): string
{
    return rg_storage_dir() . '/embeds/' . $jti . '.json';
}

function rg_image_path(string $jti): string
{
    return rg_storage_dir() . '/embeds/' . $jti . '.bin';
}

function rg_record_load(string $jti): ?array
{
    if (!preg_match('/^[a-f0-9]{16}$/', $jti)) return null;
    $path = rg_record_path($jti);
    if (!is_file($path)) return null;
    $data = json_decode((string) file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function rg_record_save(string $jti, array $rec): void
{
    file_put_contents(rg_record_path($jti), json_encode($rec), LOCK_EX);
}

/**
 * Consume one use of a link. Returns true if this caller got the use,
 * false if it was already spent. Uses an exclusive lock so two simultaneous
 * openers can't both win.
 */
function rg_record_burn(string $jti): bool
{
    $path = rg_record_path($jti);
    $fh = @fopen($path, 'r+b');
    if ($fh === false) return false;
    try {
        if (!flock($fh, LOCK_EX)) return false;
        $rec = json_decode((string) stream_get_contents($fh), true);
        if (!is_array($rec)) return false;
        if (!empty($rec['burned'])) return false;
        $rec['burned']    = true;
        $rec['burned_at'] = time();
        $json = json_encode($rec);
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, $json);
        fflush($fh);
        return true;
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

/**
 * Has this embed's image outlived its post-view grace window?
 * The clock starts at the first human view, not at creation — an unopened
 * link keeps its image until the normal TTL.
 */
function rg_image_expired(array $rec): bool
{
    if (RG_GRACE_SECONDS <= 0) return false;
    if (empty($rec['burned']) || empty($rec['burned_at'])) return false;
    return time() > (int) $rec['burned_at'] + RG_GRACE_SECONDS;
}

/**
 * Delete the image bytes but keep the record, so the page can still explain
 * itself instead of 404ing into a mystery.
 */
function rg_image_retire(string $jti): void
{
    @unlink(rg_image_path($jti));
    $rec = rg_record_load($jti);
    if ($rec !== null && empty($rec['retired'])) {
        $rec['retired'] = time();
        $rec['bytes']   = 0;
        rg_record_save($jti, $rec);
    }
}

/** Drop expired embeds, then evict oldest until under the count and disk caps. */
function rg_gc(): void
{
    $files  = glob(rg_storage_dir() . '/embeds/*.json') ?: [];
    $cutoff = time() - RG_TTL_DAYS * 86400;
    $drop = static function (string $json): void {
        @unlink($json);
        @unlink(substr($json, 0, -5) . '.bin');
    };

    $live = [];   // json path => [created, bytes]
    $total = 0;
    foreach ($files as $f) {
        $rec = json_decode((string) file_get_contents($f), true);
        $created = is_array($rec) ? (int) ($rec['created'] ?? 0) : 0;
        if ($created < $cutoff) { $drop($f); continue; }
        // reclaim bytes whose grace window lapsed without anyone re-fetching
        if (is_array($rec) && empty($rec['retired']) && rg_image_expired($rec)) {
            rg_image_retire(basename($f, '.json'));
            $rec['bytes'] = 0;
        }
        $bytes = is_array($rec) ? (int) ($rec['bytes'] ?? 0) : 0;
        $live[$f] = [$created, $bytes];
        $total += $bytes;
    }

    uasort($live, static fn($a, $b) => $a[0] <=> $b[0]);   // oldest first
    $count = count($live);
    foreach ($live as $f => [$created, $bytes]) {
        if ($count <= RG_MAX_EMBEDS && $total <= RG_MAX_BYTES) break;
        $drop($f);
        $count--;
        $total -= $bytes;
    }
}

/** Client address, honouring a proxy header only when explicitly trusted. */
function rg_client_ip(): string
{
    if (RG_TRUST_PROXY) {
        $fwd = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if ($fwd !== '') {
            $first = trim(explode(',', $fwd)[0]);
            if (filter_var($first, FILTER_VALIDATE_IP)) return $first;
        }
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/**
 * Sliding-window rate limit for link minting. Returns the number of seconds
 * to wait, or 0 when the request is allowed.
 */
function rg_rate_limit(string $ip): int
{
    $dir = rg_storage_dir() . '/rl';
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    $path = $dir . '/' . hash('sha256', $ip) . '.json';

    $fh = @fopen($path, 'c+b');
    if ($fh === false) return 0;   // never lock users out over a storage hiccup
    try {
        if (!flock($fh, LOCK_EX)) return 0;
        $now  = time();
        $hits = json_decode((string) stream_get_contents($fh), true);
        $hits = is_array($hits) ? $hits : [];
        $hits = array_values(array_filter($hits,
            static fn($t) => is_int($t) && $t > $now - RG_RATE_WINDOW));

        if (count($hits) >= RG_RATE_MAX) {
            return max(1, ($hits[0] + RG_RATE_WINDOW) - $now);
        }
        $hits[] = $now;
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($hits));
        fflush($fh);
        return 0;
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

/** Occasionally prune stale rate-limit files. */
function rg_rate_gc(): void
{
    if (random_int(1, 50) !== 1) return;
    foreach (glob(rg_storage_dir() . '/rl/*.json') ?: [] as $f) {
        if (filemtime($f) < time() - RG_RATE_WINDOW * 2) @unlink($f);
    }
}

/* ---------------- request helpers ---------------- */

/** Absolute URL of the app root, e.g. http://host/apps/reaction-gacha */
function rg_base_url(): string
{
    $https  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';

    $path = '';
    $docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    $appDir  = realpath(rg_app_dir());
    if ($docRoot && $appDir) {
        $docRoot = rtrim(str_replace('\\', '/', $docRoot), '/');
        $appDir  = rtrim(str_replace('\\', '/', $appDir), '/');
        if (str_starts_with($appDir, $docRoot)) {
            $path = substr($appDir, strlen($docRoot));
        }
    }
    if ($path === '') {
        // fall back to the current script's directory
        $script = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
        $path = rtrim(preg_replace('#/(api|lib)$#', '', $script) ?? '', '/');
    }
    return $scheme . '://' . $host . $path;
}

/**
 * Direct URL to the card image.
 *
 * The extension is load-bearing, not decoration. Chat clients decide how to
 * unfurl a link from its path: a URL ending in .gif is treated as an image and
 * rendered inline and animated, while anything else (including i.php?c=…) is
 * fetched as a page, and a page carrying og:title/og:description becomes a
 * bordered rich-embed card with a flattened still for a picture.
 *
 * Needs the rewrite in .htaccess / the vhost — see install.sh.
 */
function rg_image_url(string $token, string $mime = 'image/gif'): string
{
    $ext = $mime === 'image/png' ? 'png' : 'gif';
    return rg_base_url() . '/i/' . $token . '.' . $ext;
}

/**
 * Link-preview crawlers must be able to read the embed without spending its
 * single use — otherwise Discord's unfurler burns the link before any human
 * sees it.
 */
function rg_is_crawler(): bool
{
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    if ($ua === '') return true; // no UA: treat as a bot, never burn
    $bots = [
        'discordbot', 'twitterbot', 'facebookexternalhit', 'slackbot', 'slack-imgproxy',
        'telegrambot', 'whatsapp', 'linkedinbot', 'redditbot', 'googlebot', 'bingbot',
        'applebot', 'yandex', 'duckduckbot', 'embedly', 'iframely', 'skypeuripreview',
        'vkshare', 'mastodon', 'pleroma', 'misskey', 'matrix', 'signal', 'preview',
        'bot', 'crawler', 'spider',
    ];
    $ua = strtolower($ua);
    foreach ($bots as $b) {
        if (str_contains($ua, $b)) return true;
    }
    return false;
}

/** Card database keyed by id, with the resolved art path. */
function rg_cards(): array
{
    static $byId = null;
    if ($byId !== null) return $byId;
    $db = require rg_app_dir() . '/data/cards.php';
    $byId = [];
    foreach ($db['cards'] as $c) $byId[$c['id']] = $c;
    $byId['__types'] = ['ptypes' => $db['ptypes'], 'mtypes' => $db['mtypes']];
    return $byId;
}

function rg_json(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}
