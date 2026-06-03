## MCP - MCP Tools and AI Agent Integration

Capability tree:

- Optionality and baseline tools: `MCP-001`, `MCP-002`
- Identity, policy, and staged writes: `MCP-003`, `MCP-009`, `MCP-011`
- Core enforcement and tests: `MCP-004`, `MCP-005`, `MCP-012`
- Semantic bundles and AI boundaries: `MCP-006`, `MCP-007`, `MCP-008`, `MCP-013`
- Response contracts: `MCP-010`

### MCP-001
**Statement:** The DM shall be able to disable MCP completely without losing core app functionality for notes, maps, Scenes, characters, sessions, sync, search, or graph operations.
**Source:** Vision "MCP can be completely disabled"; Architecture Cross-Contract.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given MCP is disabled, when the DM edits notes and runs a session, then core workflows continue without MCP processes.
- Given an MCP-only command is requested while disabled, when invoked, then it returns disabled status without affecting core state.

### MCP-002
**Statement:** The MCP layer shall ship baseline read tools for vault summary, note read/list/search, graph context, character query, dice roll, and session prep bundles.
**Source:** Vision MCP baseline tools; Feature Inventory MCP Tool Inventory.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given MCP is enabled for the DM, when an agent requests a vault summary, then the tool returns structured context from core indexes.
- Given a player-scoped MCP context is ever supported, when used, then tool responses are visibility-filtered before output.
- Given baseline MCP tools are disabled by policy, when the app core runs, then notes, maps, Scenes, characters, sessions, sync, search, and graph remain usable through non-MCP UI and core commands.
- Given MCP is disabled, when navigation and command surfaces render, then MCP sections, agent commands, and tool-only actions are absent or disabled with a non-leaking disabled status.

### MCP-003
**Statement:** MCP write tools shall default to `strict_review` staged human review and require explicit `trusted_direct` mode configuration before writing durable vault state directly.
**Source:** Security MCP Write Scope; Project Overview Human-reviewed AI writes.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given `strict_review` mode, when an MCP tool creates a note, then a staged change appears for human approval instead of an immediate write.
- Given `trusted_direct` mode is enabled, when an MCP write occurs, then the mode and agent identity are included in audit history.
- Given `balanced` mode batches staged low-risk changes, when approval is requested, then the user can approve or reject the batch before durable writes occur.
- Given an MCP write targets an object, Scene widget, map asset, session state, or character field, when `strict_review` mode is active, then the operation is staged or rejected according to declared tool capability rather than writing directly by default.

### MCP-004
**Statement:** MCP read and write tools shall use Processing Core queries and commands so visibility, permission, schema, revision, and sync policies are enforced centrally.
**Source:** Architecture Contract 1 Processing Core; Defects player visibility leaks.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an MCP tool reads character data, when the actor is not DM, then hidden fields are omitted by the data layer.
- Given an MCP write command fails schema validation, when submitted, then no staged or direct durable mutation is accepted.

### MCP-005
**Statement:** Every write-capable MCP tool and every baseline read/report tool shall have dedicated behavior tests for schema validation, actor policy, visibility filtering, idempotency where applicable, staged preview, direct mode where applicable, and failure handling.
**Source:** Defect `CLAUDE-INFRA-MCP-TESTS`; Feature Inventory MCP Test implications.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: not applicable | Player-safe: dm-only
**Acceptance criteria:**
- Given a new write-capable MCP tool or baseline read/report tool is added without dedicated tests, when CI runs, then the merge gate fails.
- Given a tool receives invalid input, when tested, then the expected structured error is asserted.

### MCP-006
**Statement:** MCP semantic bundle tools shall pre-process vault data into bounded, source-cited context packages for session prep, recap, continuity, open threads, coverage gaps, and campaign health.
**Source:** Feature Inventory I5; Vision AI role.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a session prep bundle request, when generated, then output includes bounded source references and excludes hidden player-inaccessible content unless DM-scoped.
- Given the vault exceeds context limits, when bundled, then semantic compression chooses summaries rather than raw full-vault content.

### MCP-007
**Statement:** AI agents shall be limited to creative text assistance, narrative suggestions, named entity extraction, and explanation over deterministic findings; they shall not own graph intelligence, relationship scoring, sync conflict resolution, or permission decisions.
**Source:** Vision "AI supplements algorithms"; Architecture Cross-Contract.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given AI is disabled, when graph relationship scoring runs, then deterministic scores are still produced.
- Given an AI suggests a permission or conflict resolution, when applied, then a human/Core command must validate and accept it before state changes.

### MCP-008
**Statement:** Local AI integrations shall be optional and capability-detected, with deterministic non-AI fallbacks for every Must-have workflow.
**Source:** Feature Inventory I5 local AI incomplete; Vision MCP optional.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given no local model runtime is installed, when a session recap is requested, then deterministic recap scaffolding still works.
- Given a local model is available, when enabled, then the app reports model capability and failure state without blocking non-AI features.

### MCP-009
**Statement:** The DM shall be able to configure per-agent MCP policy modes of `disabled`, `strict_review`, `balanced`, and `trusted_direct`, plus tool allowlists and audit visibility.
**Source:** Security MCP policy; Feature Inventory I5 per-agent policy.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a new agent connects, when no policy exists, then it defaults to `strict_review` or `disabled` according to vault settings.
- Given the DM changes an agent policy, when the agent invokes a tool, then the new policy is enforced immediately.
- Given policy mode is `disabled`, when the agent invokes any tool, then the call returns disabled status before core queries run.
- Given policy mode is `trusted_direct`, when a direct write is allowed by tool allowlist, then Processing Core validation and audit still run before mutation.

### MCP-010
**Statement:** MCP and AI outputs shall use stable, concise, structured response envelopes with ids, status, summary, data, warnings, citations, and remediation actions where applicable.
**Source:** Vision "Formatting and output structure streamlined"; MCP shared response patterns.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an MCP tool succeeds with warnings, when output is returned, then warnings and data are separated in the response envelope.
- Given an MCP tool fails, when output is returned, then the error is structured, actionable, and does not include hidden data.

### MCP-011
**Statement:** Each MCP agent connection shall map to an authenticated vault actor, session role, policy profile, and audit identity before any tool can read or stage data.
**Source:** Architecture Contract 1 Processing Core; MCP policy requirements; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an agent connects without a valid actor mapping, when it invokes any tool, then the tool call is rejected before core queries run.
- Given a DM-scoped agent stages a write, when audit history is inspected, then agent id, actor id, policy mode, tool id, and staged/direct mode are recorded.

### MCP-012
**Statement:** MCP filesystem and platform-service exceptions shall be explicitly allowlisted, linted, and covered by regression tests rather than inferred from broad runtime access.
**Source:** Known Defect `AUDIT-21.5-MCP-FS-EXCEPTIONS`; Security boundaries.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: not applicable | Player-safe: dm-only
**Acceptance criteria:**
- Given an MCP tool imports filesystem APIs outside the allowlist, when boundary lint runs, then the gate fails.
- Given an allowlisted MCP filesystem operation runs, when tested, then containment, size limits, schema validation, and audit behavior are asserted.

### MCP-013
**Statement:** MCP bundle tools shall include calendar/custom-time context for prep, recap, continuity, and campaign health when visible source data contains dates or timeline relationships.
**Source:** Feature Inventory I3/I5 calendar-aware MCP tools.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a DM requests a session recap bundle, when calendar-linked events exist, then visible custom dates and source citations are included.
- Given a player-scoped bundle is ever supported, when hidden dated events exist, then those events and revealing aggregate counts are omitted or generalized.
