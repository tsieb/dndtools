# Widgets

Widgets turn the GM Screen and scene canvases into a configurable mission-control surface. They are
a platform primitive: the same declarative model powers the built-in tiles and the sandboxed custom
widgets a DM or the assistant authors. Decision records: [ADR-031](../adr/031-custom-widget-runtime-host.md)
(runtime host, trust review, authoring) and [ADR-029](../adr/029-scene-layout-history.md) (layout history).

## 1. Model

| Layer          | What it is                                                                                  | Lives in                                                      |
| -------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Definition** | What a widget can do: type, bindings, data queries, commands, config fields, render runtime | `packages/core/src/state/widget-package-state.ts`             |
| **Package**    | A distributable bundle of definitions plus assets, migrations, and a trust review           | `WidgetPackageRecord` in the `widgets` slice                  |
| **Instance**   | A widget placed on a scene: layout, configuration, local state, binding, `disabled` flag    | `Scene.widgets[]` in `packages/core/src/state/scene-state.ts` |

A definition declares `placement.surfaces` (`scene`, `command-center`, `player-view`), sizes and
`resizePolicy`, `requiredBindings` / `optionalBindings` / `dataQueries` / `computedFields`, a
`renderEntrypoint` runtime (`template` | `builtin` | `custom-html-js`), `configFields`, command
descriptors, `capabilitySets` (`manager` | `operator` | `viewer`), and `hostPermissions`.

`computedFields` may carry a formula in the same expression grammar System Packages use, evaluated
over the four aggregate columns of each declared query (`_count`, `_sum`, `_max`, `_active`). A
formula cannot name a row, and a query withheld from the viewer contributes zeroes, so a formula can
never route around the query's audience gate. A formula naming an undeclared query is rejected at
install (`schemas/widget-package.ts`).

## 2. Binding and visibility

A widget binds to an entity by path (`{ source: { entityType, entityId, selector? }, mode,
requiredCapability }`). `resolveWidgetBinding()` (`packages/core/src/queries/binding.ts`) resolves it
against an actor-scoped projection and returns `available`, `unbound`, `missing`, `hidden`,
`conflicted`, or `degraded`. A player binding to a DM-only entity gets `hidden` and never learns
whether it is also missing or conflicted. Leaks are prevented at the resolver, not the renderer.

`isVisibleToViewer()` filters DM-only widgets for the canvas, the scene outline, search, and the
player-view preview overlay.

Two command classes are separated by verb in `permissions/widget-operator-authority.ts`: **operate**
(`start`, `pause`, `roll`, `advance`, …) needs an `operator` grant; **configure** (`set-duration`,
`rename`, `bind`, …) needs `manager`. The DM is always authorized, an observer never, and grants are
checked against `now`.

## 3. Rendering

`WidgetRenderSlot.tsx` (`apps/gm-react/src/app/widgets/`) is the single render path on every
surface. `resolveRenderer()` picks `builtin` | `template` | `custom` | `placeholder` and never
throws; a failing renderer yields `WidgetPlaceholder.tsx` with the diagnostic and
`coreStateAvailable: true`. Template renderers (`app/widgets/templates/`: data table, status list,
tracker, action panel, scene message, chart, stat block, form panel) read `dataQueries` through
`dataEnvironment.ts`, which resolves the eight query sources against actor-filtered core reads and
honours `audience`. Built-in bodies (`app/widgets/builtin/`) cover the system widgets: Map, Audio,
combat, notes, atlas, search, session, tools, player views, and the rest.

## 4. The custom-widget host

