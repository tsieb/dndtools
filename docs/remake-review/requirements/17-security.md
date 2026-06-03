## SEC - Security

Capability tree:

- Renderer and platform isolation: `SEC-001`, `SEC-007`
- Input and content safety: `SEC-002`, `SEC-003`, `SEC-006`
- Secrets and cloud collaboration: `SEC-004`, `SEC-005`, `SEC-009`, `SEC-012`
- Regression gates and stream privacy: `SEC-008`, `SEC-010`, `SEC-011`

### SEC-001
**Statement:** The renderer shall remain sandboxed and unable to access Node APIs, filesystem APIs, arbitrary IPC, cloud credentials, or MCP sidecar internals directly.
**Source:** Security trust boundaries; Architecture Contract 1 layers.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given renderer code attempts to import filesystem APIs, when lint/build runs, then the boundary violation fails.
- Given a compromised renderer attempts arbitrary IPC invocation, when executed, then no generic invoke channel exists.
- Given the desktop shell creates renderer windows, when release security checks inspect configuration, then `contextIsolation` is true, `nodeIntegration` is false, `sandbox` is true, and preload exposes only explicit named APIs.

### SEC-002
**Statement:** All path-like inputs shall be validated against traversal, null bytes, control characters, excessive length, unsupported schemes, and vault containment before any read or write.
**Source:** Security Path Traversal; OWASP ASVS validation/access control.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given `../` appears in a note id or folder input, when validated, then the request is rejected before storage access.
- Given a resolved path escapes the vault root, when storage containment checks run, then the operation is rejected even if earlier validation missed it.

### SEC-003
**Statement:** Rendered markdown, embeds, object cards, custom widget content, and imported source content shall be sanitized or sandboxed before entering the renderer DOM.
**Source:** Security Markdown Rendering; OWASP ASVS.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a note contains `<script>` or `javascript:` URL content, when rendered, then unsafe content is removed or neutralized.
- Given a custom widget renders user-authored markup, when mounted, then it runs under the widget host constraints rather than unrestricted DOM mutation privileges.

### SEC-004
**Statement:** Auth tokens, refresh tokens, session secrets, cloud credentials, and MCP agent secrets shall be stored in OS or platform credential stores where available and never in vault markdown, exported packages, logs, diagnostics, or player streams by default.
**Source:** Architecture Contract 2 Device-local only; NIST session secrets.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given diagnostics are exported, when scanned, then token-like values are redacted.
- Given vault export runs, when output is inspected, then auth secrets are absent.

### SEC-005
**Statement:** Cloud collaboration shall use authenticated protected channels, participant identity, revocation, rate-limited session joins, tenant/session isolation, replay protection, cloud-side stream filtering, and fail-closed parsing for unsupported payload versions.
**Source:** Architecture Contract 2 Sync Security; NIST/OWASP guidance.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given an unsupported future sync payload version arrives, when parsed, then it fails closed with upgrade-required diagnostic.
- Given repeated invalid join attempts occur, when rate limiting applies, then further attempts are throttled without leaking session existence details.
- Given a player attempts to access another vault, session, tenant, or player stream, when cloud authorization evaluates the request, then access is denied before payload generation.
- Given an old valid-looking sync payload is replayed, when nonce/revision/session validation runs, then the replay is rejected or ignored idempotently.
- Given a participant is revoked, when cloud collaboration state updates, then their stream is torn down, session credentials are invalidated, and queued operations from that participant are rejected unless explicitly accepted before revocation.

### SEC-006
**Statement:** Input payloads crossing IPC, sync, widget host, MCP, import, and cloud boundaries shall have explicit size limits, schema validation, enum allowlists, and structured rejection errors.
**Source:** Security Large File DoS; IPC schema validation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given an import contains more entries than the configured maximum, when validation runs, then the import is rejected before allocation-heavy processing.
- Given an enum field contains an unknown value, when parsed, then structured rejection identifies the field path.

