#!/usr/bin/env python3
"""The RC loop's brain: what a slot works on next, who holds what, how much plan is left.

Reads `docs/planning/RC_ROADMAP.md` (stories, sizes, phases, deps, owns, acceptance) from the
integration branch, keeps the claim/outcome state under the control directory, watches the
Claude/Codex allowances, renders prompts, parses headless results for token accounting, and
serves the local dashboard + supervisor. Never edits the repository except `roadmap-sync`.

    rcloop.py claim --slot N --run R          pick + lock a story for slot N (JSON on stdout; rc 3 = idle)
    rcloop.py release --id ID --outcome landed|failed|nocommit|deferred [--metrics JSON]
    rcloop.py skip|unskip|pin|unpin --id ID [--reason R]
    rcloop.py set --id ID --status open|done|skipped|blocked
    rcloop.py render --item ITEM.json --out PROMPT.md --journal J --worktree WT --slot N
    rcloop.py result --log LOG --backend claude|codex     token/limit summary of one attempt
    rcloop.py usage [--fresh]                             the plan allowances (cached)
    rcloop.py slot-env --slot N                           shell exports for run-loop.sh
    rcloop.py roadmap-sync --file PATH                    rewrite the §23 Status column
    rcloop.py status | state                              human summary | dashboard JSON
    rcloop.py serve                                       dashboard + supervisor + usage poller
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAIN = HERE.parent.parent  # the owner's checkout — read-only for us except `git worktree`/`fetch`
CTL = Path(os.environ.get("LOOP_CTL", Path.home() / "Programming" / "dndtools-loop"))
STATE = CTL / "state"
ROADMAP_REL = "docs/planning/RC_ROADMAP.md"
LANES = ["STB", "SYS", "WID", "CAN", "MAP", "ENG", "UX", "AI", "SES", "CHR", "KNW", "AUD", "CLD", "DSN", "PLT", "DOC"]
FP = {"S": 1.0, "M": 3.0, "L": 6.0, "XL": 10.0}  # "function points" per story size, for tokens/FP

DEFAULT_CONFIG = {
    "branch": "loop/rc",
    "promote_to": "main",
    "promote_interval_s": 12 * 3600,
    "promote_gate": "e2e",  # none | build | e2e  (wrapper-side, costs no model tokens)
    "slots": [
        {"backend": "claude", "enabled": True, "model": "auto", "effort": "auto", "sizes": ["S", "M", "L"], "lanes": []},
        {"backend": "claude", "enabled": True, "model": "auto", "effort": "auto", "sizes": ["S", "M", "L"], "lanes": []},
    ],
    # Model routing by story size. `auto` on a slot means "use this table"; a slot may pin a model.
    "routing": {
        "S": {"model": "sonnet", "effort": "medium"},
        "M": {"model": "opus", "effort": "medium"},
        "L": {"model": "opus", "effort": "high"},
        "XL": {"model": "opus", "effort": "high"},
        "docs": {"model": "sonnet", "effort": "medium"},  # docs/ADR-only stories, any size
    },
    "codex": {"model": "gpt-5.6-sol", "effort": "medium"},
    "phase": {"max": "P4", "mode": "gated", "unlock_pct": 100},  # gated: P(n+1) opens when P(n) is unlock_pct done/skipped
    "lane_priority": LANES,
    "lanes_disabled": [],
    "max_per_lane": 1,
    "batch_small": 2,  # up to N S-stories of one lane, disjoint owns, in one run
    "give_up_after": 2,  # failed runs before a story is retired to skipped(loop)
    "stale_claim_s": 8 * 3600,
    "attempt_timeout_s": {"S": 75 * 60, "M": 150 * 60, "L": 180 * 60, "XL": 180 * 60},
    "max_timeout_resumes": 2,
    "max_fix_rounds": {"S": 1, "M": 2, "L": 2, "XL": 2},
    "gates": {"build_for": ["M", "L", "XL"], "feature_audit": True, "e2e_named_specs": True},
    "usage": {
        "session_soft_pct": 70,  # above: only slot 1 claims
        "session_max_pct": 88,  # above: nobody claims (headroom for interactive use)
        "weekly_soft_pct": 80,
        "weekly_max_pct": 93,
        "pace": True,  # throttle to one slot when weekly burn runs ahead of linear pace
        "pace_slack_pct": 12,
        "poll_s": 120,
        "codex_max_pct": 90,
    },
    "mcp": "none",  # none | inherit  (MCP tool definitions cost tokens on every turn)
    "min_gap_s": 45,
    "idle_wait_s": 600,
    "dashboard_port": 4991,
    "fp": FP,
}

# ----------------------------------------------------------------------------- small helpers


def now() -> float:
    return time.time()


def iso(t: float | None) -> str:
    return dt.datetime.fromtimestamp(t).strftime("%Y-%m-%d %H:%M") if t else ""


def read_json(p: Path, default):
    try:
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return default


def write_json(p: Path, data) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n")
    tmp.replace(p)


def deep_merge(base, patch):
    if isinstance(base, dict) and isinstance(patch, dict):
        out = dict(base)
        for k, v in patch.items():
            out[k] = deep_merge(base.get(k), v) if k in base else v
        return out
    return patch


def load_config() -> dict:
    cfg = deep_merge(DEFAULT_CONFIG, read_json(CTL / "config.json", {}))
    return cfg


def save_config(cfg: dict) -> None:
    write_json(CTL / "config.json", cfg)


class Lock:
    def __init__(self, name="lock"):
        STATE.mkdir(parents=True, exist_ok=True)
        self.f = open(STATE / name, "a+")

    def __enter__(self):
        fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *a):
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


def git(args, cwd=MAIN, check=False) -> str:
    r = subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError(r.stderr.strip())
    return r.stdout


def event(text: str, slot: str = "ctl") -> None:
    CTL.mkdir(parents=True, exist_ok=True)
    with open(CTL / "events.log", "a") as f:
        f.write(f"[{dt.datetime.now():%Y-%m-%d %H:%M:%S}] [{slot}] {text}\n")


# ----------------------------------------------------------------------------- the roadmap

STORY_RE = re.compile(r"^- \*\*(RC-([A-Z]+)-(\d+)\.(\d+)) — (.*?)\*\*(.*?)(?=^- \*\*RC-|^#{2,3} |\Z)", re.M | re.S)
INDEX_RE = re.compile(r"^\| (RC-[A-Z]+-\d+\.\d+)\s+\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\w+)\s*\|\s*(\w+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$", re.M)
HEAD_RE = re.compile(r"^(#{2,3}) (.*)$", re.M)
DEP_TOKEN = re.compile(r"(?:(?:RC-)?([A-Z]{2,4})-)?(\d+)\.(\d+|\*)(?:\s*[–-]\s*(?:(\d+)\.)?(\d+))?")


def roadmap_text(repo: Path | None, branch: str) -> tuple[str, str]:
    """The roadmap as the loop sees it: the worktree copy, else `origin/<branch>`'s, else the owner's."""
    if repo and (repo / ROADMAP_REL).exists():
        t = (repo / ROADMAP_REL).read_text()
        return t, hashlib.sha1(t.encode()).hexdigest()
    t = git(["show", f"origin/{branch}:{ROADMAP_REL}"])
    if not t.strip():
        t = git(["show", f"{branch}:{ROADMAP_REL}"])
    if not t.strip() and (MAIN / ROADMAP_REL).exists():
        t = (MAIN / ROADMAP_REL).read_text()
    return t, hashlib.sha1(t.encode()).hexdigest()


def _resolve_deps(text: str, lane: str, known: set[str]) -> tuple[list[str], list[str]]:
    deps, unknown = [], []
    text = text.strip()
    if not text or text.lower() in {"none", "—", "-", "n/a"}:
        return deps, unknown
    for tok in re.split(r"[,;]", text):
        tok = tok.strip().strip("`")
        if not tok or tok.lower() in {"none", "—"}:
            continue
        m = DEP_TOKEN.search(tok)
        if not m:
            unknown.append(tok)
            continue
        ln = m.group(1) or lane
        major, minor, major2, minor2 = m.group(2), m.group(3), m.group(4), m.group(5)
        if minor == "*":
            deps.extend(k for k in known if k.startswith(f"RC-{ln}-{major}."))
            continue
        if minor2:
            hi_major = major2 or major
            if hi_major == major:
                ids = [f"RC-{ln}-{major}.{i}" for i in range(int(minor), int(minor2) + 1)]
            else:
                ids = [k for k in known if k.startswith(f"RC-{ln}-") and (int(major), int(minor)) <= tuple(map(int, k.split("-")[-1].split("."))) <= (int(hi_major), int(minor2))]
        else:
            ids = [f"RC-{ln}-{major}.{minor}"]
        for i in ids:
            (deps if i in known else unknown).append(i)
    return sorted(set(deps)), unknown


def _norm_path(p: str) -> str:
    p = p.strip().strip("`'\"").replace("\\", "/")
    p = re.sub(r"\s*\(new\)|\s*\(.*?\)$", "", p)
    p = re.sub(r"\s+", "", p)  # a path wrapped across a line break in the roadmap
    for pre in ("apps/gm-react/src/", "apps/gm-react/", "packages/core/src/", "packages/core/", "src/"):
        if p.startswith(pre):
            p = p[len(pre):]
        elif p == pre.rstrip("/"):
            p = ""
    return p.rstrip("/")


def _owns_paths(owns: str) -> list[str]:
    out = []
    for m in re.finditer(r"`([^`]+)`", owns):
        raw = m.group(1)
        # `screens/settings/{index,Appearance}.tsx` → the directory; `foo.ts` → the file
        raw = re.sub(r"\{[^}]*\}.*$", "", raw)
        raw = re.sub(r"\*.*$", "", raw)
        raw = raw.rstrip("/")
        # only things that look like paths: a slash or a source/doc extension — not identifiers
        if "/" not in raw and not re.search(r"\.(tsx?|m?js|cjs|json|md|css|ya?ml|html|toml|sh)$", raw):
            continue
        n = _norm_path(raw)
        if n:
            out.append(n)
    return sorted(set(out))


_ROADMAP_CACHE: dict[str, dict] = {}


def parse_roadmap(text: str, key: str | None = None) -> dict:
    if key and key in _ROADMAP_CACHE:
        return _ROADMAP_CACHE[key]
    stories: dict[str, dict] = {}
    heads = [(m.start(), m.group(1), m.group(2)) for m in HEAD_RE.finditer(text)]
    line_of = lambda pos: text.count("\n", 0, pos) + 1  # noqa: E731

    def section_for(pos):
        cur = None
        for hpos, level, title in heads:
            if hpos <= pos:
                cur = (hpos, level, title)
            else:
                break
        if not cur:
            return "", (1, 1)
        idx = heads.index(cur)
        end = heads[idx + 1][0] if idx + 1 < len(heads) else len(text)
        return cur[2], (line_of(cur[0]), line_of(end) - 1)

    index_rows = {m.group(1): m for m in INDEX_RE.finditer(text)}
    for m in STORY_RE.finditer(text):
        sid, lane, epic, num, title, tail = m.groups()
        if sid in stories:
            continue
        flat = " ".join(tail.split())
        size = re.search(r"`(S|M|L|XL)`", flat)
        phase = re.search(r"\b(P\d|rolling)\b", flat)
        deps = re.search(r"Deps:\s*(.*?)\s*(?:·|Owns:|Acceptance:|$)", flat)
        owns = re.search(r"Owns:\s*(.*?)(?:\s*Acceptance:|\s*Declares:|$)", flat)
        acc = re.search(r"Acceptance:\s*(.*)$", flat)
        row = index_rows.get(sid)
        sec, (l0, l1) = section_for(m.start())
        stories[sid] = {
            "id": sid, "lane": lane, "epic": f"{lane}-{epic}", "num": (int(epic), int(num)), "title": " ".join(title.split()).rstrip("."),
            "size": (size.group(1) if size else (row.group(4) if row else "M")),
            "phase": (phase.group(1) if phase else (row.group(5) if row else "P2")),
            "deps_text": deps.group(1) if deps else (row.group(6) if row else ""),
            "owns_text": owns.group(1) if owns else "",
            "owns": (_owns_paths(owns.group(1)) if owns else []) or _owns_paths(title),
            "acceptance": acc.group(1) if acc else "",
            "specs": sorted(set(re.findall(r"([\w-]+\.spec\.ts)", flat))),
            "body": ("- **" + sid + " — " + title + "**" + tail).rstrip(),
            "section": sec, "lines": [l0, l1], "line": line_of(m.start()),
            "docs_only": bool(owns) and all(p.startswith(("docs/", "docs")) or p.endswith(".md") for p in _owns_paths(owns.group(1))) and bool(_owns_paths(owns.group(1))),
            "operator": bool(re.search(r"operator[- ]only|operator action|only the (owner|operator)|needs (a|an) (account|purchase)|Stripe (account|keys)|Apple Developer|signing cert", flat, re.I))
                        or "external" in (deps.group(1) if deps else (row.group(6) if row else "")).lower(),
            "index_status": (row.group(7).strip() if row else ""),
        }
    # rows only in the index (none today, but keep the loop honest)
    for sid, row in index_rows.items():
        if sid not in stories:
            lane = sid.split("-")[1]
            e, n = row.group(1).split("-")[-1].split(".")
            stories[sid] = {"id": sid, "lane": lane, "epic": f"{lane}-{e}", "num": (int(e), int(n)), "title": row.group(3), "size": row.group(4),
                            "phase": row.group(5), "deps_text": row.group(6), "owns_text": "", "owns": [], "acceptance": "", "specs": [],
                            "body": f"- **{sid} — {row.group(3)}** (index row only)", "section": "§23", "lines": [1, 1], "line": 1,
                            "docs_only": False, "operator": False, "index_status": row.group(7).strip()}
    known = set(stories)
    for s in stories.values():
        s["deps"], s["unknown_deps"] = _resolve_deps(s["deps_text"], s["lane"], known)
    # how much each story unblocks (transitively) — the critical-path signal, computed not hand-coded
    rdeps: dict[str, set[str]] = {k: set() for k in stories}
    for s in stories.values():
        for d in s["deps"]:
            rdeps[d].add(s["id"])
    def unlocks(sid, seen):
        for c in rdeps[sid]:
            if c not in seen:
                seen.add(c)
                unlocks(c, seen)
        return seen
    for s in stories.values():
        s["unlocks"] = len(unlocks(s["id"], set()))
    out = {"stories": stories, "hash": key or hashlib.sha1(text.encode()).hexdigest(), "count": len(stories)}
    if key:
        _ROADMAP_CACHE[key] = out
    return out


def load_roadmap(repo: Path | None, cfg: dict) -> dict:
    text, h = roadmap_text(repo, cfg["branch"])
    if not text.strip():
        raise SystemExit(f"no roadmap found (worktree {repo}, origin/{cfg['branch']}, or {MAIN / ROADMAP_REL})")
    return parse_roadmap(text, h)


# ----------------------------------------------------------------------------- state

ITEMS = STATE / "items.json"
RUNS = STATE / "runs.jsonl"


def load_items() -> dict:
    return read_json(ITEMS, {})


def save_items(items: dict) -> None:
    write_json(ITEMS, items)


def item(items: dict, sid: str) -> dict:
    return items.setdefault(sid, {"status": "open", "attempts": 0, "failures": 0})


def effective_status(st: dict, s: dict, cfg: dict) -> str:
    """open | claimed | done | skipped | blocked — with stale claims released."""
    status = st.get("status", "open")
    if status == "claimed":
        claim = st.get("claim") or {}
        if now() - claim.get("since", 0) > cfg["stale_claim_s"] and not _pid_alive(claim.get("pid")):
            return "open"
    return status


def _pid_alive(pid) -> bool:
    try:
        os.kill(int(pid), 0)
        return True
    except (TypeError, ValueError, ProcessLookupError, PermissionError):
        return False


# ----------------------------------------------------------------------------- usage / allowances

USAGE = STATE / "usage.json"


def _claude_token() -> str | None:
    d = read_json(Path.home() / ".claude" / ".credentials.json", {})
    return (d.get("claudeAiOauth") or {}).get("accessToken")


def fetch_claude_usage() -> dict:
    tok = _claude_token()
    if not tok:
        return {"ok": False, "error": "no OAuth token in ~/.claude/.credentials.json"}
    req = urllib.request.Request(
        "https://api.anthropic.com/api/oauth/usage",
        headers={"Authorization": f"Bearer {tok}", "anthropic-beta": "oauth-2025-04-20", "User-Agent": "dndtools-rcloop/1"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"HTTP {e.code} (token expired? any `claude` run refreshes it)"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}

    def win(w):
        if not w:
            return None
        rs = w.get("resets_at")
        ts = dt.datetime.fromisoformat(rs).timestamp() if rs else None
        return {"pct": float(w.get("utilization") or 0), "resets_at": ts, "resets_iso": rs}

    scoped = {}
    for lim in d.get("limits") or []:
        sc = (lim.get("scope") or {}).get("model") or {}
        name = sc.get("display_name")
        if lim.get("kind") == "weekly_scoped" and name:
            rs = lim.get("resets_at")
            scoped[name.lower()] = {"pct": float(lim.get("percent") or 0), "resets_at": dt.datetime.fromisoformat(rs).timestamp() if rs else None}
    for k in ("seven_day_opus", "seven_day_sonnet"):
        if d.get(k):
            scoped[k.replace("seven_day_", "")] = win(d[k])
    return {"ok": True, "session": win(d.get("five_hour")), "weekly": win(d.get("seven_day")), "scoped": scoped}


def fetch_codex_usage() -> dict:
    """Codex app-server's read-only rate-limit snapshot (same call the Codex clients make)."""
    msgs = [
        {"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "dndtools-rcloop", "title": "RC loop allowance probe", "version": "1.0.0"}, "capabilities": None}},
        {"method": "initialized"},
        {"id": 2, "method": "account/rateLimits/read", "params": None},
    ]
    try:
        p = subprocess.run(["codex", "app-server", "--stdio"], input="".join(json.dumps(m) + "\n" for m in msgs), capture_output=True, text=True, timeout=25)
    except (OSError, subprocess.SubprocessError) as e:
        return {"ok": False, "error": str(e)}
    for line in p.stdout.splitlines():
        try:
            m = json.loads(line)
        except ValueError:
            continue
        if m.get("id") == 2 and isinstance(m.get("result"), dict):
            res = m["result"]
            limits = res.get("rateLimitsByLimitId") or {}
            out = {"ok": True, "limits": {}}
            for v in limits.values():
                if not isinstance(v, dict):
                    continue
                wins = [w for w in (v.get("primary"), v.get("secondary")) if isinstance(w, dict) and isinstance(w.get("usedPercent"), (int, float))]
                out["limits"][v.get("limitName", "?")] = [
                    {"pct": float(w["usedPercent"]), "window_min": w.get("windowDurationMins"), "resets_at": w.get("resetsAt")} for w in wins
                ]
            return out
    return {"ok": False, "error": (p.stderr.strip().splitlines() or ["no snapshot"])[-1][:200]}


def get_usage(cfg: dict, fresh: bool = False, want_codex: bool | None = None) -> dict:
    with Lock("usage.lock"):
        cached = read_json(USAGE, {})
        if not fresh and cached and now() - cached.get("at", 0) < cfg["usage"]["poll_s"]:
            return cached
        if want_codex is None:
            want_codex = any(s.get("backend") == "codex" and s.get("enabled", True) for s in cfg["slots"])
        u = {"at": now(), "claude": fetch_claude_usage(), "codex": fetch_codex_usage() if want_codex else {"ok": False, "error": "no codex slot"}}
        write_json(USAGE, u)
        return u


def usage_verdict(cfg: dict, usage: dict, backend: str) -> dict:
    """{allowed_slots, reason, wait_until}: how many slots may START a run right now."""
    ucfg = cfg["usage"]
    if backend == "codex":
        c = usage.get("codex") or {}
        if not c.get("ok"):
            return {"allowed_slots": 0, "reason": f"codex usage unknown: {c.get('error')}", "wait_until": now() + 900}
        worst = max((w["pct"] for ws in c["limits"].values() for w in ws), default=0)
        if worst >= ucfg["codex_max_pct"]:
            return {"allowed_slots": 0, "reason": f"codex allowance {worst:.0f}%", "wait_until": now() + 1800}
        return {"allowed_slots": 99, "reason": "", "wait_until": None}
    c = usage.get("claude") or {}
    if not c.get("ok"):
        # fail open on a *stale* endpoint, closed on none at all: the limit-line parser still guards the run
        return {"allowed_slots": 1, "reason": f"usage endpoint unavailable ({c.get('error')}); one slot only", "wait_until": None}
    s, w = c.get("session") or {"pct": 0}, c.get("weekly") or {"pct": 0}
    if s["pct"] >= ucfg["session_max_pct"]:
        return {"allowed_slots": 0, "reason": f"5h window at {s['pct']:.0f}% ≥ {ucfg['session_max_pct']}% (resets {iso(s.get('resets_at'))})", "wait_until": s.get("resets_at") or now() + 900}
    if w["pct"] >= ucfg["weekly_max_pct"]:
        return {"allowed_slots": 0, "reason": f"weekly at {w['pct']:.0f}% ≥ {ucfg['weekly_max_pct']}% (resets {iso(w.get('resets_at'))})", "wait_until": w.get("resets_at") or now() + 3600}
    reasons = []
    allowed = 99
    if s["pct"] >= ucfg["session_soft_pct"]:
        allowed, _ = 1, reasons.append(f"5h window at {s['pct']:.0f}% ≥ soft {ucfg['session_soft_pct']}%")
    if w["pct"] >= ucfg["weekly_soft_pct"]:
        allowed, _ = 1, reasons.append(f"weekly at {w['pct']:.0f}% ≥ soft {ucfg['weekly_soft_pct']}%")
    if ucfg.get("pace") and w.get("resets_at"):
        elapsed = 1 - max(0.0, (w["resets_at"] - now()) / (7 * 86400))
        expected = elapsed * 100
        if w["pct"] > expected + ucfg["pace_slack_pct"]:
            allowed, _ = 1, reasons.append(f"weekly {w['pct']:.0f}% is ahead of pace ({expected:.0f}% + {ucfg['pace_slack_pct']}%)")
    return {"allowed_slots": allowed, "reason": "; ".join(reasons), "wait_until": None}


def route_model(cfg: dict, usage: dict, story: dict, slot: dict) -> tuple[str, str]:
    """(model, effort) for a story on a slot, honouring pins, docs routing and scoped weekly limits."""
    if slot.get("backend") == "codex":
        return cfg["codex"]["model"], cfg["codex"]["effort"]
    key = "docs" if story.get("docs_only") and "docs" in cfg["routing"] else story["size"]
    r = cfg["routing"].get(key) or cfg["routing"].get(story["size"]) or {"model": "opus", "effort": "medium"}
    model = slot.get("model") if slot.get("model") not in (None, "", "auto") else r["model"]
    effort = slot.get("effort") if slot.get("effort") not in (None, "", "auto") else r["effort"]
    scoped = ((usage.get("claude") or {}).get("scoped") or {})
    sc = scoped.get(model.lower())
    if sc and sc.get("pct", 0) >= cfg["usage"]["weekly_max_pct"]:
        model = "opus" if model.lower() != "opus" else "sonnet"
    return model, effort


# ----------------------------------------------------------------------------- dispatch


def _phase_rank(p: str) -> int:
    return 9 if p == "rolling" else int(p[1:]) if p.startswith("P") and p[1:].isdigit() else 5


def _paths_overlap(a: list[str], b: list[str]) -> bool:
    for x in a:
        for y in b:
            if x == y or x.startswith(y + "/") or y.startswith(x + "/"):
                return True
    return False


def open_phase_limit(stories: dict, items: dict, cfg: dict) -> int:
    """With gated phases, the highest phase rank that may start right now."""
    pc = cfg["phase"]
    cap = _phase_rank(pc["max"])
    if pc["mode"] != "gated":
        return cap
    for rank in range(0, cap + 1):
        ph = [s for s in stories.values() if _phase_rank(s["phase"]) == rank]
        if not ph:
            continue
        settled = sum(1 for s in ph if effective_status(item(items, s["id"]), s, cfg) in ("done", "skipped"))
        if settled * 100 < len(ph) * pc["unlock_pct"]:
            return rank
    return cap


def candidates(stories: dict, items: dict, cfg: dict, slot_cfg: dict | None = None) -> list[dict]:
    """Eligible stories, best first, each annotated with why it ranks where it does."""
    lane_rank = {ln: i for i, ln in enumerate(cfg["lane_priority"])}
    claimed = [stories[k] for k, v in items.items() if k in stories and effective_status(v, stories[k], cfg) == "claimed"]
    per_lane = {}
    for s in claimed:
        per_lane[s["lane"]] = per_lane.get(s["lane"], 0) + 1
    limit = open_phase_limit(stories, items, cfg)
    out = []
    for s in stories.values():
        st = item(items, s["id"])
        status = effective_status(st, s, cfg)
        if status != "open":
            continue
        why = []
        if s["lane"] in cfg["lanes_disabled"]:
            continue
        if _phase_rank(s["phase"]) > limit and not st.get("pinned"):
            continue
        if s.get("operator") and not st.get("pinned"):
            continue
        unmet = [d for d in s["deps"] if effective_status(item(items, d), stories[d], cfg) not in ("done", "skipped")]
        if unmet:
            continue
        if per_lane.get(s["lane"], 0) >= cfg["max_per_lane"] and not st.get("pinned"):
            why.append("lane busy")
            continue
        if any(_paths_overlap(s["owns"], c["owns"]) for c in claimed):
            continue
        if slot_cfg:
            if slot_cfg.get("sizes") and s["size"] not in slot_cfg["sizes"]:
                continue
            if slot_cfg.get("lanes") and s["lane"] not in slot_cfg["lanes"]:
                continue
        s2 = dict(s)
        s2["score"] = (0 if st.get("pinned") else 1, _phase_rank(s["phase"]), st.get("attempts", 0), lane_rank.get(s["lane"], 99), -s["unlocks"], s["num"])
        s2["attempts"] = st.get("attempts", 0)
        out.append(s2)
    out.sort(key=lambda x: x["score"])
    return out


def cmd_claim(a) -> int:
    cfg = load_config()
    slot_i = int(a.slot)
    slot_cfg = cfg["slots"][slot_i - 1] if slot_i - 1 < len(cfg["slots"]) else {"backend": "claude"}
    repo = Path(a.repo) if a.repo else None
    rm = load_roadmap(repo, cfg)
    stories = rm["stories"]
    idle_file = STATE / f"slot-{slot_i}" / "idle.json"

    def idle(reason, wait_until=None):
        write_json(idle_file, {"reason": reason, "at": now(), "wait_until": wait_until})
        print(json.dumps({"idle": reason, "wait_until": wait_until}), file=sys.stderr)
        return 3

    if not slot_cfg.get("enabled", True):
        return idle("slot disabled")
    usage = get_usage(cfg)
    verdict = usage_verdict(cfg, usage, slot_cfg.get("backend", "claude"))
    if slot_i > verdict["allowed_slots"]:
        return idle(verdict["reason"] or "throttled by usage", verdict.get("wait_until"))
    with Lock():
        items = load_items()
        # continue a story this slot already holds (a crashed runner)
        for sid, st in items.items():
            claim = st.get("claim") or {}
            if st.get("status") == "claimed" and claim.get("slot") == slot_i and sid in stories:
                st["claim"] = {**claim, "run": a.run, "since": now(), "pid": os.getppid()}
                save_items(items)
                picked = [dict(stories[sid], attempts=st.get("attempts", 0), continued=True)]
                break
        else:
            cands = candidates(stories, items, cfg, slot_cfg)
            if not cands:
                (idle_file.parent).mkdir(parents=True, exist_ok=True)
                limit = open_phase_limit(stories, items, cfg)
                return idle(f"nothing claimable (phase gate at P{limit}, {len(stories)} stories)")
            picked = [cands[0]]
            # batch a couple of small stories from the same lane with disjoint owns (amortise context)
            if picked[0]["size"] == "S" and cfg["batch_small"] > 1:
                for c in cands[1:]:
                    if len(picked) >= cfg["batch_small"]:
                        break
                    if c["size"] == "S" and c["lane"] == picked[0]["lane"] and not any(_paths_overlap(c["owns"], p["owns"]) for p in picked) \
                       and not any(d in {p["id"] for p in picked} for d in c["deps"]):
                        picked.append(c)
            for p in picked:
                st = item(items, p["id"])
                st["status"] = "claimed"
                st["attempts"] = st.get("attempts", 0) + 1
                st["claim"] = {"slot": slot_i, "run": a.run, "since": now(), "pid": os.getppid()}
            save_items(items)
    idle_file.unlink(missing_ok=True)
    primary = picked[0]
    model, effort = route_model(cfg, usage, primary, slot_cfg)
    size = primary["size"] if len(picked) == 1 else "M"
    out = {
        "id": primary["id"], "ids": [p["id"] for p in picked], "title": primary["title"] if len(picked) == 1 else " + ".join(p["id"] for p in picked),
        "lane": primary["lane"], "size": size, "phase": primary["phase"], "backend": slot_cfg.get("backend", "claude"), "model": model, "effort": effort,
        "attempts": primary.get("attempts", 0), "continued": bool(primary.get("continued")),
        "specs": sorted({sp for p in picked for sp in p["specs"]}), "owns": sorted({o for p in picked for o in p["owns"]}),
        "stories": [{k: p[k] for k in ("id", "title", "size", "phase", "deps", "owns_text", "acceptance", "body", "section", "lines", "line", "docs_only")} for p in picked],
        "attempt_timeout_s": cfg["attempt_timeout_s"].get(size, 7200), "max_fix_rounds": cfg["max_fix_rounds"].get(size, 1),
        "others": [{"id": k, "slot": (v.get("claim") or {}).get("slot"), "title": stories[k]["title"], "owns": stories[k]["owns_text"][:200]}
                   for k, v in items.items() if k in stories and v.get("status") == "claimed" and k not in {p["id"] for p in picked}],
        "roadmap_hash": rm["hash"],
    }
    print(json.dumps(out))
    return 0


def cmd_release(a) -> int:
    cfg = load_config()
    metrics = json.loads(a.metrics) if a.metrics else {}
    ids = a.id.split("+")
    with Lock():
        items = load_items()
        for sid in ids:
            st = item(items, sid)
            st.pop("claim", None)
            st["last_outcome"] = a.outcome
            st["last_at"] = now()
            if a.outcome == "landed":
                st["status"] = "done"
                st["failures"] = 0
                st["commit"] = metrics.get("commit")
            elif a.outcome == "partial":
                st["status"] = "open"
                st["partial"] = metrics.get("note", "landed in part")
            elif a.outcome == "deferred":
                st["status"] = "open"
                st["attempts"] = max(0, st.get("attempts", 1) - 1)
            else:
                st["status"] = "open"
                st["failures"] = st.get("failures", 0) + 1
                if st["failures"] >= cfg["give_up_after"]:
                    st["status"] = "skipped"
                    st["skip_reason"] = f"loop: {st['failures']} failed runs"
                    print(f"SKIPPED {sid}")
        save_items(items)
    if metrics:
        rec = {"at": now(), "id": a.id, "outcome": a.outcome, **metrics}
        with open(RUNS, "a") as f:
            f.write(json.dumps(rec, sort_keys=True) + "\n")
    return 0


def cmd_set(a) -> int:
    with Lock():
        items = load_items()
        for sid in a.id.split("+"):
            st = item(items, sid)
            if a.cmd == "skip":
                st["status"], st["skip_reason"] = "skipped", a.reason or "skipped from the dashboard"
                st.pop("claim", None)
            elif a.cmd == "unskip":
                st["status"], st["failures"] = "open", 0
                st.pop("skip_reason", None)
            elif a.cmd == "pin":
                st["pinned"] = True
            elif a.cmd == "unpin":
                st.pop("pinned", None)
            elif a.cmd == "set":
                st["status"] = a.status
                if a.status != "claimed":
                    st.pop("claim", None)
                if a.status == "open":
                    st["failures"] = 0
                if a.reason:
                    st["note"] = a.reason
        save_items(items)
    return 0


# ----------------------------------------------------------------------------- prompt rendering

GATES_TEXT = """- `pnpm typecheck` and `pnpm lint` (both include the core boundary lint) — on the FINAL tree, no edits after.
- `pnpm format:fix:changed` before committing (formats only the files you touched; never add a repo-wide `format:check` to CI).
- Unit tests for what you changed: `pnpm test:critical` (packages/core), `pnpm test:app` (apps/gm-react app layer), `pnpm test:cloud`, `pnpm test:tooling`.
- `pnpm e2e -- <spec>` on both profiles when a screen changed: `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/<name>.spec.ts --project=desktop-chromium --project=mobile-chromium` (the port is already set for you via `DNDTOOLS_E2E_PORT`).
- `pnpm build` when you touched app or core code with a `M`/`L` story.
- `pnpm feature-audit` when you touched `docs/requirements/` or screens (drift must stay at zero)."""


def cmd_render(a) -> int:
    cfg = load_config()
    it = json.loads(Path(a.item).read_text())
    tpl = (HERE / "prompts" / "worker.md").read_text()
    work = []
    for s in it["stories"]:
        work.append(f"### {s['id']} — {s['title']}\n"
                    f"Size `{s['size']}` · phase {s['phase']} · deps {', '.join(s['deps']) or 'none'} · roadmap lines {s['lines'][0]}–{s['lines'][1]} (story at line {s['line']}).\n\n"
                    f"{s['body']}\n")
    if it.get("continued"):
        work.append("**You already held this story when the run started** (an earlier run was interrupted). Check `git log --oneline -8` for its commits and the journal before doing anything.")
    if it.get("attempts", 0) > 1:
        work.append(f"This story has been attempted {it['attempts'] - 1} time(s) before without landing. The journal directory of earlier runs may hold notes; do not repeat a failed approach.")
    others = "\n".join(f"- slot {o['slot']} holds **{o['id']}** — {o['title']} (owns: {o['owns']})" for o in it.get("others", [])) or "- (nothing else is claimed right now)"
    subs = {
        "{{SLOT}}": str(a.slot), "{{JOURNAL}}": a.journal, "{{WT}}": a.worktree, "{{MAIN_CHECKOUT}}": str(MAIN), "{{BRANCH}}": cfg["branch"],
        "{{ITEM_ID}}": it["id"], "{{IDS}}": " ".join(it["ids"]), "{{WORK}}": "\n".join(work), "{{OTHERS}}": others, "{{GATES}}": GATES_TEXT,
        "{{SPECS}}": ", ".join(it.get("specs") or []) or "(none named — pick the spec that covers the screen you touch)",
        "{{LANE}}": it["lane"].lower(), "{{MODEL}}": it.get("model", ""),
    }
    out = tpl
    for k, v in subs.items():
        out = out.replace(k, v)
    Path(a.out).write_text(out)
    return 0


# ----------------------------------------------------------------------------- result parsing (tokens, limits)

LIMIT_RE = re.compile(r"hit your (session |usage |weekly )?limit|usage limit reached|limit reached.*resets|rate limit(ed)?.*(resets|try again)|out of (extra )?usage", re.I)


def parse_result(log: Path, backend: str) -> dict:
    out = {"found": False, "is_error": False, "limit": False, "limit_message": "", "tokens_in": 0, "tokens_out": 0, "cache_read": 0, "cache_create": 0,
           "cost_usd": 0.0, "turns": 0, "duration_ms": 0, "models": {}, "text": ""}
    try:
        data = log.read_bytes()
    except OSError:
        return out
    tail = data[-400_000:].decode("utf-8", "replace")
    lines = [ln for ln in tail.splitlines() if ln.startswith("{")]
    if backend in ("claude", "fake"):
        for ln in reversed(lines):
            try:
                d = json.loads(ln)
            except ValueError:
                continue
            if d.get("type") == "result":
                u = d.get("usage") or {}
                out.update(found=True, is_error=bool(d.get("is_error")), tokens_in=u.get("input_tokens", 0), tokens_out=u.get("output_tokens", 0),
                           cache_read=u.get("cache_read_input_tokens", 0), cache_create=u.get("cache_creation_input_tokens", 0),
                           cost_usd=float(d.get("total_cost_usd") or 0), turns=d.get("num_turns", 0), duration_ms=d.get("duration_ms", 0),
                           text=str(d.get("result") or "")[:600])
                for m, mu in (d.get("modelUsage") or {}).items():
                    out["models"][m] = {"in": mu.get("inputTokens", 0), "out": mu.get("outputTokens", 0), "cache_read": mu.get("cacheReadInputTokens", 0),
                                        "cache_create": mu.get("cacheCreationInputTokens", 0), "cost_usd": mu.get("costUSD", 0)}
                break
        # a limit shows up as an error result, or as the CLI's own line when it dies before a result event
        if out["is_error"] and LIMIT_RE.search(out["text"]):
            out["limit"], out["limit_message"] = True, out["text"]
        elif not out["found"]:
            for ln in reversed(tail.splitlines()[-40:]):
                if LIMIT_RE.search(ln) and not ln.startswith("{"):
                    out["limit"], out["limit_message"] = True, ln.strip()[:400]
                    break
    else:  # codex --json: turn.completed carries usage; errors carry the limit text
        for ln in lines:
            try:
                d = json.loads(ln)
            except ValueError:
                continue
            t = d.get("type", "")
            if t == "turn.completed" and isinstance(d.get("usage"), dict):
                u = d["usage"]
                out.update(found=True, tokens_in=u.get("input_tokens", 0), tokens_out=u.get("output_tokens", 0), cache_read=u.get("cached_input_tokens", 0))
            if t in ("error", "turn.failed"):
                msg = json.dumps(d)[:400]
                out["is_error"] = True
                if LIMIT_RE.search(msg):
                    out["limit"], out["limit_message"] = True, msg
    return out


def reset_epoch_from_message(msg: str) -> float | None:
    """A limit message names a wall-clock time; turn it into an epoch, or None."""
    tz = re.search(r"\(([A-Za-z_]+/[A-Za-z_]+)\)", msg)
    frag = re.search(r"(?:resets at|resets|try again at|until)\s+([^.()·\"]+)", msg)
    if not frag:
        return None
    f = re.sub(r"(\d+)(st|nd|rd|th)\b", r"\1", frag.group(1).replace(" at ", " ")).strip()
    env = dict(os.environ)
    if tz:
        env["TZ"] = tz.group(1)
    r = subprocess.run(["date", "-d", f, "+%s"], capture_output=True, text=True, env=env)
    if r.returncode:
        return None
    t = int(r.stdout.strip())
    if t <= now():
        t += 86400
    return float(t)


def cmd_result(a) -> int:
    r = parse_result(Path(a.log), a.backend)
    cfg = load_config()
    if r["limit"]:
        # prefer the endpoint's exact reset time over prose parsing
        u = get_usage(cfg, fresh=True, want_codex=(a.backend == "codex"))
        c = (u.get("claude") or {})
        target = None
        if a.backend == "claude" and c.get("ok"):
            for w in (c.get("session"), c.get("weekly")):
                if w and w["pct"] >= 99 and w.get("resets_at"):
                    target = w["resets_at"]
                    break
            if target is None:
                for sc in (c.get("scoped") or {}).values():
                    if sc and sc.get("pct", 0) >= 99 and sc.get("resets_at"):
                        target = sc["resets_at"]
        if target is None:
            target = reset_epoch_from_message(r["limit_message"])
        r["reset_at"] = target
    print(json.dumps(r))
    return 0


# ----------------------------------------------------------------------------- slot env / roadmap sync / status


def cmd_slot_env(a) -> int:
    cfg = load_config()
    i = int(a.slot)
    s = cfg["slots"][i - 1] if i - 1 < len(cfg["slots"]) else {"backend": "claude"}
    kv = {
        "LOOP_BRANCH": cfg["branch"], "LOOP_PROMOTE_TO": cfg["promote_to"], "LOOP_PROMOTE_INTERVAL": cfg["promote_interval_s"], "LOOP_PROMOTE_GATE": cfg["promote_gate"],
        "LOOP_BACKEND": s.get("backend", "claude"), "LOOP_MAX_TIMEOUT_RESUMES": cfg["max_timeout_resumes"], "LOOP_MIN_GAP": cfg["min_gap_s"], "LOOP_IDLE_WAIT": cfg["idle_wait_s"],
        "LOOP_MCP": cfg["mcp"], "LOOP_BUILD_FOR": ",".join(cfg["gates"]["build_for"]), "LOOP_FEATURE_AUDIT": int(bool(cfg["gates"]["feature_audit"])),
        "LOOP_E2E_NAMED": int(bool(cfg["gates"]["e2e_named_specs"])), "DNDTOOLS_E2E_PORT": 5273 + 10 * i,
    }
    for k, v in kv.items():
        print(f"export {k}={json.dumps(str(v))}")
    return 0


def cmd_roadmap_sync(a) -> int:
    """Rewrite the §23 Status column from the loop's state. Returns 0 if changed, 1 if not."""
    cfg = load_config()
    p = Path(a.file)
    text = p.read_text()
    items = load_items()
    changed = False

    def repl(m):
        nonlocal changed
        sid = m.group(1)
        st = items.get(sid) or {}
        status = st.get("status", "")
        cell = m.group(7)
        new = cell.strip()
        if status == "done":
            new = f"done ({(st.get('commit') or '')[:7]})".replace(" ()", "")
        elif status == "skipped":
            new = f"skipped({(st.get('skip_reason') or '')[:40]})"
        elif status == "blocked":
            new = f"blocked({(st.get('note') or '')[:40]})"
        elif status == "claimed":
            new = "in progress"
        elif st.get("partial"):
            new = "in progress"
        if new != cell.strip():
            changed = True
            width = max(len(cell), len(new) + 1)
            return m.group(0)[: m.start(7) - m.start(0)] + (" " + new).ljust(width) + "|"
        return m.group(0)

    out = INDEX_RE.sub(repl, text)
    if changed:
        p.write_text(out)
    return 0 if changed else 1


def slot_states(cfg: dict) -> list[dict]:
    out = []
    for i in range(1, len(cfg["slots"]) + 1):
        d = STATE / f"slot-{i}"
        hb = read_json(d / "heartbeat.json", {})
        pid = read_json(d / "runner.json", {}).get("pid")
        alive = _pid_alive(pid)
        idle = read_json(d / "idle.json", {}) if hb.get("state") in ("idle", "waiting", None) else {}
        live = {}
        if hb.get("log") and hb.get("state") == "working":
            live = tail_activity(Path(hb["log"]), cfg["slots"][i - 1].get("backend", "claude"))
        out.append({"slot": i, "cfg": cfg["slots"][i - 1], "alive": alive, "pid": pid, "hb": hb, "idle": idle, "live": live,
                    "stop_requested": (CTL / f"STOP-{i}").exists()})
    return out


def tail_activity(log: Path, backend: str) -> dict:
    """What the agent is doing right now, from the tail of its stream-json log — cheap and live."""
    try:
        size = log.stat().st_size
        with open(log, "rb") as f:
            f.seek(max(0, size - 120_000))
            chunk = f.read().decode("utf-8", "replace")
    except OSError:
        return {}
    last_text, tools, turns, tokens_out, last_tool = "", 0, 0, 0, ""
    for ln in chunk.splitlines():
        if not ln.startswith("{"):
            continue
        try:
            d = json.loads(ln)
        except ValueError:
            continue
        if backend == "claude" and d.get("type") == "assistant":
            turns += 1
            msg = d.get("message") or {}
            tokens_out += (msg.get("usage") or {}).get("output_tokens", 0)
            for c in msg.get("content") or []:
                if c.get("type") == "text" and c.get("text", "").strip():
                    last_text = c["text"].strip()[-300:]
                elif c.get("type") == "tool_use":
                    tools += 1
                    inp = c.get("input") or {}
                    last_tool = f"{c.get('name')}: {str(inp.get('command') or inp.get('file_path') or inp.get('pattern') or inp.get('description') or '')[:120]}"
        elif backend == "codex" and d.get("type") in ("item.completed", "item.started"):
            it = d.get("item") or {}
            if it.get("type") == "agent_message":
                last_text = str(it.get("text", ""))[-300:]
            elif it.get("type") == "command_execution":
                tools += 1
                last_tool = str(it.get("command", ""))[:120]
    return {"last_text": last_text, "last_tool": last_tool, "tools_in_window": tools, "size": size, "log": str(log)}


def read_runs(limit=400) -> list[dict]:
    try:
        lines = RUNS.read_text().splitlines()[-limit:]
    except OSError:
        return []
    out = []
    for ln in lines:
        try:
            out.append(json.loads(ln))
        except ValueError:
            pass
    return out


def metrics(runs: list[dict], cfg: dict) -> dict:
    """Tokens and cost per validated function point — the number this loop is tuned on."""
    fp = cfg.get("fp", FP)
    agg: dict[str, dict] = {}

    def bump(key, r):
        a = agg.setdefault(key, {"runs": 0, "landed": 0, "fp": 0.0, "tokens": 0, "out_tokens": 0, "cost": 0.0, "seconds": 0})
        a["runs"] += 1
        a["tokens"] += int(r.get("tokens_total") or 0)
        a["out_tokens"] += int(r.get("tokens_out") or 0)
        a["cost"] += float(r.get("cost_usd") or 0)
        a["seconds"] += int(r.get("seconds") or 0)
        if r.get("outcome") == "landed":
            a["landed"] += 1
            a["fp"] += float(r.get("fp") or fp.get(r.get("size", "M"), 3))

    for r in runs:
        bump("all", r)
        bump(f"model:{r.get('model', '?')}", r)
        bump(f"size:{r.get('size', '?')}", r)
        bump(f"lane:{r.get('lane', '?')}", r)
    for a in agg.values():
        a["tokens_per_fp"] = round(a["tokens"] / a["fp"]) if a["fp"] else None
        a["out_tokens_per_fp"] = round(a["out_tokens"] / a["fp"]) if a["fp"] else None
        a["cost_per_fp"] = round(a["cost"] / a["fp"], 2) if a["fp"] else None
        a["land_rate"] = round(a["landed"] / a["runs"], 2) if a["runs"] else None
    return agg


def build_state(cfg: dict, fresh_usage=False) -> dict:
    try:
        rm = load_roadmap(None, cfg)
        stories = rm["stories"]
        rm_err = ""
    except SystemExit as e:
        stories, rm_err = {}, str(e)
    items = load_items()
    usage = get_usage(cfg, fresh=fresh_usage)
    counts = {}
    rows = []
    for s in sorted(stories.values(), key=lambda s: (_phase_rank(s["phase"]), s["lane"], s["num"])):
        st = item(items, s["id"])
        status = effective_status(st, s, cfg)
        counts[status] = counts.get(status, 0) + 1
        unmet = [d for d in s["deps"] if effective_status(item(items, d), stories[d], cfg) not in ("done", "skipped")]
        rows.append({"id": s["id"], "lane": s["lane"], "title": s["title"], "size": s["size"], "phase": s["phase"], "status": status, "deps": s["deps"], "unmet": unmet,
                     "unlocks": s["unlocks"], "attempts": st.get("attempts", 0), "failures": st.get("failures", 0), "pinned": bool(st.get("pinned")),
                     "claim": st.get("claim"), "last_outcome": st.get("last_outcome"), "commit": st.get("commit"), "skip_reason": st.get("skip_reason"),
                     "operator": s["operator"], "docs_only": s["docs_only"], "partial": st.get("partial"), "note": st.get("note"), "line": s["line"]})
    queue = [{"id": c["id"], "lane": c["lane"], "size": c["size"], "phase": c["phase"], "title": c["title"], "unlocks": c["unlocks"], "attempts": c["attempts"]}
             for c in candidates(stories, items, cfg)[:25]] if stories else []
    runs = read_runs()
    verdicts = {b: usage_verdict(cfg, usage, b) for b in ("claude", "codex")}
    try:
        ev = (CTL / "events.log").read_text().splitlines()[-60:]
    except OSError:
        ev = []
    salvage = [b.strip() for b in git(["branch", "--list", "salvage/*"]).splitlines()]
    branch_info = {}
    for ref in (f"origin/{cfg['branch']}", f"origin/{cfg['promote_to']}"):
        sha = git(["rev-parse", "--short", ref]).strip()
        branch_info[ref] = sha
    ahead = git(["rev-list", "--count", f"origin/{cfg['promote_to']}..origin/{cfg['branch']}"]).strip()
    return {
        "at": now(), "ctl": str(CTL), "config": cfg, "usage": usage, "verdicts": verdicts, "slots": slot_states(cfg), "paused": (CTL / "PAUSE").exists(),
        "stopping": (CTL / "STOP").exists(), "counts": counts, "total": len(stories), "phase_limit": open_phase_limit(stories, items, cfg) if stories else None,
        "queue": queue, "stories": rows, "runs": runs[-80:], "metrics": metrics(runs, cfg), "events": ev, "salvage": salvage, "branches": branch_info,
        "ahead": ahead, "last_promote": read_json(STATE / "promote.json", {}), "roadmap_error": rm_err, "roadmap_hash": (rm["hash"][:8] if stories else ""),
        "supervisor": read_json(STATE / "supervisor.json", {}),
    }


def cmd_status(a) -> int:
    cfg = load_config()
    s = build_state(cfg)
    u = s["usage"].get("claude") or {}
    print(f"RC loop · {s['ctl']} · branch {cfg['branch']} → {cfg['promote_to']} (ahead {s['ahead']}) · {'PAUSED' if s['paused'] else 'running'}")
    if u.get("ok"):
        print(f"usage: 5h {u['session']['pct']:.0f}% (resets {iso(u['session']['resets_at'])}) · weekly {u['weekly']['pct']:.0f}% (resets {iso(u['weekly']['resets_at'])}) · scoped {', '.join(f'{k} {v['pct']:.0f}%' for k, v in (u.get('scoped') or {}).items()) or '-'}")
    else:
        print(f"usage: unavailable ({u.get('error')})")
    print(f"verdict claude: {s['verdicts']['claude']}")
    print(f"stories: {s['counts']} of {s['total']} · phase gate P{s['phase_limit']}")
    for sl in s["slots"]:
        hb = sl["hb"]
        print(f"slot {sl['slot']} [{sl['cfg'].get('backend')}] {'alive' if sl['alive'] else 'DOWN'} · {hb.get('state', '?')} {hb.get('item', '')} since {iso(hb.get('since'))} · {sl['idle'].get('reason', '')} · {sl['live'].get('last_tool', '')[:80]}")
    print("queue:", ", ".join(f"{q['id']}({q['size']})" for q in s["queue"][:10]))
    m = s["metrics"].get("all") or {}
    print(f"metrics: {m.get('landed', 0)} landed / {m.get('runs', 0)} runs · {m.get('tokens_per_fp')} tokens/FP · ${m.get('cost_per_fp')}/FP")
    for e in s["events"][-8:]:
        print(" ", e)
    return 0


def cmd_state(a) -> int:
    print(json.dumps(build_state(load_config(), fresh_usage=a.fresh), default=str))
    return 0


# ----------------------------------------------------------------------------- serve: dashboard + supervisor


class Supervisor:
    """Keeps one run-loop.sh per enabled slot alive; scaling is just editing config.slots."""

    def __init__(self):
        self.procs: dict[int, subprocess.Popen] = {}
        self.stop = threading.Event()

    def reconcile(self):
        cfg = load_config()
        want = {i + 1 for i, s in enumerate(cfg["slots"]) if s.get("enabled", True)}
        if (CTL / "STOP").exists():
            want = set()
        for i in list(self.procs):
            if self.procs[i].poll() is not None:
                del self.procs[i]
        # adopt runners started by hand
        for i in range(1, len(cfg["slots"]) + 1):
            pid = read_json(STATE / f"slot-{i}" / "runner.json", {}).get("pid")
            if i not in self.procs and _pid_alive(pid):
                continue
            if i in want and i not in self.procs and not _pid_alive(pid):
                if (CTL / f"STOP-{i}").exists():
                    (CTL / f"STOP-{i}").unlink()
                log = open(CTL / f"summary-{i}.log", "a")
                self.procs[i] = subprocess.Popen([str(HERE / "run-loop.sh"), str(i)], cwd=str(CTL), stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
                                                 env={**os.environ, "LOOP_CTL": str(CTL)})
                event(f"supervisor started slot {i} (pid {self.procs[i].pid})")
        for i in range(1, 32):
            pid = read_json(STATE / f"slot-{i}" / "runner.json", {}).get("pid")
            if i not in want and _pid_alive(pid) and not (CTL / f"STOP-{i}").exists():
                (CTL / f"STOP-{i}").touch()
                event(f"supervisor asked slot {i} to stop after its run")
        write_json(STATE / "supervisor.json", {"pid": os.getpid(), "at": now(), "children": {i: p.pid for i, p in self.procs.items()}})

    def run(self):
        while not self.stop.is_set():
            try:
                self.reconcile()
            except Exception as e:  # noqa: BLE001
                event(f"supervisor error: {e}")
            self.stop.wait(15)


def kill_slot(i: int, why: str) -> None:
    """Immediate stop: the runner's process group, agent included. Its next start salvages the tree."""
    pid = read_json(STATE / f"slot-{i}" / "runner.json", {}).get("pid")
    if not _pid_alive(pid):
        return
    try:
        os.killpg(os.getpgid(int(pid)), signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        pass
    event(f"slot {i} killed now ({why})", f"slot-{i}")


def apply_command(verb: str, arg: str) -> str:
    cfg = load_config()
    if verb == "pause":
        (CTL / "PAUSE").touch()
    elif verb == "unpause":
        (CTL / "PAUSE").unlink(missing_ok=True)
    elif verb == "stop":
        (CTL / "STOP").touch()
    elif verb == "unstop":
        (CTL / "STOP").unlink(missing_ok=True)
        for i in range(1, len(cfg["slots"]) + 1):
            (CTL / f"STOP-{i}").unlink(missing_ok=True)
    elif verb == "scale":
        n = max(0, min(12, int(arg)))
        slots = cfg["slots"]
        while len(slots) < n:
            slots.append(dict(DEFAULT_CONFIG["slots"][0]))
        for i, s in enumerate(slots):
            s["enabled"] = i < n
        save_config(cfg)
    elif verb == "slot-stop":
        (CTL / f"STOP-{int(arg)}").touch()
    elif verb == "slot-kill":
        kill_slot(int(arg), "dashboard")
    elif verb == "slot-start":
        i = int(arg)
        (CTL / f"STOP-{i}").unlink(missing_ok=True)
        (CTL / "STOP").unlink(missing_ok=True)
        cfg["slots"][i - 1]["enabled"] = True
        save_config(cfg)
    elif verb == "slot-disable":
        i = int(arg)
        cfg["slots"][i - 1]["enabled"] = False
        save_config(cfg)
    elif verb == "slot-set":  # arg: JSON {slot, backend?, model?, effort?, sizes?, lanes?}
        d = json.loads(arg)
        s = cfg["slots"][int(d.pop("slot")) - 1]
        s.update({k: v for k, v in d.items() if k in ("backend", "model", "effort", "sizes", "lanes")})
        save_config(cfg)
    elif verb in ("skip", "unskip", "pin", "unpin"):
        sid, _, reason = arg.partition(" ")
        cmd_set(argparse.Namespace(cmd=verb, id=sid, reason=reason, status=None))
    elif verb == "set-status":
        sid, _, rest = arg.partition(" ")
        status, _, reason = rest.partition(" ")
        cmd_set(argparse.Namespace(cmd="set", id=sid, reason=reason, status=status))
    elif verb == "release":
        cmd_release(argparse.Namespace(id=arg, outcome="deferred", metrics=None))
    elif verb == "promote":
        (STATE / "promote.json").parent.mkdir(parents=True, exist_ok=True)
        write_json(STATE / "promote-now", {"at": now()})
    elif verb == "refresh-usage":
        get_usage(cfg, fresh=True)
    elif verb == "config":  # arg: JSON patch
        save_config(deep_merge(cfg, json.loads(arg)))
    else:
        return f"unknown verb {verb}"
    event(f"dashboard: {verb} {arg}".strip())
    return "ok"


def cmd_serve(a) -> int:
    cfg = load_config()
    CTL.mkdir(parents=True, exist_ok=True)
    save_config(cfg)  # materialise defaults so the operator can see and edit them
    sup = Supervisor()
    threading.Thread(target=sup.run, daemon=True).start()

    def poll():
        while True:
            try:
                get_usage(load_config())
            except Exception as e:  # noqa: BLE001
                event(f"usage poll error: {e}")
            time.sleep(load_config()["usage"]["poll_s"])
    threading.Thread(target=poll, daemon=True).start()
    page = (HERE / "dashboard.html").read_bytes()

    class H(BaseHTTPRequestHandler):
        def log_message(self, *args):  # quiet
            pass

        def _send(self, code, body, ctype="application/json"):
            self.send_response(code)
            self.send_header("content-type", ctype)
            self.send_header("cache-control", "no-store")
            self.send_header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/":
                return self._send(200, page, "text/html; charset=utf-8")
            if self.path.startswith("/api/state"):
                fresh = "fresh=1" in self.path
                return self._send(200, json.dumps(build_state(load_config(), fresh_usage=fresh), default=str).encode())
            if self.path.startswith("/api/log?"):
                q = dict(x.split("=", 1) for x in self.path.split("?", 1)[1].split("&") if "=" in x)
                p = Path(q.get("path", ""))
                if not str(p).startswith(str(CTL)) or not p.exists():
                    return self._send(404, b"{}")
                data = p.read_bytes()[-int(q.get("bytes", 60000)):]
                return self._send(200, data, "text/plain; charset=utf-8")
            return self._send(404, b"{}")

        def do_POST(self):
            n = int(self.headers.get("content-length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            if self.path == "/api/cmd":
                try:
                    msg = apply_command(body.get("verb", ""), str(body.get("arg", "")))
                except Exception as e:  # noqa: BLE001
                    msg = f"error: {e}"
                return self._send(200, json.dumps({"result": msg}).encode())
            return self._send(404, b"{}")

    port = int(a.port or cfg["dashboard_port"])
    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    event(f"dashboard up at http://127.0.0.1:{port}")
    print(f"dashboard: http://127.0.0.1:{port}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


# ----------------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("claim"); p.add_argument("--slot", required=True); p.add_argument("--run", required=True); p.add_argument("--repo")
    p = sub.add_parser("release"); p.add_argument("--id", required=True); p.add_argument("--outcome", required=True); p.add_argument("--metrics")
    for v in ("skip", "unskip", "pin", "unpin"):
        p = sub.add_parser(v); p.add_argument("--id", required=True); p.add_argument("--reason", default=""); p.set_defaults(status=None)
    p = sub.add_parser("set"); p.add_argument("--id", required=True); p.add_argument("--status", required=True); p.add_argument("--reason", default="")
    p = sub.add_parser("render"); p.add_argument("--item", required=True); p.add_argument("--out", required=True); p.add_argument("--journal", required=True); p.add_argument("--worktree", required=True); p.add_argument("--slot", required=True)
    p = sub.add_parser("result"); p.add_argument("--log", required=True); p.add_argument("--backend", default="claude")
    p = sub.add_parser("usage"); p.add_argument("--fresh", action="store_true")
    p = sub.add_parser("slot-env"); p.add_argument("--slot", required=True)
    p = sub.add_parser("roadmap-sync"); p.add_argument("--file", required=True)
    sub.add_parser("status")
    p = sub.add_parser("state"); p.add_argument("--fresh", action="store_true")
    p = sub.add_parser("serve"); p.add_argument("--port")
    p = sub.add_parser("cmd"); p.add_argument("verb"); p.add_argument("arg", nargs="?", default="")
    a = ap.parse_args()
    if a.cmd == "claim":
        return cmd_claim(a)
    if a.cmd == "release":
        return cmd_release(a)
    if a.cmd in ("skip", "unskip", "pin", "unpin", "set"):
        return cmd_set(a)
    if a.cmd == "render":
        return cmd_render(a)
    if a.cmd == "result":
        return cmd_result(a)
    if a.cmd == "usage":
        print(json.dumps(get_usage(load_config(), fresh=a.fresh), indent=1, default=str))
        return 0
    if a.cmd == "slot-env":
        return cmd_slot_env(a)
    if a.cmd == "roadmap-sync":
        return cmd_roadmap_sync(a)
    if a.cmd == "status":
        return cmd_status(a)
    if a.cmd == "state":
        return cmd_state(a)
    if a.cmd == "serve":
        return cmd_serve(a)
    if a.cmd == "cmd":
        print(apply_command(a.verb, a.arg))
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
