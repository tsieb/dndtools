#!/usr/bin/env python3
"""Render the dispatcher task store into the §23 status column of docs/planning/RC_ROADMAP.md.

The dispatcher's task store is the status of record (RC-DOC-2.1). This script never edits story
text; it rewrites only the last cell of every `| RC-… |` row in §23 and the summary line above the
table. Run it before each promotion, or whenever §23 looks stale:

    tools/roadmap/sync-status.py                 # reads `dispatch.py status` from ../agent-dispatcher
    tools/roadmap/sync-status.py --status-json f # from a saved status blob
    tools/roadmap/sync-status.py --format        # also runs Prettier on the file

Status cells: `done (sha7)` for succeeded (the integrated head, or the sha already in the cell),
`in progress` for running/review, `blocked(<class>)` for blocked, `operator` for proposed owner
steps, `skipped` for cancelled, blank for ready.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROADMAP = ROOT / "docs/planning/RC_ROADMAP.md"
DISPATCHER = ROOT.parent / "agent-dispatcher"
ROW = re.compile(r"^\| (RC-[A-Z]+-\d+\.\d+)\s+\|")
SUMMARY = re.compile(r"^_\d+ stories\. .*_$")


def load_status(path: str | None) -> dict:
    if path:
        return json.loads(Path(path).read_text())
    out = subprocess.run([str(DISPATCHER / ".venv/bin/python"), str(DISPATCHER / "dispatch.py"), "status"],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def cell(task: dict | None, previous: str) -> str:
    if task is None:
        return previous
    st = task.get("status")
    if st == "succeeded":
        sha = (task.get("head_sha") or "")[:7]
        if not sha:
            m = re.search(r"\(([0-9a-f]{7,40})\)", previous)
            sha = m.group(1)[:7] if m else ""
        return f"done ({sha})" if sha else "done"
    if st == "cancelled":
        # A cancelled task whose cell already says `done` was completed outside the dispatcher
        # (recorded in the roadmap with evidence); keep that record.
        return previous if previous.startswith(("skipped", "done")) else "skipped"
    if st == "proposed":
        return "operator" if (task.get("metadata") or {}).get("operator") else "proposed"
    if st == "blocked":
        b = str(task.get("blocker") or "").lower()
        kind = ("write fence" if "outside its claim" in b else "rebase" if "rebase" in b
                else "review" if "review" in b else "attempts" if "attempt" in b else "blocked")
        return f"blocked({kind})"
    if st in ("running", "review"):
        return "in progress"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status-json")
    ap.add_argument("--format", action="store_true", help="run Prettier on the roadmap afterwards")
    ap.add_argument("--project", default="dndtools")
    args = ap.parse_args()
    status = load_status(args.status_json)
    tasks = {t["id"]: t for t in status.get("tasks", []) if t.get("project") == args.project}
    lines = ROADMAP.read_text().splitlines()
    tally: Counter[str] = Counter()
    sizes: Counter[str] = Counter()
    phases: Counter[str] = Counter()
    changed = 0
    for i, line in enumerate(lines):
        m = ROW.match(line)
        if not m:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 7:
            continue
        new = cell(tasks.get(m.group(1)), cells[6])
        sizes[cells[3]] += 1
        phases[cells[4]] += 1
        tally[new.split("(")[0].strip() or "open"] += 1
        if new != cells[6]:
            cells[6] = new
            lines[i] = "| " + " | ".join(cells) + " |"
            changed += 1
    total = sum(sizes.values())
    summary = (f"_{total} stories. By size: " + " · ".join(f"{k}={v}" for k, v in sorted(sizes.items()))
               + ". By phase: " + " · ".join(f"{k}={v}" for k, v in sorted(phases.items()))
               + ". Status (from the dispatcher store): " + " · ".join(f"{k} {v}" for k, v in sorted(tally.items()))
               + ". Rendered by `tools/roadmap/sync-status.py`; the store, not this column, is the record._")
    for i, line in enumerate(lines):
        if SUMMARY.match(line):
            if lines[i] != summary:
                lines[i] = summary
                changed += 1
            break
    ROADMAP.write_text("\n".join(lines) + "\n")
    print(f"{changed} row(s) updated; {dict(tally)}")
    if args.format:
        subprocess.run(["pnpm", "exec", "prettier", "--write", str(ROADMAP)], cwd=ROOT, check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
