# DND Tools — Initiative Index

> The definitive TTRPG companion: local-first worldbuilding, live session management,
> AI creative partnership, and cross-device collaborative play.

---

## Vision Statement

DND Tools will be the standard by which all TTRPG digital companions are measured. It
runs offline-first on every platform a DM or player actually uses — desktop, Android,
eventually iOS — with data fully owned by the user. When connected, it enables real-time
collaborative sessions between any participants, with or without a backend, using direct
peer-to-peer links for local play and AWS-backed cloud for remote groups. An AI agent
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

5. **Platform agnosticism through abstraction.** The `StorageAdapter` boundary and the
   renderer/main separation allow every platform target (desktop, Android, browser) to
   share the same application layer with only the adapter changing.

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
