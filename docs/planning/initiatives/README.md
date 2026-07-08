# DND Tools — Initiative Index

> The definitive TTRPG companion: local-first worldbuilding, live session management,
> AI creative partnership, and cross-device collaborative play.

---

## Vision Statement

DND Tools will be the standard by which all TTRPG digital companions are measured. It
runs offline-first — in the browser and inside the Electron desktop shell today, with
mobile a future target — with data fully owned by the user. When connected, it enables
real-time collaborative sessions between any participants, with or without a backend,
using direct peer-to-peer links for local play and AWS-backed cloud for remote groups
(both real today). An AI agent
layer (MCP) operates as a genuine creative partner: it does not merely wrap CRUD
operations but performs deep algorithmic reasoning over the vault and delivers
pre-contextualized, semantically bundled intelligence that dramatically reduces model
overhead. Every feature is keyboard-accessible, screen-reader compatible, and usable
under the stress of a live game session.

---

## Guiding Principles

1. **Data is sacred.** The vault is a DM's life's work. Zero data loss, atomic writes,
   crash-safe recovery, and full user ownership are non-negotiable at every layer.

2. **Speed is a feature.** Fast enough for live sessions under time pressure. Search
   returns in under 150ms. Navigation takes one keystroke. The AI responds in one
   semantic call, not twenty.

3. **Local-first, collaborative when needed.** The app works completely offline. Cloud
   and P2P are enhancements, never requirements.

4. **AI partnership, not AI dependence.** MCP agents augment human creativity; they
   never silently mutate data. Every write is staged, previewed, and human-approved
   unless explicitly trusted.

5. **Platform agnosticism through abstraction.** The framework-free Processing Core
   (`packages/core`) is the shared application layer: the React renderer reaches it only
   through command dispatch and actor-scoped queries, and persistence sits behind a
   Dexie/IndexedDB adapter. The same core runs in the browser and inside the Electron
   desktop shell, with only the outer shell changing.

6. **Extensibility from first principles.** Campaign systems, object types, plugins, and
   themes are designed as first-class module boundaries so the community can contribute
   without forking.

7. **Engineering as a product.** CI gates, ADRs, test coverage targets, and docs
   in-sync with code are not optional polish — they are what makes sustained delivery
   possible.

8. **Observability as a first principle.** Every critical path carries structured
   telemetry, performance marks, and error taxonomy entries. The system surfaces its
   own health in ways both users and developers can understand and act on. Darkness in
   a production system is a bug, not an acceptable state.

9. **Privacy and security by design.** User data is never transmitted without explicit
   consent. At-rest encryption, minimal external dependencies, a published threat model,
   and zero telemetry without opt-in are design inputs from day one — not post-launch
   concerns. The user owns their data absolutely.

10. **Graceful degradation everywhere.** Every feature must define its behavior when
    dependencies are unavailable: network absent means sync queues; AI unavailable means
    client-side algorithmic fallbacks; audio context unavailable means silent mode. Hard
    dependencies between optional features are architectural failures.

11. **Two users, one system.** The DM and the player have fundamentally different mental
    models, permission sets, and session-time needs. Every interface is designed for both
    personas. When in conflict, DM power wins at build time — player clarity and
    immersion win at runtime. The system never accidentally exposes DM-private content.

---

## Initiative Map

Each Initiative contains 3–7 Epics. Each Epic contains 3–7 Stories. Stories are the
atomic reviewable unit of work — one PR, one demonstrable outcome.

> **This map is the planning backlog, not a shipped-feature list.** Initiatives are
> aspirational direction; many are partially delivered or not yet started. `I21`
> (`I21-codebase-realignment-quality-audit.md`) tracks realigning docs and code to the
> React-primary reality recorded in ADR-018.

