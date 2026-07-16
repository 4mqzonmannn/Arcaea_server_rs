#!/usr/bin/env bash
#
# disk-guard.sh -- warn (and optionally reclaim) before a full disk corrupts
# the colima VM's Docker filesystem.
#
# Background: Rust image builds write several GB per run. Twice, the host disk
# filling up caused the colima VM's ext4 (/var/lib/docker) to lose its journal
# and go read-only, which took the database with it. This script is the early
# warning + one-command cleanup for that failure mode.
#
# Usage:
#   deploy/scripts/disk-guard.sh            # report only
#   deploy/scripts/disk-guard.sh --reclaim  # also prune images + fstrim the VM
#
# Exit status is non-zero when free space is below the danger threshold, so it
# can gate a build step in CI or a pre-build hook.

set -euo pipefail

# Danger threshold in GiB of free space on the host root filesystem.
HOST_MIN_GIB="${HOST_MIN_GIB:-8}"
RECLAIM=0
[ "${1:-}" = "--reclaim" ] && RECLAIM=1

avail_gib() {
  # Portable-ish: read the "available" column (4th) in 1024-blocks, to GiB.
  df -k "$1" | awk 'NR==2 {printf "%.1f", $4/1024/1024}'
}

host_avail="$(avail_gib /)"
printf 'host /: %s GiB free (danger threshold %s GiB)\n' "$host_avail" "$HOST_MIN_GIB"

vm_ok=1
fs_bad=0
if command -v colima >/dev/null 2>&1 && colima status >/dev/null 2>&1; then
  vm_line="$(colima ssh -- df -h /var/lib/docker 2>/dev/null | awk 'NR==2 {print $4" free ("$5" used)"}' || true)"
  printf 'colima /var/lib/docker: %s\n' "${vm_line:-unknown}"

  # ext4 health of the Docker data disk. A host disk that filled up mid-build
  # has, twice, left vdb1's journal aborted -> "clean with errors" (or worse),
  # which silently breaks every write (meta.db, overlay upper, DB files).
  # tune2fs is read-only and safe to run while mounted.
  fs_state="$(colima ssh -- sudo tune2fs -l /dev/vdb1 2>/dev/null | awk -F: '/Filesystem state/ {gsub(/^[ \t]+/,"",$2); print $2}' || true)"
  fs_errs="$(colima ssh -- sudo tune2fs -l /dev/vdb1 2>/dev/null | awk -F: '/FS Error count/ {gsub(/^[ \t]+/,"",$2); print $2}' || true)"
  printf 'colima vdb1 ext4: state="%s" error_count=%s\n' "${fs_state:-unknown}" "${fs_errs:-0}"
  case "$fs_state" in
    *error*|*ERROR*) fs_bad=1 ;;
  esac
  [ -n "${fs_errs:-}" ] && [ "${fs_errs}" != "0" ] && fs_bad=1
else
  printf 'colima: not running (skipping VM check)\n'
  vm_ok=0
fi

if [ "$fs_bad" -eq 1 ]; then
  cat >&2 <<'RECOVERY'

DANGER: the Docker data disk (vdb1) reports ext4 errors. Writes may be failing
silently. Do NOT keep building. Recover with (data-safe, from the runbook):
  1. verify a host-side DB dump exists:  ls -lt ../backups/arcaea_core-*.sql
  2. docker compose stop && colima stop && colima start
  3. inside VM: systemctl stop docker.socket docker containerd
     umount /var/lib/{docker,containerd,rancher,cni,ramalama} /mnt/lima-colima
     sudo e2fsck -fy /dev/vdb1        # exit 1 = "corrected", is OK
  4. colima restart ; fstrim -av ; then rebuild any image built during the
     out-of-space window (its blobs are corrupt): docker rmi -f <image>.
RECOVERY
  exit 2
fi

below() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a < b) }'; }

if below "$host_avail" "$HOST_MIN_GIB"; then
  echo "WARNING: host free space below ${HOST_MIN_GIB} GiB."
  if [ "$RECLAIM" -eq 1 ]; then
    echo "Reclaiming: docker image prune -f"
    docker image prune -f || true
    if [ "$vm_ok" -eq 1 ]; then
      echo "Reclaiming: fstrim inside colima VM"
      colima ssh -- sudo fstrim -av || true
    fi
    echo "After reclaim: host / has $(avail_gib /) GiB free."
  else
    echo "Re-run with --reclaim to prune images and fstrim the VM."
  fi
  exit 1
fi

echo "OK: sufficient free space."
