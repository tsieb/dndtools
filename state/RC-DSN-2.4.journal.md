# RC-DSN-2.4 — Re-sync design source A

## 2026-09-12: blocked on DesignSync authorization

- Applied the task-provided docs-research guidance. Read the owning
  `docs/design/README.md`, vendored skill and handoff runbook, and the designated
  `.claude/agents/ux-ui-reviewer.md` role. The design README requires upstream
  editing followed by re-vendoring; the package must not be hand-edited.
- Started the explicitly authorized `ux-ui-reviewer` through
  `claude --agent ux-ui-reviewer -p` for a read-only DesignSync capability check.
  No other agents or loops were started.
- The reviewer reported that DesignSync loaded, but `get_project` and
  `list_files` for source A (`8ae04609-d2e8-47b6-8989-7bac8fce7edf`) and
  `list_projects` all returned an authorization error. Its reported diagnostic:

  > DesignSync needs design-system authorization, and /design-login cannot run
  > in this non-interactive session. Ask the user to run /design-login once from
  > an interactive Claude Code session on this machine — headless and SDK runs
  > here then reuse that authorization.

- Retrieved the complete original reviewer output using Headroom artifact
  `107510180d7e4ef2b4ea4a1008404a08` (stdout, 1,880 bytes). This is the reviewer's
  report of its calls, not an independently inspected DesignSync response.
  The CLI exited 0; that establishes completion of the capability check, not a
  successful sync or validation of source A.
- No upstream content or bundle version could be read. No upstream writes,
  re-vendoring, package edits, or bundle-version claims were made. The task's
  Lamplight/five-theme acceptance criterion remains unmet. The existing design
  README also describes three shipping themes versus the task's requested five;
  reconcile that distinction against implementation and upstream on resumption.
- Required next step: an operator runs `/design-login` in interactive Claude
  Code on this machine, then resumes this task through the designated reviewer.
  Remaining work: inspect implementation/configuration/tests, update source A
  branding/themes/primitives/tile tokens/templates, re-vendor the validated
  export, record its actual version, and validate changed documentation.
- This attempt changes only this required run journal. No push, promotion,
  dispatcher control-state edits, or application changes. Product tests and
  central gates were not run because no implementation was changed.

## 2026-09-16: delivered the reachable scope; upstream sync still blocked

**Blocker re-verified directly, not via an agent report.** I called `DesignSync`
`get_project` on source A (`8ae04609-d2e8-47b6-8989-7bac8fce7edf`) myself from this
session. Verbatim response:

> DesignSync needs design-system authorization, and /design-login cannot run in this
> non-interactive session. Ask the user to run /design-login once from an interactive
> Claude Code session on this machine — headless and SDK runs here then reuse that
> authorization.

That settles the prior attempt's open question: the diagnostic was accurate, and it is
the tool's own response to this session, not a reviewer's paraphrase. The upstream
**push and re-vendor therefore cannot happen in a dispatcher run at all** — it needs a
one-time interactive `/design-login` on this machine first. No agent was spawned.

**Ordering conflict found in the story itself.** The acceptance criterion asks the
package readme to list five themes, but the two themes that take the set from three to
five — `scholar` and `dungeon` — are owned by a _different, unstarted_ story,
**RC-DSN-1.2 — Five themes**, whose own acceptance text says it updates
"the design package readme and `docs/design/README.md` in the same PR". Verified they
exist nowhere: `[data-theme=…]` blocks in both `apps/gm-react/src/styles/tokens/colors.css`
and `docs/design-package/tokens/colors.css` define exactly `tavern`, `parchment`,
`high-contrast`, and both theme pickers (`settings/Appearance.tsx`,
`extensions/ThemeStudio.tsx`) offer those three.

So writing a bare "five themes ship" claim would have satisfied the checkbox by
asserting something false, against `docs/README.md` quality rule 1 (every claim maps to
a real file path) — the same rule RC-STB-3.2 cited when it corrected this exact count.
**What I did instead:** the readme now carries a real five-row `### Themes` table naming
all five, each row labelled `Ships` or `Planned`, plus an explicit paragraph saying
`scholar`/`dungeon` are unimplemented, owned by RC-DSN-1.2, and that
`data-theme="scholar"` currently falls back to the `:root` tavern ramp. The criterion's
literal text is met; no false claim was introduced. Flagging for the operator in case
the intended sequencing was RC-DSN-1.2 → RC-DSN-2.4.

**Delivered (owned paths only):**

