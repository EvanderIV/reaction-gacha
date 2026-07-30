#!/usr/bin/env bash
#
# Reaction Gacha — installer for Debian 13 (trixie).
#
# Installs and updates the packages the app needs, deploys the files, tunes
# the PHP/web-server settings that this app specifically depends on, locks
# down storage/, schedules housekeeping, and optionally obtains a TLS cert.
#
# Safe to re-run: every step is idempotent, files it replaces are backed up
# with a timestamp, and storage/ (which holds the instance secret) is never
# touched once it exists.
#
#   sudo ./install.sh --domain cards.example.com --email you@example.com
#   sudo ./install.sh --server nginx --dir /srv/gacha --no-tls
#   ./install.sh --dry-run --domain example.com      # print, change nothing
#
set -Eeuo pipefail

# ---------------------------------------------------------------- defaults --

SERVER=apache          # apache | nginx
TARGET_DIR=/var/www/html/apps/reaction-gacha
DOMAIN=""
EMAIL=""
WANT_TLS=1
DRY_RUN=0
DO_UPGRADE=1
STAMP="$(date +%Y%m%d-%H%M%S)"
SRC_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# ------------------------------------------------------------------ output --

if [[ -t 1 ]]; then
  C_OK=$'\e[32m'; C_WARN=$'\e[33m'; C_ERR=$'\e[31m'; C_DIM=$'\e[2m'; C_B=$'\e[1m'; C_0=$'\e[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_B=""; C_0=""
fi

step()  { printf '\n%s==>%s %s%s%s\n' "$C_OK" "$C_0" "$C_B" "$*" "$C_0"; }
info()  { printf '    %s\n' "$*"; }
warn()  { printf '%s !! %s%s\n' "$C_WARN" "$*" "$C_0" >&2; }
die()   { printf '%s ✗  %s%s\n' "$C_ERR" "$*" "$C_0" >&2; exit 1; }
ok()    { printf '%s ✓  %s%s\n' "$C_OK" "$*" "$C_0"; }

trap 'die "failed at line $LINENO: ${BASH_COMMAND}"' ERR

# Run a command, or just show it under --dry-run.
run() {
  if (( DRY_RUN )); then
    printf '%s    [dry-run] %s%s\n' "$C_DIM" "$*" "$C_0"
  else
    "$@"
  fi
}

# Write stdin to a file, backing up any existing copy that differs.
write_file() {
  local dest="$1" content
  content="$(cat)"
  if [[ -f "$dest" ]] && [[ "$(cat "$dest")" == "$content" ]]; then
    info "unchanged: $dest"
    return 0
  fi
  if (( DRY_RUN )); then
    printf '%s    [dry-run] write %s (%d bytes)%s\n' "$C_DIM" "$dest" "${#content}" "$C_0"
    # RG_SHOW_FILES=1 prints what would be written — useful for eyeballing the
    # generated vhost before touching a real server.
    [[ "${RG_SHOW_FILES:-0}" == "1" ]] && printf '%s\n' "$content" | sed 's/^/        | /'
    return 0
  fi
  if [[ -f "$dest" ]]; then
    cp -a "$dest" "${dest}.bak-${STAMP}"
    info "backed up existing -> ${dest}.bak-${STAMP}"
  fi
  mkdir -p "$(dirname "$dest")"
  printf '%s\n' "$content" > "$dest"
  ok "wrote $dest"
}

usage() {
  cat <<'EOF'
Reaction Gacha — installer for Debian 13 (trixie).

Installs and updates the packages the app needs, deploys the files, tunes the
PHP and web-server settings this app depends on, locks down storage/, schedules
housekeeping, and optionally obtains a TLS certificate.

Safe to re-run: every step is idempotent, replaced files are backed up with a
timestamp, and storage/ (which holds the instance secret) is never touched once
it exists.

Usage:
  sudo ./install.sh --domain cards.example.com --email you@example.com
  sudo ./install.sh --server nginx --dir /srv/gacha --no-tls
  ./install.sh --dry-run --domain example.com      # print, change nothing

Options:
  --server apache|nginx   Web server to configure      (default: apache)
  --dir PATH              Install location             (default: /var/www/reaction-gacha)
  --domain NAME           Domain for the vhost + TLS   (default: server IP, HTTP only)
  --email ADDR            Contact address for Let's Encrypt
  --no-tls                Skip certbot entirely
  --no-upgrade            Skip 'apt upgrade' (still updates the index)
  --dry-run               Show every change without making it
  -h, --help              This message
EOF
}

