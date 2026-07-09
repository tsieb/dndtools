---
name: adr
description: Draft, supersede, or amend an Architecture Decision Record in docs/adr/, and correctly update the ADR index table in docs/adr/README.md — including the two-way supersedes/amended-by cross-links this repo uses. Use when the user says "write an ADR", "record this decision", "this supersedes ADR-0nn", "amend ADR-0nn", or when a change materially alters runtime boundaries, storage, security, or platform strategy (which is the repo's own bar for requiring an ADR).
---

# Writing an ADR

An ADR here is a real contract, not a note. The repo's own bar (`docs/adr/README.md`): record decisions that **materially affect runtime boundaries, storage, security, or platform strategy**. If the decision does not clear that bar, say so and write a code comment or a doc update instead.

Two files change on every ADR, always: the ADR itself, and the index table in `docs/adr/README.md`. A superseding ADR changes **three or more** — because the old ADR must point forward.

## 1. Pick the number

`ls docs/adr/` and take the next free integer, zero-padded to three digits. Filename: `NNN-kebab-case-title.md`. Numbers are never reused, never reordered.

## 2. Draft from the template

Copy `docs/adr/000-template.md` and fill **every** section. Do not delete sections you find inconvenient — `Rollback Plan` and `Verification and Evidence` are exactly the ones that get skipped and exactly the ones that matter later.

Header block:

```markdown
# ADR-0NN: Title In Title Case

- Status: Proposed | Accepted | Superseded | Deprecated
- Date: YYYY-MM-DD
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A
```

Section guidance, as this repo actually uses them:

- **Context** — the constraint that forces a decision *now*. Name the concrete pressure (two apps against one core; deferred crypto blocking a gate).
- **Decision** — one concrete, testable statement. Name the exact paths and package names affected (`apps/gm-react`, `@dndtools/core`).
- **Consequences → Positive / Negative** — the negatives are load-bearing. An ADR with no tradeoffs was not a decision.
- **Rejected Alternatives** — a table. Future ADRs cite these rows when they reverse you (ADR-018 explicitly supersedes ADR-014's React-rejecting row).
- **Migration Impact** — code/data contracts, rollout sequencing, test changes, back-compat.
- **Rollback Plan** — trigger conditions, technical steps, data recovery, known risks. If rollback is *impossible*, write that; it is a real finding.
- **Verification and Evidence** — file paths, tests, runbooks that prove the ADR maps to implementation. This is what an auditor reads.

## 3. Cross-link, in both directions

The repo distinguishes **supersedes** (the old decision's position is reversed) from **amended by** (the old decision stands, but one part of it changed). Both are two-way links.

### Superseding ADR-0MM with ADR-0NN

In the **new** ADR's header — be specific about *which position* is superseded, not just the number:

```markdown
- Supersedes: the "Svelte is the primary and only GM app" position of ADR-016; the React-rejecting
  rationale in ADR-014's rejected-alternatives table.
```

In the **old** ADR (`0MM`), change the `Status:` line to link forward, and add a dated `Superseded-by:` line directly under `Supersedes:`:

```markdown
- Status: Superseded by [ADR-0NN](./0NN-slug.md)
...
- Supersedes: N/A
- Superseded-by: ADR-0NN (YYYY-MM-DD) — one line on exactly what was reversed.
```

### Amending ADR-0MM with ADR-0NN

The old ADR keeps `Status: Accepted` but annotates it, and gains an `Amended by:` line:

```markdown
- Status: Accepted (amended by ADR-0NN)
- Amended by: ADR-0NN (what it supplies or narrows) — …
```

Use *amended* when the old ADR is still the governing decision (ADR-015's security model stayed Accepted once ADR-017 supplied its deferred crypto). Use *superseded* when its position is no longer true.

A partial reversal is both: ADR-016 reads `Accepted (amended by ADR-018)` while ADR-018's header names the specific ADR-016 position it supersedes. When in doubt, prefer the narrower `amended` and spell out the reversed clause in prose.

## 4. Update the index table

`docs/adr/README.md` holds a four-column table: `ADR | Status | Summary | File`.

- Append a row for the new ADR, in number order.
- **Also edit the row of every ADR you superseded or amended** — its `Status` cell becomes `Superseded by ADR-0NN` or `Accepted (amended by ADR-0NN)`, and its `Summary` cell gains a clause saying which part changed. A stale index row is the most common defect here: the ADR file says superseded, the table still says Accepted.
- `Summary` is one sentence in the past/present indicative, not a title. `File` is a relative markdown link.

## 5. Format and check

There is **no `docs:validate` script in this repo** (it existed historically) — nothing mechanically enforces the index. Verify by hand, then normalize only what you touched:

```bash
pnpm exec prettier --write docs/adr/README.md docs/adr/0NN-your-adr.md
```

**Do not run a bare `pnpm format`.** The repo currently has a standing ~513-file prettier warning (`docs/adr/README.md` among them), so a repo-wide rewrite buries your ADR in hundreds of unrelated changes. `pnpm format:check` is what CI runs, and it is `optional: true` in the validate harness — a warn, not a gate.

Verify the index mechanically — this catches the most common defect, a Status cell that disagrees with the ADR file:

```bash
python3 - <<'EOF'
import re, glob
files = {}
for f in sorted(glob.glob('docs/adr/0[0-9][0-9]-*.md')):
    if f.endswith('000-template.md'): continue
    s = re.search(r'^- Status: (.+)$', open(f).read(), re.M).group(1).strip()
    files['ADR-' + f.split('/')[-1][:3]] = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', s)
idx = dict(re.findall(r'^\| (ADR-\d{3}) \| ([^|]+?) \|', open('docs/adr/README.md').read(), re.M))
for n, s in files.items():
    i = idx.get(n, '<MISSING ROW>').strip()
    print(('OK  ' if s == i else 'MISMATCH') + f' {n}: file={s!r} index={i!r}')
EOF
```

Final read-through, in this order: (1) does the new ADR's `Supersedes:` name a *position*, not just a number? (2) does every superseded/amended ADR link **forward** to the new one? (3) does the index table's Status cell match each ADR file's own Status line? (4) does `Verification and Evidence` cite paths that exist?
