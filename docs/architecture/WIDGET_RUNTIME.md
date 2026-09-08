# Widget Runtime

> **Status:** As-built reference for the RC-WID-1.x custom-widget host and authoring model.
> **Decision record:** `docs/adr/031-custom-widget-runtime-host.md` (ADR-031, amended
> 2026-09-06 for the worker sandbox and the AI-proposal tool as built).
> **Audience:** Engineers touching widget rendering, the package trust/review flow, or the
> widget builder's advanced step.
> **Related:** `docs/architecture/WIDGET_FEATURE_BRIEF.md` (product-level widget model);
> this doc covers only the `custom-html-js` runtime host, which the brief describes at a
> conceptual level.

## 1. The problem this closes

`packages/core` already modeled custom widgets as data — a `WidgetPackageDefinition` with a
`renderEntrypoint.runtime` of `template | builtin | custom-html-js`, declared
`hostPermissions`, and a written security policy (`security/widget-host-api.ts`,
`security/widget-exfiltration.ts`, `security/custom-widget-runtime.ts`) — but nothing in
`apps/gm-react` rendered a `custom-html-js` widget, no command ever moved a package out of
`unreviewed`, and the manual builder was a JSON textarea. The policy was a contract with no
counterparty.

## 2. The host: an opaque-origin iframe, `postMessage` host API v1

`custom-html-js` widgets render inside an iframe with `sandbox="allow-scripts"` and **no**
`allow-same-origin` (`apps/gm-react/src/app/widgets/SandboxHost.tsx`). The two flags together
are the whole security argument: the frame gets an opaque origin — no cookies, no
`localStorage`/IndexedDB, no reach into the host DOM or globals, no way to name the host's
origin in a fetch. `allow-same-origin` is never added for any package at any trust level.

**The frame loads a served document, not `srcdoc`.** ADR-031 originally specified building the
frame's `srcdoc` from package assets; that would have inherited the embedder's CSP under a
local scheme, silently breaking under the packaged shell's `script-src 'self'` (an opaque
origin can never match it). The frame instead loads `apps/gm-react/public/widget-host.html`, a
served first-party document carrying its own `WIDGET_SANDBOX_CSP`
(`packages/core/src/security/renderer-isolation.ts`), asserted identical in the document's
`<meta>` tag and the packaged shell's response header. Package assets arrive over the same
`postMessage` channel in an `init` message sent on `ready`.

Message set (`apps/gm-react/src/app/widgets/hostBridge.ts`), mirroring
`security/widget-host-api.ts` one-to-one:

| Direction     | Message                            | Backed by                                                          |
| ------------- | ---------------------------------- | ------------------------------------------------------------------ |
| widget → host | `ready { hostApiVersion }`         | `resolveCustomWidgetRuntimePolicy` version check                   |
| host → widget | `render(props)`                    | actor-filtered binding + data-query results only                   |
| host → widget | `configChanged` / `bindingChanged` | same actor-filtered projection, re-sent on change                  |
| widget → host | `dispatch(commandDescriptor)`      | `widget.dispatch-command` + operator-authority check               |
| widget → host | `requestPermission(kind)`          | `resolveHostCapability` against the package's approved grant       |
| widget → host | `outbound(request)`                | `requestWidgetNetwork` → `evaluateWidgetOutboundRequest` (SEC-011) |
| widget → host | `resize { height }`                | host-applied frame height, clamped (iframe sandbox only, see §3)   |

**The core decides, the host relays.** `hostBridge.ts` never answers `requestPermission` or
`outbound` from its own logic — it calls the pure core functions above and forwards the
result, so there is exactly one policy implementation. Every inbound message is validated and
attributed to a widget instance id before it is acted on; unknown kinds, version mismatches,
and messages from an unexpected frame are dropped and audited. A frame that throws, hangs past
the host timeout, or violates policy is torn down through `isolateWidgetFailure`; siblings and
core state stay alive and the slot renders `WidgetPlaceholder.tsx` with the diagnostic. Only
actor-filtered `render` props ever cross the boundary — built from the same `*ForActor`
queries the rest of the app uses, so a frame rendered for a player never receives `dm`-audience
rows even transiently.

## 3. The worker sandbox (`WorkerHost.ts`, RC-WID-1.4 as built)

The `worker` sandbox (`apps/gm-react/src/app/widgets/WorkerHost.ts`) speaks the identical
protocol minus the DOM-only messages, plus one addition, settled while building it rather than
in the original ADR text:

- **Dropped:** `resize` — a worker has no DOM, so a data-only widget's size is its frame's.
- **Added: `result`.** A worker's only way to say what it "drew" is a data payload. Its result
  is projected into `WidgetTemplateData` (the same shape WID-1.2 template renderers read) and
  drawn through the template kind the entrypoint declares — a data table when it declares
  none — so a data-only widget's output is always rendered by app-shipped code, never markup
  the package wrote. `normalizeWorkerResult` whitelists the row shape (unknown fields dropped,
  strings truncated, non-finite numbers omitted, nameless rows discarded, row count clamped);
  the projected query is never marked `withheld` because the worker was already fed
  actor-filtered props.
- **Every exchange is on a clock.** 8s to answer `ready`, 3s per `render`; a missed deadline
  calls `terminate()` rather than retrying — a hung worker holds a thread forever, unlike a
  hung frame, which only hangs itself. The failure goes through `isolateWidgetFailure` and the
  widget shows "disabled, preserved" with the specific reason; the session does not
  auto-restart it.
