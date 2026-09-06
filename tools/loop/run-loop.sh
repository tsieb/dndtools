#!/usr/bin/env bash
# One runner per slot: tools/loop/run-loop.sh <slot-number>
#
# Each RUN: ask rcloop.py for a story (it holds the claim, checks the plan allowances and routes the
# model), reset this slot's worktree to the integration branch, brief a fresh headless session, let
# it work and commit, then — in the wrapper, because self-reports are not evidence — re-run the gates
# that the changed paths call for, rebase onto the integration branch, push, release the claim with
# the token accounting. A run interrupted by a usage limit or the attempt cap is RESUMED in the same
# session with the worktree intact. Periodically the integration branch is fast-forwarded to main.
# Branch operations are this script's job; the agent only edits and commits. tools/loop/README.md.
set -uo pipefail

SLOT="${1:?usage: run-loop.sh <slot>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN="$(cd "$HERE/../.." && pwd)"
CTL="${LOOP_CTL:-$HOME/Programming/dndtools-loop}"
RCL="$HERE/rcloop.py"
export LOOP_CTL="$CTL" LOOP_SLOT="$SLOT"
export PATH="$HOME/.local/bin:$PATH"
# node/pnpm live under fnm, which systemd's PATH does not know; the default alias is stable.
if ! command -v pnpm >/dev/null 2>&1; then
  for d in "$HOME/.local/share/fnm/aliases/default/bin" "$HOME/.local/share/fnm/node-versions"/*/installation/bin; do
    [ -x "$d/pnpm" ] && { export PATH="$d:$PATH"; break; }
  done
fi
command -v pnpm >/dev/null 2>&1 || { echo "pnpm not found on PATH" >&2; exit 2; }
export GIT_EDITOR=true GIT_SEQUENCE_EDITOR=true GIT_MERGE_AUTOEDIT=no CI=""

WT="$CTL/wt-$SLOT"
SD="$CTL/state/slot-$SLOT"
LOGS="$CTL/logs/slot-$SLOT"
SALVAGE="$CTL/salvage"
SUMMARY="$CTL/summary-$SLOT.log"
EVENTS="$CTL/events.log"
STOPFILE="$CTL/STOP"; STOPSLOT="$CTL/STOP-$SLOT"; PAUSEFILE="$CTL/PAUSE"
mkdir -p "$SD" "$LOGS" "$SALVAGE" "$CTL/state"

log() { local line="[$(date '+%Y-%m-%d %H:%M:%S')] [slot-$SLOT] $*"; echo "$line" >> "$SUMMARY"; [ -t 1 ] && echo "$line"; return 0; }
event() { log "$*"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] [slot-$SLOT] $*" >> "$EVENTS"; }
stopping() { [ -f "$STOPFILE" ] || [ -f "$STOPSLOT" ]; }
hb() { python3 - "$SD/heartbeat.json" "$1" "${2:-}" "${3:-}" "${4:-}" <<'PY'
import json,sys,time
p,state,item,log,extra=sys.argv[1:6]
d={"state":state,"item":item,"log":log,"extra":extra,"at":time.time()}
try:
    old=json.load(open(p))
    d["since"]=old["since"] if old.get("state")==state and old.get("item")==item else time.time()
except Exception: d["since"]=time.time()
json.dump(d,open(p,"w"))
PY
}
jget() { python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));v=d.get(sys.argv[2],"");print(json.dumps(v) if isinstance(v,(list,dict)) else v)' "$1" "$2"; }

# Slot configuration is re-read at every run so dashboard edits apply at the next run.
load_slot_env() { eval "$("$RCL" slot-env --slot "$SLOT")"; }
load_slot_env
BRANCH="$LOOP_BRANCH"; PROMOTE_TO="$LOOP_PROMOTE_TO"
BACKEND_SH="$HERE/lib/backend-$LOOP_BACKEND.sh"
LIMIT_BACKOFF=1800; MAX_WAIT=$((3 * 86400)); VERIFY_TIMEOUT=$((50 * 60))

# Everything this runner spawns — the agent, the commands it runs, the gates — at low priority, so
# five slots verifying at once never starve the owner's interactive session.
renice -n "${LOOP_NICE:-10}" -p $$ >/dev/null 2>&1 || true
command -v ionice >/dev/null 2>&1 && ionice -c2 -n7 -p $$ >/dev/null 2>&1 || true

# Cross-slot semaphore for the heavy verifications (unit suites, Playwright, build): at most
# LOOP_HEAVY_JOBS of them run at the same time across ALL slots. flock on numbered lock files —
# a lock dies with its holder, so a killed slot never wedges the others.
HEAVY_FD=""
heavy_acquire() {
  local n="${LOOP_HEAVY_JOBS:-2}" i fd waited=0
  [ -n "$HEAVY_FD" ] && return 0
  while true; do
    for ((i = 1; i <= n; i++)); do
      exec {fd}>"$CTL/state/heavy-$i.lock"
      if flock -n "$fd"; then HEAVY_FD="$fd"; [ "$waited" -gt 0 ] && log "  verification slot $i free after ${waited}s"; return 0; fi
      exec {fd}>&-
    done
    [ "$waited" = 0 ] && log "  all $n verification slots busy — queued"
    hb queued "${ITEM_ID:-}" "" "waiting for one of $n verification slots (${waited}s)"
    sleep 20; waited=$(( waited + 20 ))
  done
}
heavy_release() { [ -n "$HEAVY_FD" ] || return 0; flock -u "$HEAVY_FD"; exec {HEAVY_FD}>&-; HEAVY_FD=""; }

# ------------------------------------------------------------------------------------ guards
if [ -f "$SD/runner.json" ] && kill -0 "$(jget "$SD/runner.json" pid)" 2>/dev/null; then
  echo "slot $SLOT is already running (pid $(jget "$SD/runner.json" pid))" >&2; exit 1
fi
echo "{\"pid\": $$, \"started\": $(date +%s)}" > "$SD/runner.json"
trap 'rm -f "$SD/runner.json"; hb down' EXIT
hb starting

# ------------------------------------------------------------------------------------ helpers
sleep_until() { local t="$1"; while [ "$(date +%s)" -lt "$t" ]; do stopping && return 1; sleep 30; done; return 0; }

# Never destroy work: a dirty tree goes to a salvage branch + patch; an unpushed commit to a branch.
preserve_wip() {
  local why="$1" stamp branch head remote
  git -C "$WT" rev-parse --git-dir >/dev/null 2>&1 || return 0
  stamp="$(date '+%Y%m%d-%H%M%S')"
  if [ -n "$(git -C "$WT" status --porcelain)" ]; then
    branch="salvage/slot$SLOT-wip-$stamp"
    git -C "$WT" diff > "$SALVAGE/slot$SLOT-wip-$stamp.patch" 2>/dev/null
    git -C "$WT" add -A >/dev/null 2>&1
    if git -C "$WT" commit -q -m "wip(salvage): slot $SLOT work parked before reset ($why)" >/dev/null 2>&1; then
      git -C "$WT" branch -f "$branch" HEAD >/dev/null 2>&1; log "    preserved uncommitted work on $branch"
    fi
  fi
  head="$(git -C "$WT" rev-parse HEAD 2>/dev/null)"; remote="$(git -C "$WT" rev-parse -q --verify "origin/$BRANCH" 2>/dev/null)"
  if [ -n "$head" ] && [ -n "$remote" ] && ! git -C "$WT" merge-base --is-ancestor "$head" "$remote" 2>/dev/null; then
    git -C "$WT" branch -f "salvage/slot$SLOT-orphan-$stamp" "$head" >/dev/null 2>&1
    log "    parked unpushed HEAD ${head:0:7} on salvage/slot$SLOT-orphan-$stamp"
  fi
}

ensure_worktree() {
  if [ -d "$WT/.git" ] || [ -f "$WT/.git" ]; then return 0; fi
  git -C "$MAIN" worktree prune >/dev/null 2>&1; git -C "$MAIN" fetch origin -q
  log "creating worktree $WT"
  git -C "$MAIN" worktree add --detach "$WT" "origin/$PROMOTE_TO" >/dev/null 2>&1 || { log "FATAL: could not create the worktree"; return 1; }
}

# The integration branch: created from main, and seeded with the roadmap + this tooling when main
# does not carry them yet (the roadmap can be uncommitted in the owner's checkout).
ensure_branch() {
  git -C "$WT" fetch origin -q
  if ! git -C "$WT" rev-parse -q --verify "origin/$BRANCH" >/dev/null 2>&1; then
    log "integration branch origin/$BRANCH does not exist — creating it from origin/$PROMOTE_TO"
    git -C "$WT" push origin "origin/$PROMOTE_TO:refs/heads/$BRANCH" >/dev/null 2>&1 || { log "FATAL: could not create $BRANCH"; return 1; }
    git -C "$WT" fetch origin -q
  fi
  if ! git -C "$WT" cat-file -e "origin/$BRANCH:docs/planning/RC_ROADMAP.md" 2>/dev/null; then
    [ -f "$MAIN/docs/planning/RC_ROADMAP.md" ] || { log "FATAL: no roadmap on origin/$BRANCH nor in $MAIN"; return 1; }
    log "seeding origin/$BRANCH with the roadmap and the loop tooling from the owner's checkout"
    git -C "$WT" reset -q --hard "origin/$BRANCH"
    mkdir -p "$WT/docs/planning" "$WT/tools"
    cp "$MAIN/docs/planning/RC_ROADMAP.md" "$WT/docs/planning/"
    for f in README.md ROADMAP.md; do [ -f "$MAIN/docs/planning/$f" ] && cp "$MAIN/docs/planning/$f" "$WT/docs/planning/"; done
    rm -rf "$WT/tools/loop"; cp -r "$HERE" "$WT/tools/loop"; rm -rf "$WT/tools/loop/__pycache__"
    git -C "$WT" add docs/planning tools/loop
    git -C "$WT" commit -q -m "chore(loop): seed the RC roadmap and the autonomous loop tooling" -m "Committed by the loop wrapper so every slot reads one roadmap." \
      && git -C "$WT" push origin "HEAD:refs/heads/$BRANCH" >/dev/null 2>&1 || {
        git -C "$WT" fetch origin -q
        git -C "$WT" cat-file -e "origin/$BRANCH:docs/planning/RC_ROADMAP.md" 2>/dev/null && { log "another slot seeded first — using its commit"; git -C "$WT" reset -q --hard "origin/$BRANCH"; return 0; }
        log "FATAL: seeding failed"; return 1; }
    git -C "$WT" fetch origin -q
  fi
}

# node_modules per worktree; reinstall only when the lockfile changed.
ensure_install() {
  local h; h="$(sha1sum "$WT/pnpm-lock.yaml" | cut -c1-16)"
  [ -d "$WT/node_modules" ] && [ "$(cat "$WT/.loop-lock-hash" 2>/dev/null)" = "$h" ] && return 0
  log "  installing dependencies (lockfile $h)"
  ( cd "$WT" && timeout 1200 pnpm install --frozen-lockfile --prefer-offline ) >"$LOGS/install.log" 2>&1 || { log "  pnpm install failed — see $LOGS/install.log"; return 1; }
  echo "$h" > "$WT/.loop-lock-hash"
}

session_id_from_log() { # codex writes its own thread id
  local tid; tid="$(grep -m1 -oE '"thread_id":"[0-9a-f-]+"' "$1" | cut -d'"' -f4)"; echo "${tid:-$2}"
}

# Run the agent. $1 = new|resume, $2 = prompt/nudge file. Sets RC, RESULT (json).
# Returns 0 finished, 1 gave up, 2 stopping, 3 handed back (limit with nothing committed).
agent_session() {
  local kind="$1" file="$2" timeout_resumes=0 t0 el limit reset
  [ "$kind" = new ] && SID="$("$BACKEND_SH" new-sid)"
  while true; do
    ATTEMPTS=$(( ATTEMPTS + 1 )); ALOG="$LOGS/run-$RUNTAG-a$ATTEMPTS.log"; t0=$(date +%s)
    hb working "$ITEM_ID" "$ALOG" "attempt $ATTEMPTS ($kind)"
    log "  attempt #$ATTEMPTS ($kind${SID:+ $SID}) → $ALOG"
    if [ "$kind" = new ]; then
      ( cd "$WT" && LOOP_JOURNAL="$JOURNAL" timeout -k 60 "$ATTEMPT_TIMEOUT" "$BACKEND_SH" start "$SID" "$file" ) >"$ALOG" 2>&1; RC=$?
    else
      ( cd "$WT" && LOOP_JOURNAL="$JOURNAL" timeout -k 60 "$ATTEMPT_TIMEOUT" "$BACKEND_SH" resume "$SID" "$file" ) >"$ALOG" 2>&1; RC=$?
    fi
    [ "$LOOP_BACKEND" = codex ] && SID="$(session_id_from_log "$ALOG" "$SID")"
    el=$(( $(date +%s) - t0 ))
    RESULT="$("$RCL" result --log "$ALOG" --backend "$LOOP_BACKEND")"
    accumulate_tokens "$RESULT"
    limit="$(printf '%s' "$RESULT" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(1 if d.get("limit") else 0)')"
    if [ "$limit" = 1 ]; then
      LIMIT_WAITS=$(( LIMIT_WAITS + 1 ))
      reset="$(printf '%s' "$RESULT" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(int(d.get("reset_at") or 0))')"
      [ "$reset" -le "$(date +%s)" ] && reset=$(( $(date +%s) + LIMIT_BACKOFF ))
      [ $(( reset - $(date +%s) )) -gt "$MAX_WAIT" ] && reset=$(( $(date +%s) + MAX_WAIT ))
      LIMIT_TARGET="$reset"
      log "  attempt #$ATTEMPTS BLOCKED by a usage limit after ${el}s — resumes $(date -d "@$reset" '+%m-%d %H:%M')"
      # nothing committed and a long wait: hand the story back so another slot/backend can take it
      if [ "$(git -C "$WT" rev-parse HEAD)" = "$BEFORE" ] && [ $(( reset - $(date +%s) )) -gt 900 ]; then return 3; fi
      hb waiting "$ITEM_ID" "$ALOG" "usage limit until $(date -d "@$reset" '+%H:%M')"
      sleep_until $(( reset + 90 )) || return 2
      if [ "$kind" = new ] && [ "$el" -lt 120 ]; then SID="$("$BACKEND_SH" new-sid)"; else kind=resume; file="$NUDGE_RESUME"; fi
      continue
    fi
    if [ "$RC" -eq 124 ] || [ "$RC" -eq 137 ]; then
      timeout_resumes=$(( timeout_resumes + 1 ))
      log "  attempt #$ATTEMPTS hit the ${ATTEMPT_TIMEOUT}s cap [$timeout_resumes/$LOOP_MAX_TIMEOUT_RESUMES]"
      if [ "$timeout_resumes" -le "$LOOP_MAX_TIMEOUT_RESUMES" ]; then kind=resume; file="$NUDGE_RESUME"; sleep 10; continue; fi
      return 1
    fi
    [ "$el" -lt 90 ] && [ "$RC" -ne 0 ] && log "  attempt #$ATTEMPTS exited fast (rc=$RC, ${el}s): $(tail -c 300 "$ALOG" | tr '\n' ' ')"
    return 0
  done
}

accumulate_tokens() {
  TOK_JSON="$(python3 - "$TOK_JSON" "$1" <<'PY'
import json,sys
a=json.loads(sys.argv[1]); r=json.loads(sys.argv[2])
for k in ("tokens_in","tokens_out","cache_read","cache_create","turns","duration_ms"): a[k]=a.get(k,0)+int(r.get(k) or 0)
a["cost_usd"]=round(a.get("cost_usd",0)+float(r.get("cost_usd") or 0),4)
m=a.setdefault("models",{})
for name,mu in (r.get("models") or {}).items():
    x=m.setdefault(name,{"in":0,"out":0,"cache_read":0,"cache_create":0,"cost_usd":0})
    for k in x: x[k]=x[k]+(mu.get(k) or 0)
a["tokens_total"]=a["tokens_in"]+a["tokens_out"]+a["cache_read"]+a["cache_create"]
print(json.dumps(a))
PY
)"
}

changed_files() { git -C "$WT" diff --name-only "$1" HEAD 2>/dev/null; }

# Gates by what changed — every one is the wrapper's, none costs model tokens. The heavy ones
# (everything after prettier) run under the cross-slot semaphore with explicit worker caps.
verify_tree() { heavy_acquire; verify_tree_gates "$@"; local r=$?; heavy_release; return $r; }
verify_tree_gates() {
  local base="$1" ok=1 files code=0 core=0 app=0 cloud=0 tooling=0 docsreq=0 specs=() sp
  VLOG="$LOGS/run-$RUNTAG-verify$2.log"; : > "$VLOG"
  files="$(changed_files "$base")"
  [ -z "$files" ] && return 0
  echo "$files" | grep -vE '^(docs/|tools/loop/)' | grep -qE '\.(tsx?|m?js|cjs|json|css)$' && code=1
  echo "$files" | grep -q '^packages/core/' && core=1
  echo "$files" | grep -q '^apps/gm-react/' && app=1
  echo "$files" | grep -q '^packages/cloud-fns/' && cloud=1
  echo "$files" | grep -qE '^(scripts/|tests/)' && tooling=1
  echo "$files" | grep -qE '^docs/requirements/' && docsreq=1
  echo "$files" | grep -qE '^tools/loop/' && [ "$ITEM_ID" != "LOOP" ] && { echo "the agent edited tools/loop/ — refused" >>"$VLOG"; return 1; }
  run() { local name="$1"; shift; echo "=== $name: $*" >>"$VLOG"; hb verifying "$ITEM_ID" "$VLOG" "$name"
          if ( cd "$WT" && timeout "$VERIFY_TIMEOUT" "$@" ) >>"$VLOG" 2>&1; then echo "=== $name OK" >>"$VLOG"; else echo "=== $name FAILED" >>"$VLOG"; return 1; fi; }
  # formatting: prettier on the touched files, committed as its own commit when it changed anything
  mapfile -t RANGE_FILES < <(echo "$files" | while read -r f; do [ -f "$WT/$f" ] && echo "$f"; done)
  if [ "${#RANGE_FILES[@]}" -gt 0 ]; then
    ( cd "$WT" && timeout 600 pnpm exec prettier --write --ignore-unknown -- "${RANGE_FILES[@]}" ) >>"$VLOG" 2>&1 || true
    if [ -n "$(git -C "$WT" status --porcelain)" ]; then
      git -C "$WT" add -A && git -C "$WT" commit -q -m "style: $ITEM_ID prettier on the touched files (loop wrapper)" && echo "=== prettier: committed a formatting fix" >>"$VLOG"
    fi
  fi
  if [ $code = 1 ]; then run typecheck pnpm typecheck || ok=0; fi
  if [ $ok = 1 ] && [ $code = 1 ]; then run lint pnpm lint || ok=0; fi
  local vw="--maxWorkers=${DNDTOOLS_TEST_WORKERS:-3}" pw="--workers=${DNDTOOLS_PW_WORKERS:-2}"
  if [ $ok = 1 ] && [ $core = 1 ]; then run test:critical pnpm test:critical "$vw" || ok=0; fi
  if [ $ok = 1 ] && [ $app = 1 ]; then run test:app pnpm test:app "$vw" || ok=0; fi
  if [ $ok = 1 ] && [ $cloud = 1 ]; then run test:cloud pnpm test:cloud "$vw" || ok=0; fi
  if [ $ok = 1 ] && [ $tooling = 1 ]; then run test:tooling pnpm test:tooling "$vw" || ok=0; fi
  if [ $ok = 1 ] && [ $app = 1 ] && [ "$LOOP_E2E_NAMED" = 1 ]; then
    for sp in $ITEM_SPECS; do [ -f "$WT/apps/gm-react/tests/e2e/$sp" ] && specs+=("tests/e2e/$sp"); done
    if [ "${#specs[@]}" -gt 0 ]; then
      run e2e pnpm --filter @dndtools/gm-react exec playwright test "${specs[@]}" --project=desktop-chromium --project=mobile-chromium "$pw" || ok=0
    fi
  fi
  if [ $ok = 1 ] && { [ $app = 1 ] || [ $core = 1 ]; } && [[ ",$LOOP_BUILD_FOR," == *",$ITEM_SIZE,"* ]]; then run build pnpm build || ok=0; fi
  if [ $ok = 1 ] && [ "$LOOP_FEATURE_AUDIT" = 1 ] && { [ $app = 1 ] || [ $docsreq = 1 ]; }; then run feature-audit pnpm feature-audit || ok=0; fi
  [ $ok = 1 ]
}

write_nudge() { NUDGE_FILE="$SD/run-$RUNTAG-nudge-$1.md"
  sed -e "s|{{JOURNAL}}|$JOURNAL|g" -e "s|{{BRANCH}}|$BRANCH|g" -e "s|{{ITEM_ID}}|$ITEM_ID|g" "$HERE/prompts/nudge-$1.md" > "$NUDGE_FILE"
  if [ -n "${2:-}" ] && [ -f "$2" ]; then { echo; echo '```'; grep -B2 -A60 "FAILED\|error\|Error\|✘\|failed" "$2" | tail -n 120 | cut -c1-300; echo '```'; } >> "$NUDGE_FILE"; fi; }

integrate() {  # put HEAD on top of origin/$BRANCH; REBASED=1 when history moved
  local remote round=0 r
  git -C "$WT" fetch origin -q
  remote="$(git -C "$WT" rev-parse -q --verify "origin/$BRANCH")" || return 0
  git -C "$WT" merge-base --is-ancestor "$remote" HEAD && return 0
  while true; do
    if git -C "$WT" rebase "$remote" >"$LOGS/run-$RUNTAG-rebase$round.log" 2>&1; then REBASED=1; return 0; fi
    round=$(( round + 1 )); [ "$round" -gt 2 ] && { git -C "$WT" rebase --abort 2>/dev/null; return 1; }
    log "  rebase onto origin/$BRANCH conflicted — waking the agent (round $round)"
    write_nudge rebase "$LOGS/run-$RUNTAG-rebase$(( round - 1 )).log"
    agent_session resume "$NUDGE_FILE"; r=$?
    if [ "$r" -ne 0 ] || [ -d "$(git -C "$WT" rev-parse --git-path rebase-merge)" ] || [ -d "$(git -C "$WT" rev-parse --git-path rebase-apply)" ]; then
      git -C "$WT" rebase --abort 2>/dev/null; return 1; fi
    REBASED=1; git -C "$WT" merge-base --is-ancestor "$remote" HEAD && return 0
  done
}

# Fast-forward main to the integration branch, guarded by the promotion gate (build or full e2e).
maybe_promote() {
  local last=0 old new n plog force=0
  [ -f "$CTL/state/promote-now" ] && force=1
  [ -f "$CTL/state/promote.json" ] && last="$(jget "$CTL/state/promote.json" at | cut -d. -f1)"
  [ $force = 0 ] && [ $(( $(date +%s) - ${last:-0} )) -lt "$LOOP_PROMOTE_INTERVAL" ] && return 0
  exec 9>"$CTL/state/promote.lock"; flock -n 9 || return 0
  rm -f "$CTL/state/promote-now"
  git -C "$WT" fetch origin -q
  old="$(git -C "$WT" rev-parse "origin/$PROMOTE_TO")"; new="$(git -C "$WT" rev-parse "origin/$BRANCH")"
  [ "$old" = "$new" ] && { echo "{\"at\": $(date +%s), \"result\": \"nothing to promote\"}" > "$CTL/state/promote.json"; return 0; }
  if ! git -C "$WT" merge-base --is-ancestor "$old" "$new"; then
    event "promotion skipped: origin/$PROMOTE_TO has commits not on $BRANCH — merge by hand"; echo "{\"at\": $(date +%s), \"result\": \"blocked: main diverged\"}" > "$CTL/state/promote.json"; return 0; fi
  hb promoting "" "" "gate=$LOOP_PROMOTE_GATE"
  # roadmap status sync rides along with the promotion
  git -C "$WT" reset -q --hard "$new"
  if "$RCL" roadmap-sync --file "$WT/docs/planning/RC_ROADMAP.md"; then
    git -C "$WT" add docs/planning/RC_ROADMAP.md && git -C "$WT" commit -q -m "docs(roadmap): sync the §23 status column (loop)" && \
      git -C "$WT" push origin "HEAD:refs/heads/$BRANCH" >/dev/null 2>&1 && new="$(git -C "$WT" rev-parse HEAD)"
  fi
  plog="$LOGS/promote-$(date +%Y%m%d-%H%M%S).log"; : > "$plog"
  # The full suite is the heaviest thing the loop runs: it takes a verification slot like any gate
  # and its own (larger) Playwright worker budget.
  promote_gate() {
    case "$LOOP_PROMOTE_GATE" in
      e2e)   ( cd "$WT" && export DNDTOOLS_PW_WORKERS="${LOOP_PROMOTE_PW_WORKERS:-4}" && timeout 3600 pnpm typecheck && timeout 3600 pnpm build && timeout 5400 pnpm e2e --workers="$DNDTOOLS_PW_WORKERS" ) >>"$plog" 2>&1 ;;
      build) ( cd "$WT" && timeout 3600 pnpm typecheck && timeout 3600 pnpm build ) >>"$plog" 2>&1 ;;
      *)     true ;;
    esac
  }
  heavy_acquire; promote_gate; gate_rc=$?; heavy_release
  if [ "$gate_rc" != 0 ]; then
    event "❌ promotion gate ($LOOP_PROMOTE_GATE) FAILED on $BRANCH — see $plog"
    echo "{\"at\": $(date +%s), \"result\": \"gate failed\", \"log\": \"$plog\"}" > "$CTL/state/promote.json"; flock -u 9; return 0
  fi
  if git -C "$WT" push origin "$new:refs/heads/$PROMOTE_TO" >>"$plog" 2>&1; then
    n="$(git -C "$WT" rev-list --count "$old..$new")"
    event "✅ promoted $BRANCH → $PROMOTE_TO: $n commit(s), ${new:0:7} (CI runs now)"
    echo "{\"at\": $(date +%s), \"result\": \"promoted $n commits (${new:0:7})\"}" > "$CTL/state/promote.json"
  else
    event "❌ promotion push to $PROMOTE_TO failed — see $plog"; echo "{\"at\": $(date +%s), \"result\": \"push failed\"}" > "$CTL/state/promote.json"
  fi
  flock -u 9
}

# ------------------------------------------------------------------------------------ main
ensure_worktree || exit 2
ensure_branch || exit 2
[ -f "$CTL/state/promote.json" ] || echo "{\"at\": $(date +%s), \"result\": \"clock started\"}" > "$CTL/state/promote.json"
event "=== slot $SLOT start === backend=$LOOP_BACKEND branch=$BRANCH → $PROMOTE_TO every ${LOOP_PROMOTE_INTERVAL}s"
run="$(cat "$SD/run-counter" 2>/dev/null || echo 0)"
consec_fail=0

while true; do
  if stopping; then event "STOP present — slot $SLOT exiting"; break; fi
  load_slot_env; BRANCH="$LOOP_BRANCH"; PROMOTE_TO="$LOOP_PROMOTE_TO"; BACKEND_SH="$HERE/lib/backend-$LOOP_BACKEND.sh"
  if [ -f "$PAUSEFILE" ]; then hb paused; sleep_until $(( $(date +%s) + 120 )) || continue; continue; fi

  preserve_wip "start of a run"
  git -C "$WT" fetch origin -q
  git -C "$WT" reset -q --hard "origin/$BRANCH"; git -C "$WT" clean -fdq -e node_modules -e .loop-lock-hash
  BEFORE="$(git -C "$WT" rev-parse HEAD)"

  run=$(( run + 1 )); echo "$run" > "$SD/run-counter"; RUNTAG="$(printf '%03d' "$run")"
  ITEM_FILE="$SD/run-$RUNTAG.item.json"; JOURNAL="$SD/run-$RUNTAG.journal.md"; PROMPT_FILE="$SD/run-$RUNTAG.prompt.md"
  hb claiming
  if ! "$RCL" claim --slot "$SLOT" --run "$RUNTAG" --repo "$WT" > "$ITEM_FILE" 2>"$SD/claim.err"; then
    rm -f "$ITEM_FILE"; run=$(( run - 1 )); echo "$run" > "$SD/run-counter"
    # A promotion due while the loop is idle (nothing claimable, or waiting out a usage limit)
    # would otherwise never fire — maybe_promote only ran as a side effect of a finished run.
    maybe_promote
    reason="$(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(d.get("reason",""))' "$SD/idle.json" 2>/dev/null)"
    wait_until="$(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(int(d.get("wait_until") or 0))' "$SD/idle.json" 2>/dev/null || echo 0)"
    hb idle "" "" "$reason"
    log "idle: ${reason:-nothing claimable} — waiting"
    if [ "${wait_until:-0}" -gt "$(date +%s)" ]; then sleep_until $(( wait_until + 60 )) || continue; else sleep_until $(( $(date +%s) + LOOP_IDLE_WAIT )) || continue; fi
    continue
  fi
  ITEM_ID="$(jget "$ITEM_FILE" id)"; ITEM_IDS="$(python3 -c 'import json,sys;print("+".join(json.load(open(sys.argv[1]))["ids"]))' "$ITEM_FILE")"
  ITEM_TITLE="$(jget "$ITEM_FILE" title)"; ITEM_SIZE="$(jget "$ITEM_FILE" size)"; ITEM_LANE="$(jget "$ITEM_FILE" lane)"
  ITEM_SPECS="$(python3 -c 'import json,sys;print(" ".join(json.load(open(sys.argv[1]))["specs"]))' "$ITEM_FILE")"
  export LOOP_MODEL="$(jget "$ITEM_FILE" model)" LOOP_EFFORT="$(jget "$ITEM_FILE" effort)" LOOP_ITEM_ID="$ITEM_ID"
  ATTEMPT_TIMEOUT="$(jget "$ITEM_FILE" attempt_timeout_s)"; MAX_FIX_ROUNDS="$(jget "$ITEM_FILE" max_fix_rounds)"
  event "--- run #$run: $ITEM_IDS ($ITEM_SIZE, $LOOP_MODEL/$LOOP_EFFORT) — $ITEM_TITLE (from ${BEFORE:0:7}) ---"
  hb preparing "$ITEM_ID"
  if ! ensure_install; then "$RCL" release --id "$ITEM_IDS" --outcome deferred >/dev/null; sleep_until $(( $(date +%s) + 600 )) || continue; continue; fi

  cat > "$JOURNAL" <<EOJ
# Run journal — slot $SLOT run #$run — $ITEM_IDS
Started $(date '+%Y-%m-%d %H:%M:%S') from ${BEFORE:0:7} on origin/$BRANCH. This file is your durable memory: it is
re-injected after every context compaction and every resume. Keep it current. file:line only.

## Plan
## Ledger
## Edits made
## Tests
## Gates run
## Decisions
## Report
EOJ
  "$RCL" render --item "$ITEM_FILE" --out "$PROMPT_FILE" --journal "$JOURNAL" --worktree "$WT" --slot "$SLOT" || { log "render failed"; "$RCL" release --id "$ITEM_IDS" --outcome deferred >/dev/null; sleep 60; continue; }
  write_nudge resume; NUDGE_RESUME="$NUDGE_FILE"

  metrics_json() { python3 - "$TOK_JSON" "$1" "$ITEM_SIZE" "$ITEM_LANE" "$LOOP_MODEL" "$LOOP_EFFORT" "$SLOT" "$run" "$ATTEMPTS" "$(( $(date +%s) - START_TS ))" "$LIMIT_WAITS" "${FIX_ROUNDS:-0}" "$(git -C "$WT" rev-parse --short HEAD)" "$LOOP_BACKEND" "${PARTIAL:-}" <<'PY'
import json,sys
a=json.loads(sys.argv[1]); _,outcome,size,lane,model,effort,slot,run,attempts,secs,limits,fix,commit,backend,partial=sys.argv[1:16]
a.update(outcome=outcome,size=size,lane=lane,model=model,effort=effort,slot=int(slot),run=int(run),attempts=int(attempts),seconds=int(secs),limit_waits=int(limits),fix_rounds=int(fix),commit=commit,backend=backend)
if partial: a["note"]=partial
print(json.dumps(a))
PY
  }
  ELAPSED=0; PARTIAL=""; FIX_ROUNDS=0
  ATTEMPTS=0; LIMIT_WAITS=0; START_TS=$(date +%s); REBASED=0; SID=""; TOK_JSON='{}'; LIMIT_TARGET=0
  agent_session new "$PROMPT_FILE"; AR=$?
  if [ "$AR" -eq 2 ]; then preserve_wip "stopping mid-run"; "$RCL" release --id "$ITEM_IDS" --outcome deferred >/dev/null; continue; fi
  if [ "$AR" -eq 3 ]; then
    preserve_wip "usage limit — handed back"
    "$RCL" release --id "$ITEM_IDS" --outcome deferred --metrics "$(metrics_json handed-back)" >/dev/null
    event "⏸ run #$run: $ITEM_IDS handed back — slot $SLOT is out of budget until $(date -d "@$LIMIT_TARGET" '+%m-%d %H:%M')"
    hb waiting "" "" "usage limit until $(date -d "@$LIMIT_TARGET" '+%H:%M')"
    sleep_until $(( LIMIT_TARGET + 90 )) || continue; continue
  fi

  # the agent's own verdicts
  while IFS= read -r line; do sid="${line#SKIP }"; sid="${sid%%:*}"; reason="${line#*: }"
    "$RCL" skip --id "$sid" --reason "agent: ${reason:0:160}" >/dev/null; event "story $sid retired by the agent: ${reason:0:200}"
  done < <(grep -E '^SKIP RC-[A-Z]+-[0-9.]+: ' "$JOURNAL" 2>/dev/null)
  PARTIAL="$(grep -m1 -E '^PARTIAL RC-' "$JOURNAL" 2>/dev/null | cut -c1-300)"
  grep -E '^HANDOFF ' "$JOURNAL" 2>/dev/null | while IFS= read -r line; do event "handoff: ${line:0:240}"; done

  ELAPSED=$(( $(date +%s) - START_TS )); AFTER="$(git -C "$WT" rev-parse HEAD)"
  if [ "$BEFORE" = "$AFTER" ]; then
    outcome=nocommit; grep -qE '^SKIP RC-' "$JOURNAL" 2>/dev/null && outcome=failed
    consec_fail=$(( consec_fail + 1 )); [ "$outcome" = failed ] && consec_fail=0
    log "run #$run: NO COMMIT (rc=$RC, ${ELAPSED}s, $ATTEMPTS attempt(s)) [consec_fail=$consec_fail]"
    preserve_wip "run ended without a commit"
    "$RCL" release --id "$ITEM_IDS" --outcome "$outcome" --metrics "$(metrics_json "$outcome")" | grep -q SKIPPED && event "story $ITEM_IDS retired after repeated failures"
  else
    FIX_ROUNDS=0; ok=0
    while true; do
      if verify_tree "$BEFORE" "-r$FIX_ROUNDS"; then ok=1; break; fi
      FIX_ROUNDS=$(( FIX_ROUNDS + 1 )); [ "$FIX_ROUNDS" -gt "$MAX_FIX_ROUNDS" ] && break
      log "run #$run: gates FAILED on the committed tree — waking the agent (round $FIX_ROUNDS): $(grep -m1 '=== .* FAILED' "$VLOG")"
      write_nudge gates-failed "$VLOG"
      agent_session resume "$NUDGE_FILE" || break
      preserve_wip "after fix round $FIX_ROUNDS"; git -C "$WT" reset -q --hard HEAD
    done
    git -C "$WT" log -1 --format=%s | grep -q '^wip(salvage)' && { git -C "$WT" reset -q --hard HEAD~1; ok=0; log "run #$run: last commit was a salvage — not integrating"; }
    if [ $ok = 1 ]; then
      push_round=0
      while true; do
        if ! integrate; then ok=0; break; fi
        if [ "$REBASED" = 1 ]; then REBASED=0; if ! verify_tree "$BEFORE" "-rebased$push_round"; then log "run #$run: gates FAILED after rebase"; ok=0; break; fi; fi
        hb pushing "$ITEM_ID"
        if git -C "$WT" push origin "HEAD:refs/heads/$BRANCH" >>"$LOGS/run-$RUNTAG-push.log" 2>&1; then break; fi
        push_round=$(( push_round + 1 )); [ "$push_round" -gt 3 ] && { ok=0; break; }
        log "run #$run: push rejected (someone landed first) — rebasing again"
      done
    fi
    AFTER="$(git -C "$WT" rev-parse HEAD)"; NEW="$(git -C "$WT" rev-list --count "$BEFORE..$AFTER" 2>/dev/null || echo '?')"
    if [ $ok = 1 ]; then
      consec_fail=0
      if [ -n "$PARTIAL" ]; then
        event "◐ run #$run: $ITEM_IDS landed $NEW commit(s) in PART (${ELAPSED}s) — $(git -C "$WT" log -1 --pretty='%h %s') · $PARTIAL"
        "$RCL" release --id "$ITEM_IDS" --outcome partial --metrics "$(metrics_json partial)" >/dev/null
      else
        event "✅ run #$run: $ITEM_IDS landed $NEW commit(s) on $BRANCH in ${ELAPSED}s ($ATTEMPTS attempt(s), $FIX_ROUNDS fix round(s)) — $(git -C "$WT" log -1 --pretty='%h %s')"
        "$RCL" release --id "$ITEM_IDS" --outcome landed --metrics "$(metrics_json landed)" >/dev/null
      fi
    else
      consec_fail=$(( consec_fail + 1 ))
      git -C "$WT" branch -f "salvage/slot$SLOT-unverified-run-$RUNTAG" HEAD >/dev/null 2>&1
      event "❌ run #$run: $ITEM_IDS NOT integrated — $NEW commit(s) parked on salvage/slot$SLOT-unverified-run-$RUNTAG ($(grep -m1 '=== .* FAILED' "${VLOG:-/dev/null}" 2>/dev/null))"
      "$RCL" release --id "$ITEM_IDS" --outcome failed --metrics "$(metrics_json failed)" | grep -q SKIPPED && event "story $ITEM_IDS retired after repeated failures"
    fi
  fi
  maybe_promote
  hb idle
  [ "${LOOP_ONCE:-0}" = 1 ] && { log "LOOP_ONCE — exiting after one run"; break; }
  if [ "$consec_fail" -ge 3 ]; then
    backoff=$(( 300 * (1 << (consec_fail - 3)) )); [ "$backoff" -gt 7200 ] && backoff=7200
    event "⚠ slot $SLOT: $consec_fail runs in a row landed nothing — backing off ${backoff}s"
    sleep_until $(( $(date +%s) + backoff )) || continue
  else
    sleep "$LOOP_MIN_GAP"
  fi
done
event "=== slot $SLOT end === $run run(s)"
