# RC-WID-5.1 run journal

## Scope

A closed intent descriptor kind beside commands: open a screen, open an entity (character, map,
note, quest), open an allow-listed in-app route, create (scene, screen, character, map, note,
widget) through the existing creation flows, and open a Settings tab. The host resolves an intent
after the actor's read gate. Template widgets declare intents; custom widgets also need the new
`navigate` host permission, which trust review approves or denies. Acceptance: core tests for the
resolver and the permission gate; e2e: a builder-made action panel opens a character and starts
"New map"; a denied custom widget's intent is dropped and audited. No agents, dispatcher
mutations, push or promotion.

## Design

- **Descriptor** (`state/widget-package-state.ts`, `schemas/widget-package.ts`): optional
  `WidgetDefinition.intents: WidgetIntentDescriptor[]`, a discriminated union on `kind`
  (`open-screen` | `open-entity` | `open-route` | `create` | `open-settings`). Every target is a
  closed enum (entity kinds, `WIDGET_INTENT_ROUTES`, create targets, settings tabs); the zod union is
  strict, so a descriptor cannot carry a URL or any other field. Intent ids must be unique inside a
  definition (schema refinement).
- **Permission**: `navigate` joins `WidgetHostPermission` / `ALL_HOST_PERMISSIONS` and is a
  permission-gated host capability. Old trust records have no `navigate` key and therefore stay
  denied (the host reads approvals from the entries that say `approved`).
- **Resolver** (`security/widget-host-api.ts`): `resolveWidgetIntent(input)` → `resolved` with a
  `{ path, state }` destination, or a refusal (`undeclared`, `permission-denied`, `missing-target`,
  `not-visible`, `not-authorized`) — every outcome carries a non-leaking audit record. Order:
  declared → navigate permission (custom-html-js only) → actor read gate → destination. The read
  gates are the existing ones: `listScreensForActor`, `getCharacterForActor`, `listMapsForActor`,
  `getContentItemDetailForActor` (+ kind/subtype), `resolveSectionRouteAccess`,
  `actorCanAuthorContent` / DM authority. "Not found" and "hidden" produce the same refusal so a
  player cannot probe for DM-only ids.
- **Destinations** reuse the existing creation flows' router state (`{ create: true }` on
  `/characters`, `/atlas`, `/knowledge`; `{ addWidget: true }` on `/board`; `/scenes`), entity deep
  links (`/characters/:id`, `/knowledge/:id`, `/atlas?map=`), `/scene/:id` for a screen (ADR-041 will
  alias it to `/screen/:id`), and `/settings?tab=`.
- **Host**: `hostBridge.ts` gains `navigate` in the guest protocol, `decideNavigate` (core decides,
  host relays) and a bounded session audit log. `SandboxHost.tsx` routes a resolved intent and
  drops + audits a refused one; the frame reports the drop count as `data-dropped-intents`.
