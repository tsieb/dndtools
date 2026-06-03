## PERF - Performance Budgets and Constraints

Capability tree:

- Budget ownership and measurement: `PERF-001`, `PERF-007`
- Scene and map rendering: `PERF-002`, `PERF-003`
- Search, graph, and sync responsiveness: `PERF-004`, `PERF-008`
- Bundles, memory, and AI/MCP isolation: `PERF-005`, `PERF-006`, `PERF-009`

### PERF-001
**Statement:** The system shall define measurable performance budgets for startup, vault open, Scene render, widget update, map pan/zoom, graph indexing, search, sync reconciliation, and test suite tiers before feature implementation.
**Source:** Vision Performance; Feature Inventory I2 performance budgets.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a new feature domain starts implementation, when planning is reviewed, then relevant budgets and measurement method exist.
- Given a budget is exceeded in CI or profiling, when reported, then the owning domain and user-facing risk are identified.
- Given initial v2 budgets are reviewed, when no measured baseline exists yet, then provisional targets are declared with dataset, device class, and review date rather than left as "fast enough".

### PERF-002
**Statement:** Scene rendering shall support large Scenes through virtualization, incremental widget updates, bounded subscriptions, and backpressure for high-frequency events.
**Source:** Architecture Contract 4 Widget bindings; Feature Inventory I20 virtualization.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a Scene contains many widgets, when opened, then offscreen or collapsed widgets do not force full rendering work.
- Given high-frequency events arrive, when widgets subscribe, then declared debounce/backpressure policy prevents render starvation.

### PERF-003
**Statement:** Map rendering shall meet explicit budgets for pan, zoom, layer compositing, fog operations, POI overlays, and nested-map transitions on desktop and slim profiles.
**Source:** Vision performance; Feature Inventory I9 map risks.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a map with multiple visible layers and POIs, when panning and zooming, then measured frame budget remains within the defined target.
- Given a fog operation affects a region, when committed, then only affected render regions update where the renderer supports it.

### PERF-004
**Statement:** Graph and search indexing shall use incremental, source-aware algorithms and background scheduling so large vaults remain navigable during updates.
**Source:** Vision algorithmic approaches; Feature Inventory I3.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a large vault receives one changed note, when indexing runs, then navigation and search remain responsive.
- Given background indexing is incomplete, when search runs, then stale/partial status is visible without returning hidden data.

### PERF-005
**Statement:** Platform builds shall enforce bundle, memory, and startup budgets with path-aware gates and avoid shipping disabled or out-of-scope systems in core bundles.
**Source:** Vision lean CI; Feature Inventory I21 bundle/build performance.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: not applicable | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a feature is disabled by tier or platform, when bundles are analyzed, then unnecessary code is lazy-loaded or excluded where feasible.
- Given memory profiling exceeds budget, when diagnostics run, then major retained object categories are reported.

### PERF-006
**Statement:** AI and MCP processing shall not block deterministic UI, graph, search, sync, or session commands and shall use bounded context, cancellation, and progress reporting.
**Source:** Vision AI supplements algorithms; Feature Inventory I5.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an AI bundle generation is running, when the DM rolls dice or advances combat, then session commands remain responsive.
- Given an AI/MCP task exceeds limits, when cancelled, then partial output is discarded or clearly marked partial.
- Given AI is unavailable offline, when deterministic UI, graph, search, sync, or session commands run, then they remain within their configured budgets without waiting on AI.

### PERF-007
**Statement:** Initial v2 performance budgets shall include concrete provisional thresholds for smoke CI, startup, vault open, Scene first render, widget update, map pan/zoom, search, graph indexing, and sync reconciliation.
**Source:** Vision Performance; CI/CD Philosophy; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: not applicable | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given the smoke CI path runs on supported CI hardware, when measured, then it completes in under three minutes or has an approved temporary exception.
- Given startup, vault open, Scene render, map pan/zoom, search, graph indexing, or sync reconciliation benchmarks run, then each reports pass/fail against a named target, fixture size, and platform profile.

Initial provisional budget artifact:

| Workflow | Dataset / fixture | Platform profile / device class | Provisional target | Owner | Review date |
| --- | --- | --- | ---: | --- | --- |
| Smoke CI | Supported CI runner | CI reference runner | < 3 minutes | Platform | Pre-implementation |
| App startup | Warm cache | Desktop reference device | < 2 seconds to shell | Platform | Pre-implementation |
| Vault open | 1,000 notes / 100 objects / 20 maps | Desktop reference device | < 3 seconds to usable Command Center | Platform | Pre-implementation |
| Scene first render | 50 widgets / 10 active bindings | Desktop and slim reference profiles | < 1.5 seconds to interactive | Canvas | Pre-implementation |
| Widget update | Single accepted command | Desktop and slim reference profiles | < 100 ms p95 to visible update | Canvas | Pre-implementation |
| Map pan/zoom | 4 layers / 100 POIs | Desktop reference, slim reference | >= 50 fps p95 desktop, >= 30 fps slim | Maps | Pre-implementation |
| Search | 10,000 indexed records | Desktop and mobile reference profiles | < 250 ms p95 cached query | Search | Pre-implementation |
| Graph indexing | One changed note in 10,000-record vault | Background worker profile | < 500 ms affected-node update | Graph | Pre-implementation |
| Sync reconciliation | 1,000 queued operations | Desktop and mobile reference profiles | < 2 seconds local replay without UI starvation | Sync | Pre-implementation |

### PERF-008
**Statement:** Search, graph, and sync background work shall preserve interactive responsiveness by using scheduling, cancellation, resumable batches, and stale/partial result indicators.
**Source:** Architecture Contract 2 Local-First Invariant; Search requirements.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a large vault reindex is running, when the user searches, navigates, or advances combat, then the command remains within the configured responsiveness budget.
- Given background work is cancelled or interrupted, when resumed, then it continues from a checkpoint or restarts with a visible diagnostic.

### PERF-009
**Statement:** Performance diagnostics shall be privacy-preserving and shall not include hidden player-inaccessible content, raw paths, secrets, or full note bodies by default.
**Source:** Security diagnostics; Feature Inventory instrumentation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given performance traces are exported, when inspected, then raw content, secrets, hidden titles, and absolute paths are absent unless explicitly included by the DM.
- Given local UX diagnostics measure task success or time-to-first-value, when stored, then data remains local unless the user explicitly exports it.
