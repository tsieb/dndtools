# Completion — UX-CHAR-roster-creation-and-draft-ownership

UX workpack status: `complete`

Epic: Character Roster, Creation, and Draft Ownership (phase "06 Core Library Workspaces", P1).
Requirement coverage: `UX-CHAR-001` (`UX-CHAR-001-S01`), `UX-CHAR-002` (`UX-CHAR-002-S01`),
`UX-CHAR-011` (`UX-CHAR-011-S01`), `UX-CHAR-013` (`UX-CHAR-013-S01`).

## Summary

Turned `/characters` from a stacked document list into a **suite**: a role-differentiated command
workspace built on the design tokens. The DM gets a two-column layout — a primary column with the
party vitals board + roster, and an authoring rail with quick-create + draft ownership — over a
single-mount "Character tools" region (collaboration, combat resources, advancement, data exposure,
journal) carried over from the functional epics. A player gets their guided creation **wizard** as
the hero, then the party/roster. An observer gets the actor-filtered (empty) party board.

Four surfaces were rebuilt to the UX contract while preserving every existing functional test id and
command-dispatch path (Contract 1 — the GUI never writes character state directly):

- **UX-CHAR-001 quick-create** (`CharacterQuickCreate.svelte`): the five speed fields (Kind, Name,
  HP, AC, Visibility) plus an optional disclosure (attack row + dm-only notes). Name autofocuses,
  the submit button names the selected kind ("Create Monster"), numeric inputs use
  `inputmode="numeric"` with the native steppers hidden, `aria-busy` during submit, and a success
  toast announces "<Name> created as <Kind>" with an **Open sheet** affordance that reveals + focuses
  the new roster card. An empty name shows an inline `aria-describedby`-linked error and returns
  focus to Name (`novalidate` so the custom inline error UX runs instead of the native popup).
  Visibility defaults to **dm-only** (fail closed).
- **UX-CHAR-002 creation wizard** (`CharacterDraftFlow.svelte`): a `role="tablist"` step rail with
  per-step status markers (empty ○ / valid ✓ / has-issues !), a `role="tabpanel"` content area, a
  live **"What you get"** preview (background/class labels; ability modifiers + live point-buy budget
  used), an autosave **"Saved just now"** indicator that folds back into the step status, Back +
  Save-&-continue navigation (first-time valid completion advances; revising stays), an
  `aria-live` "Step N of 3" announcement, and a finalize gate that lists the remaining issues. Focus
  lands on the first input of the resumed step on open. Resumability and validation are unchanged
  (read from the persisted draft).
- **UX-CHAR-011 party / roster overview** (`PartyOverview.svelte`, `CharacterRoster.svelte`, new
  `ux-char/HpBar.svelte` + `hp-tone.ts`): glanceable member cards with a `role="meter"` **HP bar**
  (green/amber/red by the `hp-tone` thresholds), AC badge, condition pills (max 2 + "+N more"), a
  **critical red-accent** card under 25% HP, keyboard/touch **Up/Down** marching-order controls, the
  visibility-tagged party inventory, and a DM-only "N characters … hidden from players" line. An
  observer gets "No party information available." (CHAR-015).
- **UX-CHAR-013 draft ownership** (`CharacterDraftManager.svelte`): per-draft cards showing owner
  (or "Unassigned"), **step completion** ("N of 3 steps"), and a Finalized badge. Transfer and
  revoke are now safety-critical **confirmation dialogs** (`alertdialog`, no backdrop dismiss) that
  name the players involved before any command is dispatched; the transfer picker lives on each card
  and excludes the current owner.

## Demo path / surfaces

`/characters` with the header `View as` switch (DM / Demo Player / Demo Player 2 / observer).

- **DM:** quick-create an NPC (defaults dm-only) → success toast → Open sheet focuses the roster
  card. Create a draft for a player; transfer it (confirm dialog names both players); revoke it
  (confirm dialog → draft removed). Watch the party board's HP bars + AC badges; reorder marching
  order with ↑/↓; add a player-visible inventory item.
