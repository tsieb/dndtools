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
