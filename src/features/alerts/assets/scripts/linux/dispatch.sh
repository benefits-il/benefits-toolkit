#!/bin/sh
# Benefit's Toolkit alert dispatcher (Linux): sound only, no popup and no
# per-project sounds. Run by agent hooks as: sh dispatch.sh <agent> <kind>
# sounds.env (written by the extension) holds ENABLED, DONE and WAITING.
root="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$root/sounds.env" ] || exit 0
. "$root/sounds.env"
[ "$ENABLED" = "1" ] || exit 0
case "$2" in
  waiting) id="$WAITING" ;;
  *) id="$DONE" ;;
esac
f="$root/sounds/$id"
[ -n "$id" ] && [ -f "$f" ] && { paplay "$f" || aplay -q "$f"; } >/dev/null 2>&1
exit 0
