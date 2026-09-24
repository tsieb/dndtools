#!/usr/bin/env bash
# RC-DSN-4.1 — run the golden-route visual suite inside the pinned Playwright image, the only
# environment whose rendering the committed baselines describe (docs/development/TESTING.md §8).
#
#   apps/gm-react/tests/visual/run-in-container.sh                               # compare
#   apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=changed    # rewrite changed baselines
#   apps/gm-react/tests/visual/run-in-container.sh --project=visual-phone -g board
#
# Arguments are passed to `playwright test`. The checkout (with its installed node_modules) is
# mounted at the same path, so pnpm's relative links resolve and a linked worktree still derives
# its own dev-server port. CONTAINER_ENGINE picks podman or docker; podman wins when both exist.
set -euo pipefail

# Keep in step with the `visual-regression` job in .github/workflows/ci.yml and with the
# @playwright/test version in apps/gm-react/package.json: the image carries exactly one browser build.
IMAGE='mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48'

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
engine=${CONTAINER_ENGINE:-$(command -v podman || command -v docker || true)}
if [[ -z "$engine" ]]; then
	echo 'run-in-container.sh: neither podman nor docker is installed' >&2
	exit 1
fi
if [[ ! -d "$root/apps/gm-react/node_modules" ]]; then
	echo 'run-in-container.sh: run pnpm install in the checkout first' >&2
	exit 1
fi

# Files the run writes (baselines, test-results, Vite's cache) must stay owned by the caller.
if [[ "$(basename "$engine")" == podman ]]; then
	identity=(--userns=keep-id)
else
	identity=(--user "$(id -u):$(id -g)")
fi

# No network: the dev server and the browser talk over the container's own loopback, and the run
# must not reach anything else. It also keeps the engine from plugging a bridge interface into the
# host. Every interface change makes each Chromium on the host abort its in-flight requests with
# net::ERR_NETWORK_CHANGED, so any e2e run on the machine would lose page boots whenever a visual
# run started (docs/development/TESTING.md §8).
exec "$engine" run --rm --init --ipc=host --network=none "${identity[@]}" \
	--security-opt label=disable \
	-v "$root:$root" -w "$root/apps/gm-react" \
	-e HOME=/tmp -e CI -e DNDTOOLS_VISUAL=1 -e DNDTOOLS_PW_WORKERS \
	"$IMAGE" \
	./node_modules/.bin/playwright test "$@"
