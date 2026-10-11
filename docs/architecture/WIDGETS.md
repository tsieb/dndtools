# Widgets

Widgets turn the GM Screen and scene canvases into a configurable mission-control surface. They are
a platform primitive: the same declarative model powers the built-in tiles and the sandboxed custom
widgets a DM or the assistant authors. Decision records: [ADR-031](../adr/031-custom-widget-runtime-host.md)
(runtime host, trust review, authoring), [ADR-029](../adr/029-scene-layout-history.md) (layout history),
and [ADR-041](../adr/041-screens-as-the-run-surface.md) (screens as the run surface, flow and canvas
layout policies).

## 1. Model

| Layer          | What it is                                                                                  | Lives in                                                      |
| -------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Definition** | What a widget can do: type, bindings, data queries, commands, config fields, render runtime | `packages/core/src/state/widget-package-state.ts`             |
| **Package**    | A distributable bundle of definitions plus assets, migrations, and a trust review           | `WidgetPackageRecord` in the `widgets` slice                  |
| **Instance**   | A widget placed on a scene: layout, configuration, local state, binding, `disabled` flag    | `Scene.widgets[]` in `packages/core/src/state/scene-state.ts` |

A definition declares `placement.surfaces` (`scene`, `command-center`, `player-view`), sizes and
`resizePolicy`, `requiredBindings` / `optionalBindings` / `dataQueries` / `computedFields`, a
`renderEntrypoint` runtime (`template` | `builtin` | `custom-html-js`), `configFields`, command
descriptors, intent descriptors, `capabilitySets` (`manager` | `operator` | `viewer`), and
`hostPermissions`.

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

### 2.1 Intents: navigation and creation

A command writes to the campaign. An **intent** writes nothing: it takes the viewer somewhere
(RC-WID-5.1). `WidgetDefinition.intents` is optional and is a closed union on `kind`:

| `kind`          | Target                                                                       | Destination                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open-screen`   | `targetId` (a scene; ADR-041)                                                | `/scene/:id`                                                                                                                                                                                |
| `open-entity`   | `entityKind` (`character` \| `map` \| `note` \| `quest`) and `targetId`      | `/characters/:id`, `/atlas?map=`, `/knowledge/:id`, `/campaign` with `openQuestId`                                                                                                          |
| `open-route`    | `route`, one of `WIDGET_INTENT_ROUTES` (section roots only)                  | that path                                                                                                                                                                                   |
| `create`        | `target` (`scene` \| `screen` \| `character` \| `map` \| `note` \| `widget`) | the existing creation flow: `/scenes` with `{ createScreen: true }` for scene/screen, or `/characters`, `/atlas`, `/knowledge` with `{ create: true }`, `/board` with `{ addWidget: true }` |
| `open-settings` | `tab`, one of `WIDGET_INTENT_SETTINGS_TABS`                                  | `/settings?tab=`                                                                                                                                                                            |

Every variant is a strict schema, so no descriptor has a field a URL could hide in. Intent ids are
unique within a definition. An open intent may fix its `targetId`; a custom widget may leave it out
and supply one when it asks, but a fixed target is never replaced by the requested one.

On `/campaign`, `openQuestId` opens the quest editor for an author. A reader who cannot author
the quest has no editor, so the page scrolls to that quest's card, focuses it and marks it
`aria-current` instead.

`resolveWidgetIntent` (`security/widget-host-api.ts`) decides every request, in this order:

1. The definition must declare the intent (`undeclared`).
2. A `custom-html-js` widget must hold the `navigate` host permission, approved at trust review
   (`permission-denied`). Template and builtin intents are data drawn by first-party code, so
   declaring them is the grant.
3. The viewer's read gate decides the target through the existing actor-filtered reads
   (`listScreensForActor`, `getCharacterForActor`, `listMapsForActor`,
   `getContentItemDetailForActor`, `resolveSectionRouteAccess`). A hidden target and a missing one
   both return `not-visible`, so a widget cannot probe for ids. Creation flows require authoring
   authority. The Settings tabs `players`, `permissions`, `plugins` and `systems` require DM
   authority (`not-authorized`).
4. Only then is an in-app destination built.

Each outcome carries a non-leaking audit record naming the declared intent, never the requested
target. The action-panel template renders one button per intent after its commands. On a live
surface it omits any intent the viewer could not follow, resolves again on press, and reports a
refusal. While the layout is being edited, the buttons are inert.

### 2.2 Commands and executors

A command a template widget declares is only a button if something in the core runs it. Each
descriptor names that thing in `executor` (RC-WID-6.1), and `widget.dispatch-command`
(`packages/core/src/commands/widget-command.ts`) routes a press to it after the authority and
payload checks:

| Executor                                | What a press does                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roll`                                  | The session dice engine (`handleRollDice`) with the payload's `formula`; the result is also kept on the instance as `executor.lastRoll`.                 |
| `advance`, `tick`, `reset`, `set-value` | A per-instance counter kept in the instance configuration as `executor.counter` (`advance` adds `by`, default 1). Scene state: the scene revision moves. |
| `show`                                  | A message for the players, kept on the instance as `executor.shownMessage`.                                                                              |
| `write-note-line`, `mark-complete`      | The bound entity through its own command (`content.update-item` appends a line to a note; `content.update-object` completes a quest).                    |
| `start`, `pause`, `resume`              | The session timer keyed by the instance; `start` takes the payload's `durationSeconds`, else the configured one.                                         |

