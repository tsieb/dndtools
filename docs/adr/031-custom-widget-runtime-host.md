# ADR-031: Custom-Widget Runtime Host and Authoring Model

- Status: Accepted
- Date: 2026-09-04
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A
- Amends: ADR-002 (the staged-write model covers note/scene-card/character writes; this ADR extends
  it to a **package draft** — an artifact that carries executable code — and states what "approve"
  means for one). ADR-025 (the expanded staged MCP write surface gains `widget.package.propose`,
  whose approval installs an untrusted package rather than a content row, so approval and trust
  become two separate human decisions).

## Context

`packages/core` already models custom widgets end to end as **data**: a `WidgetPackageDefinition`
declares widgets, each with a `renderEntrypoint` naming one of three runtimes
(`template` | `builtin` | `custom-html-js`, `state/widget-package-state.ts:29`), declared
`hostPermissions`, bindings, data queries, commands, style tokens and assets. The security policy
that decides what such a widget may touch is written and tested:
`security/widget-host-api.ts` resolves a host-API capability fail-closed (forbidden platform
surfaces are absolute; permission-gated capabilities require an approved permission),
`security/widget-exfiltration.ts` gates outbound network by destination class, and
`security/custom-widget-runtime.ts:57` derives a per-widget runtime policy with
`CUSTOM_WIDGET_HOST_API_VERSION = 1`.

Three things are missing, and they are missing together.

**There is no host.** Nothing in `apps/gm-react` renders a `custom-html-js` widget — the app has
exactly one render path, the hand-written builtin bodies in `app/widget-bodies.tsx`, and the string
`iframe` does not appear in the app at all. A package may declare custom code, be installed, be
enabled, and then render nothing. The policy modules above are a contract with no counterparty.

**There is no way to grant a permission.** `handleInstallWidgetPackage`
(`commands/widget-package.ts:253`) writes `trust: { state: 'unreviewed', hostPermissions:
deniedHostPermissions() }` for every installed package, and no command anywhere moves it: the
`widget.package.*` family is `install` / `enable` / `disable` / `remove` / `upgrade` /
`switch-system`. `buildWidgetPackageReviewSummary` (`queries/widget-package-review.ts:78`) computes
a rich, DM-facing review — requested permissions, network destinations, cross-privilege writes,
player-visible outputs, a `trustRecommendation` — and nothing consumes its verdict. So the system
fails closed, which is right, and then stays closed forever, which is not a security posture, it is
a dead feature.

**There is no authoring story that matches the risk.** The manual builder today is a JSON textarea,
which means the cheapest way to author anything is to hand-write a definition — and a definition
with an `assetPath` and `runtime: 'custom-html-js'` is script the DM will run on their own vault.
The AI builder is deferred entirely, with no decision on record about what a model is even allowed
to produce here.

The risk profile is not the same across those three runtimes. A `template` widget is declarative
data interpreted by first-party React: its worst case is a bad query or an ugly layout. A
`custom-html-js` widget is third-party script. Treating them the same — either both trivial or both
scary — is what makes widget platforms either unsafe or unusable.

## Decision

### 1. The host: an opaque-origin iframe speaking `postMessage` host API v1

`custom-html-js` widgets render inside an iframe created with `sandbox="allow-scripts"` and **no**
`allow-same-origin`. The two flags together are the whole security argument: the document gets an
opaque origin, so it has no cookies, no `localStorage`, no IndexedDB, no access to the host
document's DOM or globals, and no way to name the host's origin in a fetch. It cannot reach the
vault, the storage adapters, the Electron IPC bridge, the cloud client, or the auth token, because
it is not in a position to reach anything. `allow-same-origin` is never added, for any package, for
any trust level; a package that needs it is a package we do not run.

Inside that frame the widget gets one channel: `postMessage` to the host, in a versioned protocol
**host API v1** whose message set mirrors `security/widget-host-api.ts` one-to-one rather than
inventing a second vocabulary.

| Direction     | Message                            | Backed by                                                          |
| ------------- | ---------------------------------- | ------------------------------------------------------------------ |
| widget → host | `ready { hostApiVersion }`         | `resolveCustomWidgetRuntimePolicy` version check, refuse if higher |
| host → widget | `render(props)`                    | actor-filtered binding + data-query results only                   |
| host → widget | `configChanged` / `bindingChanged` | the same actor-filtered projection, re-sent on change              |
| widget → host | `dispatch(commandDescriptor)`      | `widget.dispatch-command` + the operator-authority check           |
| widget → host | `requestPermission(kind)`          | `resolveHostCapability` against the package's **approved** grant   |
| widget → host | `outbound(request)`                | `requestWidgetNetwork` → `evaluateWidgetOutboundRequest` (SEC-011) |
| widget → host | `resize { height }`                | host-applied frame height, clamped                                 |

