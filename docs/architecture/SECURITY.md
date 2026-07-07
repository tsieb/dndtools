# DND Tools Security Model

**Last updated:** 2026-03-04
**Owner:** Engineering
**Epic:** 1.4 — IPC Hardening & Security Model

---

## 1. Overview

DND Tools is a local-first Electron application. All vault data lives on the
user's own filesystem, and the app is fully usable with no account and no
network. Cloud features (Cognito accounts, internet remote play, and E2EE
cloud sync) are **opt-in** and covered in §6. The primary threat actors are:

| Actor                   | Description                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Malicious vault content | Markdown files containing embedded scripts or path-traversal sequences                                       |
| Compromised renderer    | A cross-site-scripting (XSS) vulnerability in the renderer that lets an attacker send arbitrary IPC messages |
| MCP sidecar abuse       | An AI agent using the MCP interface to read/write vault data beyond its intended scope                       |
| Physical access         | An attacker with local access to the filesystem                                                              |

This document catalogues the attack surface, current mitigations, open risks,
and the remediation plan for each open item.

---

## 2. Architecture Trust Boundaries

```
┌────────────────────────────────────────────────────────────┐
│ OS Filesystem (vault directory)                            │
│   ├── notes/       (markdown files)                        │
│   ├── objects/     (JSON object files)                     │
│   ├── boards/      (JSON board files)                      │
│   └── .dndtools/   (metadata, snapshots, migration state)  │
└────────────────────────────────────────────────────────────┘
         ▲                              ▲
         │ file I/O                     │ file I/O
         │                              │
┌────────┴───────────────┐   ┌──────────┴─────────────────┐
│  Electron Main Process  │   │  MCP Sidecar (stdio, local) │
│  (Node.js, trusted)     │   │  (Node.js, trusted)         │
│                         │   │                             │
│  • FileSystemAdapter    │   │  • MCP tool handlers        │
│  • IPC validation layer │   │  • Staged write review      │
│  • DiagnosticsTracker   │   │  • Safe-write journal       │
└───────────┬─────────────┘   └─────────────────────────────┘
            │ contextBridge (explicit named API only)
            ▼
┌───────────────────────────────────────────────────────────┐
│  Renderer (SvelteKit, sandboxed)                          │
│  contextIsolation=true  nodeIntegration=false  sandbox=true│
│                                                           │
│  • Can only call methods exposed on window.dndtoolsDesktop│
│  • Cannot import Node.js, cannot access filesystem        │
│  • Cannot invoke arbitrary IPC channels                   │
└───────────────────────────────────────────────────────────┘
```

The **preload script** is the sole controlled crossing of the trust boundary
between the renderer and the main process. It exposes a finite set of named
methods; the renderer cannot call arbitrary IPC channels.

---

## 3. Vault Filesystem Attack Surface

### 3.1 Path Traversal

**Risk:** A malicious actor could craft note IDs, folder IDs, or `filePath`
fields containing `../../` sequences to escape the vault directory and read or
write arbitrary files on the host.

**Mitigations (current):**

- `electron/ipc-schemas.ts` — The `idSchema` and `folderPathSchema` Zod schemas
  reject any string containing `..` before the value reaches the storage layer.
- `mcp/storage.ts` — The `FileSystemAdapter` independently resolves all paths
  relative to the vault root and performs a containment check
  (`resolved.startsWith(vaultRoot)`) before any filesystem operation.
- `electron/main.ts` — The static asset server performs the same containment
  check for HTTP requests.

**Residual risk:** None known for path traversal. Defence is applied at two
independent layers (IPC validation and storage).

### 3.2 Vault Write Without Snapshot

**Risk:** Bulk operations (import, automated MCP writes) could corrupt the
vault before the user can intervene.

**Mitigations (current):**

- Safety snapshots available via `createSafetySnapshot()` before destructive
  operations.
- MCP writes are staged by default (strict_review preset) and require user
  approval in the review UI before reaching the filesystem.
- The write journal in `mcp/safe-write.ts` allows recovery after crash during
  multi-file operations.

**Residual risk:** Low. The user can always restore from a safety snapshot.

### 3.3 Large File Denial-of-Service

**Risk:** A renderer compromise or malicious MCP agent could send extremely
large payloads (e.g., a 1 GB note body) that exhaust heap memory in the main
process.

**Mitigations (current):**

- `electron/ipc-schemas.ts` — Note content is capped at 10 MB per note. Import
  arrays are capped at 10,000 notes. All string fields have explicit upper
  bounds.
- MCP tool schemas in `mcp/tools/` independently validate input sizes.

**Residual risk:** Low for the IPC surface. An attacker with direct filesystem
access could still write arbitrarily large files, but those would only be read
on demand and are bounded by the rendering pipeline.

---

## 4. IPC Injection Vectors