# -------------------------------------------------------------------- args --

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server)     SERVER="${2:?--server needs a value}"; shift 2 ;;
    --dir)        TARGET_DIR="${2:?--dir needs a value}"; shift 2 ;;
    --domain)     DOMAIN="${2:?--domain needs a value}"; shift 2 ;;
    --email)      EMAIL="${2:?--email needs a value}"; shift 2 ;;
    --no-tls)     WANT_TLS=0; shift ;;
    --no-upgrade) DO_UPGRADE=0; shift ;;
    --dry-run)    DRY_RUN=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            die "unknown option: $1  (try --help)" ;;
  esac
done

[[ "$SERVER" == "apache" || "$SERVER" == "nginx" ]] \
  || die "--server must be 'apache' or 'nginx', got '$SERVER'"

# --------------------------------------------------------------- preflight --

step "Preflight"

(( DRY_RUN )) || [[ $EUID -eq 0 ]] || die "run as root (sudo $0 ...)"

if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  info "OS: ${PRETTY_NAME:-unknown}"
  [[ "${ID:-}" == "debian" ]] || warn "built for Debian; '${ID:-?}' may need adjusting"
  case "${VERSION_ID:-}" in
    13|"") : ;;
    *) warn "targets Debian 13; found ${VERSION_ID} — should still work" ;;
  esac
else
  warn "cannot identify the OS; continuing"
fi

[[ -f "$SRC_DIR/index.php" && -d "$SRC_DIR/lib" ]] \
  || die "run this from the app directory (index.php and lib/ not found in $SRC_DIR)"

if (( WANT_TLS )) && [[ -z "$DOMAIN" ]]; then
  warn "no --domain given, so there's nothing to issue a certificate for; skipping TLS"
  WANT_TLS=0
fi
if (( WANT_TLS )) && [[ -z "$EMAIL" ]]; then
  warn "no --email given; certbot will be run with --register-unsafely-without-email"
fi

SERVER_NAME="${DOMAIN:-_}"
ok "will install to $TARGET_DIR and configure $SERVER for '${SERVER_NAME}'"

# -------------------------------------------------------------- packages ---

step "Packages"

export DEBIAN_FRONTEND=noninteractive

pkgs=(ca-certificates curl rsync)
if [[ "$SERVER" == "apache" ]]; then
  pkgs+=(apache2 libapache2-mod-php php-cli)
else
  pkgs+=(nginx php-fpm php-cli)
fi
if (( WANT_TLS )); then
  pkgs+=(certbot)
  [[ "$SERVER" == "apache" ]] && pkgs+=(python3-certbot-apache) || pkgs+=(python3-certbot-nginx)
fi

info "updating package index"
run apt-get update -qq

if (( DO_UPGRADE )); then
  info "upgrading installed packages (this can take a while)"
  run apt-get -y -qq upgrade
else
  info "skipping upgrade (--no-upgrade)"
fi

info "installing: ${pkgs[*]}"
run apt-get -y -qq install "${pkgs[@]}"
ok "packages ready"

# ------------------------------------------------------------ php version --

step "PHP"

if (( DRY_RUN )) && ! command -v php >/dev/null 2>&1; then
  PHP_VER="8.4"
  info "[dry-run] assuming PHP $PHP_VER"
else
  command -v php >/dev/null 2>&1 || die "php missing after install"
  PHP_VER="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')"
  info "PHP $PHP_VER ($(command -v php))"

  # The app needs openssl for AES-256-GCM token encryption. On Debian this is
  # compiled in rather than a separate package, so verify instead of installing.
  if ! php -m | grep -qx openssl; then
    die "PHP is missing the openssl extension — embed links cannot be encrypted without it"
  fi
  php -r 'exit(in_array("aes-256-gcm", openssl_get_cipher_methods()) ? 0 : 1);' \
    || die "PHP openssl has no aes-256-gcm cipher"
  ok "openssl + aes-256-gcm available"