- **Template**: `ActionPanel.tsx` renders one button per declared intent after the commands. It
  pre-resolves each for the viewer and omits the ones that cannot resolve (same fail-closed rule as
  a configure command a player can't fire), then resolves again on press.
- **Builder**: `CommandsStep.tsx` gains an "Open and create" section with a catalogue of intents
  and per-kind target pickers fed from actor-filtered reads.

## Boundary crossings (outside Owns — flagged for the operator)

Each is the smallest additive edit the acceptance needs; none changes existing behaviour.

- `packages/core/src/constraints/scope-constraints.ts`: `navigate` added to
  `DECLARED_WIDGET_HOST_PERMISSIONS`. The CON-006 audit requires the declared list to mirror
  `ALL_HOST_PERMISSIONS`; without this the scope gate goes red.
- `packages/core/src/schemas/commands.ts`: `navigate` added to the `widget.package.review`
  permission enum, so trust review can approve or deny it (acceptance: "trust review approves or
  denies").
- `packages/core/src/index.ts`: barrel exports for the new types, constants and functions.
- `apps/gm-react/src/app/widgets/SandboxHost.tsx`: a `navigate` case that calls
  `decideIntent` and either routes or drops; `data-dropped-intents` on the frame.
- `apps/gm-react/public/widget-host.html`: `dndtoolsWidget.navigate(intent)` on the guest API.
  CSP meta untouched (`hostBridge.test.ts` still asserts the three copies agree). RC-WID-5.4 owned
  this file and is merged.
- `apps/gm-react/src/app/widgetBuilder/draft.ts`, `draftDiff.ts`: the draft carries `intents`
  (build, read-back, validation, diff). CommandsStep edits the draft, so it cannot hold intents
  without this.
- `apps/gm-react/src/app/widgetBuilder/vocabulary.ts`, `screens/extensions/TrustReviewSheet.tsx`,
  `screens/extensions/Plugins.tsx`: label maps typed `Record<WidgetHostPermission, …>` or listing
  every permission. The trust review sheet shows `navigate` and its meaning.
- `apps/gm-react/src/i18n/messages/{en,es}.ts`: copy for the above.
- `apps/gm-react/src/screens/Campaign.tsx`: consumes `openQuestId` router state (quest tab, quest
  open) next to the existing `createFaction` handoff. This is the "open a quest by id" destination.
- `apps/gm-react/src/app/widgets/templates/templates.test.tsx` (templates dir is RC-WID-5.3's):
  one added test. `index.tsx` in the same directory is untouched: `ActionPanel.tsx` renders its
  own live half, so the template registry did not need to change.
- New files: `packages/core/tests/widget-intents.test.ts`,
  `apps/gm-react/tests/e2e/widget-intents.spec.ts`.

## Changes

- Core: `WidgetIntentDescriptor` union + closed target sets (`WIDGET_INTENT_ROUTES`,
  `WIDGET_INTENT_SETTINGS_TABS`, entity kinds, create targets), strict zod union and unique-id
  refinement, `navigate` host permission / permission-gated capability, `widgetMayNavigate`,
  `resolveWidgetIntent`.
- Host: `navigate` guest message (intent id + optional target id; a URL-only message is
  `malformed`), `decideIntent`, bounded session audit log (`recordWidgetHostAudit`,
  `listWidgetHostAudit`, `subscribeWidgetHostAudit`, dev-only `window.__widgetHostAudit` seam in the
  `__rt` style). `navigate` is a capability name `requestPermission` knows.
- Action panel: intent buttons (`variant="ghost"`, `data-widget-intent`) after commands; live half
  pre-filters by the viewer's resolution and re-resolves on press; inert with the "finish editing"
  reason while the layout is edited or in the builder preview.
- Builder: "Open and create" section on the Commands step — catalogue chips (open character / map /
  note / quest / screen / page / Settings tab; new scene / screen / character / map / note /
  widget), per-row label + kind-specific picker fed from the author's actor-filtered reads. Draft
  validation: unique ids, a label, a target for a template open intent, `navigate` requested when a
  custom widget declares intents. The existing chip style is factored into `CatalogChip`, so the
  raw-style count did not grow.
- Docs: WIDGETS.md §2.1 (intents, resolver order, destinations), protocol row, host drop/audit
  behaviour, §5 `navigate` at trust review, §6 builder, where-to-look and e2e rows.

## Known limits

- The audit log is per session and in memory. No DM-facing screen lists it yet.
- `open-screen` routes to `/scene/:id`. ADR-041 moves screens to `/screen/:id`; that alias belongs
  to CAN-7.
- The worker sandbox (`WorkerHost.ts`) does not relay `navigate`; its own parser drops it.
- The MCP `widget.package.propose` schema does not expose intents (unchanged).
- Every creation flow requires DM authority (`actorCanAuthorContent`), failing closed. A player's
  panel does not show "New character".

## Validation

- Core `tsc --noEmit`: clean. App `tsc --noEmit`: clean.
- ESLint on every changed TS/TSX file: clean.
- Core vitest (full): 282 files / 4922 tests passed (`/tmp/rc-wid51-core-vitest.log`). The new
  `tests/widget-intents.test.ts` has 20 tests. Mutation check: removing the custom-runtime
  permission check fails 2 of them, and swapping `getCharacterForActor` for a raw lookup fails 3.
- App vitest (full, `vitest.app.config.ts`): 145 files / 1636 tests passed
  (`/tmp/rc-wid51-app-vitest.log`), including the 7 new `hostBridge.test.ts` navigate tests and the
  new action-panel intent test.
- Tooling vitest: 28 files / 212 tests passed.
- `scripts/quality-gates.ts`: passed (CommandsStep 756 lines: warn-only, under the 800 hard limit).
- Playwright, desktop-chromium + mobile-chromium: `widget-intents.spec.ts` 4/4. With
  `custom-widgets`, `widget-builder`, `widget-trust-review`, `widget-kit`, `campaign` and
  `starter-widgets`: 67 passed, 1 skipped (`custom-widgets.spec.ts:673`, the existing phone-only
  skip) (`/tmp/rc-wid51-e2e-3.log`).