### 4.1 Arbitrary IPC Channel Invocation

**Risk:** If the preload exposed a generic `invoke(channel, ...args)` method, a
compromised renderer could call any registered channel — including privileged
operations like `dndtools:diagnostics:export` (triggers a file-save dialog) or
`dndtools:pick-vault` (opens a directory picker).

**Mitigations (current):**

- The preload in `electron/preload.ts` exposes **only named methods** (e.g.
  `getNote`, `saveNote`, `pickVaultDirectory`). There is no generic invoke
  escape hatch.
- `contextIsolation: true` means the renderer cannot access `ipcRenderer`
  directly.
- `sandbox: true` means the renderer process runs in a Chrome sandbox and
  cannot import Node.js modules.

**Residual risk:** None. The IPC surface is closed.

### 4.2 Type-Confusion / Missing Payload Validation

**Risk:** Before Epic 1.4, handlers accepted parameters typed as broad types
(e.g. `id: string`) and cast them with `as never` without runtime validation.
A compromised renderer could send values of unexpected types (numbers, objects,
arrays) to confuse the storage layer.

**Mitigations (current):**

- Every IPC handler in `electron/main.ts` now calls `parseIpcArg()` from
  `electron/ipc-schemas.ts` before any business logic.
- `parseIpcArg()` uses Zod `.safeParse()` and throws a structured `Error` on
  failure. Electron's `ipcMain.handle` infrastructure converts this to a
  rejected promise on the renderer side; the main process does not crash.
- The `as never` casts have been eliminated. After validation, values are cast
  to branded types (e.g. `as NoteId`) which is a TypeScript-only assertion, not
  a runtime coercion.

**Residual risk:** None. `setSetting` now validates both the key (via
`appSettingsKeySchema`) and the value (via `settingValueSchemas` keyed by the
validated setting key, defined in `electron/ipc-schemas.ts`). Both validations
occur before any storage call.

### 4.3 Settings Key Injection

**Risk:** A compromised renderer calling `setSetting` with an arbitrary key
(e.g. `__proto__`, `constructor`, or a new invented key) could corrupt the
settings store.

**Mitigations (current):**

- `appSettingsKeySchema` in `electron/ipc-schemas.ts` is a Zod `z.enum` of
  all 15 valid `AppSettings` keys. Any other string causes the handler to
  throw before the storage call.

**Residual risk:** None for key injection. New settings fields added in future
must also be added to `appSettingsKeySchema`.

### 4.4 Oversized Diagnostics Payloads

**Risk:** The `diagnostics:record-error` handler previously used a manual type
guard (`isStructuredErrorEvent`) that only checked field types, not field
lengths. A very long `message` or `details` field could still consume excessive
memory.

**Mitigations (current):**

- `structuredErrorEventSchema` now enforces `message ≤ 10 MB` and
  `details ≤ 10 MB`, consistent with note content limits.

**Residual risk:** None known.

---

## 5. MCP Sidecar Trust Boundary

### 5.1 MCP Sidecar Authentication

**Risk:** The MCP sidecar listens on stdio and is launched by the Electron main
process. If the sidecar port or process were somehow accessible to other
processes, they could invoke MCP tools without authorisation.

**Mitigations (current):**

- The MCP sidecar communicates exclusively over **stdio** (not TCP or HTTP).
  There is no network listener; the attack surface does not exist.
- The sidecar is a child process owned by `electron/mcp-sidecar.ts`; it is
  restarted when the vault changes and stopped on app exit.

**Residual risk:** None for network-based attacks.

### 5.2 MCP Write Scope

**Risk:** An AI agent using the MCP interface could perform bulk writes that
alter vault content in ways the user did not intend.

**Mitigations (current):**

- All MCP write tools use the staged-write system
  (`mcp/staged-storage.ts`). Writes are held in a pending queue and displayed
  in the MCP Changes UI for human approval before they reach disk.
- The default policy (`strict_review`) requires approval for every write.
  Agents can be individually promoted to `balanced` or `trusted` but only
  through the in-app policy settings.
- The `mcpPolicySettingsSchema` in `electron/ipc-schemas.ts` whitelists the
  three valid preset IDs, preventing a renderer from injecting arbitrary
  policy values.

**Residual risk:** Low. A `trusted` agent could write directly without review.
This is an opt-in configuration decision made by the user through the UI.

### 5.3 MCP Sidecar Path Traversal

**Risk:** An AI agent could craft tool arguments with path-traversal sequences
to access files outside the vault.

**Mitigations (current):**

- MCP tool schemas in `mcp/tools/` validate all input paths (e.g. folder, id)
  with Zod schemas that reject `..` segments.
- `mcp/storage.ts` independently enforces vault containment on every filesystem
  operation.

**Residual risk:** None known. Two independent validation layers exist.

---