fi

# This app uploads a rendered GIF (up to RG_MAX_IMG, 10M by default).
# Debian defaults to upload_max_filesize=2M / post_max_size=8M, which would
# reject the larger animated exports.
for sapi in cli apache2 fpm; do
  d="/etc/php/${PHP_VER}/${sapi}/conf.d"
  [[ -d "$d" ]] || (( DRY_RUN )) || continue
  write_file "${d}/99-reaction-gacha.ini" <<'INI'
; Managed by reaction-gacha install.sh
; The client renders each card to ~7MB of GIF and RG_MAX_IMG allows 10M, so
; both of Debian's defaults (2M upload / 8M post) are far too small.
upload_max_filesize = 12M
post_max_size = 14M
memory_limit = 256M
max_execution_time = 60

; Don't leak stack traces to visitors; the app reports its own errors.
display_errors = Off
log_errors = On
expose_php = Off
INI
done

# ---------------------------------------------------------------- deploy ----

step "Application files"

if [[ "$(readlink -f "$SRC_DIR")" == "$(readlink -f "$TARGET_DIR" 2>/dev/null || echo "")" ]]; then
  info "already running from $TARGET_DIR; not copying"
else
  run mkdir -p "$TARGET_DIR"
  # storage/ holds the instance secret — excluding it means re-running the
  # installer never invalidates links that have already been shared.
  info "syncing $SRC_DIR -> $TARGET_DIR (preserving storage/)"
  run rsync -a --delete \
    --exclude '.git/' \
    --exclude 'storage/' \
    --exclude 'config.local.php' \
    --exclude '*.bak-*' \
    "$SRC_DIR"/ "$TARGET_DIR"/
  ok "files deployed"
fi

# Placeholder card art ships as SVG; regenerate if the folder came up empty.
if (( ! DRY_RUN )) && [[ -z "$(ls -A "$TARGET_DIR/assets/images" 2>/dev/null || true)" ]]; then
  info "generating placeholder card art"
  ( cd "$TARGET_DIR" && php tools/generate-art.php >/dev/null ) && ok "art generated"
fi

# --------------------------------------------------------------- local cfg --

if [[ ! -f "$TARGET_DIR/config.local.php" ]]; then
  write_file "$TARGET_DIR/config.local.php" <<'CFG'
<?php
// Deployment overrides — see config.local.example.php for every option.
// Written by install.sh; safe to edit, never overwritten on re-install.

// Seconds an embed image keeps serving after the link's first human view.
define('RG_GRACE_SECONDS', 120);

// Leave false unless another proxy (CDN, load balancer) sits in front of the
// web server this script configured — otherwise clients can spoof their IP
// past the rate limiter.
define('RG_TRUST_PROXY', false);
CFG
else
  info "config.local.php exists; leaving it alone"
fi

# ----------------------------------------------------------- permissions ----

step "Permissions"

WEB_USER=www-data
if (( ! DRY_RUN )); then
  id -u "$WEB_USER" >/dev/null 2>&1 || die "user $WEB_USER does not exist"
fi

# App code: readable by everyone, writable only by root.
run chown -R root:root "$TARGET_DIR"
run find "$TARGET_DIR" -type d ! -path "$TARGET_DIR/storage*" -exec chmod 755 {} +
run find "$TARGET_DIR" -type f ! -path "$TARGET_DIR/storage*" -exec chmod 644 {} +
run chmod 755 "$TARGET_DIR/install.sh"

# storage/: private to the web user. Holds the instance secret.
run mkdir -p "$TARGET_DIR/storage/embeds"
run chown -R "$WEB_USER:$WEB_USER" "$TARGET_DIR/storage"
run chmod 700 "$TARGET_DIR/storage"
ok "storage/ is $WEB_USER-only (0700)"

# ------------------------------------------------------------- web server --

step "Web server ($SERVER)"

if [[ "$SERVER" == "apache" ]]; then
  write_file "/etc/apache2/sites-available/reaction-gacha.conf" <<APACHE