What a press leaves behind lives in the instance **configuration** under the namespaced
`executor.*` keys, because that is the record every surface already carries to the templates (the
board view-model's `configuration`). No declared setting can use those keys, so the Inspector never
offers them.

The system Timer's `timer.*`, the Dice widget's `dice.roll`, and `content.update-item` predate
executors and are still run by name (`CORE_NAMED_WIDGET_COMMANDS`). `content.update-item` (the Loot
Ledger starter's write) is pinned to the widget's bound note: a payload naming any other item is
refused. Anything else is refused.

**Install refuses what nothing can run.** `widget.package.install` and `widget.package.upgrade`
reject a `template` widget that declares a command with no executor
(`schema.command-no-executor`, naming the command). A custom widget is exempt: its code answers its
own buttons. The builder names the same problem on the Commands step (`validate.ts`), so Review
never offers to install it, and its catalogue only offers verbs that have an executor (Draw, Rename
and Set duration had none and were removed). A catalogue pick also adds the setting its payload
reads, so Roll arrives with a `formula` field defaulting to `1d20`. A template command that declares
no executor but whose verb names one (`encounter.roll`, `quest.mark-complete`) gets that executor
recorded at install (`effectiveWidgetCommandExecutor`), which is how the MCP propose tool's drafts
get theirs; a verb that names none is refused. Custom widgets are never inferred for.

**Unavailable is said before the press.** `widgetCommandAvailability()` reports why a command
cannot run right now: no formula, a formula the dice parser rejects, no bound note or quest, nothing
to show, no line, no value, no timer length. The action panel runs it on the payload it would send
and disables the button with the reason as its tooltip; the core runs it again, with the vault, before
executing, so the panel and the core cannot disagree.

**Counter presses are undoable.** `buildWidgetCommandInverse()` turns an accepted counter press into
the core-reserved `widget.counter-restore` command carrying the previous value, under the same pure
(command, state before) contract as `buildWidgetInverse()`. The restore is reachable only on a widget
that declares a counter command, under that command's authority. A roll, a shown message or a note
line has no inverse. `buildWidgetInverse()` delegates counter commands to this builder. Both the
scene editor and home board record presses in their local history, exposing Ctrl+Z and redo from
the panel's buttons in Standby. History serializes consecutive writes and refreshes the scene
revision and idempotency key for each replay; the core still authorizes every restore.

## 3. Rendering

`WidgetRenderSlot.tsx` (`apps/gm-react/src/app/widgets/`) is the single render path on every
surface. `resolveRenderer()` picks `builtin` | `template` | `custom` | `placeholder` and never
throws; a failing renderer yields `WidgetPlaceholder.tsx` with the diagnostic and
`coreStateAvailable: true`. Template renderers (`app/widgets/templates/`: data table, status list,
tracker, action panel, scene message, chart, stat block, form panel) read `dataQueries` through
`dataEnvironment.ts`, which resolves every query source (§3.2) against actor-filtered core reads
and honours `audience`. Built-in bodies (`app/widgets/builtin/`) cover the system widgets: Map, Audio,
combat, notes, atlas, search, session, tools, player views, and the rest.

### 3.1 Accessibility contract

What every widget owes a keyboard or screen-reader user, and who supplies each part (RC-WID-4.4).

| Obligation           | Builtin bodies and templates (the host)                                                                                                                                                                                                 | Custom `custom-html-js` frames (the package)                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A labelled region    | `WidgetRegion` (`WidgetRenderSlot.tsx`) wraps every branch, placeholder included, in a `<section>` named by the widget's title.                                                                                                         | The same region, plus the iframe `title`. Nothing to do.                                                                                               |
| Keyboard operation   | Every operate control is a real `<button>` (`OpChip`, DS `Button`/`IconButton`) in the Tab order, run by Enter and Space. A soft-disabled control stays focusable and says why. A control that unmounts when pressed hands focus on.    | Native controls or named ARIA widgets; every operate control reachable by Tab; no `tabindex` above 0; no focus taken on load; no `role="application"`. |
| Value changes spoken | The value readout is an `aria-live="polite"` region mounted with the readout: a stat row (`LiveStats`), a count line, the timer's status line, the map summary. A template's readout is `TemplateShell`'s region, its controls outside. | Mount an `aria-live="polite"` region at install, empty, and write changes into it. A region inserted together with its text is routinely not heard.    |
| No colour-only state | An accent tone also carries a shape and a name: `StateMark` (done, pinned, playing), "Now" on the active chart and tracker row, a warning glyph on an urgent timer.                                                                     | Same rule. Honour the contrast state below.                                                                                                            |
| Contrast             | Tokens remap under `forced-colors` (`styles/tokens/colors.css`).                                                                                                                                                                        | `init` sets `--host-forced-colors` (`active` \| `none`) and `--host-high-contrast` (`on` \| `off`) on the frame's root, whatever the package declares. |

Placed regions prefix the title with their persisted scene-list position (for example, `1. Note`
and `2. Note`). This keeps landmarks distinct when titles repeat, including across widget types.
Moving or resizing a tile preserves its number; adding/removing tiles may renumber later entries.
Unplaced previews use the title alone.

The readouts are `aria-live`, not `role="status"`. The canvas's confirmation channel ("Undone: moved
…") is the one status on a board; twenty tiles each claiming the role would bury it.

What counts as a value is deliberate. It is what changes while the tile sits on the board: the
round, a count, whether a track plays. Authored prose (a note or handout body) is content and is not
announced. The countdown figure is `role="timer"`, readable on demand but never read out twice a
second; the status line under it announces the status and time left on explicit timer operations
(including duration adjustments while paused, running or stopped) and urgency transitions. Ordinary
clock ticks leave that live text unchanged. Count readouts keep the same live-region element mounted
through empty and populated states, including removal of the last item.
The phone initiative tile announces the turn by its place in the order, because the name is already
in its row and a second copy in the DOM makes every by-name lookup ambiguous. Its value region
retains the same DOM node through idle, running, ended and empty-order states.

The contrast variables reach every frame, not only those declaring `host-theme-tokens`, because they
are an accessibility signal and say nothing about the vault. `--host-high-contrast` is `on` for the
app's high-contrast theme or for the OS forcing colours. The OS mode also reaches the frame's own
`@media (forced-colors: active)`; the app theme reaches it only through this variable. Both are set
before the package's scripts run, and the host restarts the frame when either changes
(`ThemeAwareWidgetHost`):

```js
var root = getComputedStyle(document.documentElement);
if (root.getPropertyValue('--host-high-contrast').trim() === 'on') {
	document.body.classList.add('high-contrast'); // drop decorative colour, keep shapes and words
}
```

The host cannot enforce anything inside an opaque origin, so the package column is a contract, not a
check. Evidence for the host column is `custom-widgets.spec.ts` › "widget accessibility contract":
axe on `/board` and `/scene/:id` with every builtin type placed and the table live, on both profiles;
a Tab-only walk that drives every operate command the builtins declare; and the contrast forwarding.

The map tile renders token and POI markers as decorative glyphs, not controls. Its map canvas
receives empty marker arrays, so scaled markers do not introduce undersized button targets.

### 3.2 Query sources

`WIDGET_DATA_QUERY_SOURCES` (`packages/core/src/state/widget-package-state.ts`) lists every
source: the original eight (`ALL_WIDGET_DATA_QUERY_SOURCES`) followed by the hub sources
(`ALL_WIDGET_HUB_QUERY_SOURCES`). The persisted schema and the builder's catalogue read the full
list, and the source picker labels every member of the union. The `widget.package.propose` tool
still teaches and accepts only the original eight. The hub sources reach the model once that tool's
glosses are extended in `mcp/tool-registry.ts`. `resolveWidgetTemplateData` maps each source onto an existing actor-scoped core read
and adds no filtering of its own. Where it touches a record directly, it does so only for an id that
read has just returned. A query declared `audience: 'dm'` (or `requiredCapability: 'manager'`)
returns no rows to a non-DM viewer, whatever the read would have returned. RC-WID-5.2 added the hub
sources the SCREENS_PARITY gap register (§4.1 G-02) lists.

| Source                | Core read                                                       | A player receives                                                       |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `current-combatants`  | `getCombatTrackerForActor`                                      | Visible combatants; vitals only where the tracker exposes them          |
| `visible-characters`  | `getPartyOverviewForActor`                                      | The characters they may see                                             |
| `selected-scene`      | `listScenesForActor`                                            | Scenes they may open                                                    |
| `session-state`       | workflow + `listScenesForActor` + tracker                       | Active scene named only if visible                                      |
| `notes`               | `getContentItemsForActor` (notes)                               | Visible notes                                                           |
| `maps`                | `listMapsForActor`                                              | Visible maps                                                            |
| `content-objects`     | `getContentItemsForActor` (objects)                             | Visible objects                                                         |
| `binding`             | the board's binding status                                      | The board's own availability verdict                                    |
| `screens`             | `listScreensForActor`                                           | Visible screens; visibility, widget count, thumbnail, live flag         |
| `vault-counts`        | characters, maps and content `*ForActor`                        | Counts of what they may list, never vault totals                        |
| `party`               | `getPartyOverviewForActor` (PCs)                                | Visible PCs with initials (`avatar`) and vitals                         |
| `campaign`            | `getActiveSystemForActor`, scenes, `getCalendarContextForActor` | Name, system, live screen only if visible, workflow, date, own identity |
| `dice-history`        | `getDiceHistoryForActor`                                        | Rolls they may see; the hidden count is never surfaced                  |
| `handouts`            | `getHandoutsForActor`                                           | Handouts delivered to them                                              |
| `rollable-tables`     | content `*ForActor` (`dice-table`) + dice history               | Visible tables and the latest draw they may see                         |
| `quick-reference`     | `getQuickReferencePanelsForActor`                               | Nothing (DM-only read)                                                  |
| `session-archives`    | archives (DM) / `getSessionRecapFeedForActor`                   | Only archived sessions whose recap the feed delivers                    |
| `continuity-digest`   | `getPrepRecapDigest`                                            | Nothing (DM-only read)                                                  |
| `rest-log`            | ledger of characters `listCharactersForActor` returned          | Rests of characters they may see                                        |
| `presence`            | `projectSessionPresence` with scene-hint stripping              | Participants; a hint naming a hidden screen is removed                  |
| `player-projections`  | `session.playerViewAssignments` (DM) / `getPlayerViewForActor`  | Their own row only                                                      |
| `initiative-call`     | `getCombatTrackerForActor` log                                  | Awaiting / rolled / adjusted for visible combatants                     |
| `combatant-status`    | `getCombatTrackerForActor`                                      | Conditions, concentration, death saves only where vitals are exposed    |
| `capture-candidates`  | `listCharactersForActor` + `getContentItemsForActor`            | References to what they may list                                        |
| `widget-library`      | `listWidgetLibrary`                                             | Nothing (scene authors only)                                            |
| `live-peers`          | host transport (`WidgetHostContext.table`) + presence status    | Connected peers by actor: name, status, hand, ready. No ids or invites  |
| `table-readiness`     | host transport (`WidgetHostContext.table`)                      | Nothing (the hosting DM's call cue)                                     |
| `continuity-mentions` | latest archived capture vs `listCharactersForActor` + content   | Nothing (DM-only, like the capture)                                     |

A row may also carry `avatar` (initials), `thumbnail` (the scene background token: screens carry no
image) and `visibility`. A screen row keeps its visibility in `visibility` (and `meta`) and its live
flag in `active`, so a private live screen still reads as private. `WidgetHostContext` passes in what
only the device knows: the vault's name from this device's catalog (`campaign`), the platform
profile (`widget-library`) and the live table (`table`: the P2P session role and its peers). The
live-table sources project that table for the viewer the way the host's presence broadcast does. A
caller that passes no table gets "The live table is not available here", never an empty roster.
`continuity-mentions` reads the capture the latest session log stored on its archive and runs
`detectContinuityMentions` against the DM's roster and vault, so a quick-created NPC drops off by
itself. "Not now" is a local dismissal, not data. `useWidgetHostContext` builds the context;
the builder's previews pass it today. The template slot (`templates/index.tsx`) and the worker
host still call the resolver without one, so a placed widget reads the live-table sources as "not
available here" until RC-WID-5.3 wires it into the template slot.

The builder's Data step previews every source live (`DataStepBindings.tsx`). Each query card
shows its reading for the author and for the reserved preview player. "Every source" lists the
whole catalogue the same way. Isolation tests: `app/widgets/dataEnvironment.hub.test.ts` (one case
per source, for a player, an observer and the preview player). Browser:
`tests/e2e/widget-query-sources.spec.ts`.

### 3.3 Query options

A query may carry `options` (RC-WID-6.5, `WidgetDataQueryOptions`). Every option narrows or orders
the rows the source's actor-scoped read already returned, so none can widen what a viewer sees.

| Option            | Values                                     | Sources                                                           |
| ----------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `characterKinds`  | `pc`, `npc`, `monster`, `sidekick` (1+)    | `visible-characters`, `current-combatants`                        |
| `tag`             | non-blank, ≤ 64 characters                 | `selected-scene`, `screens`, `notes`, `content-objects`           |
| `sceneMembership` | `active-scene`; `in-combat` for characters | `visible-characters`, `party`; `notes`, `content-objects`, `maps` |
| `status`          | `up`, `bloodied` (≤ half HP), `down` (0)   | `visible-characters`, `party`, `current-combatants`               |
| `sort`            | `name`, `value-high`, `value-low`          | every source                                                      |
| `limit`           | 1–50                                       | every source                                                      |

The schema refuses an option on a source that cannot honour it (`widgetQueryOptionIssues`, shared
with the builder). Filters match the viewer's redacted view: a tag in a field hidden from players,
or an HP the read withheld, never matches for a player. `active-scene` reads the entity ids bound
on the active screen as `getSceneForActor` delivers it to the viewer, so a screen they cannot open
contributes nobody. Sort and limit run last. Rows that name a visibility put the app's word in
`meta` ("DM only", "Shared", "Player visible") and the level in `visibility`.

A template kind that reads no query (`widgetTemplateReadsQueries`: action panel, scene message, form
panel, launcher, link list) never says it has no data source. In the builder preview a kind that
does read one draws three sample rows labelled "Sample data" until a query exists; a placed widget
never gets them. Tests: `packages/core/tests/widget-query-options.test.ts`,
`app/widgets/dataEnvironment.options.test.ts`, `app/widgets/templates/noQuery.test.tsx`, and
`tests/e2e/widget-honest-previews.spec.ts`.

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
| widget → host | `navigate({ intentId, targetId? })`         | `resolveWidgetIntent` (§2.1); needs `navigate`       |
| widget → host | `resize { height }`                         | clamped frame height (iframe only)                   |
| host → widget | `theme { themeVariables, hostDocument }`    | the host's live look; themed packages only (§4.1)    |

The core decides, the host relays: `hostBridge.ts` never answers a permission, outbound or navigate
request from its own logic. A refused `navigate` is dropped. The frame is answered with the
decision, the iframe's `data-dropped-intents` count goes up, and the core's audit record goes into
the host's bounded session log (`listWidgetHostAudit`, 100 entries, not persisted; `window.__widgetHostAudit`
in dev builds). A resolved one is routed in-app. The worker sandbox does not speak `navigate`; its
parser drops it as an unknown kind. Inbound messages are validated and attributed to an instance id; unknown kinds,
version mismatches, and foreign frames are dropped and audited. A frame that throws, hangs, or
violates policy is torn down through `isolateWidgetFailure`; siblings and core state survive.

The **worker sandbox** (`app/widgets/WorkerHost.ts`) speaks the same protocol minus `resize`, plus a
`result` message whose payload is whitelisted by `normalizeWorkerResult` and drawn through the
template kind the entrypoint declares. Every exchange is on a clock (8s to `ready`, 3s per render); a
missed deadline calls `terminate()`. The hosted CSP admits `worker-src 'self' blob:`; the packaged
Electron shell's `buildCsp()` does not yet, so a worker there fails closed with "Background widgets
do not run on this build yet."

### 4.1 The design-system kit

A package that declares the `host-theme-tokens` style capability gets the design-system kit
(`apps/gm-react/public/widget-kit.css`, RC-WID-5.4): classes that draw the DS Button, IconButton,
Card, Badge, Chip, ListItem, Input, Select and Stat from the host's own theme tokens. A package
without the capability gets neither the kit nor the tokens. The Torchlight starter is the reference
user, and `widget-kit.spec.ts` checks its kit card, badge and button against the DS components
rendered by the gallery, in all three themes and both densities.

**Delivery.** The kit is served beside `widget-host.html`, but the frame never requests it. The host
fetches it once per page (`loadWidgetKit` in `SandboxHost.tsx`) and sends the text in `init` as
`kit { version, css }`. The host prepends `@font-face` rules containing data URLs for the same
vendored latin WOFF2 faces and weights as `styles/tokens/fonts.css` (Inter 400–800, Cinzel 400–900,
JetBrains Mono 400–700). Vite embeds those assets in both development and production; no guest
font request leaves the frame, and the existing `font-src data:` policy is unchanged. These faces
follow the app's `font-display: swap`; wait for `document.fonts.ready` before comparing rendered text.
The guest installs it ahead of the package's stylesheet, so a package rule
beats a kit rule of equal specificity. `WIDGET_SANDBOX_CSP` does not change. A `<link>` would need
an external style source. Even restricting that source to the kit's path would allow a query
string on the stylesheet URL, giving the frame a request that bypasses the `outbound` gate
(`renderer-isolation.ts`). If the fetch fails or the served file declares a different version, the
frame is initialised without the kit.

**What the host forwards.** `init` and every later `theme` message carry `themeVariables`: the
bridge's forwarded tokens, the Style step's tokens, and `KIT_THEME_TOKENS` (the colours, shadows and
mono face the kit draws with). They also carry `hostDocument { theme, density, motion, colorScheme,
rootFontSize }`, which the guest mirrors onto the frame's `<html>` as `data-theme`, `data-density`,
`data-motion`, `color-scheme` and `font-size`. The host watches its own `<html>`, so switching theme,
density or Reduce motion re-themes a running frame without a reload. The theme-invariant scale
(`--space-*`, `--radius-*`, `--text-*`, `--font-weight-*`, `--leading-*`, `--tracking-*`,
`--duration-*`, `--easing-*`, `--focus-ring-*`, `--density-*`) is declared by the kit itself, along
with the two density sets and the motion collapse. `widgetKit.test.ts` holds all of it equal to
`styles/tokens/`. Package CSS can use any of these tokens.

**Class contract (kit v1).** A modifier goes with its base class. Colours come only from tokens.

| Component   | Markup                                                                                                                                | Modifiers and states                                                                                                           | DS counterpart       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Body text   | `class="kit-root"` on a container                                                                                                     | —                                                                                                                              | app body typography  |
| Button      | `<button class="kit-button">` (or an `<a>`), optional leading/trailing `<svg>`                                                        | `--primary`, `--secondary` (default), `--ghost`, `--danger`, `--accent`; `--sm`, `--lg`; `:disabled` or `aria-disabled="true"` | `Button`             |
| Icon button | `<button class="kit-icon-button" aria-label="…"><svg>…</svg></button>`                                                                | `--ghost` (default), `--outline`, `--accent`; `--sm`, `--lg`                                                                   | `IconButton`         |
| Card        | `.kit-card`; header row `.kit-card__header` holding a `.kit-card__title` eyebrow                                                      | `--sunken`, `--flat` (default), `--raised`, `--overlay`; `--accent`; `--pad-none`, `--pad-sm`, `--pad-lg`; `--interactive`     | `Card`, `CardHeader` |
| Badge       | `<span class="kit-badge">`, optional `<svg>`                                                                                          | `--success`, `--warning`, `--error`, `--info`, `--accent`, `--neutral` (default)                                               | `Badge`              |
| Chip        | `.kit-chip`; a `<button class="kit-chip" aria-pressed>` for a filter; `.kit-chip__remove` for the close button                        | `--neutral` (default), `--accent`, `--danger`, `--info`; `--selected` or `aria-pressed="true"` (neutral tone)                  | `Chip`               |
| List row    | `<ul class="kit-list">` of `<li class="kit-list-row">`; an interactive row holds `<button class="kit-list-row__action" aria-pressed>` | `--selected` or `aria-selected="true"`; a disabled action dims its row                                                         | `ListItem`           |
| Input       | `<input class="kit-input">`, `<textarea class="kit-input">`                                                                           | `--invalid` or `aria-invalid="true"`; focus ring on `:focus`                                                                   | `Input`, `Textarea`  |
| Select      | `<div class="kit-select"><select>…</select></div>`; the wrapper draws the chevron                                                     | `--invalid` on the wrapper, or `aria-invalid="true"` on the select                                                             | `Select`             |
| Stat        | `.kit-stat` holding `.kit-stat__label`, `.kit-stat__figure` (`.kit-stat__value`, `.kit-stat__unit`) and `.kit-stat__delta`            | `.kit-stat--accent`; `.kit-stat__delta--up`, `--down`                                                                          | `Stat`               |

Two baselines apply to the whole frame at zero specificity: the app's `:focus-visible` ring, and
`box-sizing: border-box` on kit elements. Under `data-motion="reduced"` or `"none"`, every animation
and transition in the frame stops on its resting frame, the package's own included.

**Versioning.** `--kit-version` in the stylesheet and `WIDGET_KIT_VERSION` in `SandboxHost.tsx`
move together. Renaming or removing a class or modifier, or changing what one means, is breaking and
bumps both. Adding a class is not breaking.

**What the kit does not do.** It ships no icons; draw a Lucide glyph as inline SVG at a 2px stroke in
`currentColor`. It ships no behaviour: an `aria-disabled` button must ignore its own clicks, and a
`role="button"` chip needs its own keyboard handler. The kit supplies the app's latin fonts; glyphs
absent from those fonts use the same device fallback stack as the app. A package that overrides typography owns the resulting look.

## 5. Trust review

`widget.package.review` (`packages/core/src/commands/widget-package.ts`) is the single writer of
`WidgetPackageRecord.trust`. Every permission the package requests carries an explicit
`approved` | `denied` decision; anything absent stays denied, so a permission an upgrade newly
requests stays denied until a review approves it. When `buildWidgetPackageReviewSummary`
(`queries/widget-package-review.ts`) recommends `deny-until-fixed`, the DM must acknowledge it before
`trusted` is recorded. Review is separate from `widget.package.enable`. The approved set is exactly
the `HostCapabilityGrant.approvedPermissions` the host passes to `resolveHostCapability`, so a denied
capability is absent at the gate, not merely hidden.

Installed packages start `unreviewed` with every permission denied. System packages shipped in code
are pre-trusted.

### 5.1 Author trust (RC-WID-6.2)

`widget.package.install` accepts `authorTrust: true`: the installing DM wrote the package and trusts
it on their own word. The core grants it only when `evaluateWidgetPackageAuthorTrust`
(`queries/widget-package-review.ts`) clears the package:

- every widget renders through a host `template` (no `custom-html-js`, no missing entrypoint);
- the package ships no file except plain `asset`s (no html, script, worker, module, stylesheet, or
  asset of unstated kind), and no widget declares a stylesheet or the `custom-stylesheet` capability;
- no widget requests a host permission or a network destination;
- the review summary's verdict is `trusted-after-review`, which already excludes generated packages
  and any command or output write to a player-visible or lower-privilege destination.

A cleared package is recorded `trusted` with `basis: 'author'`, `reviewedBy` = the installing DM,
every permission still denied, and `enabled: true`. Beside the install op the command appends a
`widget.package.review` op (`trustState: 'trusted'`, `approvedPermissions: []`, the verdict and
`basis: 'author'`) as the audit entry. A package the rule does not clear is refused outright
(`author-trust-refused`, one issue per reason) and nothing is installed; without the flag the
install is unchanged. Author trust covers the package as written: an upgrade of an author-trusted
package that stops qualifying drops it to `unreviewed` with every permission denied (the upgrade op
records `trust: 'unreviewed'`). A later review in the sheet replaces the record and clears `basis`.
`packages/core/tests/widget-author-trust.test.ts` holds the rule, each refusal and the upgrade lapse.

The builder asks for author trust only when the same rule clears its package. Anything else installs
on the fail-closed path and `TrustReviewSheet` opens over the builder; trusting it there enables it
too, so allow-and-enable never needs Extensions. Cancelling or denying closes the builder with a
toast whose "Open package" action goes to Extensions.

### 5.2 Forks (RC-WID-6.6)

`widget.package.fork` copies one widget of any installed package (a starter, a bundle's, a
generated one) into a new `user-authored` package with `authoring.forkedFrom` (source package id,
version and widget type). The core reads the definition and assets from its own state; the caller
names only the source and, optionally, the copy's slug ids and display name. The copy gets a fresh
type and id (`widgetPackageForkIdentity`: `user.<type>` / `<type>-copy`, numbered from `-2`),
version 1.0.0 and no migrations, then goes through the install schema, validation and commit path.
A widget with a `builtin` renderer cannot be copied, because that renderer is keyed by its own type. Nor can a system widget (`author: 'system'`, locked content): most
draw through a hand-written body keyed by their type, which a copy would lose (Dice, the timer).

The copy's trust is decided afresh by `evaluateWidgetPackageForkTrust`. The RC-WID-6.2 rule runs on
the copy, and two source states keep it on the review path whatever it contains: a source the DM
denied, and a generated source nobody has trusted. Nothing about the source's trust or approved
permissions carries over. A template copy that clears is `trusted`/`basis: 'author'` and enabled
with the same `widget.package.review` audit op an author-trusted install writes; anything else,
Torchlight's custom code included, is `unreviewed`, off, every permission denied. The fork op
records `forkedFrom` and the trust it started with. `forkedFrom` is accepted by install and upgrade
(`schemas/commands.ts`) so the builder can save the copy again; nothing reads it to grant anything.

`scene.repoint-widget` moves a placed instance onto its fork, or a fork's instance back to the
widget it was copied from, and refuses any other type, so it cannot bypass `scene.add-widget`'s
checks. The target must be installed; it may be off (the tile then reads "disabled, preserved", as
for any package switched off after placement). The instance's configuration must satisfy the
target's schema; id, layout, binding and local state are kept, `disabled` is cleared. Both commands are
DM-only. `packages/core/tests/widget-fork.test.ts` covers both.

`navigate` (RC-WID-5.1) lets custom code follow the intents its definition declares, and only to
targets the viewer can already read. It never grants a URL. A trust record written before the
permission existed has no `navigate` key, and the host reads approvals only from entries that say
`approved`, so such a record stays denied.

## 6. Authoring

- **Manual builder** (`apps/gm-react/src/app/widgetBuilder/`, Extensions › Plugins, and the
  gallery's "Build your own"): a stepper
  (identity → layout → data → config → commands → style → advanced → review) with a live preview
  through the same render resolver. It produces `template` definitions; `custom-html-js` is only
  reachable through the explicit Advanced step, where code, requested permissions, and the SEC-011
  destination picker live with the review summary recomputed live. The Commands step also declares
  intents ("Open and create"). Open intents pick their target from the author's actor-filtered
  reads; a template's starts on the first one the author can see. Adding an intent to a custom
  widget requests `navigate`. The step itself names a template open intent with no target, an
  unlabelled intent, and a custom widget whose intents lack `navigate` (`validateIntents`, in `draft.ts`); the core
  schema refuses duplicate ids and empty labels on Review. The iteration diff (`draftDiff.ts`)
  prints each intent with its destination, so a re-run that keeps a label but changes the target,
  kind, route, tab or creation target shows up as a change and can be applied. Each command row
  has a "Runs" picker for its executor; a template command without one blocks Review (§2.2).
  Install follows §5.1: author-trusted and enabled when the rule clears it, otherwise the trust sheet
  over the builder. An enabled install is handed to the host's `onInstalled`.
- **Kept drafts** (RC-WID-6.6): a draft that differs from what the builder opened with is kept
  (`keptDraftStore`, for the life of the document), keyed by the id of the package the builder
  opened on (the empty key for a new widget), until it is installed, saved or discarded. It is not
  in device preferences yet: that needs a `PREFERENCE_KEYS` entry RC-WID-6.6 does not own, and the
  store holds the same serialized value so the move is that key plus the store's two lines. Closing it by
  Escape, Back or the platform gesture asks Keep or Discard; Escape on that question returns to the
  builder. Opening the builder on a package with a kept draft asks Resume or Start over first. The
  store is pure (`readStoredDraft`, `writeStoredDraft`, `removeStoredDraft` in `draft.ts`, at most
  12 drafts) and reads a stale or hand-edited value over fresh defaults instead of failing.
- **Edit widget** (RC-WID-6.6): the canvas and flow tile menus and the Inspector share
  `useEditWidget`. `widgetEditTarget` decides: the GM's own single-widget package opens as it is;
  otherwise an unplaced copy from an earlier edit is reused (its kept draft resumes), or the widget
  is forked (§5.2). The tile moves onto the copy at once through `scene.repoint-widget`. A copy that
  starts off (custom code) reads "disabled, preserved" until the builder saves it: the upgrade turns
  it on and the slot mounts a fresh sandbox with the saved code. Closed with the copy still off, the
  tile goes back to its original widget. The builder opens on Data, or Advanced for custom code.
  A saved new version of a custom widget whose tile stays mounted (a second edit) keeps drawing
  the old code until the tile remounts: `SandboxHost` sends its document once, at load. `readPackage` reads a starter's or import's own files: the
  stylesheet and script by declaration and kind beside the entrypoint, and the markup as the
  document's body without the link and script the builder's document adds back. The builder is
  portalled behind a fence that stops key, wheel and context-menu events reaching the canvas
  through React; it hears its own keys on its overlay, before that fence.
- **Settings that exist** (RC-WID-6.8): the builder writes the Layout step's dock preference as a
  display config field only when the widget's surfaces include one that docks (`DOCKING_SURFACES`,
  the Command Center); a scene-only widget has none. A placed tile offers
  `widgetSettingsFields`: every declared field except `visibility` (it has its own control) and the
  dock preference (no tile canvas reads it). The Config step flags both keys as reserved. With no
  setting left, the canvas tile menu shows a disabled "No settings" row with the reason in place of
  Configure…, and Edit widget beside it; the Inspector's settings tabs say the same. Recipes declare
  the settings a GM changes through `titleSetting` (key `title`, which the host reads as the tile
  title) and `rangeSettings` (`min`/`max`, content-group numbers, which the tracker shows beside
  the count, so a range saved in Configure… is what the tile then says). `counterRecipe` is the
  "Counter or clock" draft. Who sees a tile stays the host's per-instance visibility, not a field.
  Colour is not a recipe setting yet: a per-instance colour is the `styleTokens` override object,
  which no flat config control writes.
- **AI builder**: `widget.package.propose` is a staged MCP write tool (`mcp/tool-registry.ts`,
  `commandType: 'widget.package.install'`). Its input schema has no code, permissions, or network
  fields, so a model cannot author `custom-html-js`. Approval installs the package `unreviewed`;
  trust is a second, separate review (a generated package never qualifies for author trust, §5.1). Provenance records `authoring.source = 'generated'` and a
  `promptHash` fingerprint, never the prompt. The schema was trimmed to what a model must invent,
  because a large tool schema degraded tool choice across every other tool (measured against
  `scripts/ai-agent-smoke.ts`).

### 6.1 The builder parity gate (RC-WID-5.5)

Every widget on a shipped fresh default screen must be a template or public-API custom
widget that a GM can open in the builder. This includes both the Command Center and the
fresh GM board at `commandCenter.homeSceneId`, even when the board has no default origin.
Preserving existing customized boards does not exempt fresh provisioning.

`parity.test.ts` runs in `pnpm test` through `test:app`. It checks the installed definition,
actual renderer, builder edit target and fork, then compares the original eligible export
bytes with the first builder import/save/install/export. Added fields, removed fields and
changed serialization all fail; normalization before comparison is not allowed.

`BUILTIN_PARITY` in `parity.ts` declares each builtin body's commands, intents and query
sources. Source scanning follows local imports and checks shared-module declarations.
Runtime state member access, aliases (`const s = runtime.state; s.session.timers`), later
assignments (`let s; s = runtime.state`), runtime destructuring (`const { state: s } = runtime`),
aliases of aliases and literal indexed access (`runtime["state"]`) are inspected through TypeScript
syntax. Query exposure is derived from resolver sources. Every command, read or state path
that no declared descriptor, intent or query source covers is a finding.

The checkers report every finding and never consult a waiver. The test compares the full
list with `PARITY_DEBT_LEDGER` in `parity.ts`, an exact ratchet like the raw-style
allow-lists: a finding missing from the ledger fails, and so does a ledger entry that no
longer reproduces. Each entry is one finding, word for word, and names the story that
repays it. Repairing a finding means deleting its entry in the same change; adding an entry
is a reviewed decision, not a way to pass the gate. Regression cases cover an unledgered
private read, an aliased private read, a stale entry, a field lost on the first import and
a builtin on the fresh GM board.

Negative regression fixtures inject their own defects; only the exact ledger comparison requires
current production debt to reproduce, so repaying that debt does not break unrelated assertions.

The remaining ledger after RC-WID-5.6 (2026-10-08):

| Repaid by  | Findings                                                                                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RC-WID-5.7 | 7: the fresh GM board provisions builtin bodies for `map`, `initiative-tracker`, `dice`, `timer`, `audio`, `quick-reference` and `prep`.                                                                                                                                                                           |
| RC-WID-5.7 | 41: private builtin uses in `timer`, `audio`, `initiative-tracker`, `character`, `map`, `session`, `getting-started`, `tools`, `atlas`, `player-views`, `combat` and `search` (session timers, audio playback, map views and projection, combat writes, other actors' roles, presets, encounters, saved searches). |

RC-WID-5.6 repaid the five home-definition findings: shipped definitions include empty
computed fields and query arrays, token-derived CSS variables and declared configuration schema properties,
matching the builder’s first save. The first-trip byte comparison remains unnormalised;
existing customised boards and instance settings are not rewritten. RC-WID-5.7
(RC_ROADMAP.md, Epic WID-5) repays the remaining ledger.

## 7. Canvas and layout history

`app/SceneBoardCanvas.tsx` is the shared engine for `/board` and `/scene/:id`. Every pointer
operation serializes to the same core command as its keyboard equivalent (WCAG 2.5.7). Layout undo
and reversible destroy are documented in [`SCENE_HISTORY.md`](SCENE_HISTORY.md).

[ADR-041](../adr/041-screens-as-the-run-surface.md) accepts this engine as the `canvas` layout policy
of a screen and adds `flow`, a responsive column grid of auto-height tiles whose visual, DOM and
focus order is the layout order, as the default for hub screens. Both policies use the same widget
instances, the same render resolver and the same core mutation path; flow is not implemented yet
(CAN-7.7).

## 8. Where to look

| Concern                                  | Location                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definitions, packages, system widgets    | `packages/core/src/state/widget-package-state.ts`                                                                                                                                                                                                                             |
| Instances and scene visibility           | `packages/core/src/state/scene-state.ts`                                                                                                                                                                                                                                      |
| Binding resolution                       | `packages/core/src/queries/binding.ts`                                                                                                                                                                                                                                        |
| Library discovery                        | `packages/core/src/queries/widget-library.ts`                                                                                                                                                                                                                                 |
| Operator authority                       | `packages/core/src/permissions/widget-operator-authority.ts`                                                                                                                                                                                                                  |
| Command executors and availability       | `packages/core/src/commands/widget-command.ts` (`widgetCommandAvailability`, `buildWidgetCommandInverse`)                                                                                                                                                                     |
| Intent resolver and `navigate` gate      | `packages/core/src/security/widget-host-api.ts` (`resolveWidgetIntent`)                                                                                                                                                                                                       |
| Sandbox policy, host API, exfiltration   | `packages/core/src/security/{custom-widget-runtime,widget-host-api,widget-exfiltration}.ts`                                                                                                                                                                                   |
| Review command, summary, author trust    | `packages/core/src/commands/widget-package.ts`, `queries/widget-package-review.ts` (`evaluateWidgetPackageAuthorTrust`)                                                                                                                                                       |
| Fork, fork trust, re-point               | `packages/core/src/commands/widget-package.ts` (`handleForkWidgetPackage`, `evaluateWidgetPackageForkTrust`), `commands/scene.ts` (`handleRepointWidget`)                                                                                                                     |
| Render path, templates, data environment | `apps/gm-react/src/app/widgets/`                                                                                                                                                                                                                                              |
| Iframe and worker hosts, bridge          | `apps/gm-react/src/app/widgets/{SandboxHost.tsx,WorkerHost.ts,hostBridge.ts}`                                                                                                                                                                                                 |
| Design-system kit for custom widgets     | `apps/gm-react/public/widget-kit.css`, `apps/gm-react/src/app/widgets/widgetKit.test.ts`                                                                                                                                                                                      |
| Builder                                  | `apps/gm-react/src/app/widgetBuilder/`, `screens/extensions/WidgetBuilder.tsx`                                                                                                                                                                                                |
| Builder parity gate (§6.1)               | `apps/gm-react/src/app/widgets/parity.ts`, `parity.test.ts`                                                                                                                                                                                                                   |
| E2E                                      | `custom-widgets.spec.ts`, `widget-builder.spec.ts`, `widget-trust-review.spec.ts`, `widget-generate.spec.ts`, `starter-widgets.spec.ts`, `widget-kit.spec.ts`, `widget-intents.spec.ts`, `widget-commands.spec.ts`, `widget-author-trust.spec.ts`, `widget-edit-fork.spec.ts` |

## 9. Widget gallery

`WidgetFrame.tsx` owns the gallery row (`WidgetLibraryCard`). Since RC-CAN-8.5 a library entry is
one short row: accent rail, glyph, title, category and a one-line purpose, all inside ONE button
named "Add <widget>" (the visible title is part of the name; the purpose and any unavailability
reason are its description). The row reports mouse hover and keyboard focus (`:focus-visible`, so
a tap does not) to the gallery, which owns discovery, filtering, the miniature and placement. Row
test ids (`gallery-card-<type>` on the `li`, `gallery-entry-<type>` on the button) are keyed on
widget type, which assumes types are unique across installed packages.

`AddWidgetGallery` is shared by the GM Screen (`Board`) and scene editor. Phones use the design
system bottom `Sheet`; wider viewports use a non-modal side panel with the same rows. The side panel
is size-contained (`contain: size`): the board's root grows with its content (RC-UX-2.4), so an
uncontained panel grew the page and `<main>` scrolled the canvas away; contained, it stretches to
the board row and scrolls inside itself. Search matches name, description, category, type and
package name; category filters combine with search. Unsupported entries remain visible after the
available entries, with an accessible reason and no add action. A row dimmed because its package is
off gets its own list row below it with "Enable <widget>" (`InPlaceEnable`, in
`screens/extensions/WidgetBuilder.tsx`) for the DM, but only for a package already `trusted` or one
`evaluateWidgetPackageAuthorTrust` clears; a package with code or a permission still goes through
review. Enabling announces "<widget> is on. Pick it to add it." and focuses the row. "Generate with assistant" and
"Build your own" follow the library as a final "More ways to add" group (still one click each).

### Rendering and placement

The gallery reads `listWidgetLibrary` with the runtime profile and `includeUnavailable: true`.
Declared templates render through the same pure template components used by `WidgetRenderSlot`,
with synthetic sample rows and default configuration. These samples never enter campaign state.
Legacy bodies without a declared template use `WidgetRenderSlot`. Custom-code packages show a
labelled silhouette; browsing does not start their iframe or worker. A miniature mounts only while
its row is hovered by a mouse or focused from the keyboard, in a fixed popover portalled beside the
row (left of the side panel, over the canvas; above or below a phone row), `aria-hidden` and
`inert`, so its body's own buttons are never tab stops (`AddWidgetGallery.test.tsx` proves it with
the live Dice body).

An empty scene offers “Start from a template”. “Generate with assistant” opens the existing draft
workflow; “Build your own” opens the widget builder. Neither installs a package just by opening it.
Picking a row places the tile through `placeNewTile` (`screens/screen/paletteRows.ts`), the one
placement path for every add: the gallery, the palette's "Add tile" rows (through `nextFreeSlot`)
and, after a build, RC-WID-6.2: the host keeps the builder's `onInstalled` package and passes it
back as `placePackage`; once the library lists it, the gallery picks it exactly like a row (and calls
`onPlacePackageDone`). Candidates are the board's 24px margin/gutter on its 264px column
step, the gutter past every tile's right and bottom edge, and every tile's top. Of the free ones,
the first in reading order whose corner is in view wins (`visibleBoardRect` reads the on-screen part
of the surface off its rendered frames); with none in view, the one nearest the view's centre; with
no rendered surface, the first in reading order. The GM Screen uses its fixed right bound; scenes
also admit their existing horizontal extent. A scene on the `flow` layout policy (ADR-041) has no
free coordinates to search, so its next slot is the end of the reading order: `flowKeyBetween(last,
null)` over `flowOrder`, one flow row below the last tile. An accepted add closes the panel, hands
the new tile to the host's `onPlaced` (the GM Screen selects it; the scene editor passes none, because
there a selection opens the Inspector, which on a phone covers the canvas), focuses it, scrolls it
fully into view and announces "Added <widget>" in a permanent polite region. Failed adds keep the gallery open.

The gallery's copy lives in the shared catalogs under `boardCanvas.add.*`.

### Browser acceptance

The executable Playwright fixture below checks Board and SceneEditor in both desktop-chromium and
mobile-chromium: panel modality, populated template miniatures, unsupported profile reason and
blocked placement, search, categories, empty header, generation/build entry points, non-overlapping
placement, tile focus and a visible keyboard focus ring on a row. It also runs axe over the open gallery's interactive content.
RC-CAN-8.5's committed `tests/e2e/add-panel.spec.ts` covers the rest of the panel's contract on both
projects (two clicks to add Dice, a focused, selected tile inside the viewport, in-view placement on
a scrolled board, unnamed-button axe rules, the miniature outside the tab order), and
`tests/visual/add-panel.spec.ts` pins the panel in every theme and tier.

Test paths are outside RC-CAN-4.1 ownership, so this fixture is kept here and extracted temporarily.
From the repository root, run:

````sh
python3 - <<'PYTEST'
from pathlib import Path
import os
import subprocess
text = Path('docs/architecture/WIDGETS.md').read_text()
spec = text.split('```typescript\n', 1)[1].split('\n```', 1)[0]
path = Path('apps/gm-react/tests/e2e/rc-can-gallery-acceptance.spec.ts')
with path.open('x') as output:
    output.write(spec + '\n')
try:
    result = subprocess.run([
        'pnpm', '--filter', '@dndtools/gm-react', 'exec', 'playwright', 'test',
        'tests/e2e/rc-can-gallery-acceptance.spec.ts',
        '--project=desktop-chromium', '--project=mobile-chromium',
    ], env={**os.environ, 'DNDTOOLS_E2E_PORT': '15549', 'DNDTOOLS_PW_WORKERS': '2'})
finally:
    path.unlink()
raise SystemExit(result.returncode)
PYTEST
````

The scene library retains its existing `scene-add-widget-panel` test hook on the card list.
The phone sheet exposes Done in its footer so layout editing can finish while the toolbar is
covered. Existing canvas and widget-builder browser tests run unchanged. The keyboard specs from
RC-CAN-3.5/3.6 (`canvas-keyboard.spec.ts`, `canvas-arrange.spec.ts`) now pick the Note card by its
`gallery-entry-note` test id. They wait for the gallery itself, because the phone Sheet hides the
toolbar toggle. They also expect first-open-slot placement (one row) instead of the old diagonal
cascade.

```typescript
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

/**
 * RC-CAN-4.1 — the Add-widget gallery on `/board` and `/scene/:id`, run on both Playwright
 * projects. The phone project gets the DS Sheet, the desktop project the side panel; everything
 * else (live miniatures, search, category filter, dimmed profile-unsupported entries, the empty
 * scene's template header, the generate/build entries, placing into the first open slot and
 * focusing the new tile) is asserted identically on both.
 */

const DESKTOP_ONLY_ID = 'e2e.gallery-desk-lantern';
const DESKTOP_ONLY_TYPE = 'gallery-desk-lantern';

/** A package whose only widget declares the desktop profile. The browser runtime is `web`. */
const DESKTOP_ONLY_PACKAGE = (() => {
	const base = `widgets/${DESKTOP_ONLY_TYPE}`;
	return {
		id: DESKTOP_ONLY_ID,
		version: '1.0.0',
		displayName: 'Desk Lantern',
		widgets: [
			{
				type: DESKTOP_ONLY_TYPE,
				version: '1.0.0',
				displayName: 'Desk Lantern',
				author: 'workspace',
				description: 'Only runs in the desktop app.',
				placement: { surfaces: ['scene'], libraryListed: true },
				renderEntrypoint: {
					runtime: 'custom-html-js',
					sandbox: 'iframe',
					assetPath: `${base}/index.html`,
					hostApiVersion: 1,
				},
				style: {
					isolation: 'iframe-document',
					stylesheetAssetPaths: [`${base}/styles.css`],
					capabilities: ['css-variables', 'host-theme-tokens'],
					tokens: [],
				},
				supportedProfiles: ['desktop'],
				defaultSize: { width: 240, height: 160 },
				minSize: { width: 200, height: 120 },
				resizePolicy: 'free',
				requiredBindings: [],
				optionalBindings: [],
				configurationSchema: { type: 'object', additionalProperties: true },
				capabilitySets: ['manager', 'operator', 'viewer'],
				commands: [],
				events: [],
				hostPermissions: [],
			},
		],
		migrations: [],
		assets: [
			{
				path: `${base}/index.html`,
				kind: 'html',
				entrypoint: true,
				content:
					'<!doctype html><html><head><link rel="stylesheet" href="./styles.css" /></head><body><p>Lantern</p><script src="./main.js"></script></body></html>',
			},
			{ path: `${base}/styles.css`, kind: 'css', content: 'p { margin: 0; }' },
			{ path: `${base}/main.js`, kind: 'javascript', content: '' },
		],
		portabilityWarnings: [],
	};
})();

async function installDesktopOnly(page: Page): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const installed = await dispatch(page, {
		type: 'widget.package.install',
		actorId,
		payload: { package: DESKTOP_ONLY_PACKAGE },
	});
	expect(installed.status, JSON.stringify(installed.rejection)).toBe('accepted');
	const enabled = await dispatch(page, {
		type: 'widget.package.enable',
		actorId,
		payload: { packageId: DESKTOP_ONLY_ID },
	});
	expect(enabled.status, JSON.stringify(enabled.rejection)).toBe('accepted');
}

type Layout = { id: string; x: number; y: number; w: number; h: number };

function layouts(page: Page, sceneId: string): Promise<Layout[]> {
	return page.evaluate(
		(id) =>
			(
				window.__rt!.state.scenes.scenes[id]?.widgets as unknown as
					| Array<{ id: string; layout: { x: number; y: number; w: number; h: number } }>
					| undefined
			)?.map((w) => ({ id: w.id, ...w.layout })) ?? [],
		sceneId,
	);
}

const overlaps = (a: Layout, b: Layout) =>
	a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Pick the first addable card and return the new tile's layout once the core has it. */
async function placeFirst(page: Page, sceneId: string): Promise<Layout> {
	const before = new Set((await layouts(page, sceneId)).map((w) => w.id));
	await page
		.getByTestId('add-widget-gallery')
		.locator('[data-testid^="gallery-entry-"]:not([aria-disabled="true"])')
		.first()
		.click();
	await expect.poll(async () => (await layouts(page, sceneId)).length).toBe(before.size + 1);
	return (await layouts(page, sceneId)).find((w) => !before.has(w.id))!;
}

test.describe('add-widget gallery (RC-CAN-4.1)', () => {
	test('the GM Screen gallery previews, filters, dims unsupported entries and places a tile in the first open slot', async ({
		page,
	}, testInfo) => {
		const phone = testInfo.project.name === 'mobile-chromium';
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const homeSceneId = (await (
			await page.waitForFunction(
				() => {
					const rt = window.__rt!;
					const id = rt.state.commandCenter.homeSceneId;
					return id && (rt.state.scenes.scenes[id]?.widgets.length ?? 0) > 0 ? id : null;
				},
				null,
				{ timeout: 10_000 },
			)
		).jsonValue()) as string;
		await installDesktopOnly(page);

		await page.getByRole('button', { name: 'Edit layout' }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		const gallery = page.getByTestId('add-widget-gallery');
		await expect(gallery).toBeVisible();
		// Phone: a modal DS Sheet. Desktop: a side panel that leaves the board in view.
		await expect(page.getByRole('dialog', { name: 'Add widget' })).toHaveCount(phone ? 1 : 0);
		// The home board already has tiles, so there is no "start from a template" header.
		await expect(gallery.getByTestId('gallery-start-header')).toHaveCount(0);

		// A keyboard-focused row shows its focus ring (WCAG 2.4.7). RC-CAN-8.5: the row no longer
		// clips, and its miniature is drawn beside it (outside the row), so the ring may sit outside.
		const firstCard = gallery
			.locator('[data-testid^="gallery-card-"]')
			.filter({ has: page.locator('[data-testid^="gallery-entry-"]:not([aria-disabled="true"])') })
			.first();
		const firstEntry = firstCard.locator('[data-testid^="gallery-entry-"]');
		const cardShot = () => firstCard.screenshot({ animations: 'disabled' });
		const unfocused = await cardShot();
		await firstEntry.focus();
		await page.keyboard.press('Shift+Tab');
		await page.keyboard.press('Tab');
		await expect(firstEntry).toBeFocused();
		expect(await firstEntry.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
		const ring = await firstEntry.evaluate((el) => {
			const s = getComputedStyle(el);
			return {
				style: s.outlineStyle,
				reach: parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset),
			};
		});
		expect(ring.style).toBe('solid');
		expect(ring.reach).toBeGreaterThan(0);
		expect(unfocused.equals(await cardShot())).toBe(false);

		// Keyboard focus draws the row's miniature beside it, rendered by the widget render path.
		const live = page.getByTestId('gallery-preview');
		await expect(live).toHaveAttribute('data-preview', 'live');
		await expect
			.poll(() => live.evaluate((el) => el.textContent?.trim().length ?? 0))
			.toBeGreaterThan(0);
		await expect(live).toHaveAttribute('inert', '');
		await expect(live).toHaveAttribute('aria-hidden', 'true');
		await firstEntry.blur();
		await expect(live).toHaveCount(0);
		// The preview uses the declared template and populated sample rows, even before binding.
		await gallery.getByRole('searchbox').fill('initiative');
		const sample = gallery.getByTestId('gallery-entry-initiative-tracker');
		await sample.focus();
		await page.keyboard.press('Shift+Tab');
		await page.keyboard.press('Tab');
		await expect(live.locator('[data-testid="widget-template-status-list"]')).toBeVisible();
		await expect(live).toContainText('Scout');
		await gallery.getByRole('searchbox').fill('');

		// The desktop-only widget is listed, dimmed, with the core's reason, and cannot be added.
		const lanternCard = gallery.getByTestId(`gallery-card-${DESKTOP_ONLY_TYPE}`);
		const lantern = gallery.getByTestId(`gallery-entry-${DESKTOP_ONLY_TYPE}`);
		await expect(lanternCard).toContainText('Not available on the web profile.');
		await expect(lantern).toHaveAttribute('aria-disabled', 'true');
		const countBefore = (await layouts(page, homeSceneId)).length;
		await lantern.click({ force: true });
		await expect(gallery).toBeVisible();
		expect((await layouts(page, homeSceneId)).length).toBe(countBefore);

		// Search narrows the list; a miss says so.
		const search = gallery.getByRole('searchbox', { name: 'Search widgets' });
		await search.fill('no-such-widget-anywhere');
		await expect(gallery.getByText('No widgets match that search.')).toBeVisible();
		await expect(gallery.locator('[data-testid^="gallery-entry-"]')).toHaveCount(0);
		await search.fill('lantern');
		await expect(gallery.locator('[data-testid^="gallery-entry-"]')).toHaveCount(1);
		await search.fill('');

		// The category filter shows only that category's cards.
		const categories = gallery.getByRole('group', { name: 'Filter by category' });
		const chip = categories.getByRole('button').nth(1);
		const category = (await chip.textContent())!.trim();
		await chip.click();
		await expect(chip).toHaveAttribute('aria-pressed', 'true');
		const shown = await gallery
			.locator('[data-testid^="gallery-entry-"]')
			.evaluateAll((els) => els.map((el) => el.getAttribute('data-category')));
		expect(shown.length).toBeGreaterThan(0);
		expect(new Set(shown)).toEqual(new Set([category]));
		await categories.getByRole('button', { name: 'All', exact: true }).click();

		// Picking a card places it in an open spot on the board's columns and focuses the new tile.
		const placed = await placeFirst(page, homeSceneId);
		await expect(gallery).toHaveCount(0);
		await expect(page.getByTestId(`widget-${placed.id}`)).toBeFocused();
		const others = (await layouts(page, homeSceneId)).filter((w) => w.id !== placed.id);
		for (const other of others) expect(overlaps(placed, other), other.id).toBe(false);
		await expect(page.getByTestId('board-layout-banner')).toHaveCount(0);
	});

	test('the scene editor gallery offers a template header on an empty scene, plus generate and build entries', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		const sceneName = `Gallery Scene ${Date.now()}`;
		const created = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: sceneName, description: '', visibility: 'dm-only', tags: [] },
		});
		expect(created.status).toBe('accepted');
		const sceneId = (await page.evaluate(
			(name) =>
				Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === name)?.id ?? null,
			sceneName,
		))!;
		expect(sceneId).toBeTruthy();

		await gotoRoute(page, `/scene/${sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		const addToggle = page.getByRole('button', { name: 'Add', exact: true });
		await addToggle.click();
		const gallery = page.getByTestId('add-widget-gallery');
		await expect(gallery).toBeVisible();
		await expect(gallery.getByTestId('gallery-start-header')).toContainText(
			'Start from a template',
		);
		await expect(gallery.getByRole('button', { name: 'Generate with assistant' })).toBeVisible();
		await expect(gallery.getByRole('button', { name: 'Build your own' })).toBeVisible();

		// The open gallery passes axe. The miniatures are `inert` + `aria-hidden` previews of other
		// widgets' bodies, which their own specs cover, so they are excluded here.
		const results = await new AxeBuilder({ page })
			.include('[data-testid="add-widget-gallery"]')
			.exclude('[data-preview]')
			.analyze();
		expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

		const first = await placeFirst(page, sceneId);
		expect({ x: first.x, y: first.y }).toEqual({ x: 24, y: 24 });
		await expect(gallery).toHaveCount(0);
		await expect(page.getByTestId(`widget-${first.id}`)).toBeFocused();

		// The scene is no longer empty, so the header is gone; the second tile clears the first.
		await addToggle.click();
		await expect(gallery).toBeVisible();
		await expect(gallery.getByTestId('gallery-start-header')).toHaveCount(0);
		const second = await placeFirst(page, sceneId);
		expect(overlaps(first, second)).toBe(false);
		await expect(page.getByTestId(`widget-${second.id}`)).toBeFocused();

		// Generation opens the assistant dialog without installing anything.
		await addToggle.click();
		await gallery.getByRole('button', { name: 'Generate with assistant' }).click();
		await expect(gallery).toHaveCount(0);
		const generator = page.getByRole('dialog');
		await expect(generator).toBeVisible();
		await generator.getByRole('button', { name: 'Close', exact: true }).first().click();
		expect((await layouts(page, sceneId)).length).toBe(2);

		// "Build your own" closes the gallery and opens the widget builder on a blank widget.
		await addToggle.click();
		await gallery.getByRole('button', { name: 'Build your own' }).click();
		await expect(gallery).toHaveCount(0);
		await expect(page.getByRole('dialog', { name: /Widget builder/ })).toBeVisible();
	});

	test('a flow scene appends gallery picks to the end of its reading order and focuses them', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const sceneName = `Gallery Flow ${Date.now()}`;
		const created = await dispatch(page, {
			type: 'scene.create',
			actorId,
			payload: { name: sceneName, description: '', visibility: 'dm-only', tags: [] },
		});
		expect(created.status).toBe('accepted');
		const sceneId = (await page.evaluate(
			(name) =>
				Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === name)?.id ?? null,
			sceneName,
		))!;
		expect(sceneId).toBeTruthy();
		// The same command the editor's layout picker dispatches.
		const policy = await dispatch(page, {
			type: 'scene.set-layout-policy',
			actorId,
			payload: { sceneId, layoutPolicy: 'flow' },
		});
		expect(policy.status, JSON.stringify(policy.rejection)).toBe('accepted');

		await gotoRoute(page, `/scene/${sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		const addToggle = page.getByRole('button', { name: 'Add', exact: true });
		const gallery = page.getByTestId('add-widget-gallery');
		await addToggle.click();
		await expect(gallery.getByTestId('scene-add-widget-panel')).toBeVisible();
		const first = await placeFirst(page, sceneId);
		expect({ x: first.x, y: first.y }).toEqual({ x: 0, y: 0 });
		await expect(page.getByTestId('scene-board-flow')).toBeVisible();
		await expect(page.getByTestId(`widget-${first.id}`)).toBeFocused();

		// The second pick lands one flow row below the first: last in reading, DOM and focus order.
		await addToggle.click();
		const second = await placeFirst(page, sceneId);
		expect({ x: second.x, y: second.y }).toEqual({ x: 0, y: 240 });
		await expect(page.getByTestId(`widget-${second.id}`)).toBeFocused();
		const order = await page
			.getByTestId('scene-board-flow')
			.locator('[data-testid^="widget-"][role="group"]')
			.evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-testid')));
		expect(order).toEqual([`widget-${first.id}`, `widget-${second.id}`]);
	});
});
```

### Tile size bounds (RC-CAN-8.2)

Authorship controls content editing, not layout sizing. `isWidgetResizable` uses
an explicit `resizePolicy: 'fixed'` or equal minimum and maximum dimensions; every
seeded tile can be resized. Fixed-size affordances name the widget that declares
that restriction.

`BUILTIN_SIZE_BOUNDS` beside `WidgetBody` declares `minSize` and `maxSize` for each
builtin. The default range is one 20px grid cell to the board: width is capped at
the bounded board's right edge, while its height and the free canvas can grow
(`Infinity` means no additional body-specific ceiling). Finite maxima can constrain
either axis. These host bounds are merged into `BoardWidget`, never written into
core definitions or seeded layouts, so opening the editor does not alter saved
sizes or builder export bytes.

Pointer drags, Shift+Arrow, handle arrow keys, handle preset cycling and inspector
controls use `fitWidgetSize`. S is the minimum, M the definition default and L 150%
of that default, fitted to the declared limits. The corner handle appears on
selection or hover in edit mode; the tile menu's Resize enters keyboard move mode,
where Shift+Arrow resizes. View-mode content recovery remains available separately.
