#!/usr/bin/env bash
# Push assets/images/ to the live server.
#
# The art lives outside git (see .gitignore) because it's binary and churns,
# so this script is the only way it reaches production.
#
# There's no rsync on the Windows dev box, so we fake the useful half of it:
# hash both sides, then ship only the files that actually differ, in a single
# tar stream over one ssh connection. For a 3 MB folder that's overkill; for
# the folder this becomes once it's full of mp4 art, it isn't.
#
# Usage:  tools/push-assets.sh [-n] [-d] [-a] [-f] [-H user@host] [-r remote-dir]
set -euo pipefail

HOST="evanm@eminich.com"
REMOTE_BASE="/var/www/html/apps/reaction-gacha/assets"
SRC_REL="assets/images"

DRY=0 DELETE=0 SEND_ALL=0 FORCE=0

usage() {
  cat <<EOF
Push $SRC_REL/ to $HOST:$REMOTE_BASE/images/

  -n, --dry-run        show the plan, transfer nothing
  -d, --delete         also remove remote files that no longer exist locally
  -a, --all            skip the hash diff, send every file
  -f, --force          don't prompt for confirmation (for --delete / CI)
  -H, --host USER@HOST override the destination host
  -r, --remote DIR     override the remote assets dir (images/ is appended)
  -h, --help           this

Environment:
  RG_SSH_OPTS   extra flags passed to ssh/scp, e.g. "-i ~/.ssh/eminich -p 2222"

Run from Git Bash (or any POSIX shell); from PowerShell use:
  bash tools/push-assets.sh -n
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -n|--dry-run) DRY=1 ;;
    -d|--delete)  DELETE=1 ;;
    -a|--all)     SEND_ALL=1 ;;
    -f|--force)   FORCE=1 ;;
    -H|--host)    HOST="${2:?--host needs a value}"; shift ;;
    -r|--remote)  REMOTE_BASE="${2:?--remote needs a value}"; shift ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

# shellcheck disable=SC2206  # deliberate word splitting: these are ssh flags
SSH_OPTS=(${RG_SSH_OPTS:-})

REMOTE_DIR="${REMOTE_BASE%/}/images"

# A typo in --remote turns the --delete branch into an `rm -rf` on something
# that isn't ours. Refuse anything suspiciously short or root-adjacent.
case "$REMOTE_DIR" in
  /|/images|/*/images) : ;;
  *) echo "refusing to target '$REMOTE_DIR' — doesn't look like an assets dir" >&2; exit 2 ;;
esac
if [ "$(printf '%s' "$REMOTE_DIR" | tr -cd / | wc -c)" -lt 3 ]; then
  echo "refusing to target '$REMOTE_DIR' — too close to the filesystem root" >&2
  exit 2
fi

cd "$(dirname "$0")/.."
[ -d "$SRC_REL" ] || { echo "no $SRC_REL/ here — run this from the repo" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "  local:  $(pwd)/$SRC_REL"
echo "  remote: $HOST:$REMOTE_DIR"
echo

# ---- manifests -------------------------------------------------------------
# sha256sum prints "<64 hex><2 spaces><path>", but on Windows the second space
# is sometimes '*' (binary mode), and paths carry a leading './' from find.
# Normalise both sides to "<path>\t<hash>" so they're directly comparable.
normalise() {
  awk '{ h = substr($0, 1, 64); p = substr($0, 67)
         sub(/^\*/, "", p); sub(/^\.\//, "", p)
         if (p != "") print p "\t" h }' | LC_ALL=C sort
}

# BL_proxy is Blender's video-proxy cache — local scratch, never deploy it.
find "$SRC_REL" -type f \
  -not -path "*/BL_proxy/*" \
  -not -name '.DS_Store' -not -name 'Thumbs.db' -not -name '*.tmp' \
  -printf '%P\0' 2>/dev/null \
  | (cd "$SRC_REL" && xargs -0 -r sha256sum) \
  | normalise > "$TMP/local.txt"

LOCAL_N=$(wc -l < "$TMP/local.txt")
[ "$LOCAL_N" -gt 0 ] || { echo "nothing to push — $SRC_REL/ has no files" >&2; exit 1; }

if [ "$SEND_ALL" -eq 1 ]; then
  : > "$TMP/remote.txt"
  echo "  --all: skipping the hash diff"
else
  echo "  hashing remote..."
  # Missing dir or missing sha256sum both just yield an empty manifest, which
  # correctly degrades to "everything is new".
  ssh "${SSH_OPTS[@]}" "$HOST" \
    "cd '$REMOTE_DIR' 2>/dev/null && find . -type f -not -path './BL_proxy/*' -exec sha256sum {} + 2>/dev/null" \
    | normalise > "$TMP/remote.txt" || : > "$TMP/remote.txt"
