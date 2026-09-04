#!/usr/bin/env bash
# Operator's switchboard for the RC loop. Day to day you use the dashboard; this installs and
# starts the one process that hosts it (dashboard + supervisor + usage poller).
#
#   loopctl.sh install          write the systemd user unit (survives logout via lingering)
#   loopctl.sh start|stop       the supervisor service (stop = slots finish their current run first)
#   loopctl.sh serve            run the supervisor in the foreground instead (Ctrl-C to quit)
#   loopctl.sh status           one-screen summary (same data as the dashboard)
#   loopctl.sh once <slot>      one run of one slot in the foreground, then exit
#   loopctl.sh dry-run          rehearse a run with the fake backend on branch loop/dryrun, no tokens
#   loopctl.sh logs [slot]      follow events, or a slot's summary
#   loopctl.sh kill-all         stop the supervisor and every runner NOW (work is salvaged at next start)
#   loopctl.sh clean-dryrun     delete the dry-run branch/worktree/control dir
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN="$(cd "$HERE/../.." && pwd)"
CTL="${LOOP_CTL:-$HOME/Programming/dndtools-loop}"
UNIT="dndtools-loop"
UNIT_DIR="$HOME/.config/systemd/user"

case "${1:-}" in
  install)
    mkdir -p "$UNIT_DIR" "$CTL"
    cat > "$UNIT_DIR/$UNIT.service" <<UNIT
[Unit]
Description=dndtools RC loop (dashboard + supervisor)
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=$CTL
Environment=LOOP_CTL=$CTL
Environment=PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/systemd-inhibit --what=sleep:idle --who=dndtools-loop --why="dndtools RC loop is working" /usr/bin/python3 $HERE/rcloop.py serve
Restart=on-failure
RestartSec=30
KillMode=control-group
TimeoutStopSec=20

[Install]
WantedBy=default.target
UNIT
    systemctl --user daemon-reload
    loginctl show-user "$USER" 2>/dev/null | grep -q '^Linger=yes' || loginctl enable-linger "$USER"
    echo "installed $UNIT.service — start with: $0 start" ;;
  start)   rm -f "$CTL/STOP" "$CTL"/STOP-* ; systemctl --user enable --now "$UNIT.service" && sleep 1 && systemctl --user is-active "$UNIT.service" && echo "dashboard: http://127.0.0.1:$(python3 "$HERE/rcloop.py" state 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin)["config"]["dashboard_port"])' 2>/dev/null || echo 4991)" ;;
  stop)    touch "$CTL/STOP"; echo "STOP set — slots finish their current run, then the supervisor idles; kill-all for now" ;;
  serve)   exec python3 "$HERE/rcloop.py" serve ;;
  status)  exec python3 "$HERE/rcloop.py" status ;;
  once)    LOOP_ONCE=1 exec "$HERE/run-loop.sh" "${2:?slot}" ;;
  dry-run)
    export LOOP_CTL="$CTL-dryrun"
    mkdir -p "$LOOP_CTL"
    python3 - "$LOOP_CTL" <<'PY'
import json,sys,pathlib
p=pathlib.Path(sys.argv[1])/"config.json"
cfg={"branch":"loop/dryrun","promote_to":"loop/dryrun-main","promote_interval_s":99999999,"promote_gate":"none",
     "slots":[{"backend":"fake","enabled":True,"model":"auto","effort":"auto","sizes":["S","M","L"],"lanes":[]}],
     "usage":{"session_max_pct":101,"weekly_max_pct":101,"session_soft_pct":101,"weekly_soft_pct":101,"pace":False}}
p.write_text(json.dumps(cfg,indent=1))
PY
    git -C "$MAIN" fetch origin -q
    git -C "$MAIN" rev-parse -q --verify origin/loop/dryrun-main >/dev/null 2>&1 || git -C "$MAIN" push origin origin/main:refs/heads/loop/dryrun-main -q
    echo "dry run in $LOOP_CTL on branch loop/dryrun (fake backend, real wrapper)"
    LOOP_ONCE=1 exec "$HERE/run-loop.sh" 1 ;;
  clean-dryrun)
    git -C "$MAIN" worktree remove --force "$CTL-dryrun/wt-1" 2>/dev/null; git -C "$MAIN" worktree prune
    git -C "$MAIN" push origin --delete loop/dryrun loop/dryrun-main 2>/dev/null; rm -rf "$CTL-dryrun"; echo cleaned ;;
  logs)    if [ -n "${2:-}" ]; then exec tail -n 40 -f "$CTL/summary-$2.log"; else exec tail -n 40 -f "$CTL/events.log"; fi ;;
  kill-all)
    touch "$CTL/STOP"; systemctl --user stop "$UNIT.service" 2>/dev/null
    for f in "$CTL"/state/slot-*/runner.json; do [ -f "$f" ] || continue; pid="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["pid"])' "$f")"; kill -- -"$(ps -o pgid= "$pid" 2>/dev/null | tr -d ' ')" 2>/dev/null; done
    echo "killed; remove $CTL/STOP (or press Start on the dashboard) before starting again" ;;
  *) sed -n 2,14p "$0"; exit 2 ;;
esac