# Managed by reaction-gacha install.sh
<VirtualHost *:80>
    ServerName ${SERVER_NAME}
    DocumentRoot ${TARGET_DIR}

    <Directory ${TARGET_DIR}>
        Options -Indexes +FollowSymLinks
        # Rules live here rather than in .htaccess, so AllowOverride stays off.
        AllowOverride None
        Require all granted

        # Pretty image URLs: /i/<token>.gif -> i.php?c=<token>
        # The .gif extension is what makes chat clients render the card inline
        # and animated instead of unfurling it as a rich-embed card with a
        # static thumbnail. Tokens are base64url, hence the charset.
        RewriteEngine On
        RewriteRule ^i/([A-Za-z0-9_-]+)\.(gif|png)\$ i.php?c=\$1 [L,QSA]
    </Directory>

    # Instance secret, stored embed images and rate-limit buckets.
    <Directory ${TARGET_DIR}/storage>
        Require all denied
    </Directory>

    # Dotfiles (.gitignore, editor leftovers) are nobody's business.
    <FilesMatch "^\.">
        Require all denied
    </FilesMatch>

    LimitRequestBody 14680064

    ErrorLog \${APACHE_LOG_DIR}/reaction-gacha-error.log
    CustomLog \${APACHE_LOG_DIR}/reaction-gacha-access.log combined
</VirtualHost>
APACHE

  run a2enmod php"${PHP_VER}" rewrite headers
  run a2ensite reaction-gacha.conf
  # Default site would otherwise shadow ours on a bare IP.
  if [[ -L /etc/apache2/sites-enabled/000-default.conf ]]; then
    info "disabling the default Apache site"
    run a2dissite 000-default.conf
  fi
  run apache2ctl configtest
  run systemctl reload apache2
  ok "apache2 configured"

else
  write_file "/etc/nginx/sites-available/reaction-gacha" <<NGINX
# Managed by reaction-gacha install.sh
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};
    root ${TARGET_DIR};
    index index.php;

    # Must clear the app's image uploads or nginx rejects them before PHP runs.
    client_max_body_size 14M;

    # Instance secret, stored embed images and rate-limit buckets.
    location ^~ /storage/ { deny all; return 404; }
    location ~ /\\.       { deny all; return 404; }

    # Pretty image URLs: /i/<token>.gif -> i.php?c=<token>
    # The .gif extension is what makes chat clients render the card inline and
    # animated instead of unfurling it as a rich-embed card with a static
    # thumbnail. Tokens are base64url, hence the charset.
    location ~ ^/i/([A-Za-z0-9_-]+)\\.(gif|png)\$ {
        rewrite ^/i/([A-Za-z0-9_-]+)\\.(gif|png)\$ /i.php?c=\$1 last;
    }

    location / {
        try_files \$uri \$uri/ =404;
    }

    location ~ \\.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php${PHP_VER}-fpm.sock;
    }

    access_log /var/log/nginx/reaction-gacha-access.log;
    error_log  /var/log/nginx/reaction-gacha-error.log;
}
NGINX

  run ln -sfn /etc/nginx/sites-available/reaction-gacha /etc/nginx/sites-enabled/reaction-gacha
  if [[ -e /etc/nginx/sites-enabled/default ]]; then
    info "removing the default nginx site"
    run rm -f /etc/nginx/sites-enabled/default
  fi
  run nginx -t
  run systemctl reload nginx
  run systemctl enable --now "php${PHP_VER}-fpm"
  ok "nginx + php${PHP_VER}-fpm configured"
fi

# ---------------------------------------------------------------- firewall --

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  step "Firewall"
  profile="Nginx Full"
  [[ "$SERVER" == "apache" ]] && profile="Apache Full"
  info "ufw is active; allowing '$profile'"
  run ufw allow "$profile"
fi

# ------------------------------------------------------------ housekeeping --

step "Housekeeping"

# Images are retired lazily on request; without this, a link opened once and
# then ignored would keep its bytes until someone else minted a link.
write_file "/etc/cron.d/reaction-gacha" <<CRON
# Managed by reaction-gacha install.sh
# Retires embed images past their grace window and prunes rate-limit files.
SHELL=/bin/sh
PATH=/usr/local/bin:/usr/bin:/bin
*/5 * * * * ${WEB_USER} php ${TARGET_DIR}/tools/gc.php >/dev/null 2>&1
CRON

