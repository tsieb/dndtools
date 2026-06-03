# Requirements Quality and Traceability

This file defines requirements-package rules that apply to every domain file. It also records the
explicit remediation of the requirements audit findings.

## Quality Standard

Each requirement must satisfy the review plan:

1. **Vocabulary first:** repeated nouns are defined in `08-glossary.md`.
2. **Role action:** feature requirements use a role actor where practical. System-level statements
   are reserved for NFRs, constraints, and architecture contracts.
3. **Architecture alignment:** requirements are compatible with `09-architecture-contracts.md`.
4. **Capability tree:** every domain file starts with a capability tree and each requirement sits
   under one tree branch by source, heading, or table.
5. **Compatibility row:** every Must-have feature requirement states offline, multi-user, mobile,
   and player-safety behavior.
   Rows use only these values: `Offline: yes|no|degrade`,
   `Multi-user: yes|no|dm-only|not applicable`, `Mobile: yes|slim|not applicable`, and
   `Player-safe: yes|dm-only`. Cached-only behavior, remote degradation, and first-time auth
   limits belong in acceptance criteria or notes, not in the row value.
6. **Binary acceptance:** acceptance criteria are pass/fail checks, not explanatory restatements.
7. **Honest priority:** Must-have means the v2 product promise, security/privacy model, or
   architecture contract fails without it.

## Capability Tree Index

| Domain | Capability branches |
| --- | --- |
| CANVAS | Scene state; widget lifecycle; player view/projection; custom widgets; layout accessibility |
| CMD | Home scene; active session control; player view control; widget library; presets/actions |
| MAP | Map entity/assets; editing/generation; layers/visibility; nesting; POIs/routes/fog; map controls |
| CHAR | Character creation; ownership/grants; collaboration/DM edits; bindings; combat/resources; party/player journal |
| SES | Session lifecycle; combat; dice; handouts/tools; prep/recap; calendar/custom time; async command state |
| CONTENT | Notes; editor; templates/snippets; structured objects; wikilinks; import/export; visibility; embeds |
| GRAPH | Source indexing; backlinks; quality intelligence; visualization; incremental API; reports; metadata |
| SRCH | Full-text and quick switcher; filters/saved searches; ranking; result context/opening; freshness/determinism |
| SYNC | Local-first; operations; source adapters; conflict lifecycle; cloud/device-local storage; assets; status |
| COLLAB | Session join/reconnect; real-time state; presence; player views; combat/handouts; authority; stream filtering; cache privacy |
| PERM | Roles; visibility; grants; capability schema/inheritance; consistency; revocation/cache invalidation; audit |
| AUDIO | Scene/map audio; playback; session state; assets; automation; platform degradation; player controls |
| MCP | Optionality; baseline tools; staged writes; core enforcement; tests; bundles; AI boundaries; policy; response envelopes |
| PLAT | Platform profiles; desktop/web/Android; storage boundaries; IPC; migration; diagnostics; quality gates; onboarding |
| NAV | Home/canonical sections; aliases; global/local/contextual nav; focus/deep links; IA validation; command palette |
| A11Y | WCAG conformance; keyboard/pointer/focus; motion/live announcements; screen reader semantics; spatial alternatives; evidence |
| SEC | Renderer sandbox; path/input validation; sanitization; secrets; cloud security; widget host; regression gates |
| PERF | Budget definition; scene/map/search/sync performance; bundles; AI/MCP isolation; measurable thresholds |
| CON | No UI-only security; no required network/AI/MCP; no public ecosystem; no raw grants; no alternate source of truth |

## Audit Remediation Log

