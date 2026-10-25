# Planning

## The plan of record

[`RC_ROADMAP.md`](RC_ROADMAP.md) is the execution plan from the current baseline to Release
Candidate 1: the honest gap list, the RC exit criteria, the critical path, sixteen workstreams, and
the story index in §23 whose Status column is kept current by the autonomous loop. It is parsed by
`tools/loop/rcloop.py` and cited by `scripts/validate/feature-audit.ts`, so its story format and its
§0.3 guardrails (lines 42–78, which the worker prompt points agents at) must not be reshaped
casually.

[`CLOUD_TIER_ROADMAP.md`](CLOUD_TIER_ROADMAP.md) is the product thesis for the paid cloud tiers and
the standing decisions the CLD workstream executes.

[`SCREENS_PARITY.md`](SCREENS_PARITY.md) is the RC-CAN-7.5 inventory of the Command Center, the GM
screen board and Session as they shipped before the ADR-041 conversion, with the gap register
RC-WID-5 works through. It is the row-by-row checklist RC-CAN-7.6 and RC-CAN-7.8 are measured
against. Its [filed follow-up backlog](SCREENS_PARITY.md#filed-wid-stories)
records open RC-WID-5.6–5.12 with acceptance criteria; operator registration in the execution
roadmap remains separate from this documentation filing.

[`FRICTIONLESS.md`](FRICTIONLESS.md) is the RC-ENG-9.3 exit audit for milestone M2.6: the
[2026-09-29 friction reviews](friction-review-2026-09-29/README.md) re-run on one commit, the
[friction budgets](FRICTION_BUDGETS.md) measured on five runs, and every remaining finding by
severity.

[`EARLY_ACCESS.md`](EARLY_ACCESS.md) is the RC-ENG-8.3 exit audit for milestone M2.5: the golden
paths on five runs, the a11y gate, a `ux-ui-reviewer` pass over the primary routes at three tiers,
and the primary-path reading of DEBT.md and FEATURE-GAPS.md, with the verdict and the stories its
findings became. The fifth run, on `d1b4e6e4d`, passed; the four before it are kept below it.

The RC-ENG-7.3 exit audit for RC-1 is recorded in
[`RC_CHECKLIST.md`](../development/RC_CHECKLIST.md#rc-eng-73-exit-audit), beside the checklist it
gates. It covers every §2 gate on one commit, every inventory row re-read, every §20 waiver, and a
`ux-ui-reviewer` pass over the surfaces M2.5 did not cover. The first run, on `3cbf4b7cc`, did not
pass. Its findings are epics ENG-11 to ENG-14 in the roadmap, and the owner's steps are in §24.
The second run, on `c97e5da65` (application tree `aa300d6d5`), applied the owner's 2026-10-24
decisions. It met every clause except the IA-1 precondition, which stayed open because RC-ENG-15.2
left the hosted `ci-gate` red. Its new findings are epic ENG-16. The third run, on `loop/rc` `a047c6bd2`,
passed. The Electron smoke fix had landed and `ci-gate` was green, and the run fixed the live-P2P
probe that 15.2 broke.

For what is actually built, read [`../requirements/FEATURE-GAPS.md`](../requirements/FEATURE-GAPS.md)
and run `pnpm feature-audit`, not this folder.

## Vision

Lamplight is the definitive tabletop companion: local-first worldbuilding, live session management,
AI creative partnership, and cross-device collaborative play. It runs offline in the browser, the
Electron desktop shell, and the Android shell with data owned by the user. When connected it enables
real-time sessions between any participants, with or without a backend: peer-to-peer on a LAN, AWS
signalling and relay for remote groups. The AI layer proposes and a human approves. Every feature is
keyboard-accessible, screen-reader compatible, and usable under the stress of a live game.

## Guiding principles

1. **Data is sacred.** Zero data loss, atomic writes, crash-safe recovery, full user ownership.
2. **Speed is a feature.** Fast enough for live sessions under time pressure.
3. **Local-first, collaborative when needed.** Cloud and P2P are enhancements, never requirements.
4. **AI partnership, not dependence.** Every model write is staged, previewed, and human-approved.
5. **Platform agnosticism through abstraction.** The framework-free core is the shared application
   layer; only the outer shell changes.
6. **Extensibility from first principles.** Game systems, object types, widgets, and themes are
   module boundaries the community can contribute to without forking.
7. **Engineering as a product.** Gates, ADRs, coverage, and docs in sync with code are what make
   sustained delivery possible.
8. **Observability as a first principle.** Critical paths carry structured telemetry and an error
   taxonomy; darkness is a bug.
9. **Privacy and security by design.** Nothing is transmitted without explicit consent; the threat
   model is published; telemetry is opt-in and content-free.
10. **Graceful degradation everywhere.** Every feature defines its behaviour when a dependency is
    absent. Hard dependencies between optional features are architectural failures.
11. **Two users, one system.** DM and player have different mental models and permissions. DM power
    wins at build time; player clarity wins at runtime. DM-private content is never exposed.

## How work is sized

Stories are identified `RC-<LANE>-<epic>.<story>`, sized S (≤ 1 agent-day), M (2–4), L (5–10), or
XL (must be split), and phased P0 (stabilize) through P4 (RC hardening). Each names its `Deps:` and
`Owns:` (the files it may edit). A story is done when its acceptance criteria are met, its e2e
specs pass on both Playwright profiles, and its docs moved with the code in the same commit. The
pre-RC initiative backlog (I1–I21, Svelte-era) was retired in favour of the roadmap and is
recoverable from git history.
