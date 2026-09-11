#!/usr/bin/env python3
"""Push each unfinished story's text from RC_ROADMAP.md into the dispatcher task store.

`dispatch.py migrate` creates tasks for NEW story ids but never rewrites an existing task, so an
`Owns:` widened in the roadmap after a write-fence block, an amended `Acceptance:`, or a changed
`Deps:` line reaches the store only through `task.update`. This script does that for every task
that is not succeeded/cancelled, using the dispatcher's own parser and ownership resolver so the
result matches what a fresh import would produce, plus two deliberate differences:

- paths the story names that do not resolve against the tree (a new directory) are kept as
  intended paths when they start under a known root, instead of being dropped;
- priority follows phase (P0/P1 70 · P2 60 · P3 50 · P4 40 · rolling 30) so that, with the phase
  gate off, earlier phases still win a free worker.

    tools/roadmap/sync-tasks.py            # dry run: prints the patches
    tools/roadmap/sync-tasks.py --apply    # sends task.update for each changed task
    tools/roadmap/sync-tasks.py --ref origin/loop/rc   # parse that ref instead of the working tree
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DISPATCHER = ROOT.parent / "agent-dispatcher"
ROADMAP = "docs/planning/RC_ROADMAP.md"
PREFIXES = ["apps/gm-react/src", "apps/gm-react", "packages/core/src", "packages/core"]
KNOWN_ROOTS = ("apps/", "packages/", "docs/", "scripts/", "tests/", ".github/", "infra/", "tools/")
PRIORITY = {"P0": 70, "P1": 70, "P2": 60, "P3": 50, "P4": 40, "rolling": 30}


def load(name: str, rel: str):
    spec = importlib.util.spec_from_file_location(name, DISPATCHER / rel)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def dispatch(op: str, args: dict) -> dict:
    env = {"id": str(uuid.uuid4()), "op": op, "args": args}
    out = subprocess.run([str(DISPATCHER / ".venv/bin/python"), str(DISPATCHER / "dispatch.py"), "command", json.dumps(env)],
                         capture_output=True, text=True)
    try:
        reply = json.loads(out.stdout)
    except json.JSONDecodeError:
        raise SystemExit(f"{op} {args.get('id')}: {out.stdout[:400]} {out.stderr[:400]}")
    if reply.get("status") != "succeeded":
        raise SystemExit(f"{op} {args.get('id')}: {json.dumps(reply)[:600]}")
    return reply["result"]


def intended(raw: str, prefixes: list[str], tracked: set[str]) -> str | None:
    """A story path that resolves to nothing but starts under a known root is still the story's intent."""
    if raw.startswith(KNOWN_ROOTS):
        return raw
    if "/" not in raw:
        return None  # a bare filename is resolved by suffix match or not at all; never invent a home for it
    for prefix in prefixes:
        candidate = prefix.rstrip("/") + "/" + raw
        parent = candidate.rsplit("/", 1)[0]
        if parent in tracked:
            return candidate
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--ref", default=None, help="git ref to read the roadmap from (default: working tree)")
    ap.add_argument("--project", default="dndtools")
    ap.add_argument("--only", nargs="*", default=None, help="restrict to these story ids")
    args = ap.parse_args()
    rc = load("rc", "dispatcher/sources/rc.py")
    migration_src = (DISPATCHER / "dispatcher/migration.py").read_text()
    # resolve_ownership/_intended_path are pure; lift them without importing the package.
    ns: dict = {}
    start = migration_src.index("def resolve_ownership")
    end = migration_src.index("def source_tasks")
    exec("from pathlib import Path\n" + migration_src[start:end], ns)
    resolve_ownership = ns["resolve_ownership"]

    text = (subprocess.run(["git", "show", f"{args.ref}:{ROADMAP}"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
            if args.ref else (ROOT / ROADMAP).read_text())
    tree = subprocess.run(["git", "ls-tree", "-r", "--name-only", args.ref or "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.splitlines()
    tracked = set(tree)
    for p in tree:
        tracked.update(str(parent) for parent in Path(p).parents if str(parent) != ".")
    stories = rc.parse_roadmap(text)["stories"]
    status = json.loads(subprocess.run([str(DISPATCHER / ".venv/bin/python"), str(DISPATCHER / "dispatch.py"), "status"],
                                       capture_output=True, text=True, check=True).stdout)
    tasks = {t["id"]: t for t in status["tasks"] if t.get("project") == args.project}
    changed = 0
    for sid, story in sorted(stories.items()):
        task = tasks.get(sid)
        if not task or task["status"] in ("succeeded", "cancelled"):
            continue
        if args.only and sid not in args.only:
            continue
        owns = set(resolve_ownership(story["owns"], tree, PREFIXES)) - {"*"}
        for raw in story["owns"]:
            if raw in tracked:
                owns.add(raw)
                continue
            hit = intended(raw, PREFIXES, tracked)
            if hit:
                owns.add(hit)
        owns = sorted(owns) or ["*"]
        patch = {}
        if task.get("description") != story["body"]:
            patch["description"] = story["body"]
        if story["acceptance"] and task.get("acceptance") != [story["acceptance"]]:
            patch["acceptance"] = [story["acceptance"]]
        deps = story["deps"] + story["unknown_deps"]
        if task.get("dependencies") != deps:
            patch["dependencies"] = deps
        if task.get("owns") != owns:
            patch["owns"] = owns
        if task.get("size") != story["size"]:
            patch["size"] = story["size"]
        prio = PRIORITY.get(story["phase"], 50)
        if int(task.get("priority", 50)) < 90 and int(task.get("priority", 50)) != prio:
            patch["priority"] = prio
        if not patch:
            continue
        changed += 1
        print(f"{sid} ({task['status']}, rev {task['revision']}): " + ", ".join(
            f"{k}={json.dumps(v)[:120]}" for k, v in patch.items()))
        if args.apply:
            if task["status"] == "running":
                print("   skipped: task is running; pause and drain first")
                continue
            dispatch("task.update", {"project": args.project, "id": sid, "revision": task["revision"], "patch": patch})
    print(f"{changed} task(s) {'updated' if args.apply else 'would change'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