# ---------------------------------------------------------------------- TLS --

if (( WANT_TLS )); then
  step "TLS certificate"
  certbot_args=(--non-interactive --agree-tos --redirect -d "$DOMAIN")
  if [[ -n "$EMAIL" ]]; then
    certbot_args+=(-m "$EMAIL")
  else
    certbot_args+=(--register-unsafely-without-email)
  fi
  [[ "$SERVER" == "apache" ]] && certbot_args=(--apache "${certbot_args[@]}") \
                              || certbot_args=(--nginx  "${certbot_args[@]}")

  info "requesting a certificate for $DOMAIN"
  if (( DRY_RUN )); then
    printf '%s    [dry-run] certbot %s%s\n' "$C_DIM" "${certbot_args[*]}" "$C_0"
  elif certbot "${certbot_args[@]}"; then
    ok "HTTPS enabled (renewal is handled by certbot's systemd timer)"
  else
    warn "certbot failed — the site is still up on HTTP."
    warn "Check that $DOMAIN resolves to this host and ports 80/443 are open, then:"
    warn "  certbot ${certbot_args[*]}"
  fi
else
  step "TLS certificate"
  info "skipped. Note: navigator.clipboard only exists in a secure context, so"
  info "over plain HTTP the app falls back to a copy dialog (it still works)."
fi

# --------------------------------------------------------------- self-test --

step "Verifying"

if (( DRY_RUN )); then
  info "[dry-run] skipping live checks"
else
  for f in index.php e.php i.php api/share.php lib/embed.php tools/gc.php; do
    php -l "$TARGET_DIR/$f" >/dev/null || die "syntax error in $f"
  done
  ok "PHP files parse"

  # Exercise the storage path as the web user: creates the instance secret and
  # proves a token survives an encrypt/decrypt round trip.
  if sudo -u "$WEB_USER" php -r '
      require "'"$TARGET_DIR"'/lib/embed.php";
      $t = rg_token_encode(["j"=>bin2hex(random_bytes(8)),"c"=>"x","r"=>0,"t"=>"pokemon"]);
      exit(rg_token_decode($t) === null ? 1 : 0);
  ' 2>/dev/null; then
    ok "instance secret established; token round-trip works"
  else
    die "could not write storage/ as $WEB_USER — check ownership of $TARGET_DIR/storage"
  fi

  probe="http://127.0.0.1/index.php"
  [[ -n "$DOMAIN" ]] && probe="http://127.0.0.1/index.php -H Host:$DOMAIN"
  # shellcheck disable=SC2086
  code="$(curl -s -o /dev/null -w '%{http_code}' $probe || echo 000)"
  if [[ "$code" == "200" ]]; then
    ok "app responds locally (HTTP $code)"
  else
    warn "local probe returned HTTP $code — check the $SERVER error log"
  fi

  # storage must NOT be reachable over HTTP
  # shellcheck disable=SC2086
  scode="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/storage/secret.key.php \
    ${DOMAIN:+-H Host:$DOMAIN} || echo 000)"
  if [[ "$scode" == "403" || "$scode" == "404" ]]; then
    ok "storage/ is not web-readable (HTTP $scode)"
  else
    warn "storage/ returned HTTP $scode — expected 403/404. Review the vhost."
  fi
fi

# ------------------------------------------------------------------- done ---

step "Done"
host_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
url="http://${DOMAIN:-${host_ip:-localhost}}"
if (( WANT_TLS )) && [[ -n "$DOMAIN" ]]; then url="https://${DOMAIN}"; fi
cat <<EOF

  Reaction Gacha is installed.

    URL          ${url}/
    Files        ${TARGET_DIR}
    Config       ${TARGET_DIR}/config.local.php
    Secret       ${TARGET_DIR}/storage/secret.key.php   ${C_WARN}back this up${C_0}
    Housekeeping /etc/cron.d/reaction-gacha (every 5 min)

  ${C_B}Back up ${TARGET_DIR}/storage/${C_0} — losing the instance secret
  invalidates every embed link that has ever been shared.

  Embed links only unfurl if Discord can reach this host from the internet.

EOF
