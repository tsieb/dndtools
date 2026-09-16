# RC-CHR-5.2 run journal

## Scope

Builder step polish in `app/charBuilder/*`: point-buy / standard-array / roll score methods, class
preview cards built from the active package's features, the import review diff against a same-named
roster character, and Stepper/StepRail a11y. Acceptance: e2e; the `verify:ui` CharBuilder case.
No agents, dispatcher mutations, push or promotion.

## Attempt 5 (2026-09-16) — answering the independent review of `2495a9c8`

The reviewer confirmed all eight gates green on that head and rejected it on two findings.

### Finding 1 (high) — the newly exposed Roll mode cannot finalize an ordinary rolled PC

Reproduced and root-caused. `validateDraftStep('abilities', …)` is the CHAR-002 prototype rule: each
score 8–15, 27 point-buy points, applied to EVERY PC draft; `finalize-draft` rejects on the same
report. An ordinary 4d6-drop-lowest spread (`[16,13,14,8,12,10]` in the reviewer's `pc-roll-repro.log`)
can therefore never be created, and swapping the assignment cannot help. Nothing downstream can repair
it either: `character.edit-field` only reaches `name`, `combat.*` and `data.*`
(`character-collaboration.ts:40`), and `character.quick-create`'s `kind` enum excludes `pc` (CHAR-001).

**The core fix was built, proven, and then reverted — deliberately.** The shape that works is an
optional DM-supplied `abilityScorePool` on `character.create-draft`, recorded on `CharacterDraft`, with
the abilities step valid when its scores are a PERMUTATION of that pool and the point-buy budget not
applied. DM-only, so the owning player may only rearrange the dice the DM witnessed. On that branch:

- `pnpm test:critical`: 273 files, 4785 tests passed, including six new pool cases (pool recorded;
  point buy rejects `[16,…]` while the pool accepts it; invented or duplicated scores rejected; a
  rolled PC finalizes with `{str:16,…}` intact; a mis-sized pool and a pool no die can produce both
  rejected at `create-draft`; a pool-less draft still on point buy).
- A new PC e2e case rolled until the dice left 8–15, created the PC, and asserted the roster scores
  equalled the rolled ones: 10/10 across desktop-chromium and mobile-chromium. With only the
  `create-draft` payload sabotaged it failed exactly as reported (the character is never created).

It cannot ship here. The write fence is `owns` + `journal_paths` + `companion_paths`
(`dispatcher/engine.py:793-807`), and `owns` is `apps/gm-react/src/app/charBuilder`. Three of the files
the fix needs — `packages/core/src/state/character-draft-flow.ts`, `.../character-state.ts`,
`packages/core/src/commands/character.ts` — are outside every granted scope, so the candidate would
`raise RuntimeError("candidate changes paths outside its claim")` before any gate ran. (`index.ts` and
`schemas/commands.ts` ARE companions; the rule modules are not.)

What shipped instead, inside the fence: **the guided PC path no longer offers Roll.** `methodChoices`
is derived from the kind, and a method picked under another kind falls back legal the same way `clsId`
/ `bgId` already do — so switching NPC→PC with Roll selected lands on the dealt standard array rather
than stranding the step. The note under the methods now says why, on every PC method that does not
already state the rule. The core prerequisite is recorded as **DEBT-2026-006** with the prototyped
shape, so it is tracked rather than dropped. This narrows the story's "roll mode" on the PC path; that
is stated here and in the commit rather than papered over.

### Finding 2 (medium) — the import diff omits changes inside fields it calls matching

Fixed as asked. `importDiff.ts` reduced attacks and spells to names and skills to keys, so the three
changes in the reviewer's `import-diff-repro.log` all reported `changed: false`. Each list entry now
carries the values the import actually writes — `warhammer (+4 to hit)`,
`cure wounds (level 1, prepared)`, `religion (expertise)` — while list ORDER and CASE stay normalized
away, so a reordered or re-cased export is still not a change. Three new unit cases cover exactly the
reviewer's three repros; the existing "identical copy" fixture now carries `+4 TO HIT` so it still
proves the case-insensitivity it was written for.

## Validation results

- `pnpm typecheck`: clean (core, cloud-fns, gm-react).
- `pnpm lint`: 0 errors (15 pre-existing warnings, none in files this task touches); boundary lint and
  the non-text contrast gate passed.
- `pnpm test:app`: 125 files, 1304 tests passed (1301 before, +3 import-diff cases).
- `pnpm test:critical`: 273 files, 4785 tests passed on the reverted-core tree as well.
- `prettier --check` on every changed file: clean.
- `playwright test tests/e2e/char-builder-steps.spec.ts`: 12/12 across desktop-chromium and
  mobile-chromium, including the two new PC-path cases (a PC is offered only the methods it can
  finalize, and creates with the dealt standard array; an NPC roll survives the switch to PC).
- `verify:ui` on an isolated dev server (`REACT_URL=http://localhost:5841`, `NODE_PATH` set to resolve
  the hoisted Playwright): **`✓ Characters · New character  ops 41→52`** — the required case. The
  script exits 1 on three out-of-scope cases (`Atlas · builder POI place`, `Session · Build encounter`,
  `Board · safe-point round-trip`); the independent reviewer observed the same three on the unchanged
  candidate, and this task changes nothing under Atlas, Session or Board. No full `verify:ui` pass is
  claimed.
- Fence re-checked against `manifests/dndtools.json` after the revert: every changed path is inside
  `owns`, `companion_paths` or `journal_paths`.
- Not run here: the full Playwright suite and `pnpm build` are the operator's gates.
