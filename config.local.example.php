<?php
/**
 * Copy to config.local.php to override deployment settings.
 * Anything defined here wins over the defaults in lib/embed.php.
 *
 * Must start with `<?php` on byte one — no BOM, no blank line before it,
 * or PHP will emit it as output and headers will already be sent.
 */

// --- Embed link lifetime -------------------------------------------------

// Seconds the image keeps serving after a link's FIRST HUMAN VIEW, after
// which the bytes are deleted. Crawler previews don't start this clock.
// 0 disables expiry (images live until RG_TTL_DAYS).
// define('RG_GRACE_SECONDS', 120);

// Hard expiry for links regardless of whether anyone opened them.
// define('RG_TTL_DAYS', 30);

// --- Storage budget ------------------------------------------------------

// define('RG_MAX_EMBEDS', 500);
// define('RG_MAX_BYTES', 512 * 1024 * 1024);
// define('RG_MAX_IMG', 6 * 1024 * 1024);

// --- Abuse control -------------------------------------------------------

// define('RG_RATE_MAX', 40);       // mints per IP...
// define('RG_RATE_WINDOW', 3600);  // ...per this many seconds

// Enable ONLY behind a reverse proxy you control, otherwise clients can
// spoof X-Forwarded-For and bypass the rate limiter entirely.
// define('RG_TRUST_PROXY', false);
