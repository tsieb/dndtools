# Widget builder + widget construction — review findings (loop/rc 7fab0ebd, 2026-09-29)

Screenshots: `scratchpad/shots/widgets/` (step-_.png = every builder step at 1440 and 390 plus the phone
Preview/Definition panes; flowA-_ = party HP tracker; flowB-_ = action panel; flowC-_ = starter custom
widget; keyboard-\*, generate-dialog, configure-template-widget, visibility-submenu).
Method: repo Playwright against http://localhost:5299, real UI clicks, `window.__rt.state` read back;
axe on every builder step and on the board with the gallery open (0 critical/serious/moderate).

## 1. Verdict

A GM who wants a simple tile on their screen is handed a package-authoring IDE. Making the most basic
useful widget (a party HP list) and getting it onto the DM screen took **18 clicks across three
surfaces**: the builder installs the widget _disabled and unreviewed_ even though it is a no-code
template the GM just wrote with no permissions, the gallery then shows it greyed with "The Party HP
package is disabled." and no way to fix that in place, and the toast says "enable it in Installed
packages" without a link, while Installed packages lives under the collapsed "More" group as
Extensions. The eight-step stepper (Identity → Layout → Data → Config fields → Commands → Style →
Advanced → Review) asks for a package id, a widget type id, a semver version, supported devices,
canvas pixel sizes and a resize policy before it asks what the widget shows; the JSON definition pane
takes a third of the desktop screen on every step; on a phone the step rail alone fills the first
screen and the Next button sits two viewports below the form. Worst of all, the Commands step offers a
catalogue of verbs (Roll, Advance, Start, Tick…) that install cleanly, render as buttons, and then
fail at the table with "Command encounter-actions.roll has no reducer in this slice" — the core only
executes `timer.*` and `dice.roll`. The builder is architecturally sound (draft round-trips, the real
render path previews, axe is clean, keyboard reaches everything) but it is designed for a package
author, not for a GM at prep time, and it has one honest-failure hole that ships dead controls.

## 2. Findings

### Critical

- **WID-1 · Catalogue commands ship buttons that cannot run.** Evidence: flowB-04-view.png,
  flowB-05-after-roll.png; `apps/gm-react/src/app/widgetBuilder/CommandsStep.tsx:63-140` (the
  `CATALOG` mints `<typeId>.roll` etc.), `packages/core/src/commands/widget-command.ts:178-212` (only
  `timer.set-duration`, `TIMER_OPERATE_COMMANDS` and `dice.roll` have reducers; everything else is
  rejected "has no reducer in this slice"). Impact: a GM builds an action panel from the catalogue,
  installs, enables, places it, presses Roll in Standby and gets a red banner; the Review step said
  nothing. Fix: either give every catalogue verb a real reducer behind a declared target (roll → the
  session dice engine with the descriptor's `formula`; advance/tick/reset/set-value → a per-instance
  counter slice; show → player-visible scene message; write-note-line → the bound note), or remove
  from the catalogue every verb the core cannot execute for a template widget and make the Review
  step refuse to install a template widget whose declared command has no executor (fail closed,
  guardrail §0.3 rule 9).