Rules that hold for every message:

1. **The core decides, the host relays.** The host bridge never answers `requestPermission` or
   `outbound` from its own logic; it calls the existing pure core functions and forwards their
   result. There is no second policy implementation to drift.
2. **Only actor-filtered data crosses the boundary.** `render` props are built from the same
   `*ForActor` queries the rest of the app uses. A widget on a player-visible surface receives what
   that player may see; `dm` audience rows never enter a frame rendered for a player. The frame is
   an untrusted renderer, so it is fed as if it were the least-privileged viewer that can see it.
3. **Every inbound message is validated and attributed** to a widget instance id before it is acted
   on; unknown message kinds, version mismatches, and messages from an unexpected frame are dropped
   and audited, not guessed at.
4. **Failure is isolated, not fatal.** A frame that throws, hangs past the host timeout, or violates
   policy is torn down through `isolateWidgetFailure`; siblings and core state stay alive and the
   slot shows the placeholder with the diagnostic.
5. **Theme tokens are forwarded, not inherited** — the frame gets `--widget-*` CSS variables only
   when the package declares the `host-theme-tokens` style capability.

The `worker` sandbox in `WidgetRuntimeSandbox` speaks the identical protocol minus the DOM messages,
so a data-only widget can be moved between the two without a package change.

### 2. `widget.package.review` — one DM decision per permission, recorded durably

A new DM-only core command `widget.package.review` is the single writer of
`WidgetPackageRecord.trust`. Payload: the package id, a trust state, and an explicit
`Record<WidgetHostPermission, 'approved' | 'denied'>`. It stamps `reviewedBy` / `reviewedAt`, appends
an op, and emits a `widget.package-reviewed` event.

- **Per permission, not per package.** "I trust this widget" is not a decision anyone can make
  honestly. "This may read the clipboard, and may not touch the network" is. The command therefore
  refuses a partial map: every permission the package requests must carry an explicit decision, and
  anything absent stays denied. Approving a package does not approve a permission it did not request
  at review time — an upgrade that requests a new permission resets that permission to denied and
  the package to `unreviewed`, so a widget cannot grow capabilities through a version bump.
- **The recommendation must be faced.** When `buildWidgetPackageReviewSummary` returns
  `deny-until-fixed` (custom code with runtime issues, cross-privilege writes, unapproved network
  destinations), the command requires the caller to acknowledge that recommendation explicitly
  before it will record `trusted`. The DM may still override — it is their vault — but not by
  accident.
- **Review is not enable.** `widget.package.enable` stays a separate command and a separate button.
  Trust answers "what may this code do"; enabled answers "is it in my library right now".
- **Denied means denied at the capability gate,** not merely hidden in the UI: the approved-permission
  set recorded here is exactly the `HostCapabilityGrant.approvedPermissions` the host passes to
  `resolveHostCapability`, so a widget whose clipboard permission was denied finds the capability
  absent rather than present-but-rejected.

### 3. Authoring: `template` by default, `custom-html-js` behind an explicit advanced step

The manual builder produces `renderEntrypoint.runtime = 'template'` definitions. Every ordinary path
through it — identity, layout, data queries, config fields, commands, style — yields a declarative
definition rendered by first-party template renderers. A DM who never opens the advanced step can
never author a package that runs third-party script, and therefore never faces a trust review with
real teeth.

`custom-html-js` is reachable only through an explicit "Advanced" step that the DM opts into. That
step is where code, the requested host permissions, and the SEC-011 destination-class picker live,
with the review summary recomputed live so the security consequence of adding a permission is
visible while typing it, not at install time. Switching a draft to the advanced runtime is a
deliberate, reversible act with its own confirmation; dropping back to `template` discards the
asset rather than keeping it dormant.

This is the same reasoning as the sandbox decision, applied to authoring: make the safe thing the
default path and the dangerous thing a door you have to open, rather than putting both behind the
same button and relying on a warning nobody reads.

### 4. The AI builder is `widget.package.propose`, and it lands in the same review

Generation is an MCP **write** tool (`mcp/tool-registry.ts`), not a special assistant mode:

- `widget.package.propose`, `kind: 'write'`, `writeRisk: 'durable'`, `commandType:
'widget.package.install'`. Its input schema is a structured package draft (template kind, queries,
  bindings, config fields, commands, style) — the model submits a validated definition, not free
  prose the app then parses.
- Because it is a write tool it inherits ADR-002 unchanged: it is **staged**, and a human approves
  it. Nothing a model produces installs itself.