- **Player:** open the assigned draft → the wizard opens on the first incomplete step with focus on
  its input; the rail shows prior completion; saving a step shows "Saved just now" and advances;
  the preview updates live; finalize is gated with a remaining-issues list.
- **Observer:** the party board reads "No party information available."; no member/inventory names
  leak.

## Requirement coverage / traceability

| Requirement / AC | Implementation | Test |
|---|---|---|
| **UX-CHAR-001** ≤7-field quick-create, defaults, dynamic "Create [Kind]", success toast + Open sheet, inline error → focus Name, numeric/aria-busy/touch | `apps/gm/src/lib/gui/CharacterQuickCreate.svelte` | e2e `character-ux-suite.spec.ts` (dynamic button text, toast + Open-sheet focus, empty-name error+focus); existing `character-creation-and-drafts.spec.ts` CHAR-001 (dm-only default non-leak) |
| **UX-CHAR-002** step rail + status, one decision/step, live preview, autosave indicator, resume focus, finalize gate w/ issues | `apps/gm/src/lib/gui/CharacterDraftFlow.svelte` | existing `character-creation-and-drafts.spec.ts` CHAR-002 (resume, finalize, over-budget validation, non-owner fail-closed) — all green against the rebuilt rail |
| **UX-CHAR-011** HP meter + thresholds, critical border, condition pills, Up/Down order, inventory, hidden count, observer empty | `apps/gm/src/lib/gui/PartyOverview.svelte`, `CharacterRoster.svelte`, `ux-char/HpBar.svelte`, `ux-char/hp-tone.ts` | unit `ux-char/hp-tone.test.ts` (threshold/critical boundaries); e2e `character-ux-suite.spec.ts` (meter role + live `aria-valuenow`, non-critical at full HP); existing `character-party-and-player-records.spec.ts` CHAR-011/015 |
| **UX-CHAR-013** owner/step/finalized states, transfer+revoke confirmation dialogs naming players | `apps/gm/src/lib/gui/CharacterDraftManager.svelte` (a11y `Dialog` alertdialog) | e2e `character-ux-suite.spec.ts` (revoke confirm + cancel dispatches nothing); updated `character-creation-and-drafts.spec.ts` CHAR-013 (transfer confirm dialog → exactly one owner) |

## Actor-safety / no-leak evidence

- Every surface renders ONLY from the core's actor-filtered queries (`listCharactersForActor`,
  `getPartyOverviewForActor`, `listDraftsForActor`, `getDraftForActor`); the GUI never re-derives
  visibility. A dm-only NPC is omitted (not redacted) from a player's roster/party
  (`character-creation-and-drafts` CHAR-001, `character-party-and-player-records` CHAR-011/015).
- Quick-create defaults Visibility to **dm-only** and dm-only notes flow through `data.dmNotes` +
  `dmOnlyFields`, so the owning player never sees them (`character-collaboration-and-dm-edits`
  CHAR-014 still green).
- Transfer/revoke dispatch the same durable `character.transfer-draft` / `character.revoke-draft`
  commands; the one-owner invariant and DM-gating are enforced in the core. The dialogs only gate the
  GUI affordance.
- The shared "Character tools" region is one un-branched block so a DM↔player view-as switch keeps
  in-progress collaborative edits (the CHAR-004 conflict path) instead of remounting and dropping
  them — fixed during this epic after the first cut regressed it.

## Tests / gates run

- `pnpm typecheck` (core `tsc` + app `svelte-check`) — **0 errors, 0 warnings (4743 files)**.
- App vitest — **486 tests pass (62 files)** (includes new `ux-char/hp-tone.test.ts`).
- Core vitest — unchanged (no `packages/core` edits in this epic).
- `pnpm lint` (eslint + boundary + nav-registry + a11y contrast) — **PASS** (79 contrast pairs × 5
  themes).
- Character e2e (7 specs incl. new `character-ux-suite.spec.ts`), BOTH projects — **72 passed**.
- Full Playwright suite, BOTH projects — **see run below** (the route layout changed, so the full
  suite was exercised per the shared-route caution).
- `pnpm docs:validate` — **PASS**.
- `pnpm ux-workpack:validate` — **PASS** (after `ux-workpack:complete`; no generated drift).