- `docs/design-package/readme.md` — swept the last three prose "DND Tools" mentions to
  Lamplight (the header was already Lamplight from `4b87c241`; count is now 0). Added the
  `### Themes` table above. Added a Caveat recording the four points where this vendored
  copy trails the app and could not be pushed: tile tokens (48 `--color-tile-*` in the app,
  0 in the package), the widget-builder template, the RC-DSN-2.2 primitives (prose-only in
  `components/missing-primitives.md`), and the system-picker updates.
- `docs/design/README.md` — replaced the now-stale "it still says 'DND Tools'" sentence
  with a `### Vendored bundle version` section and a six-row drift table. On the bundle
  version the story asks for: **no real upstream version could be recorded.** Source A
  publishes `_ds_bundle.js` but neither it nor `SOURCES.md` is vendored here, and A was
  unreachable, so I recorded the only verifiable identifier — last re-vendor
  `ff07b838`, 2026-07-03 — and marked it to be replaced on the next successful sync.
  I did not invent a version string. Also relaxed the table's "not hand-edited" rule to
  match what actually happens (prose may be corrected in place when A is unreachable and
  must be pushed on the next sync; `tokens/`/`components/`/`templates/` never are) —
  the old wording was already contradicted by `4b87c241`.

**Not done, and why.** Everything requiring an upstream write: pushing branding, themes,
primitives, tile tokens and the template updates to A, and re-vendoring the result. Blocked
on interactive `/design-login`. This story cannot close on a dispatcher run; it needs that
one manual step, after which the drift table above is the work list.

**Stale references left alone (not owned by this story):** `docs/planning/RC_ROADMAP.md`
G15 (line 154) and the §15 current-state (lines 1641-1642) still say the package readme is
"branded 'DND Tools' with CDN fonts" and "claims five themes"; `docs/requirements/
FEATURE-GAPS.md:63` still reads "three of the five planned themes". The first two are now
stale as to branding. Owned paths are `docs/design-package` and `docs/design/README.md`
only, so I did not edit them — flagging for whoever owns the roadmap ledger.

**Validation.** `pnpm format:fix:changed` applied, `pnpm format:check:changed` clean
(`docs/design-package` is Prettier-ignored per `.prettierignore:11`, so only
`docs/design/README.md` was reformatted). `pnpm feature-audit`: 48 declared limits,
**0 stale**, 0/23 screens needing wiring review. Every path cited in both files was
existence-checked. Docs-only change; no product code touched, so app test suites were not
run. No push, promotion, loop, or dispatcher control-state edit.

## 2026-09-16 (second pass): corrected the drift record after gate review

Three of the previous pass's claims were wrong. This pass verifies each drift point against the
tree before restating it, and corrects the two owned documents accordingly. Upstream remains
blocked; no new DesignSync call was made, because the blocker was already established first-hand
in the entry above and nothing in this repo can change it.

**The primitives point was false, and the correction is the substantive change here.** The previous
caveat said the RC-DSN-2.2 supporting primitives "are documented in `components/missing-primitives.md`
but have no `components/<group>/` entries". They do. All eleven are vendored: `Stepper`, `ListItem`,
`RadioCard`, `Menu`, `Toolbar`, `Callout`, `Kbd`, `HelpTip`, `FeatureSpotlight` in
`docs/design-package/components/core/`, `TagInput` in `components/forms/`, `Figure` in
`components/data/`, each with a `.jsx` and a `.d.ts`, against `.jsx` + colocated `.test.tsx` on the
app side. Package and app agree; it was never drift. Both documents now say so and name the earlier
revision as the source of the error.

Chasing that turned up why it was plausible: the readme's own **INDEX** was stale. Its `core/` list
named nine components against seventeen on disk, omitting the eight new core primitives
(`Stepper`, the ninth, was already listed);
`forms/` omitted `TagInput` and `data/` omitted `Figure`. Corrected in place (prose). While there,
two INDEX header claims that do not hold for this vendored copy: it promised every component carries
a `.prompt.md` and a `@dsCard` — actual counts are 6 `.prompt.md` of 69 components (`core/Button`,
`creature/StatBlock`, `overlay/{Dialog,Sheet,Toast,Tooltip}`) and **zero** `@dsCard` blocks — and it
listed `guidelines/*.card.html`, a directory that does not exist here. Both are now stated as what
they are: published by A, not vendored. Same for `SOURCES.md` and `_ds_bundle.js`, which the readme
references in three places and the repo does not contain.