### SEC-007
**Statement:** Custom widget code shall run in a constrained host API with declared host permissions and no direct access to storage adapters, IPC, cloud clients, auth tokens, platform bridges, raw vault files, or hidden actor data.
**Source:** Architecture Contract 4 Custom Widget Code.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a custom widget requests clipboard access without declaring permission, when run, then clipboard API is unavailable.
- Given a custom widget attempts to read raw vault files, when executed, then the host rejects access and isolates the widget failure.
- Given a custom widget requests network access, when host permission is not approved for the specific destination class, then outbound network APIs are unavailable and the attempt is audited.

### SEC-008
**Statement:** Security regression tests shall cover IPC validation, storage containment, markdown sanitization, widget host permission denial, sync stream filtering, MCP staged write enforcement, and cloud join authorization.
**Source:** Security Regression Test Coverage; Defects security carry-forward.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a security-critical boundary is added without tests, when architecture tests run, then the missing coverage fails the gate.
- Given a known player-data leak fixture is tested, when player queries run, then hidden data never appears in returned payloads.

### SEC-009
**Statement:** The cloud security model shall declare encryption responsibilities, key custody, server trust boundaries, credential rotation, and recovery tradeoffs before cloud sync or collaboration release.
**Source:** Vision Cloud Sync & Multi-User; OWASP ASVS; NIST session guidance.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given cloud sync is enabled for a vault, when security review runs, then encryption at rest, encryption in transit, key ownership, and recovery behavior are documented and test-covered.
- Given a credential or session key is rotated or revoked, when the participant reconnects, then stale credentials no longer authorize payload access.
- Given no cloud encryption/key-custody decision record exists, when release gating runs for cloud sync or collaboration, then the release is blocked.
- Given the approved model claims end-to-end encryption, when cloud payloads are inspected by server-side code paths, then hidden content is unavailable to the server except for metadata explicitly allowed by the decision record.

### SEC-010
**Statement:** Player and observer replication stream tests shall assert absence of hidden entity data, hidden metadata, revealing counts, and hidden relationship edges across notes, maps, characters, Scenes, search, graph, widgets, MCP, and sync status.
**Source:** Defects `CODEX-PR5-DM-NOTES-LEAK`, `CODEX-PR17-POI-VISIBILITY-LEAK`; Architecture Contract 3 Visibility.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a fixture contains hidden content in every major domain, when player and observer streams are generated, then no hidden value, title, id, edge, snippet, or revealing count is present.
- Given a new query surface is added, when security coverage is evaluated, then the surface is included in replication filtering tests before release.

### SEC-011
**Statement:** Widget host network and exfiltration controls shall constrain outbound requests, storage access, clipboard use, telemetry, and cross-widget communication through explicit host permissions and audit.
**Source:** Security widget host; Glossary "Widget Package"; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a widget attempts to send hidden actor data, raw vault content, tokens, diagnostics, or absolute paths over an approved network permission, when the host validates the payload, then the request is blocked or redacted according to policy.
- Given a widget has network permission for one destination class, when it requests another destination, then the request is denied and audited.
- Given a widget stores local state, when inspected, then it cannot use widget-local storage as the sole source of truth for canonical vault/session data.
- Given a widget crashes or violates host policy, when isolated, then other widgets and core app state remain available.

### SEC-012
**Statement:** Cloud key custody, rotation, participant revocation, and recovery behavior shall be enforced by tests before any cloud sync or collaboration release.
**Source:** Vision Cloud Sync & Multi-User; Feature Inventory I7 encryption; Sync and Collaboration requirements.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a participant is removed from a session, when keys rotate, then newly synced or newly delivered content cannot be decrypted with the removed participant's credentials.
- Given a recovery flow is configured, when tested, then it restores only the approved recovery scope and does not expose another vault, tenant, or participant stream.
- Given cloud storage is compromised in the threat model, when the approved key-custody model is evaluated, then the exposed plaintext and metadata classes match the documented server trust boundary.