- The proposal carries `authoring.source = 'generated'` provenance with the provider and prompt
  summary (`WidgetAuthoringProvenance`, `state/widget-package-state.ts:195`), so a generated package
  is identifiable forever, including after export and re-import elsewhere.
- **The tool proposes `template` drafts only.** A model may not author `custom-html-js`. This is the
  one place we are stricter than the manual path, and deliberately: a DM writing custom code has
  read it, and a model's output is exactly the artifact nobody reviews line by line. If a generated
  widget needs code, the DM opens the advanced step themselves and writes it.
- Approving the proposal installs the package `unreviewed` with every permission denied — the normal
  install path, no shortcut. It then goes through `widget.package.review` like any other package.
  **Two decisions, not one:** approving a staged write means "yes, create this thing"; a trust review
  means "yes, this thing may do that". Collapsing them would let a single click on an AI proposal
  grant network access.

## Consequences

### Positive

- The written-and-tested security policy (`widget-host-api.ts`, `widget-exfiltration.ts`,
  `custom-widget-runtime.ts`) acquires a real caller, so the SEC-007 acceptance criteria become
  statements about the shipping product rather than about pure functions.
- Trust becomes reachable. Today every installed package is permanently unreviewed with everything
  denied; after this a DM can grant clipboard to one widget and refuse network to it in the same
  sheet, and see that decision honored at the capability gate.
- The default authoring path produces data, not code. Most widgets a DM wants — a tracker, a loot
  ledger, a rumor board — never require the sandbox at all, which keeps the number of packages under
  genuine review small enough that reviewing them means something.
- One protocol serves iframe and worker sandboxes, the manual builder's live preview, and the AI
  builder's preview, so there is a single thing to get right.
- The AI builder needs no new safety machinery: it is a staged write tool, and the ADR-002 model
  already says what happens to those.

### Negative

- An opaque-origin iframe cannot use the host's fonts, styles, or asset URLs implicitly; everything
  a widget renders with must be forwarded explicitly, which makes custom widgets more work to author
  and slightly heavier to render than a same-origin frame would be.
- Per-permission review is more UI and more DM attention than a single trust toggle, and an upgrade
  that requests a new permission drops the package back to unreviewed — correct, occasionally
  annoying.
- Refusing model-authored `custom-html-js` means "generate a widget with a custom animation" is a
  request the assistant declines. We accept a narrower AI feature over an unreviewed code path.
- A `postMessage` protocol is a versioned contract: host API v2 will need a compatibility window,
  and packages pinned to a higher version must be refused with a clear diagnostic rather than
  rendered optimistically.

## Rejected Alternatives

| Alternative                                                         | Why Rejected                                                                                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same-origin iframe or Shadow DOM with a JS API object               | Both leave widget code in the host realm: it can walk `window`, reach storage and the IPC bridge, and monkey-patch the "API" it was handed. The policy modules would be advisory. |
| `sandbox="allow-scripts allow-same-origin"`                         | The two together defeat the sandbox — the frame regains the host origin, including its storage and cookies. Never granted.                                                        |
| A JS interpreter / VM shim in-process (QuickJS, `with`-scoped eval) | A parallel security boundary to maintain and audit, worse performance, and no DOM for widgets that need one. The browser already ships the isolation primitive.                   |
| One "trust this package" toggle                                     | Asks a question nobody can answer honestly and grants every requested permission at once; the review summary's per-permission detail would be decoration.                         |
| Trust implied by install (or by enabling)                           | Makes the risky decision a side effect of a routine one. Install, review, and enable are three different questions and stay three commands.                                       |
| Builder defaults to `custom-html-js` (most powerful path first)     | Every authored widget would then be third-party code needing review, which trains DMs to approve reflexively — the failure mode that makes permission prompts worthless.          |
| AI builder as a bespoke "generate" flow outside MCP                 | Would need its own staging, audit, provenance and approval UI, duplicating ADR-002/ADR-025 with a second chance to get them wrong.                                                |
| Let the model author `custom-html-js`                               | The artifact least likely to be read line by line would be the one carrying executable code. Provenance is not review.                                                            |
| Auto-approve permissions a generated widget "obviously needs"       | AI proposes, never disposes (ADR-002). An inferred grant is a grant nobody made.                                                                                                  |

## Migration Impact

**Code/data contracts affected.**

- `packages/core`: a `widget.package.review` command (handler + schema + dispatch registration +
  event), consuming the existing `WidgetPackageTrustReview` shape — no new durable slice and no
  `WidgetPackageState` schema bump, since `trust` already has the fields this writes. The upgrade
  path gains the "new permission ⇒ reset to unreviewed" rule.
