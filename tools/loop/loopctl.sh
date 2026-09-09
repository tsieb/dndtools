#!/usr/bin/env bash
# CENTRAL_DISPATCHER_ENTRYPOINT: this repository's loop is retired.
set -euo pipefail
central="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../agent-dispatcher" && pwd)"
exec python3 -c 'import sys; sys.path.insert(0, sys.argv.pop(1)); from dispatcher.legacy_cli import main; raise SystemExit(main("dndtools"))' "$central" "$@"