`custom-html-js` widgets render in an iframe with `sandbox="allow-scripts"` and no
`allow-same-origin` (`app/widgets/SandboxHost.tsx`): an opaque origin with no cookies, storage, host
DOM, or way to name the host's origin in a fetch. The frame loads the served document
`apps/gm-react/public/widget-host.html`, which carries its own `WIDGET_SANDBOX_CSP`
(`packages/core/src/security/renderer-isolation.ts`, asserted identical in the document's `<meta>`
and the packaged shell's response header). Package assets arrive over `postMessage` in an `init`
message; `srcdoc` was rejected because a local-scheme document inherits the embedder's CSP.

The protocol (`app/widgets/hostBridge.ts`) mirrors `security/widget-host-api.ts` one to one:

| Direction     | Message                                     | Backed by                                            |
| ------------- | ------------------------------------------- | ---------------------------------------------------- |
| widget → host | `ready { hostApiVersion }`                  | `resolveCustomWidgetRuntimePolicy` version check     |
| host → widget | `render`, `configChanged`, `bindingChanged` | actor-filtered binding and query results only        |
| widget → host | `dispatch(commandDescriptor)`               | `widget.dispatch-command` + operator-authority check |
| widget → host | `requestPermission(kind)`                   | `resolveHostCapability` against the approved grant   |
| widget → host | `outbound(request)`                         | `evaluateWidgetOutboundRequest` (SEC-011)            |
| widget → host | `resize { height }`                         | clamped frame height (iframe only)                   |

The core decides, the host relays: `hostBridge.ts` never answers a permission or outbound request
from its own logic. Inbound messages are validated and attributed to an instance id; unknown kinds,
version mismatches, and foreign frames are dropped and audited. A frame that throws, hangs, or
violates policy is torn down through `isolateWidgetFailure`; siblings and core state survive.

The **worker sandbox** (`app/widgets/WorkerHost.ts`) speaks the same protocol minus `resize`, plus a
`result` message whose payload is whitelisted by `normalizeWorkerResult` and drawn through the
template kind the entrypoint declares. Every exchange is on a clock (8s to `ready`, 3s per render); a
missed deadline calls `terminate()`. The hosted CSP admits `worker-src 'self' blob:`; the packaged
Electron shell's `buildCsp()` does not yet, so a worker there fails closed with "Background widgets
do not run on this build yet."

## 5. Trust review

`widget.package.review` (`packages/core/src/commands/widget-package.ts`) is the single writer of
`WidgetPackageRecord.trust`. Every permission the package requests carries an explicit
`approved` | `denied` decision; anything absent stays denied; an upgrade that requests a new
permission resets the package to `unreviewed`. When `buildWidgetPackageReviewSummary`
(`queries/widget-package-review.ts`) recommends `deny-until-fixed`, the DM must acknowledge it before
`trusted` is recorded. Review is separate from `widget.package.enable`. The approved set is exactly
the `HostCapabilityGrant.approvedPermissions` the host passes to `resolveHostCapability`, so a denied
capability is absent at the gate, not merely hidden.

Installed packages start `unreviewed` with every permission denied. System packages shipped in code
are pre-trusted.

## 6. Authoring

- **Manual builder** (`apps/gm-react/src/app/widgetBuilder/`, Extensions › Plugins): a stepper
  (identity → layout → data → config → commands → style → advanced → review) with a live preview
  through the same render resolver. It produces `template` definitions; `custom-html-js` is only
  reachable through the explicit Advanced step, where code, requested permissions, and the SEC-011
  destination picker live with the review summary recomputed live.
- **AI builder**: `widget.package.propose` is a staged MCP write tool (`mcp/tool-registry.ts`,
  `commandType: 'widget.package.install'`). Its input schema has no code, permissions, or network
  fields, so a model cannot author `custom-html-js`. Approval installs the package `unreviewed`;
  trust is a second, separate review. Provenance records `authoring.source = 'generated'` and a
  `promptHash` fingerprint, never the prompt. The schema was trimmed to what a model must invent,
  because a large tool schema degraded tool choice across every other tool (measured against
  `scripts/ai-agent-smoke.ts`).

## 7. Canvas and layout history

`app/SceneBoardCanvas.tsx` is the shared engine for `/board` and `/scene/:id`. Every pointer
operation serializes to the same core command as its keyboard equivalent (WCAG 2.5.7). Layout undo
and reversible destroy are documented in [`SCENE_HISTORY.md`](SCENE_HISTORY.md).

## 8. Where to look

| Concern                                  | Location                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Definitions, packages, system widgets    | `packages/core/src/state/widget-package-state.ts`                                                                                       |
| Instances and scene visibility           | `packages/core/src/state/scene-state.ts`                                                                                                |
| Binding resolution                       | `packages/core/src/queries/binding.ts`                                                                                                  |
| Library discovery                        | `packages/core/src/queries/widget-library.ts`                                                                                           |
| Operator authority                       | `packages/core/src/permissions/widget-operator-authority.ts`                                                                            |
| Sandbox policy, host API, exfiltration   | `packages/core/src/security/{custom-widget-runtime,widget-host-api,widget-exfiltration}.ts`                                             |
| Review command and summary               | `packages/core/src/commands/widget-package.ts`, `queries/widget-package-review.ts`                                                      |
| Render path, templates, data environment | `apps/gm-react/src/app/widgets/`                                                                                                        |
| Iframe and worker hosts, bridge          | `apps/gm-react/src/app/widgets/{SandboxHost.tsx,WorkerHost.ts,hostBridge.ts}`                                                           |
| Builder                                  | `apps/gm-react/src/app/widgetBuilder/`, `screens/extensions/WidgetBuilder.tsx`                                                          |
| E2E                                      | `custom-widgets.spec.ts`, `widget-builder.spec.ts`, `widget-trust-review.spec.ts`, `widget-generate.spec.ts`, `starter-widgets.spec.ts` |
