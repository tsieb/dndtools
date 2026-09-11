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
