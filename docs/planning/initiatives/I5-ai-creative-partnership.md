# Initiative 5 — AI Creative Partnership

**Outcome:** The MCP agent layer is the most intelligent, context-aware, and
responsibility-respecting AI integration in any TTRPG tool. It reduces model overhead
through deep algorithmic pre-processing, enriches creative work through targeted
generation, and gives the DM complete oversight of every change.

---

## Epic 5.1 — Semantic MCP Architecture (Bundled Intelligence)

**Goal:** Replace fine-grained individual CRUD tool calls with semantically bundled,
algorithmically pre-processed endpoints that deliver rich context in single calls,
dramatically reducing model overhead.

**Stories:**

- **S5.1.1 — Algorithmic bundling strategy and caching layer**
  Design a `VaultIntelligenceCache` (in `mcp/`) that computes and caches derived
  metrics (campaign health score, coverage gap list, stale note index, link centrality
  scores) on a time+mutation budget. Cache invalidates on structural changes. Bundle
  endpoints read from cache first, only recomputing on miss.

- **S5.1.2 — Session prep bundle tool**
  `get_session_prep_bundle` returns in one call: the N most recently updated notes,
  board context for the active session board, notes tagged with current arc, stale-risk
  notes (high-backlink-count but not updated recently), and open threads. The bundle
  is pre-ranked by relevance score, not just recency.

- **S5.1.3 — Recap generation bundle tool**
  `get_recap_generation_bundle` returns: all notes created or updated since the last
  session timestamp, objects with mutations since that timestamp, dice rolls logged
  in-session, combat tracker logs, and a topic momentum score (which entities appeared
  most in recent sessions). Agents can produce a recap with a single bundle call.

- **S5.1.4 — Continuity check bundle tool**
  `get_continuity_check_bundle` returns: inconsistent NPC descriptions (same NPC, two
  conflicting notes), unresolved thread links (quest started but no resolution entry),
  orphaned factions (faction object with no linked NPC or location), and timeline gaps.
  Each inconsistency includes source note IDs and the nature of the conflict.

- **S5.1.5 — Semantic compression for large vault summaries**
  For vaults > 500 notes, bundle tools apply semantic compression: notes are scored by
  relevance to the current request context (using TF-IDF + link graph proximity), and
  only the top-K are included in full. Remaining notes appear as summaries. The model
  can request expansion of any summary via a `expand_note` call.

---

## Epic 5.2 — Vault Intelligence Engine

**Goal:** The MCP layer can quantify the health, completeness, and structural quality of
the campaign vault and surface specific, actionable improvement suggestions.

**Stories:**

- **S5.2.1 — Campaign health score algorithm**
  Compute a 0–100 health score from: link density (% notes with at least 2 links),
  object completeness (% objects with required fields filled), freshness (% recently
  updated notes relative to vault size), coverage (% objects with at least one note
  reference), and tag taxonomy consistency. Expose via `get_campaign_health`.

- **S5.2.2 — Coverage gap detection**
  Identify structural gaps: NPCs without backstory notes, locations without description
  objects, quests without resolution notes, factions without linked members. Each gap
  type has a severity score and an example note to create. `get_coverage_gaps` returns
  gaps grouped by type with count and top examples.

- **S5.2.3 — Stale note detection with recency weighting**
  Compute stale risk as: time since last update × (1 + backlink_count). Notes with many
  inbound links are higher risk when stale because more content depends on them.
  `get_stale_notes` returns notes above a threshold, ordered by stale risk score.

- **S5.2.4 — Thematic cluster analysis**
  Cluster notes by shared tags and link proximity to identify active story arcs vs.
  dormant ones. Each cluster has a "momentum score" (recent mutations / total notes in
  cluster). Surface in `get_session_prep_bundle` as arc context. This is computed via
  graph community detection (Louvain or label propagation), not AI.

---

## Epic 5.3 — Human Oversight & Staged Change Excellence

**Goal:** The staged MCP change workflow is so transparent and friction-appropriate that
DMs trust the AI layer completely — because they can always see exactly what it did and
undo it immediately.

**Stories:**

- **S5.3.1 — Semantic diff preview for all staged writes**
  Staged change previews show: structural change summary (title changed, folder moved,
  frontmatter key added), line delta count, a compact inline diff view, and the set
  of notes whose backlinks will be affected by a title change. The preview is computed
  by `StagedMcpAdapter` before writing to changelog, not lazily on display.

- **S5.3.2 — Per-agent policy configuration UI**
  Settings → MCP → Agents shows a list of agents that have made changes, with a
  per-agent policy selector: `strict_review` (all changes require approval), `balanced`
  (read-only auto-approve, structural writes require review), `trusted` (all writes
  auto-approve with audit trail). Policy is persisted in `mcpPolicySettings.perAgent`.

