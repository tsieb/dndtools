#!/usr/bin/env bash
# Break apt with a Chrome source, then prove action.yml's own guard step repairs it.
# Real Ubuntu 24.04 apt runs in Docker with no network; the host's apt is never touched.
set -euo pipefail
action_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
guard=$(sed -n 's/^ *run: \(sudo rm .*\)$/\1/p' "$action_dir/action.yml")
if [[ -z "$guard" ]]; then
  echo 'ERROR: action.yml has no guard step' >&2
  exit 1
fi
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/sources.list.d" "$fixture/repo"
touch "$fixture/repo/Packages"
echo 'deb [trusted=yes] file:/fixture/repo ./' > "$fixture/sources.list.d/local.list"
# A deterministic apt failure, regardless of whether Google's mirror is healthy today. The
# filename deliberately has no Chrome hint, and uses Ubuntu 24.04's deb822 format.
for key in first second; do
  cat >> "$fixture/sources.list.d/runner.sources" <<EOF
Types: deb
URIs: https://dl.google.com/linux/chrome/deb/
Suites: stable
Components: main
Signed-By: /missing/$key.gpg

EOF
done
chmod -R a+rwX "$fixture"
# The fixture replaces the image's sources.list.d, so the guard runs against real /etc/apt paths.
docker run --rm --network none -e GUARD="$guard" \
  -v "$fixture/repo:/fixture/repo:ro" -v "$fixture/sources.list.d:/etc/apt/sources.list.d" \
  ubuntu:24.04 bash -euo pipefail -c '
    sudo() { "$@"; } # the image has no sudo, and the container already runs as root
    if apt-get update > /tmp/before.log 2>&1; then
      echo "ERROR: deliberately broken source unexpectedly passed" >&2
      exit 1
    fi
    cat /tmp/before.log
    grep -q "Conflicting values set for option Signed-By" /tmp/before.log
    eval "$GUARD"
    apt-get update
    test -f /etc/apt/sources.list.d/local.list
    test ! -e /etc/apt/sources.list.d/runner.sources
  '
echo 'PASS: real Ubuntu 24.04 apt failed before the action guard and succeeded after it.'
