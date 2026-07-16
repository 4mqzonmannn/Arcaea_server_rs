#!/usr/bin/env bash
#
# build-guarded.sh -- run `docker compose build` with disk-space guardrails.
#
# Why this exists: a `docker compose build` (especially --no-cache) writes
# several GB. Twice, the host disk filling up mid-build aborted the colima VM's
# ext4 journal, silently breaking every write and taking the database down with
# it. This wrapper makes that failure mode structurally hard to hit:
#
#   1. PRE-CHECK: refuse to start if host free space (or ext4 health) is bad
#      -- runs disk-guard.sh first, which exits non-zero on danger.
#   2. LIVE MONITOR: a background watcher samples free space during the build
#      and kills the build the moment it drops below a hard floor, so we stop
#      BEFORE the disk hits zero and corrupts the fs.
#   3. POST-RECLAIM: fstrim the VM so freed blocks return to the host.
#
# Usage (args after `--` are passed straight to `docker compose build`):
#   deploy/scripts/build-guarded.sh -- app
#   deploy/scripts/build-guarded.sh -- --no-cache caddy
#   FLOOR_GIB=3 START_MIN_GIB=6 deploy/scripts/build-guarded.sh -- app
#
# Env knobs:
#   START_MIN_GIB  host free needed to *begin* a build   (default 6)
#   FLOOR_GIB      host free that *aborts* a running build (default 2)
#   SAMPLE_SECS    monitor sampling interval              (default 5)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

START_MIN_GIB="${START_MIN_GIB:-6}"
FLOOR_GIB="${FLOOR_GIB:-2}"
SAMPLE_SECS="${SAMPLE_SECS:-5}"

# Everything after the first literal `--` is the compose build command line.
BUILD_ARGS=()
seen_dd=0
for a in "$@"; do
  if [ "$seen_dd" -eq 0 ] && [ "$a" = "--" ]; then seen_dd=1; continue; fi
  [ "$seen_dd" -eq 1 ] && BUILD_ARGS+=("$a")
done
if [ "${#BUILD_ARGS[@]}" -eq 0 ]; then
  echo "usage: $0 -- [docker compose build args...]" >&2
  exit 64
fi

avail_gib() { df -k "${1:-/}" | awk 'NR==2 {printf "%.1f", $4/1024/1024}'; }
below() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a < b) }'; }

echo "== pre-flight disk check =="
HOST_MIN_GIB="$START_MIN_GIB" "$SCRIPT_DIR/disk-guard.sh" || {
  echo "pre-flight failed: free space or fs health below threshold. Aborting build." >&2
  echo "Try: $SCRIPT_DIR/disk-guard.sh --reclaim   (then retry)" >&2
  exit 1
}

cd "$DEPLOY_DIR"

echo "== starting guarded build: docker compose build ${BUILD_ARGS[*]} =="
echo "   (floor=${FLOOR_GIB}GiB, sampling every ${SAMPLE_SECS}s)"

docker compose build "${BUILD_ARGS[@]}" &
BUILD_PID=$!

# Live monitor: abort the build if host free space crosses the floor.
(
  while kill -0 "$BUILD_PID" 2>/dev/null; do
    free="$(avail_gib /)"
    if below "$free" "$FLOOR_GIB"; then
      echo "" >&2
      echo "!! LOW DISK: host free ${free}GiB < floor ${FLOOR_GIB}GiB -- aborting build to protect the fs" >&2
      # Terminate the whole compose build process group.
      pkill -P "$BUILD_PID" 2>/dev/null || true
      kill "$BUILD_PID" 2>/dev/null || true
      exit 0
    fi
    sleep "$SAMPLE_SECS"
  done
) &
MON_PID=$!

build_rc=0
wait "$BUILD_PID" || build_rc=$?
kill "$MON_PID" 2>/dev/null || true
wait "$MON_PID" 2>/dev/null || true

echo "== post-build reclaim (fstrim) =="
if command -v colima >/dev/null 2>&1 && colima status >/dev/null 2>&1; then
  colima ssh -- sudo fstrim -av 2>/dev/null | awk '/lima-colima/{print "  "$0}' || true
fi
echo "host / now: $(avail_gib /) GiB free"

if [ "$build_rc" -ne 0 ]; then
  echo "BUILD FAILED (rc=$build_rc). If it was disk-aborted, reclaim space and retry." >&2
  echo "NOTE: any image partially built during an abort may have corrupt layers -- rmi -f and rebuild." >&2
  exit "$build_rc"
fi
echo "build OK."