- **Known gap:** the packaged shell (`electron/main.cjs` `buildCsp()`,
  `infra/web-hosting/template.yaml`) does not admit `blob:` workers yet, so a worker
  constructor throws in the packaged app and the widget shows "Background widgets do not run
  on this build yet." — fail closed and visibly, not an empty frame.

## 4. `widget.package.review` — one DM decision per permission

`widget.package.review` (`packages/core/src/commands/widget-package.ts:1076`,
`commands/types.ts:121`, dispatched at `commands/dispatch.ts:374`) is the single writer of
`WidgetPackageRecord.trust`. Payload: package id, a trust state, and an explicit
`Record<WidgetHostPermission, 'approved' | 'denied'>`.

- **Per permission, not per package.** Every permission the package requests must carry an
  explicit decision; anything absent stays denied. An upgrade that requests a new permission
  resets that permission (and the package) to `unreviewed` — a package cannot grow
  capabilities through a version bump.
- **The recommendation must be faced.** When `buildWidgetPackageReviewSummary`
  (`packages/core/src/queries/widget-package-review.ts:78`) returns `deny-until-fixed`, the
  command requires an explicit acknowledgment before it records `trusted`. The DM can still
  override — it's their vault — but not by accident.
- **Review is not enable.** `widget.package.enable` stays a separate command; trust answers
  "what may this code do", enabled answers "is it in my library right now".
- **Denied means denied at the capability gate**, not merely hidden in the UI — the approved
  set recorded here is exactly `HostCapabilityGrant.approvedPermissions` passed to
  `resolveHostCapability`.

## 5. Authoring: `template` by default, `custom-html-js` behind an explicit step

The manual builder (`apps/gm-react/src/app/widgetBuilder/`) produces
`renderEntrypoint.runtime = 'template'` definitions by default — declarative data rendered by
first-party template renderers. `custom-html-js` is reachable only through an explicit
"Advanced" step the DM opts into, where code, requested host permissions, and the SEC-011
destination-class picker live, with the review summary recomputed live. Switching a draft to
the advanced runtime is a deliberate, reversible act with its own confirmation.

## 6. The AI builder: `widget.package.propose`, staged like every other write

Widget generation is an MCP **write** tool (`packages/core/src/mcp/tool-registry.ts`), not a
special assistant mode: `kind: 'write'`, `writeRisk: 'durable'`, `commandType:
'widget.package.install'`. Per ADR-002/025 it is staged — a human approves it, nothing a model
produces installs itself. As built (RC-WID-3.1):

- **`template` drafts only.** The tool's input schema has no fields for html/css/js, no
  `hostPermissions`, no `networkDestinationClasses` — a model cannot author `custom-html-js`
  by phrasing, because those fields do not exist on its input.
- **Provenance carries a prompt fingerprint**, not the prompt itself:
  `WidgetAuthoringProvenance.promptHash` (`fnv1a64-<checksum>` via `hashWidgetPromptText`) so
  two packages from the same ask are recognizably one lineage, without persisting the DM's
  words verbatim.
- **Two separate decisions, never collapsed.** Approving the staged proposal installs the
  package `unreviewed` with every permission denied — the normal install path, no shortcut. It
  then goes through `widget.package.review` (§4) like any other package. Approving a write
  means "create this"; a trust review means "this may do that" — one click on an AI proposal
  can never grant network access.
- **Schema kept lean on purpose.** The tool's JSON schema was trimmed from 5,326 to 3,968
  bytes by dropping fields a DM edits in the builder anyway (a binding's entity types/mode, a
  config field's group/default/help, a command's required capability) — an agent-facing schema
  should carry only what the model must invent, per the finding recorded in ADR-031's
  amendment (measured against `scripts/ai-agent-smoke.ts`, qwen2.5:7b).

## 7. Where to look in code

| Concern                                | Location                                                            |
| -------------------------------------- | ------------------------------------------------------------------- |
| Iframe host component                  | `apps/gm-react/src/app/widgets/SandboxHost.tsx`                     |
| Worker host                            | `apps/gm-react/src/app/widgets/WorkerHost.ts`                       |
| postMessage protocol / policy relay    | `apps/gm-react/src/app/widgets/hostBridge.ts`                       |
| Served sandbox document                | `apps/gm-react/public/widget-host.html`                             |
| Sandbox CSP (single source of truth)   | `packages/core/src/security/renderer-isolation.ts`                  |
| Host capability policy                 | `packages/core/src/security/widget-host-api.ts`                     |
| Exfiltration / outbound gate (SEC-011) | `packages/core/src/security/widget-exfiltration.ts`                 |
| Runtime policy, host API version       | `packages/core/src/security/custom-widget-runtime.ts:17,57`         |
| Review command                         | `packages/core/src/commands/widget-package.ts:1076`                 |
| Review summary / draft scaffold        | `packages/core/src/queries/widget-package-review.ts:78,259`         |
| Manual builder, advanced step          | `apps/gm-react/src/app/widgetBuilder/`                              |
| AI proposal tool                       | `packages/core/src/mcp/tool-registry.ts` (`widget.package.propose`) |
| Decision record                        | `docs/adr/031-custom-widget-runtime-host.md`                        |
