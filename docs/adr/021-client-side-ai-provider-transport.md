# ADR-021: Client-Side BYO-Key AI Provider Transport

- Status: Accepted (amended by [ADR-025](./025-agentic-multi-step-assistant-runs.md))
- Date: 2026-07-11
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A
- Amended by: ADR-025 (2026-07-15) — turns the single-ask assistant into an autonomous multi-step
  run (streaming/cancellable loop, raised tool budget), expands the staged MCP write surface
  (`table.create`, `character.create`, `note.update`), adds guided provider onboarding + a local
  Ollama runner, and fixes the staged-write payload to match the direct-write path. No safety rule is
  relaxed — writes remain staged proposals.
- Amends: ADR-014 — lifts its AI/agent-provider **transport** deferral. ADR-014 kept the first
  prototype provider-agnostic and deferred the cloud/provider/transport choice ("defer CRDT/cloud/
  provider choices"; no MCP/provider packages in the first slice). ADR-002 and ADR-008 then built
  the whole MCP identity/policy/staged-write **Processing-Core** surface, but `agent-dispatch.ts`
  states plainly: _"Per ADR-014 the MCP transport is deferred; this composes only Processing-Core
  surfaces."_ That last deferral is now closed: an app-side client can actually talk to a model
  provider and drive that existing pipeline. ADR-014's storage boundary and the ADR-002 staged-write
  contract remain fully in force — this ADR adds a transport, it does not relax any safety rule.

## Context

The MCP layer in `@dndtools/core` (`packages/core/src/mcp/*`) is real and complete: the master
enable switch (MCP-001), agent→actor identity binding (MCP-011), per-agent policy + tool allowlist
(MCP-009), and the staged-write proposal model (ADR-002). The Settings → AI & tools screen already
dispatches the `mcp.*` commands that administer all of it. But nothing could _call a model_: there
was no code path from a user's question to an LLM and back into `invokeMcpToolAsAgent`. Every AI
surface was therefore honestly labeled "no transport ships in this build". Closing this is the
single largest deferred capability; the release bar is "every feature functional except desktop
signing and payment processing".

Constraints that shape the design:

- **No server to proxy through.** The app is local-first (ADR-014) and the cloud backend
  (ADR-007/020) is a thin app-api, not an inference gateway. Adding a server-side LLM proxy would
  mean holding a shared provider key, per-user metering, and an always-on billed service — none of
  which is in scope.
- **Secret custody is already governed.** ADR-015/SEC-004 and the boundary lint (PLAT-012) require
  that credentials never enter core state, the op log, or E2EE sync, and that plaintext secrets are
  not written at rest on the web. `src/cloud/tokenStore.ts` / `secureStore.ts` are the sanctioned
  patterns.
- **Agent writes must stay staged.** ADR-002 is non-negotiable: a model must never write directly to
  the vault. Its tool calls have to flow through the same fail-closed pipeline as any other agent.

## Decision

Ship the transport **entirely client-side, with a bring-your-own-key model**, in a new app-layer
module `apps/gm-react/src/ai/` (transport layer, alongside `src/cloud` / `src/net` — not GUI).

1. **Two provider wire formats, one provider-agnostic call** (`transport.ts`, `sendAiChat`):
   - **Anthropic Messages API** — `POST https://api.anthropic.com/v1/messages` with
     `anthropic-version: 2023-06-01` **and** `anthropic-dangerous-direct-browser-access: true`
     (required for a direct browser/CORS call). Default model `claude-sonnet-5`.
   - **Any OpenAI-compatible endpoint** — `POST {baseUrl}/chat/completions` with a Bearer key — so
     users can point at a local runner, a proxy, or another vendor and are not locked in.

   The transport shapes requests, parses replies into a provider-agnostic `AiReply` (text + tool
   calls + stop reason), and maps failures onto a typed `AiTransportError` (`auth` / `rate-limit` /
   `api` / `network` / `not-configured`), mirroring `appApi.ts`'s honest 4xx-message / generic-5xx
   split. It knows nothing about MCP.

2. **BYO-key, device-local custody** (`providerConfig.ts`): the user supplies their own key in
   Settings. The key lives in module memory + `sessionStorage`, and is mirrored into the
   OS-encrypted durable store on desktop (`secureStore`) exactly as `tokenStore.ts` does — **never**
   `localStorage`, the vault, a command payload, or the op log, so it can never sync to another
   device. Non-secret settings (provider kind, model id, base URL) persist in `localStorage`, the
   same metadata/secret split `googleDocs.ts` draws. The whole surface is **fail-closed**: with no
   key (or an OpenAI-compatible provider with no base URL) `resolveAiProviderConfig()` returns
   `null` and every AI surface stays off.

3. **MCP is the only door to the vault** (`mcpBridge.ts` + `SceneRuntime.invokeAgentTool`): the
   model is offered tool specs projected from the Core's own declared registry (name-sanitized for
   both wire formats; JSON Schema derived from each tool's Zod schema). Every tool call the model
   makes is routed through `SceneRuntime.invokeAgentTool` → `invokeMcpToolAsAgent`, which runs the
   full optionality → identity → policy pipeline against authoritative state and
   persists like any command (PLAT-018 rollback-on-persist-failure included). The built-in model client
   sets the Core invocation's restrictive `forceStageWrites` option, so reads come back actor-filtered
   and **writes become staged proposals** even if the selected generic agent policy is `trusted_direct`;
   a human DM approves them in the existing
   review UI — the bridge's result mapping explicitly tells the model a staged write has _not_ been
   applied. A bounded per-ask tool budget keeps the exchange from looping.

4. **Entry surface**: the Settings → AI & tools screen gains an _AI provider_ panel (key custody)
   and an _Assistant_ panel (one ask at a time, run as a chosen agent binding). The assistant is
   disabled with an honest reason until every prerequisite is real: provider key present, MCP master
   switch on, a registered agent binding, and DM (not previewing).

## Consequences

### Positive

- Closes the last ADR-014 transport deferral; AI features are functional end-to-end without a
  server, a shared key, or a new billed service.
- No new trust boundary: the only credential is the user's own, held under the existing SEC-004
  custody rules; the model's authority is exactly the bound actor's, and its writes are staged.
- Vendor-agnostic — Anthropic direct or any OpenAI-compatible endpoint — so the choice is the
  user's, not baked into the app.
- One source of truth for the tool surface (the Core registry), so offered tools cannot drift from
  what actually runs.

### Negative

- The key is exposed to the page at request time (inherent to any browser-side BYO-key design). The
  `anthropic-dangerous-direct-browser-access` header names this; it is acceptable because the key is
  the user's own and never bundled, proxied, or synced. Users who object can point the
  OpenAI-compatible provider at a local proxy that holds the key instead.
- CORS/rate limits are the provider's, surfaced honestly rather than smoothed over by a server.
- BYO-key means no zero-config assistant — the app ships no key, by design.

## Rejected Alternatives

| Alternative                                                    | Why Rejected                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side inference proxy in the cloud backend               | Requires a shared provider key, per-user metering, and an always-on billed service; contradicts the local-first, no-payment-processing release bar and adds a trust boundary the E2EE model deliberately avoids. |
| Anthropic-only transport                                       | Locks users to one vendor and forbids local/offline runners; the OpenAI-compatible path costs little and removes the lock-in.                                                                                    |
| Let the model write directly under a "trusted" mode by default | Violates ADR-002. `trusted_direct` remains available to explicitly configured generic MCP callers, but the built-in model assistant always passes `forceStageWrites`; its writes stay staged-review.             |
| Store the key in `localStorage` / the vault for convenience    | Breaks SEC-004 (plaintext at rest on web) and PLAT-012, and would let the key sync to other devices via the op log. Memory + `sessionStorage` + OS-encrypted desktop mirror is the sanctioned custody.           |

## Migration Impact

- New app-layer module `apps/gm-react/src/ai/{transport,providerConfig,mcpBridge}.ts`; no core
  contract changes. `SceneRuntime` gains one method (`invokeAgentTool`) that reuses the existing
  `invokeMcpToolAsAgent` transition and persistence path.
- `zod` is added as an `apps/gm-react` dependency to derive tool JSON Schemas (`z.toJSONSchema`).
- No storage migration: no new Core state, no op-log shape change, no schema-version bump. The key
  and settings live entirely in device-local browser storage / the desktop secure store.
- Boundary lint: the module lives in the transport layer (`src/ai`, out of the GUI boundary like
  `src/cloud`), so its device-local storage reads need no new PLAT-012 exception.

## Rollback Plan

- Trigger: a provider-side CORS/policy change breaks direct browser calls, or a custody regression.
- Steps: the surface is fail-closed and self-contained — removing the two Settings panels (or simply
  leaving no key configured) returns every AI surface to its prior honest "not configured" state
  with no data to unwind. The `src/ai/` module can be deleted without touching Core or storage.
- Data recovery: none required — nothing durable is written outside device-local key/settings
  storage, which is disposable.
- Risk: low; the MCP policy/staged-write layer that guards the vault is unchanged and independently
  gated.

## Verification and Evidence

- Transport: `apps/gm-react/src/ai/transport.ts` + `transport.test.ts` (request shaping for both
  wire formats incl. the direct-browser-access header, reply/tool-call parsing, stop-reason mapping,
  fail-closed not-configured, and the typed auth/rate-limit/api/network error surfaces — fetch
  mocked, never hits the network).
- Key custody: `apps/gm-react/src/ai/providerConfig.ts` + `providerConfig.test.ts` (key in memory +
  `sessionStorage` and asserted absent from `localStorage`; fail-closed resolve; settings
  persistence and corrupt-data fallback).
- MCP bridge: `apps/gm-react/src/ai/mcpBridge.ts` + `mcpBridge.test.ts` (tool specs from the real
  Core registry, honest result folding incl. "staged, NOT applied", and the exchange loop routing
  each call through the injected agent pipeline with a bounded tool budget).
- Runtime seam: `apps/gm-react/src/runtime/SceneRuntime.ts` (`invokeAgentTool`).
- Entry surface: `apps/gm-react/src/screens/Settings.tsx` (`AiProviderPanel`, `AiAssistantPanel`).
- Model/API reference: the Anthropic Messages API shape and `claude-sonnet-5` default follow the
  `claude-api` skill (direct-browser-access header, `anthropic-version: 2023-06-01`).