| Finding | Resolution |
| --- | --- |
| Flat requirements list | Split into domain files and added capability trees to each file. |
| Missing glossary terms | Folded audit-added terms into canonical `08-glossary.md`; this file no longer carries binding shadow definitions. |
| Weak/contradictory priorities | Corrected priorities for primary map creation, asset sync, cache privacy, access audit, baseline MCP tools, web/Android platform support, and security gates. |
| Scene state incomplete | Added CANVAS criteria for tags, ownership metadata, background/visual settings, scene-level visibility, and player-view metadata. |
| Projection revocation and write semantics missing | Added CANVAS/COLLAB/PERM requirements and acceptance criteria for revoke, hidden bindings, and projection not granting writes. |
| Map shared/observer visibility under-tested | Added MAP requirements for `shared`, observer access, hidden-layer/visible-POI consistency, and search/widget/graph leak prevention. |
| Map nesting integrity missing | Added MAP criteria for cycle prevention, depth, transform, broken child links, and cross-visibility behavior. |
| Character creation/advancement inconsistent | Split draft creation from advancement and aligned priorities; added owner-draft semantics. |
| DM edit visual flag missing | Added character acceptance criteria for visible DM attribution without a separate override value layer. |
| Session lifecycle inconsistent | Added defined session workflow states and transition semantics. |
| Conflict resolution under-specified | Added SYNC criteria for resolver authority, resolution command, audit trail, publication blocking, and new revisions. |
| Source adapter write-back weak | Added Google Docs and Obsidian write-back acceptance. |
| Permission revocation missing | Added explicit revocation/transfer/visibility-change requirements. |
| Observer role weak | Added observer negative tests in COLLAB/PERM/NAV. |
| MCP actor identity missing | Added MCP agent identity, actor mapping, and per-tool test expansion. |
| Cloud collaboration security thin | Added security requirements for encryption, tenant/session isolation, replay protection, and cloud-side filtering. |
| Performance budgets vague | Added measurable budget requirements and CI timing criteria. |
| Accessibility conformance weak | Strengthened WCAG AA, spatial alternatives, and evidence-gate language. |
| Calendar/custom time missing | Added session/content/graph/MCP requirements for calendar/custom time. |
| Onboarding/fresh-vault requirements missing | Added platform onboarding and fixture-gated acceptance requirements. |
| Boundary debt missing | Added platform requirements for type/runtime separation and MCP filesystem exception allowlists. |
| User-authored widgets vs plugin ecosystem tension | Added constraint clarifying that vault-local/user-authored widgets are not public plugin ecosystem APIs. |
| Compatibility vocabulary drift | Normalized compatibility rows to approved values and moved cached/remote/auth limitations into acceptance criteria. |
| Visibility terminology drift | Added binding definitions for `dm-only`, `player-visible`, and `shared`; updated permission semantics for Player View assignment, handout delivery, and viewer-capable grants. |
| Widget lifecycle gaps | Added Widget Package management, trust review, host-permission approval, disabled/removal states, portability, and Scene section semantics. |
| Map import/combat overlay gaps | Added initial external map format scope, import preview diagnostics, combat token lifecycle, movement, range, area-of-effect, and actor-filtered token projection. |
| Graph/search repair and semantic gaps | Added dead-link repair workflows, bulk repair preview, link-picker disambiguation, combined facets, relationship hints, and optional semantic/entity expansion boundaries. |
| Sync/collaboration source gaps | Added source adapter capability metadata, fail-closed schema/version handling, Google Docs auth/rename/delete/offline/conflict cases, and mobile reconnect catch-up ordering. |
| Audio/platform/security/performance gaps | Added split audio source/cache/package/routing/safety requirements, expanded PWA support matrix, semantic color/high-contrast checks, widget exfiltration controls, cloud key-custody release block, and an initial performance budget artifact. |
| Requirements audit follow-up gaps | Reconciled session workflow vocabulary, character journal privacy, Scene/Object ownership, map import scope, map projection diagnostics, MCP policy priority, participant cache sealing, and static count validation. |

## Open Gaps / Deferred Decisions

These items are intentionally unresolved and must be closed by a requirement update, architecture
decision, or explicit scope revision before release:

| Gap | Current disposition |
| --- | --- |
| Mobile degradation terminology | Compatibility rows use `Mobile: slim` only; domain acceptance criteria must describe unavailable controls, focused views, or platform-specific fallback behavior. |
| Cloud encryption and key custody | `SEC-009`, `SEC-012`, `SYNC-017`, and `COLLAB-014` require a decision record and test coverage for encryption responsibilities, key ownership, server trust boundaries, rotation, revocation, and recovery before cloud sync/collaboration release. |
| MCP policy allowlists | `MCP-009` is Must-have and defines canonical modes, but exact allowlists for balanced and trusted-direct operation remain product/security decisions. |
| PWA offline support matrix | `PLAT-016` requires a release matrix for cached reads/writes, unsupported filesystem features, auth limits, service-worker behavior, quota/eviction, and recovery. |
| Semantic search | `SRCH-011` keeps deterministic search primary and requires semantic/entity expansion to be optional, visibility-safe, and explicitly labeled; full semantic ranking scope is deferred until the search architecture decision. |
| Audio source and package scope | Audio remains design-incomplete. `AUDIO-009` through `AUDIO-013` split source, cache, package, routing, and playback-safety decisions so audio can remain deferred without blocking non-audio MVP scope. |
| External map format scope | `MAP-002` starts with image/SVG import; external scene formats require a declared adapter, scope update, and import diagnostics. |