## Files changed

New — GUI (`apps/gm/src/lib/gui/ux-char/`):
- `HpBar.svelte` (glanceable `role="meter"` HP bar), `hp-tone.ts` (pure threshold model),
  `hp-tone.test.ts`.

New — tests:
- `apps/gm/tests/e2e/character-ux-suite.spec.ts`

Modified — GUI:
- `apps/gm/src/lib/gui/CharacterQuickCreate.svelte` (minimal speed form, dynamic submit, success
  toast + Open sheet, inline error+focus, optional-details disclosure)
- `apps/gm/src/lib/gui/CharacterDraftFlow.svelte` (step-rail wizard, live preview, autosave,
  back/continue, finalize issue list)
- `apps/gm/src/lib/gui/PartyOverview.svelte` (HP-bar member cards, condition pills, Up/Down order,
  critical state, hidden count, observer empty state)
- `apps/gm/src/lib/gui/CharacterRoster.svelte` (HP bar + visibility/kind badges, focusable cards for
  the Open-sheet affordance)
- `apps/gm/src/lib/gui/CharacterDraftManager.svelte` (per-draft owner/step/finalized cards, transfer
  & revoke confirmation dialogs)
- `apps/gm/src/routes/characters/+page.svelte` (role-differentiated suite layout + single-mount
  tools region)

Modified — tests:
- `apps/gm/tests/e2e/character-creation-and-drafts.spec.ts` (CHAR-013 transfer now goes through the
  per-draft picker + confirmation dialog)

Generated by the UX workpack commands (do not hand-edit):
- `docs/planning/v2/ux/workpack-state.yaml`, `docs/planning/v2/ux/status.yaml`,
  `docs/planning/v2/ux/epics/UX-CHAR-roster-creation-and-draft-ownership.yaml`

## Known gaps / deferred

- **Full 7-step wizard:** the surface doc describes 7 steps (identity, species, class, background,
  abilities, equipment, story); the prototype core models 3 (identity, abilities, class). The rail
  renders whatever `DRAFT_STEPS` defines, so it extends with the core — no GUI change needed when the
  remaining steps land.
- **Open sheet → real character sheet:** the toast's "Open sheet" reveals + focuses the roster card;
  a dedicated sheet route arrives with `UX-CHAR-sheet-live-resources-and-advancement`.
- **Finalize as `disabled` (not `aria-disabled`):** the spec suggests `aria-disabled` so a tooltip
  can read remaining issues; the functional contract asserts a real `disabled` finalize. Kept real
  `disabled` and surfaced the remaining-issues **list visibly** (better than a tooltip, and
  screen-reader available) below the status line.
- **Optional-details disclosure defaults open:** so the dm-only notes field stays directly reachable
  on every profile (the CHAR-014 non-leak flow fills it); the DM can collapse it.
- **Low-HP visual path** is unit-tested via `hp-tone` (quick-create starts characters at full HP, so
  e2e asserts the meter wiring at full HP); damaging HP to exercise amber/red live belongs to the
  combat/session surfaces.

## Git evidence

- Branch: `ux/UX-CHAR-roster-creation-and-draft-ownership` (off `fe20015`).
- Commit: `feat(ux): UX-CHAR roster, quick-create, creation wizard, party board, draft ownership`
  (recorded after this evidence file + regenerated UX state).

Final `git status --short` (pre-commit snapshot):

```
 M apps/gm/src/lib/gui/CharacterDraftFlow.svelte
 M apps/gm/src/lib/gui/CharacterDraftManager.svelte
 M apps/gm/src/lib/gui/CharacterQuickCreate.svelte
 M apps/gm/src/lib/gui/CharacterRoster.svelte
 M apps/gm/src/lib/gui/PartyOverview.svelte
 M apps/gm/src/routes/characters/+page.svelte
 M apps/gm/tests/e2e/character-creation-and-drafts.spec.ts
 M docs/planning/v2/ux/epics/UX-CHAR-roster-creation-and-draft-ownership.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/gm/src/lib/gui/ux-char/
?? apps/gm/tests/e2e/character-ux-suite.spec.ts
```