| #   | Initiative                    | Priority | Depends On | File                                                                     |
| --- | ----------------------------- | -------- | ---------- | ------------------------------------------------------------------------ |
| I1  | Platform Foundation & Trust   | P0       | —          | [I1-platform-foundation.md](I1-platform-foundation.md)                   |
| I2  | Engineering Excellence        | P0       | I1         | [I2-engineering-excellence.md](I2-engineering-excellence.md)             |
| I3  | Core Knowledge Architecture   | P1       | I1, I2     | [I3-core-knowledge-architecture.md](I3-core-knowledge-architecture.md)   |
| I4  | Session-Time Command Center   | P1       | I3         | [I4-session-command-center.md](I4-session-command-center.md)             |
| I5  | AI Creative Partnership       | P1       | I3, I2     | [I5-ai-creative-partnership.md](I5-ai-creative-partnership.md)           |
| I6  | Multi-Platform Distribution   | P1       | I1, I3     | [I6-multi-platform-distribution.md](I6-multi-platform-distribution.md)   |
| I7  | Collaborative Infrastructure  | P2       | I3, I6     | [I7-collaborative-infrastructure.md](I7-collaborative-infrastructure.md) |
| I8  | Extensibility & Ecosystem     | P2       | I3, I2     | [I8-extensibility-ecosystem.md](I8-extensibility-ecosystem.md)           |
| I9  | Maps & Spatial Intelligence   | P1       | I3         | [I9-maps-spatial-intelligence.md](I9-maps-spatial-intelligence.md)       |
| I10 | Player Character Suite        | P1       | I3, I4     | [I10-player-character-suite.md](I10-player-character-suite.md)           |
| I11 | Atmosphere, Audio & Immersion | P2       | I4         | [I11-atmosphere-audio-immersion.md](I11-atmosphere-audio-immersion.md)   |
| I12 | Community & Content Ecosystem | P3       | I7, I8     | [I12-community-content-ecosystem.md](I12-community-content-ecosystem.md) |

**UX Refactor Cluster (I13–I20):** These eight initiatives constitute the major UX
overhaul. They must be executed in dependency order: I13 (IA and navigation model) is
the prerequisite for all others. I14 (adaptive shell) and I15 (design system) build in
parallel on I13's foundation. I16, I17, and I18 build on I13–I15. I19 (map tool UX)
and I20 (board tool UX) are the domain-specific UX completions that require the full
I13–I18 foundation plus their respective functional prerequisites (I9 for maps, I4/I16
for boards). These initiatives will touch nearly every screen in `apps/gm-react/src/`
and require a dedicated story branch series. Plan for a long-running refactor branch strategy: each
initiative is a branch, each epic within it is a PR. I19 and I20 must not be started
until I13, I14, I15, I16, I17, and I18 are complete.

| I13 | Information Architecture & Navigation | P0 (UX) | — | [I13-information-architecture-navigation.md](I13-information-architecture-navigation.md) |
| I14 | Adaptive Cross-Platform Shell | P1 (UX) | I13 | [I14-adaptive-cross-platform-shell.md](I14-adaptive-cross-platform-shell.md) |
| I15 | Design System & Visual Language | P1 (UX) | I13, I14 | [I15-design-system-visual-language.md](I15-design-system-visual-language.md) |
| I16 | Session-Time UX Reimagined | P1 (UX) | I4, I13, I14, I15 | [I16-session-time-ux-reimagined.md](I16-session-time-ux-reimagined.md) |
| I17 | Learnability & Progressive Disclosure | P1 (UX) | I13, I14, I15 | [I17-learnability-progressive-disclosure.md](I17-learnability-progressive-disclosure.md) |
| I18 | Accessibility & Inclusive Design | P1 (UX) | I13, I14, I15 | [I18-accessibility-inclusive-design.md](I18-accessibility-inclusive-design.md) |
| I19 | Map Tool UX: Clarity & Ergonomics | P1 (UX) | I9, I13, I14, I15, I17, I18 | [I19-map-tool-ux.md](I19-map-tool-ux.md) |
| I20 | Board Tool UX: Interaction & Mobile | P1 (UX) | I9, I13, I14, I15, I16, I17, I18, I19 | [I20-board-tool-ux.md](I20-board-tool-ux.md) |