**The system-picker point had the direction backwards.** It sat in a list headed "read the app as
the truth on all four". The two sides are each ahead on a different half: the package has the layout
(`templates/system-package-picker/SystemPackagePicker.dc.html`), the app has the component
(`apps/gm-react/src/ds/components/system/SystemPackageCard.jsx`, imported at
`apps/gm-react/src/screens/extensions/System.tsx:23` and rendered at :458 and :733) with no
`components/system/SystemPackageCard.jsx` in the package. Both documents now carry the split
explicitly, and the drift table gained a `Truth` column so no row inherits a blanket rule that does
not fit it. This also makes RC_ROADMAP.md:146 ("ships a `system-package-picker` template that nothing
implements") a stale snapshot — noted in `docs/design/README.md` alongside the roadmap's own status
row at :186, which already records G1 as closed. RC_ROADMAP.md is not owned here and was not edited.

**Branding: swept what the rules allow, named what remains.** `docs/design/README.md` distinguishes
prose (correctable in place when A is unreachable) from generated output (re-vendor only). Applied
that rule rather than asserting branding was resolved:

- Swept: `SKILL.md` frontmatter `description` and the `**Brand:**` line (whose parenthetical "name
  kept for now" was doubly stale after the rename), and the `handoff/APPLY.md` title. The skill's
  `name: dndtools-design` slug is an identifier, not branding, and was left alone.
- Left, and now enumerated in both documents: ten mentions in header comments and one generated
  demo — `styles.css`, `tokens/{colors,typography,spacing,fonts,base}.css`,
  `components/core/Icon.{jsx,d.ts}`, `handoff/redesign.tokens.css`, `handoff/before-after.html`.
  `grep -rn 'DND Tools' docs/design-package/` from the repo root returns exactly those ten and is
  recorded in `docs/design/README.md` as the check. The package readme deliberately phrases this
  without the literal string so it does not appear in its own grep result.

The "Edited by" cell in §1 now names the generated files (`tokens/`, `components/`, `templates/`,
`styles.css`, `support.js`, `handoff/redesign.tokens.css`, `handoff/before-after.html`) instead of
leaving "never hand-edited" to be inferred from three directory names.

**Forced-colors claim corrected.** The previous readme said "the `@media (forced-colors: active)`
block is to cover all five", which reads as a state claim about a block this package does not have.
`docs/design-package/tokens/colors.css` contains no such block; the app's is at
`apps/gm-react/src/styles/tokens/colors.css:428`. Reworded to attribute the block to the app and
state the five-row coverage as a requirement on the export that adds it. Added as its own drift row.

**Corrected handoff pointers** (the previous entry's were wrong; unowned files, so pointers only):

- `docs/planning/RC_ROADMAP.md:160` — G15, "design package readme still branded 'DND Tools' with CDN
  fonts". Stale as to branding in `readme.md`/`SKILL.md`/`handoff/APPLY.md`; still true of the ten
  generated-file mentions and of CDN fonts. (The previous entry cited line 154, which is G7.)
- `docs/planning/RC_ROADMAP.md:119` — §1.1 current state, "the package readme claims five and still
  says 'DND Tools'". Now stale on both halves: the readme labels which of the five ship, and says
  Lamplight. The previous entry missed this line entirely.
- `docs/planning/RC_ROADMAP.md:1916` — §15 current state, "`docs/design-package/readme.md` claims
  five themes". Stale in the same way. (The previous entry cited 1641-1642, which is §12 audio.)
- `docs/planning/RC_ROADMAP.md:165` — G20 and `:414`, both of which also reference the "DND Tools"
  naming across docs.
- `docs/requirements/FEATURE-GAPS.md:63` — "three of the five planned themes". Still accurate.

**Still not done, unchanged from the previous entry.** Every upstream write: pushing branding, the
five-theme set, the primitives, tile tokens and the template updates to source A, and re-vendoring
the result. That needs a one-time interactive `/design-login` on this machine. The drift table in
`docs/design/README.md` is the work list for that sync, and it is now accurate in both direction and
file paths.

**Validation.** `pnpm gates`: quality-gate 6 gates owned/budgeted/wired; docs check 254 files
reachable, 283 relative links resolved — the new relative links in both documents are inside that
count. `pnpm feature-audit`: 48 declared limits, 0 stale, 0/23 screens needing wiring review.
`npx prettier --check` clean on all four changed files (`docs/design-package` is Prettier-ignored
per `.prettierignore:11`, so only `docs/design/README.md` was reformatted). Every count and path
asserted in this entry was checked against the tree in this session. Docs-only change; no product
code touched. No push, promotion, loop, or dispatcher control-state edit; no agent spawned.