- `packages/core/src/mcp`: `widget.package.propose` in the tool registry plus its input schema;
  `scaffoldCustomWidgetPackageDraft` (`queries/widget-package-review.ts:259`) grows template, query
  and config parameters so a draft can be built from structured input.
- `apps/gm-react`: the sandbox host and its bridge, the sandboxed host document served as a static
  asset, an Electron CSP entry for the sandbox, the Plugins review sheet, and the builder's advanced
  step. No existing screen changes behavior for `template` or `builtin` widgets.

**Rollout sequencing.** Review command and its UI first (RC-WID-1.5) — it is independently useful
and unblocks nothing dangerous. Then the render resolver and template renderers (RC-WID-1.1/1.2),
then the iframe host (RC-WID-1.3), then the builder (RC-WID-2.x) with the advanced step last, then
`widget.package.propose` (RC-WID-3.1). Each step is shippable alone; `custom-html-js` packages keep
rendering the placeholder until the host lands, which is the current behavior.

**Validation and test changes.** Core: review-command tests (partial map refused, unrequested
permission not granted, `deny-until-fixed` requires acknowledgement, upgrade resets a new
permission, non-DM refused). Host: protocol unit tests for version mismatch, unknown message,
foreign-frame message, permission denial, outbound denial, crash isolation. E2E: install a starter,
review it with one permission approved and one denied, enable it, place it, and assert the denied
capability is unavailable to the running widget.

**Backward compatibility.** Every currently installed package is `unreviewed` with all permissions
denied, which is exactly the state this ADR treats as the starting point — nothing to migrate, and
no package silently gains a capability when the review command ships. Packages declaring a
`hostApiVersion` above 1 were already refused by `resolveCustomWidgetRuntimePolicy` and continue to
be.

## Rollback Plan

- **Trigger conditions.** A sandbox escape or a capability reachable without an approved permission;
  a host bridge that leaks `dm` audience data into a player-rendered frame; review decisions that do
  not survive reload or sync.
- **Technical rollback steps.** The host is one branch of the render resolver: return the placeholder
  for `custom-html-js` and every custom widget degrades to "disabled, preserved" with a diagnostic,
  no data loss. `widget.package.propose` is one registry entry and can be removed without touching
  the dispatcher. The advanced builder step is feature-flaggable independently of the rest of the
  builder.
- **Data recovery considerations.** Nothing here destroys data: packages persist, and trust records
  are additive fields on an existing record. Rolling back the review command leaves recorded grants
  in place but unused (fail-closed, since the gate reads them only to allow).
- **Known rollback risks.** A DM who authored a `custom-html-js` widget while the host shipped keeps
  a package that renders as a placeholder afterwards; the definition and its assets are intact and
  render again when the host returns.

## Verification and Evidence

- `packages/core/src/security/widget-host-api.ts` — the capability policy the host API v1 protocol
  mirrors message-for-message (`resolveHostCapability`, `requestRawVaultFileAccess`,
  `requestWidgetNetwork`); `packages/core/tests/security-widget-host-api.test.ts`.
- `packages/core/src/security/custom-widget-runtime.ts:17,57` —
  `CUSTOM_WIDGET_HOST_API_VERSION = 1` and `resolveCustomWidgetRuntimePolicy`, the version and
  sandbox check the `ready` handshake enforces.
- `packages/core/src/security/widget-exfiltration.ts` — the outbound gate behind the `outbound`
  message (SEC-011).
- `packages/core/src/state/widget-package-state.ts:29,147,195,267,306` — runtime kinds, render
  entrypoint, authoring provenance, `WidgetPackageTrustReview`, `ALL_HOST_PERMISSIONS`.
- `packages/core/src/commands/widget-package.ts:253` — install writes `unreviewed` + all denied, the
  state `widget.package.review` is the only exit from.
- `packages/core/src/queries/widget-package-review.ts:78,259` —
  `buildWidgetPackageReviewSummary` (the review sheet's content and the `deny-until-fixed`
  recommendation) and `scaffoldCustomWidgetPackageDraft` (the propose tool's draft builder).
- `packages/core/src/mcp/tool-registry.ts:456-513` — the existing staged write tools
  `widget.package.propose` is modelled on; `packages/core/src/mcp/ai-boundary.ts` — AI proposes,
  never disposes.
- `docs/planning/RC_ROADMAP.md:521-626` — the stories this ADR unblocks: RC-WID-1.3 (iframe host),
  RC-WID-1.5 (review command + UI), RC-WID-2.1/2.5 (builder, advanced step), RC-WID-3.1
  (`widget.package.propose`).