fi

# ---- diff ------------------------------------------------------------------
# Keyed on FILENAME, not the usual NR==FNR: when the remote manifest is empty
# (fresh deploy, or --all) NR==FNR stays true through the whole local file and
# every local path gets misfiled as remote-only.
awk -F'\t' -v RF="$TMP/remote.txt" '
  FILENAME == RF { remote[$1] = $2; next }
  { if (!($1 in remote))       print $1 > NEW
    else if (remote[$1] != $2) print $1 > CHANGED
    else                       print $1 > SAME
    seen[$1] = 1 }
  END { for (p in remote) if (!(p in seen)) print p > GONE }
' NEW="$TMP/new.txt" CHANGED="$TMP/changed.txt" SAME="$TMP/same.txt" GONE="$TMP/gone.txt" \
  "$TMP/remote.txt" "$TMP/local.txt"

# awk only creates an output file if something was written to it
for f in new changed same gone; do [ -f "$TMP/$f.txt" ] || : > "$TMP/$f.txt"; done
LC_ALL=C sort -o "$TMP/new.txt" "$TMP/new.txt"
LC_ALL=C sort -o "$TMP/changed.txt" "$TMP/changed.txt"
cat "$TMP/new.txt" "$TMP/changed.txt" > "$TMP/send.txt"

count() { wc -l < "$1" | tr -d ' '; }
show()  { [ "$(count "$2")" -gt 0 ] && sed "s/^/    $1 /" "$2" || true; }

echo
show "+" "$TMP/new.txt"
show "~" "$TMP/changed.txt"
[ "$DELETE" -eq 1 ] && show "-" "$TMP/gone.txt"

SEND_N=$(count "$TMP/send.txt")
BYTES=$( [ "$SEND_N" -gt 0 ] && (cd "$SRC_REL" && tr '\n' '\0' < "$TMP/send.txt" | xargs -0 -r du -cb 2>/dev/null | tail -1 | cut -f1) || echo 0 )

printf '\n  %s new, %s changed, %s unchanged, %s remote-only  (%s KB to send)\n' \
  "$(count "$TMP/new.txt")" "$(count "$TMP/changed.txt")" \
  "$(count "$TMP/same.txt")" "$(count "$TMP/gone.txt")" "$(( BYTES / 1024 ))"

if [ "$SEND_N" -eq 0 ] && { [ "$DELETE" -eq 0 ] || [ "$(count "$TMP/gone.txt")" -eq 0 ]; }; then
  echo "  already in sync."
  exit 0
fi

if [ "$DRY" -eq 1 ]; then
  echo "  dry run — nothing transferred."
  exit 0
fi

confirm() {
  [ "$FORCE" -eq 1 ] && return 0
  printf '  %s [y/N] ' "$1"
  read -r reply < /dev/tty || return 1
  case "$reply" in [yY]*) return 0 ;; *) return 1 ;; esac
}

# ---- transfer --------------------------------------------------------------
# One tar stream, one ssh connection: Windows OpenSSH has no ControlMaster, so
# per-file scp would re-authenticate for every single file.
if [ "$SEND_N" -gt 0 ]; then
  echo
  echo "  sending $SEND_N file(s)..."
  # --verbatim-files-from keeps filenames with leading dashes/spaces intact;
  # older tars don't have it, hence the fallback.
  { tar -C "$SRC_REL" -czf - --verbatim-files-from -T "$TMP/send.txt" 2>/dev/null \
      || tar -C "$SRC_REL" -czf - -T "$TMP/send.txt"; } > "$TMP/payload.tgz"

  ssh "${SSH_OPTS[@]}" "$HOST" \
    "set -e; mkdir -p '$REMOTE_DIR'; tar -xzf - -C '$REMOTE_DIR'; \
     find '$REMOTE_DIR' -type f -exec chmod 644 {} +; \
     find '$REMOTE_DIR' -type d -exec chmod 755 {} +" < "$TMP/payload.tgz"
  echo "  sent."
fi

# ---- deletions -------------------------------------------------------------
if [ "$DELETE" -eq 1 ] && [ "$(count "$TMP/gone.txt")" -gt 0 ]; then
  echo
  if confirm "delete $(count "$TMP/gone.txt") remote file(s) listed above?"; then
    # NUL-delimited so filenames with spaces survive; paths are forced relative
    # to REMOTE_DIR remotely, so a crafted name can't escape the folder.
    tr '\n' '\0' < "$TMP/gone.txt" \
      | ssh "${SSH_OPTS[@]}" "$HOST" \
          "cd '$REMOTE_DIR' && xargs -0 -r rm -f --"
    echo "  deleted."
  else
    echo "  kept remote-only files."
  fi
fi

echo
echo "  done."