- **S5.3.3 — Batch approval with semantic grouping**
  The pending changes list in Settings supports: filter by agent, filter by change type
  (create/update/delete), filter by affected folder, text search across change summaries,
  and bulk approve/reject with confirmation. Dangerous operations (bulk delete, folder
  moves) are visually distinguished and require explicit individual approval.

- **S5.3.4 — Audit trail browser**
  A full audit history of all MCP-applied changes (approved, auto-approved, rejected)
  is accessible at Settings → MCP → Audit History. Each entry shows: agent ID,
  operation, affected note, policy that governed it, timestamp, and the before/after
  diff. The audit log is append-only and exportable as JSON.

- **S5.3.5 — Conflict detection and resolution UI**
  When a staged change targets a note that has been edited in the UI since the change
  was staged, flag the change as conflicted with a visual indicator. The conflict UI
  shows a three-way diff: original, AI version, and current UI version. The DM chooses:
  keep AI, keep UI, merge manually, or reject the change.

---

## Epic 5.4 — Content Generation Workflows

**Goal:** Agents can generate campaign content that is richly contextual, vault-aware,
and delivered in ready-to-use note/object format.

**Stories:**

- **S5.4.1 — NPC generation with campaign context injection**
  `create_npc_from_context` tool accepts: faction affiliation, location, personality
  traits, and role. It queries the vault for existing NPCs in that faction/location,
  avoids name collisions, and proposes a character object with backstory note. The
  generated content respects worldbuilding constraints already in the vault.

- **S5.4.2 — Encounter builder with environment and CR awareness**
  `build_encounter` tool accepts: party level, party size, location, desired difficulty,
  and tone (ambush, dramatic, puzzle). Returns a structured encounter object with
  combatant list, environment description, and tactical notes. Uses vault stat blocks
  for creatures already defined in the campaign.

- **S5.4.3 — Story hook generator from active threads**
  `generate_story_hooks` reads the open threads, recent session context, and active
  NPC motivations from the vault, then proposes N story hooks that organically connect
  existing threads. Each hook references specific vault notes as sources.

- **S5.4.4 — Post-session update workflow**
  `get_post_session_update_checklist` analyzes what happened in the session (from
  combat logs, dice history, recently opened notes) and proposes: notes to create,
  notes to update, NPC status changes, and quest progression updates. Returned as a
  structured checklist for DM review before any writes are staged.

---

## Epic 5.5 — Local AI & Offline Intelligence

**Goal:** When internet is unavailable or the user prefers privacy-first operation,
AI features degrade gracefully to powerful client-side computation. When a local LLM
runtime (Ollama, LM Studio) is running, full generative capabilities work offline.

**Stories:**

- **S5.5.1 — Local embedding model integration for offline semantic search**
  Integrate with the Ollama REST API (`/api/embeddings`) to compute local text
  embeddings for vault notes. When a local embedding model is available, the semantic
  search toggle (S3.3.5) routes to the local model instead of a cloud API. The
  embedding index is stored in `.vault/embeddings.bin` (float32 vectors) and updated
  incrementally on note saves. Dimension size adapts to the configured model.

- **S5.5.2 — Local LLM routing and capability detection**
  Implement a `ModelRouter` in `mcp/` that detects available AI backends in priority
  order: Claude API (cloud), Ollama (local), client-side TF-IDF fallback. Each MCP
  tool that calls an AI model accepts a `modelBackend` parameter. The router exposes
  capability flags (`supportsGeneration`, `supportsEmbeddings`, `maxContext`) so tools
  can gracefully skip AI-only features rather than erroring. Backend status is shown
  in Settings → AI → Model Status.

- **S5.5.3 — Client-side algorithmic fallbacks for bundle tools**
  All semantic bundle tools (session prep, recap, continuity check) have a non-AI
  fallback computation path using TF-IDF scoring, recency weighting, link graph
  centrality, and rule-based heuristics. The fallback runs in the renderer process
  without any external call. AI-enhanced versions augment the algorithmic base, not
  replace it. Document the fallback algorithms in `docs/AGENTIC_NOTES_WORKFLOW.md`.

- **S5.5.4 — Ollama model management UI**
  Add Settings → AI → Local Models showing: detected Ollama installation status, list
  of pulled models with their capability tags (chat, embed, vision), and a pull/delete
  UI. Recommend a default set of models: one embed model (`nomic-embed-text`) and one
  chat model (`llama3.2`). Display estimated disk usage and warn if available space
  is low. Link to Ollama download if not detected.

---

---