## 6. Local-Only vs Cloud-Connected Threat Profile

DND Tools is **local-first**: with no account and no opt-in, it is fully local-only
(no cloud storage, no third-party analytics/telemetry, no remote sync). Cloud
features are **opt-in** and being rolled out (see ADR-007/015/017):

- **Accounts + internet remote play (shipped, opt-in):** AWS Cognito (SRP + PKCE)
  identity; a WebSocket signaling relay + coturn TURN for WebRTC. Auth/refresh
  tokens are held in the OS credential store (Electron `safeStorage`), never in
  IndexedDB/localStorage or logs (`SEC-004`); on the web build tokens are
  memory-only. The relay is untrusted: it sees only opaque, already-encrypted
  offer/answer codes and mints short-lived HMAC TURN credentials.
- **Cloud sync/backup (shipped, opt-in):** end-to-end encrypted with **client-held**
  AES-256-GCM keys per key epoch (ADR-017, `packages/core/src/security/vault-crypto.ts`).
  Every artifact is sealed on-device before upload; the sync-api (`infra/sync-api/`,
  API GW HTTP + Lambda + S3 + DynamoDB) stores ciphertext plus a strictly bounded
  metadata set only (`vault-id`, `participant-id`, `operation-revision`,
  `operation-size`, `content-hash`, `timestamp`) — proven on every write by the same
  `assertServerSeesOnlyAllowedMetadata` policy the client uses. The server holds no key
  and never decrypts; storage is tenant-isolated by Cognito `sub`. Restore is
  snapshot-based (there is no generic op-applier). Cloud sync stays **off by default
  and fail-closed** behind the SYNC-017 gate, and is offered only on devices with an OS
  credential store to durably hold the client key. Verified end-to-end
  (`infra/verify-sync.sh`): encrypted push/pull/snapshot/restore, ciphertext-at-rest,
  and fail-closed rejection of plaintext in metadata.

Remaining items to document as web hosting + CI land:

- CloudFront CSP parity with the Electron `connect-src` allowlist.
- Server-side rate limiting / abuse budgets on the sync-api (self-tenant caps are in place).

Desktop updates use GitHub Releases via `electron-updater` with signed release
artifacts and staged rollout controls for major-version adoption.

---

## 7. Renderer Content Security

### 7.1 Markdown Rendering

**Risk:** Vault notes contain user-authored markdown. If the rendering
pipeline allows raw HTML or JavaScript, a malicious note could execute scripts
in the renderer context.

**Mitigations (current):**

- The unified/rehype pipeline applies `rehype-sanitize` which strips
  `<script>`, `<style>`, `on*` event attributes, and `javascript:` URLs by
  default.
- Renderer components use the sanitised HTML output, not raw note content.

**Residual risk:** Depends on `rehype-sanitize` defaults remaining strict. Any
future relaxation of sanitisation rules must be reviewed for XSS impact.

### 7.2 Wikilink Targets

**Risk:** Wikilinks (`[[target]]`) could be crafted to navigate to unexpected
routes if the link resolver does not validate the target.

**Mitigations (current):**

- Wikilink targets are resolved through the `StorageAdapter.resolveTitle()`
  call, which returns a `Note | null`. Navigation only occurs if a matching
  note exists.

**Residual risk:** Low.

---

## 8. Risk Register

| ID  | Description                                     | Severity | Status    | Remediation Target | Owner       | Review Cadence |
| --- | ----------------------------------------------- | -------- | --------- | ------------------ | ----------- | -------------- |
| R1  | `setSetting` value not schema-validated per key | Low      | Closed    | Epic 1.5           | Engineering | —              |
| R2  | rehype-sanitize defaults must not be relaxed    | Low      | Monitor   | Ongoing            | Engineering | Each dep bump  |
| R3  | Cloud sync will expand attack surface           | Medium   | Future    | Phase 5 pre-launch | Engineering | Pre-Phase 5    |
| R4  | `trusted` MCP agents bypass write review        | Low      | By-design | Document in UI     | Engineering | Annual         |

---

## 9. Security Regression Test Coverage

The `electron/ipc-security.test.ts` suite (run via `pnpm test`) verifies:

| Test group            | Acceptance criteria                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Oversized payloads    | Note content > 10 MB rejected; import > 10 000 notes rejected; IDs > 512 chars rejected                        |
| Path traversal        | `../`, `..\\`, null bytes, control characters all rejected in IDs and folder paths                             |
| Enum whitelists       | Unknown settings keys, object types, subsystem names, MCP presets all rejected                                 |
| parseIpcArg behaviour | Structured error thrown; channel name in message; path in message for nested failures; valid payloads accepted |

Run with: `pnpm test` (Vitest, node environment).

---

## 10. Contact and Reporting

This is a personal, local-first application. Security concerns should be
filed as GitHub issues in the project repository.