- **WID-2 · A GM's own no-code widget installs disabled and unreviewed, then dead-ends.** Evidence:
  flowA-05-after-install.png (toast "Installed Party HP. It is disabled until you enable it in
  Installed packages."), flowA-06-gallery-card.png (card greyed, lock, "The Party HP package is
  disabled."), flowA-08-extensions-after-install.png; `packages/core/src/commands/widget-package.ts:240-263`
  (every install starts `unreviewed`, `enabled: false`), `apps/gm-react/src/screens/extensions/WidgetBuilder.tsx:184-203`
  (success closes the overlay with a toast, no follow-up), `apps/gm-react/src/app/canvas/AddWidgetGallery.tsx:467`
  (unavailable entries are listed with the reason but no action). Impact: 18 clicks and a trip to a
  route hidden under "More" for the first widget; a new GM reads "disabled" as "broken". Fix: the
  Review step already _is_ the trust review ("The same review Lamplight shows for any installed
  package"), so a template-runtime widget that asks for no host permissions and writes nothing
  player-visible should install **enabled and trusted-by-author** in the same command (recorded on
  the package with the reviewer = the DM actor, audited like a trust decision); a custom-code or
  permission-requesting widget keeps today's fail-closed path but the builder's Review step hosts the
  same review sheet inline so trusting happens there. When the builder was opened from the gallery,
  closing on success must select the new card (or place it directly, see WID-3). The gallery's
  disabled card gets an in-place "Enable" action for the DM.

### High

- **WID-3 · The builder never places the widget it built.** Evidence: flowA steps 9–16 (Install →
  reopen Add → find card → click); `apps/gm-react/src/screens/Board.tsx:640,687` and
  `screens/sceneEditor/index.tsx:399,453-460` pass only `onClose`; there is no `onInstalled`. Impact:
  "Build your own" is offered inside the Add gallery, yet after Install the GM is back on the board
  with nothing added and the gallery closed. Fix: the gallery-launched builder returns the installed
  definition; the board places it at `nextFreeSlot` and focuses the tile (the same path a card click
  takes), announced by the existing live region.

- **WID-4 · Package identity and platform questions come first.** Evidence: step-identity.png,
  step-layout.png; `apps/gm-react/src/app/widgetBuilder/draft.ts:52-61` (step order),
  `IdentityStep.tsx` (Package id, Widget type id, Version, Category, Icon, Supported devices, Where
  it appears, "List it in the Add widget library"), `LayoutStep.tsx` (Default/Minimum width and
  height "measured in canvas pixels", Resize policy, Dock preference). Impact: a GM must decode
  eight jargon terms (package id, widget type id, version, template kind, binding, data query,
  audience, capability) and answer six platform questions before choosing what the widget shows;
  every step is on the same footing, so "Advanced" and "Style" look mandatory. Fix: a two-track
  builder. **Quick** (default): What is it (name + pick from illustrated cards: list of party,
  counter/clock, table of things, note/message, buttons, stat block, chart, form), Show what (one
  picker per card with a live preview), Done (installs enabled, places). **Full** (a "More options"
  disclosure inside Quick and the entry from Extensions): today's eight steps, with Identity's ids,
  version, devices and category moved under an "Advanced identity" disclosure that defaults from
  the name (already the case for ids), Layout defaulted per template and shown as a size chip on the
  preview, and Style/Advanced collapsed unless the runtime is custom code.

- **WID-5 · Phone builder is a scroll maze with no sticky navigation.** Evidence:
  step-identity-phone.png, step-data-phone.png, step-review-phone.png; measured on the Identity step:
  Name field y=577, Next button y=1713 in an 844px viewport; Data step: Template kind y=577, Add data
  query y=1045. `WidgetBuilder.tsx:346-351` renders the full `BuilderStepRail` above every step in
  the single pane. Impact: on a phone every step starts with a screen of step names; the primary
  action is two screens down; the pane switch (Edit / Preview / Definition) hides the preview a GM
  needs to see while editing. Fix: on the phone tier collapse the rail to a one-line "Step 3 of 8 ·
  Data" disclosure (tap to open the list), make Back/Next/Install a sticky footer, and show a
  collapsed live preview strip under the header; the Definition pane becomes a "Copy definition"
  action in the header menu.

- **WID-6 · Preview says the wrong thing until a query exists, and the placed tile keeps saying
  it.** Evidence: step-identity.png..step-review.png (Status list chosen, preview reads "Untitled
  widget / Custom / This widget has no data source yet."), flowB-04-view.png (a placed action panel
  reads "This widget has no data source yet." above its buttons, permanently);
  `apps/gm-react/src/app/widgets/templates/shared.tsx:92`. Impact: the preview lies about the
  template ("Custom" is the default category, not the kind), and a template that needs no data
  (action panel, scene message) carries an error-sounding line on the live board. Fix: the preview
  renders each template with sample rows until a query exists, labelled "Sample data"; templates
  that read no query never show the no-data line; the tile eyebrow shows the template kind or the
  GM's category, never the literal default "Custom" (`draft.ts:167`).

- **WID-7 · Data step keeps a stale query id and cannot filter.** Evidence:
  flowA-03b-preview-with-query.png (Source "Characters you can see", Id still
  `current-combatants`), `apps/gm-react/src/app/widgetBuilder/DataStep.tsx:184-192` (source change
  rewrites label, not id); the placed "Party HP" lists NPCs (Mira the Ferryman, The Hollow King) with
  raw `dm-only`/`shared` chips (flowA-13-view-mode.png; rows built at
  `apps/gm-react/src/app/widgets/dataEnvironment.ts:160-175`). Impact: the definition is dishonest
  (an id naming the wrong source), a "party" tracker cannot exclude NPCs, and the chips use enum
  values instead of the voice ("DM only", "Shared"). Fix: re-derive the id from the source unless the
  author edited it; add per-source filters as declarative query options (character kind, tag, scene
  membership, status) exposed as plain pickers; render visibility chips through the same vocabulary
  the rest of the app uses.

### Medium

- **WID-8 · Escape discards a dirty draft silently; nothing is kept.** Evidence: keyboard run
  ("Escape with a dirty draft: builder still open=false, confirm dialog=false; reopened name value
  ''"); `WidgetBuilder.tsx:125-131`. Impact: one stray Escape, the Back gesture, or the browser back
  loses everything typed across eight steps. Fix: keep the draft in the device-preferences slice
  (UX-4.1) keyed by package id until installed or discarded; closing a dirty draft asks Keep draft /
  Discard; reopening offers "Resume Party HP (draft)".

- **WID-9 · The Definition JSON pane is a permanent third column.** Evidence: every step-\*.png
  (read-only textarea, "Select all"); it is in the Tab order at every step (keyboard run: tab 29).
  Impact: a third of the desktop screen and a tab stop on every step for something only a package
  author copying a bundle needs. Fix: move it behind a header "Definition" toggle (off by default,
  remembered), keep the export on the Extensions card.

- **WID-10 · Configure… for a template widget offers only "Dock preference", which the canvas
  ignores.** Evidence: configure-template-widget.png; `draft.ts:63-79` (the dock field is written into
  every built package as a config field), copy: "The scene canvas is free-form and leaves it alone."
  Impact: the one settings dialog a GM opens on their widget contains a single setting that does
  nothing here. Fix: hide dock preference on surfaces that do not dock; when a widget has no
  effective settings, the menu item reads "No settings" (disabled with reason) or is replaced by
  "Edit widget" (WID-12).

- **WID-11 · "Generate with assistant" is a peer of "Build your own" but dead-ends on a fresh
  vault.** Evidence: generate-dialog.png ("Add a provider API key in Settings, AI and tools, to
  generate a widget." with only Close); `AddWidgetGallery.tsx:644-676`. Impact: the first thing the
  gallery offers a new GM under "Make something new" is a dialog that sends them to Settings. Fix:
  when no provider is configured, the gallery card itself says so and links to the Settings tab
  (honest gate, as UX-5.2 does elsewhere); when a local model is available (AI-3) the card says
  "Generate (local)".

- **WID-12 · A placed widget cannot be edited from the canvas unless it is a single-widget
  user-authored package.** Evidence: flowC run (Torchlight from the starter library: Configure… only,
  no "Edit widget definition"; `Inspector.tsx:88-95` requires `authoring.source === 'user-authored'`;
  starters are `source: 'workspace'` (`packages/core/src/state/starter-widgets/shared.ts:43`)); the
  tile menu (flowA-12-tile-menu.png) is Move · Resize · Duplicate · Configure… · Visibility · Remove.
  Impact: "restyle a starter with the kit" means Extensions → New version → Advanced step; a GM
  looking at the tile has no path to "make it mine". Fix: every tile menu gains "Edit widget" which
  forks a non-user-authored package into the workspace (a fork through `widget.package.install`
  with `authoring.source: 'user-authored'`, `forkedFrom`) and opens the builder on the relevant
  step; the placed copy is re-pointed to the fork.

- **WID-13 · Trust review copy is written for a security reviewer.** Evidence: flowC-02-trust-sheet.png
  ("Requires review", "Runs its own code in a sandbox. It writes nothing your players see.",
  Deny package / Trust package); the Extensions card shows four badges (Unreviewed · Needs review ·
  Custom code · plus the trust-after-review line). Impact: a GM installing a bundled starter
  with no permissions is asked to "trust" a "package" twice (review, then the enable switch).
  Fix: for bundled starters with no permissions, Install enables directly and the card says
  "Bundled · no permissions"; the review sheet's primary reads "Allow and enable"; badges collapse
  to one status.

- **WID-14 · The Commands step's authority split leaks engine vocabulary.** Evidence:
  step-commands.png ("Operate — An operator at the table can fire this." / "Configure — Only a
  campaign manager can fire this."; "Add a blank command" with Type "words separated by dots",
  "Writes to", "Destination — what class of data this command reaches"). Impact: the GM has to learn
  operator/manager/destination class to add a button. Fix (with WID-1): the catalogue becomes "Add a
  button" cards named by outcome ("Roll dice", "Count up/down", "Show a message to players", "Add a
  line to the bound note"), each with its target picker; the blank-command editor moves under
  Advanced.

### Low

- **WID-15 · Icon picker radios are named by Lucide file name ("ArrowUp").** Evidence: keyboard run
  tabs 17–25 (button "ArrowUp", seven unlabeled spans in the focus log); `IdentityStep.tsx:143-171`
  (radio group, `aria-label={name}`). Fix: label each icon with its vocabulary meaning from
  `docs/reference/ICON_VOCABULARY.md`.
- **WID-16 · Gallery copy is a feature-local catalog.** `AddWidgetGallery.tsx:33-70` ships its own
  en/es strings outside `src/i18n/messages`; fr has none. Fix: move to the catalogs (UX-1.2 rule).
- **WID-17 · Console warning on every builder open.** "Function components cannot be given refs …
  DefinitionPane → Textarea" (`BuilderPanes.tsx`). Fix: forwardRef on DS `Textarea` or drop the ref.
- **WID-18 · The builder is a dark full-screen overlay over a cream workspace.** step-\*.png vs
  cc-new-widget.png. Not a defect against the DS (it uses `T.bg`), but it reads as a separate tool;
  the Quick track (WID-4) should render as a DS Sheet on the board's own surface.

Covered elsewhere, not restated: RC-WID-5.1 (intents — needed by WID-14's "open"/"create" buttons;
as written it is sufficient); RC-WID-5.2 (hub query sources — WID-7's filters should land as query
_options_ on top of it, not as new sources); RC-WID-5.3 (bare presentation — the Quick track's
"note/message" card should use it); RC-WID-5.5 (parity gate — unchanged; the Quick track writes the
same definitions). RC-CAN-5.5 covers the Prep tile clipping visible in cc-new-widget.png.

## 3. Proposed stories (epic WID-6 — "A widget in one minute")

All P3; sizes as marked. Every story keeps guardrail §0.3 rule 12: the Quick track writes ordinary
template definitions that round-trip through the Full builder byte-identically.

- **RC-WID-6.1 — Commands that cannot run are never installed.** `M` · P3 · Deps: WID-5.1 · Owns:
  `packages/core/src/commands/widget-command.ts`, `packages/core/src/commands/widget-package.ts`,
  `packages/core/src/state/widget-package-state.ts`, `packages/core/src/schemas/widget-package.ts`,
  `apps/gm-react/src/app/widgetBuilder/CommandsStep.tsx`, `apps/gm-react/src/app/widgetBuilder/validate.ts`,
  `apps/gm-react/src/app/widgets/templates/ActionPanel.tsx`, `docs/architecture/WIDGETS.md`. Current
  state: the Commands catalogue mints `<typeId>.<verb>` descriptors, the core executes only `timer.*`
  and `dice.roll`, so a builder-made action panel's buttons fail at the table with "has no reducer in
  this slice" (WID-1). What to build: a declared **executor** per catalogue verb in the core — roll
  (session dice engine with the descriptor's formula), advance/tick/reset/set-value (a per-instance
  `widget.counter` in scene widget state, undoable), show (a player-visible scene message), mark
  complete / write-note-line (the bound entity through its existing commands), start/pause/resume
  (the timer executor) — each recorded in the descriptor as `executor`, validated at install: a
  template widget that declares a command with no executor is rejected with the reason and the
  builder's validation shows it on the Commands step before Review. The action panel disables a button
  whose executor reports unavailable (no bound note, no formula) with the reason as its tooltip.
  Acceptance: core tests per executor and for the install rejection; e2e on both profiles builds an
  action panel with Roll and Advance, places it, presses both in Standby and sees a dice result and a
  counter change with no error banner; a widget declaring a blank command cannot pass Review.

- **RC-WID-6.2 — A GM's own template widget installs enabled and lands on the screen.** `M` · P3 ·
  Deps: 6.1 · Owns: `packages/core/src/commands/widget-package.ts`,
  `packages/core/src/queries/widget-package-review.ts`, `packages/core/src/state/widget-package-state.ts`,
  `apps/gm-react/src/screens/extensions/WidgetBuilder.tsx`, `apps/gm-react/src/screens/Board.tsx`,
  `apps/gm-react/src/screens/sceneEditor/index.tsx`, `apps/gm-react/src/app/canvas/AddWidgetGallery.tsx`,
  `apps/gm-react/src/app/canvas/FlowBoard.tsx`, `docs/architecture/WIDGETS.md`. Current state: every
  install is `unreviewed` + disabled; the builder closes with a toast; the gallery lists the new
  widget greyed with no action; 18 clicks to place (WID-2, WID-3). What to build: `widget.package.install`
  accepts an author-trust outcome for packages whose runtime is `template`, that request no host
  permissions and whose review verdict is "safe to trust after review" — recorded as
  `trust.state: 'trusted'` with `reviewedBy` = the installing DM and an audit entry; custom-code or
  permission-requesting packages keep the fail-closed path but the Review step embeds the trust sheet
  so allow-and-enable happens without leaving the builder. A builder opened from a gallery returns
  the installed definition to the caller, which places it at the first free slot (or the flow order
  end) and moves focus to the tile; the gallery's unavailable cards gain an in-place "Enable" for the
  DM and the toast links to the package. Acceptance: core tests for the author-trust rule and its
  refusal for custom code and for any permission; e2e on both profiles: Add → Build your own → name,
  template, source → Install places the tile on the board in ≤ 8 clicks with no visit to Extensions;
  a custom-code build still ends in the review sheet; the security review is linked in the journal.

- **RC-WID-6.3 — The Quick track: make a widget in three questions.** `L` · P3 · Deps: 6.2, WID-5.3 ·
  Owns: `apps/gm-react/src/app/widgetBuilder/QuickBuilder.tsx` (new),
  `apps/gm-react/src/app/widgetBuilder/quickRecipes.ts` (new),
  `apps/gm-react/src/app/widgetBuilder/draft.ts`, `apps/gm-react/src/app/widgetBuilder/BuilderPanes.tsx`,
  `apps/gm-react/src/screens/extensions/WidgetBuilder.tsx`, `apps/gm-react/src/app/canvas/AddWidgetGallery.tsx`,
  `apps/gm-react/src/screens/CommandCenter.tsx`. Current state: the only builder is the eight-step
  stepper that opens on Identity (WID-4). What to build: a DS Sheet on the board's own surface with
  three panels — **What is it** (illustrated recipe cards: Party list, Counter or clock, Table of
  things, Note for the table, Buttons, Stat block, Chart, Form; each recipe is a draft preset over one
  template kind), **Show what** (one plain picker per recipe: which characters, which note, which
  number and its range, which buttons from the WID-6.1 catalogue; a live preview with real vault
  data), **Done** (name defaulted from the recipe, "Players can see this" toggle mapped to query
  audience, Add to screen). "More options" opens the Full builder on the same draft at the matching
  step. Recipes are data, so every card round-trips: Quick → Full → export → import → export is
  byte-identical (WID-5.5's test extended). The Command Center's "New widget" and the gallery's
  "Build your own" open the Quick track; Extensions keeps the Full builder. Acceptance: e2e on both
  profiles makes a party HP list and a doom counter in ≤ 6 clicks each and uses them in Standby; a
  keyboard-only run completes a recipe; axe clean; the parity test proves each recipe is an ordinary
  template definition; `scene-first-render` unchanged.

- **RC-WID-6.4 — Full builder: progressive disclosure and a phone that can finish.** `M` · P3 ·
  Deps: 6.3 · Owns: `apps/gm-react/src/app/widgetBuilder/IdentityStep.tsx`,
  `apps/gm-react/src/app/widgetBuilder/LayoutStep.tsx`, `apps/gm-react/src/app/widgetBuilder/BuilderPanes.tsx`,
  `apps/gm-react/src/app/widgetBuilder/StyleStep.tsx`, `apps/gm-react/src/app/widgetBuilder/AdvancedStep.tsx`,
  `apps/gm-react/src/screens/extensions/WidgetBuilder.tsx`. Current state: ids, version, devices,
  category, canvas-pixel sizes and resize policy are asked up front; the JSON pane is a permanent
  third column and a tab stop; on a phone the rail fills the first screen and Next sits at y≈1700
  (WID-4, WID-5, WID-9, WID-15). What to build: Identity shows Name, Description and Icon; ids,
  version, category, devices and surfaces sit under an "Advanced identity" disclosure that keeps
  deriving from the name; Layout defaults per template and is shown as a size chip on the preview
  with "Change size"; Style and Advanced collapse to a summary line unless the runtime is custom
  code; the Definition pane becomes a header toggle remembered per device, off by default, with the
  same "Select all" copy action. Phone tier: the rail collapses to "Step n of 8 · Label" (tap to
  open), Back / Next / Install are a sticky footer, and a collapsed preview strip stays under the
  header. Icon radios are named by their vocabulary meaning. Acceptance: unit tests for the derived
  ids after the disclosure is closed; e2e on the mobile profile reaches Install from the Identity
  step with the Next button always inside the viewport and completes a build; desktop keyboard run
  reaches Next in ≤ 12 tabs from the Name field; axe clean on every step; visual snapshots per theme
  and tier.

- **RC-WID-6.5 — Honest previews and honest tiles.** `M` · P3 · Deps: WID-5.2 · Owns:
  `apps/gm-react/src/app/widgetBuilder/BuilderPreview.tsx`, `apps/gm-react/src/app/widgetBuilder/DataStep.tsx`,
  `apps/gm-react/src/app/widgets/templates/shared.tsx`, `apps/gm-react/src/app/widgets/templates/StatusList.tsx`,
  `apps/gm-react/src/app/widgets/dataEnvironment.ts`, `packages/core/src/schemas/widget-package.ts`,
  `packages/core/src/state/widget-package-state.ts`. Current state: the preview reads "Custom · This
  widget has no data source yet." whatever template is chosen until a query exists, the placed action
  panel keeps that line forever, a source change leaves the query id naming the old source, "Characters
  you can see" cannot exclude NPCs, and rows carry raw `dm-only`/`shared` chips (WID-6, WID-7). What to
  build: templates that read no query never render the no-data line; templates that do render sample
  rows labelled "Sample data" until a query exists; the tile eyebrow shows the template kind or the
  GM's category, never the literal default; the query id re-derives from the source until edited by
  hand; declarative query **options** (character kind, tag, scene membership, status, limit, sort)
  validated in the schema and resolved in the data environment through the same actor-scoped reads,
  exposed in the Data step as plain pickers and in the Quick track's "Show what"; visibility chips use
  the shared vocabulary (DM only · Shared · Player visible). Acceptance: schema and data-environment
  tests per option including the player-isolation case; a snapshot per template with no query; e2e:
  a party list filtered to PCs shows no NPC and the same widget previewed as player shows only
  player-visible rows.

- **RC-WID-6.6 — Drafts survive, and every tile can become yours.** `M` · P3 · Deps: 6.2, UX-4.1 ·
  Owns: `apps/gm-react/src/app/widgetBuilder/draft.ts`, `apps/gm-react/src/screens/extensions/WidgetBuilder.tsx`,
  `apps/gm-react/src/app/canvas/TileActionMenu.tsx`, `apps/gm-react/src/screens/sceneEditor/Inspector.tsx`,
  `packages/core/src/commands/widget-package.ts`, `packages/core/src/state/widget-package-state.ts`,
  `packages/core/src/commands/scene.ts`. Current state: Escape or Back discards a dirty draft with
  no prompt and nothing kept; "Edit widget definition" exists only for single-widget user-authored
  packages, so a starter or bundled widget cannot be edited from the tile (WID-8, WID-12). What to
  build: the builder keeps its draft in device preferences keyed by package id until installed or
  discarded, closing a dirty draft asks Keep / Discard, and reopening offers to resume; a new
  `widget.package.fork` command copies any installed package's single widget into a user-authored
  package (`authoring.forkedFrom`, trust re-evaluated by the WID-6.2 rule), and the tile menu gains
  "Edit widget" which forks when needed, re-points the placed copy to the fork through the existing
  layout command, and opens the builder on the Data step (Advanced for custom code). Acceptance:
  unit tests for draft persistence and the fork's trust outcome; e2e: Escape on a dirty draft then
  reopen resumes it; "Edit widget" on the Torchlight starter opens the builder, a code edit saves as
  a new user package, and the tile shows the change; `/security-review` linked for the fork path.

- **RC-WID-6.7 — Install and trust in the GM's words.** `S` · P3 · Deps: 6.2 · Owns:
  `apps/gm-react/src/screens/extensions/TrustReviewSheet.tsx`, `apps/gm-react/src/screens/extensions/Plugins.tsx`,
  `apps/gm-react/src/screens/extensions/PluginPackageCard.tsx`, `apps/gm-react/src/app/widgetBuilder/CommandsStep.tsx`,
  `apps/gm-react/src/app/canvas/AddWidgetGallery.tsx`, `apps/gm-react/src/app/widgetBuilder/GenerateDialog.tsx`.
  Current state: a bundled starter with no permissions asks to be reviewed, trusted and then enabled;
  cards carry four badges; the Commands step explains operator/manager/destination classes; the
  gallery's "Generate with assistant" opens a dialog that only says to visit Settings; the gallery's
  strings live outside the catalogs (WID-11, WID-13, WID-14, WID-16). What to build: bundled starters
  with no permissions install enabled ("Bundled · no permissions"); the review sheet's primary is
  "Allow and enable" and its verdict line is one sentence a GM understands; card badges collapse to
  one status; the Commands catalogue is named by outcome ("Roll dice", "Count up or down", "Show a
  message to players", "Add a line to the note") with the authority explained only on hover;
  "Generate with assistant" states the missing provider on the card with a link to the Settings tab
  and reads "Generate (local)" when a local model is ready; gallery copy moves into the message
  catalogs with ES and FR. Acceptance: copy reviewed against `docs/design-package/readme.md` in the
  journal; e2e: Install on Torchlight enables it in one click and places it; the Generate card's gate
  links to Settings › AI; the catalog test passes with no feature-local strings in the gallery.

- **RC-WID-6.8 — Widget settings that exist.** `S` · P3 · Deps: 6.5 · Owns:
  `apps/gm-react/src/app/widgetBuilder/draft.ts`, `apps/gm-react/src/app/widgetBuilder/ConfigStep.tsx`,
  `apps/gm-react/src/app/canvas/TileActionMenu.tsx`, `apps/gm-react/src/screens/sceneEditor/Inspector.tsx`.
  Current state: every built package carries a "Dock preference" config field the scene canvas
  ignores, so Configure… on a template widget shows one dead setting (WID-10). What to build: dock
  preference is written only when a docking surface is selected and hidden on surfaces that do not
  dock; recipes declare the settings a GM actually changes (title, range, colour, players-visible) as
  config fields; a widget with no effective settings shows "No settings" with the reason and offers
  "Edit widget" instead. Acceptance: draft test that a scene-only widget has no dock field; e2e: the
  Configure… dialog for a Quick-track counter shows its range and title and saving them changes the
  tile.

Sequencing: 6.1 → 6.2 → 6.3 is the spine (dead controls, then the install chain, then the Quick
track); 6.4/6.5/6.6/6.7/6.8 can run in parallel after 6.2 with the Owns above kept disjoint (6.4
owns the step files, 6.5 the preview/data files, 6.6 the draft and tile menu, 6.7 the Extensions
surface). RC-POL-1.14 is done, so none of these depends on it; all of them must land before
RC-ENG-8.3's early-access audit if "New widget" stays a Command Center launcher. Note the ownership
overlaps that must serialize: 6.2/6.6 both name `widget-package.ts` and `WidgetBuilder.tsx`; 6.3/6.4
both name `BuilderPanes.tsx` and `WidgetBuilder.tsx`; 6.6/6.8 both name `TileActionMenu.tsx`,
`Inspector.tsx` and `draft.ts` — the dispatcher's owns-overlap rule will run them one at a time,
which the spine order already implies.

## 4. Not checked

- The AI builder beyond its gate: no provider key on this machine, so the proposal → Review-step path
  (`widget-generate.spec.ts`) was not exercised by hand; the IterateDialog likewise.
- The bindings inspector against a required binding: the flows used queries, not bindings;
  `binding-inspector.spec.ts` covers the player-hidden cases and was not re-run.
- Tablet (834) rail layout of the builder: only 1440 and 390 were captured; `narrow` is true below
  desktop so the phone findings apply to the rail tier too but geometry was not measured.
- Multi-widget packages: "Edit widget definition" is hidden for them by design; not exercised.
- Live session (Go live) behaviour of the placed widgets: all three flows were used in Standby only.
