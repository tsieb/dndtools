# Onboarding + user support review — loop/rc `7fab0ebd`, 2026-09-29

Reviewed on the dev server at http://localhost:5299 (worktree `~/Programming/dndtools-ux-review`).
Screenshots and text dumps: `scratchpad/shots/onboarding/` (prefixes `desktop-`, `phone-`,
`keyboard-`, `empty-`, `support-`, `phone-support-`, `help-geometry-`, `demo-`).

## 1. Verdict

A new GM meets a seven-step wizard before seeing anything. It opens over a vault that is already
full of someone else's campaign ("Your campaign": 2 scenes, 3 PCs, 2 NPCs, 3 maps, 9 notes), asks
them to decide who can read their world with no default and a typed acknowledgement, asks how much
they want on screen with three cards that list the same four features and pre-select the card that
is not the recommended one, asks about AI tools, asks for player names that nothing ever reads, and
ends on a "checklist" where four of five rows are struck through because the sample vault did them.
Finishing takes 8 clicks or 37 keystrokes, lands on the Command Center with focus dropped to the
document, and the only follow-up is a toast. The GM's campaign has no name and never will unless
they find "Rename vault" in the switcher. If they start fresh, the one primary action on the empty
Command Center ("Create your first scene") opens the Screens library, which already lists one
screen and is dominated by a scene-card form. When they look for help on desktop, the Help dialog
renders as a 26-pixel strip inside the top bar and cannot be used. RC-UX-3.6 fixes the step count
and the privacy default; it does not fix the name, the tier promise, the first action, the help
surfaces, or the import path, and as written it still puts "optional AI" and "party names" in the
flow. The stories below replace it.

Click and key budget measured today: finish onboarding = 8 clicks (37 keys); reach an empty
Command Center = 9 clicks + a full reload; first character from there = 1 click (New character
launcher); find help on desktop = 1 click, then nothing readable (ONB-1).

## 2. Findings

- **ONB-1 · critical · Help is unusable on desktop.** `help-geometry-desktop.png`,
  `support-help-dialog.png`: the Help dialog measures 540×26 at (582,24), inside the top bar; its
  header is 33px and body 40px, scrollHeight 73. Cause: `HelpLauncher`
  (`apps/gm-react/src/app/help/HelpMenu.tsx:72-90`) renders `<HelpMenu>` inside
  `apps/gm-react/src/app/shell/TopBar.tsx:9`, so the DS `Dialog`'s `position: fixed` scrim
  (`src/ds/components/overlay/Dialog.tsx:223-260`) is trapped by a transformed/contained top-bar
  ancestor and the flex column collapses. The phone trigger (`Footer.tsx:60-75`) works (342×638).
  Impact: on desktop, Getting started, the eight guides, What's new and the shortcuts entry are
  all unreachable. Fix: render the Help dialog from the shell root (or portal every DS Dialog to
  `document.body`, which also covers the "Host a live table" sheet collapse from the 2026-09-12
  audit); add a Dialog test that mounts inside a `transform: translateZ(0)` ancestor and asserts the
  panel is viewport-sized.
- **ONB-2 · critical · Seven steps, one of them forced and undefaulted.** `desktop-step2-*.png`,
  `phone-step2-privacy-private.png`. Skip on step 1 refuses and jumps to step 3 with a toast
  (`Onboarding.tsx:136-158`); Continue on the privacy step is `aria-disabled` with the reason in a
  hover-only `title` (`Onboarding.tsx:468-480`); the typed-ack field sits below the fold on both
  widths (panel fixed at 560px). Impact: the first two minutes are a consent form. RC-UX-3.6 already
  moves this to three steps with Cloud-Enhanced as the Beginner/Standard default (ADR-042); keep
  that, and see the rewrite in §3.
- **ONB-3 · high · The experience step lies three ways.** `desktop-step3-experience.png`: (a)
  Beginner is pre-selected because `DEFAULT_FEATURE_TIER = 'core'`
  (`packages/core/src/state/onboarding.ts:1885`) while the Standard card carries "Recommended"
  (`shared.ts:33-52`); (b) all three cards list "Command Center · Scenes · Maps · Navigation"
  because `ExperienceStep.tsx:48` takes `visibleFeatures(tier).slice(0, 4)` and the first four gates
  are core on every tier; (c) the Beginner blurb promises "advanced panels hidden until you ask",
  but the tier is read by nothing outside Settings tab gating and telemetry (grep: `readTier()` in
  `HelpMenu.tsx:116`, `useAnalytics.ts:52`; no primary surface consults it). The same panel is
  duplicated in Settings › Appearance (`settings-experience.png`) with the identical defect. The
  "Recommended" badge wraps to "Recom / mended" at desktop. Fix: Standard selected by default; each
  card lists what it hides, derived from `SECTION_FEATURE_GATES` (RC-UX-5.1 data); the tier
  actually removes advanced launchers from the primary surfaces (§3, RC-UX-6.5).
- **ONB-4 · high · The campaign has no name.** After finishing, the sidebar chip, the hero and the
  switcher all read "Your campaign" (`home.yourCampaign` fallback at `CommandCenter.tsx:402`; vault
  name "Your campaign" from `localVaults`). Nothing in onboarding asks for one; core has no
  campaign identity (`command-center-state.ts:61-71` holds only `homeSceneId`, presets, autoSave).
  RC-UX-3.6 promises "your table (campaign name, game system…)" with no field to write to. Fix:
  RC-UX-6.3.
- **ONB-5 · high · The party step collects data nothing reads.** `desktop-step5-party-added.png`:
  names or emails are written to `PREFERENCE_KEYS.partyNotes` (`Onboarding.tsx:151,213`) and read
  back only by Onboarding itself and `localVaults.test.ts`. Settings › Players on a fresh vault
  lists one actor, "Default DM — This is you — click the pencil to set your name"
  (`empty-settings-players.txt`); the sample vault ships "Demo Observer", "Demo Player 1–3".
  Impact: the GM believes the party is "kept track of"; it is not. Fix: drop the step; RC-UX-6.3
  creates real player actors from the first-session guide instead.
- **ONB-6 · high · The Ready step is not a first action.** `desktop-step6-Yourereadytorun.png`:
  rows are completion shortcuts (`ReadyStep.tsx:56-70`) styled as a checklist with strikethrough on
  done rows; on the sample vault 4 of 5 are struck; the open one is "Start a session from Session";
  tour cards are static text (`Onboarding.tsx:263-278`); after "Enter Command Center" focus lands
  on `<body>` (`keyboard-notes.json`) and the only confirmation is the toast "Setup complete —
  welcome to the table". Nothing on the Command Center says what to do first. Fix: RC-UX-6.4.
- **ONB-7 · high · The empty vault's first action leads into vocabulary drift.**
  `empty-home.png` → "Create your first scene" → `/screens` (`empty-screens.png`,
  `empty-after-first-scene.png`): the library already lists "DM screen · DM only · Canvas · 7
  widgets", the sidebar still says "SCENES · No scenes yet", and the page's lower half is the Scene
  cards atmosphere form with a 60-entry audio preset select. `CommandCenter.tsx:484-495` and
  `home.createFirstScene`. Impact: the first click contradicts the sidebar and lands on a form the
  GM did not ask for. CAN-7.4 (sidebar Screens group) and CAN-7.9 (retire bespoke CC) are open but
  neither owns this copy or the hub's empty state. Fix: RC-UX-6.4 (the guide replaces this card) and
  a copy fix in the same story: the launcher creates a screen from a template and says so.
- **ONB-8 · high · Help › Getting started reports nonsense progress.** `support-help-dialog.txt`,
  `empty-help.txt`, `phone-support-help-dialog.png`: "1 of 2 set up" on both the sample and the
  empty vault; "Set up your Command Center" is never done (it is `homeSceneId !== null`, which the
  ensure-home path does not set here), and "Create your first Scene" is done on an EMPTY vault
  because the seeded DM screen counts (`packages/core/src/state/onboarding.ts:2181-2192`). The
  `getting-started` builtin widget (`app/widgets/builtin/GettingStartedBody.tsx`) reads the same
  two steps. Fix: RC-UX-6.4 replaces `resolveOnboarding`'s steps with a real first-session list.
- **ONB-9 · medium · What's new is the raw changelog.** `support-help-dialog.txt`: "Fixed the
  Android build: a shared-file reader caught `IOException | SecurityException`…" — `changelog.ts`
  parses `CHANGELOG.md` verbatim, backticks included. Fix: RC-UX-6.7 (a user-facing section marker
  and a renderer that strips code spans, or curated release notes).
- **ONB-10 · medium · The Help trigger is an info icon with a red dot.** Desktop: top-bar
  `IconButton icon="info"` (`HelpMenu.tsx:77-80`); phone: the same icon above the tab bar
  (`home-phone.png`, bottom right). "i" reads as About; the dot reads as an alert. The Ready tour
  and the getting-started guide tell users to "open Help", which has no visible word "Help". Fix:
  RC-UX-6.7 (labelled trigger where the top-bar charter allows it; otherwise a sidebar/footer row
  with the word Help on desktop, matching the phone row).
- **ONB-11 · medium · Import paths for a migrating GM are a scavenger hunt.** Onboarding says
  "Import files from Settings → Vault connections" (`onboarding.vault.importHint`); that panel
  (`settings-vault.png`) says "Connect a Markdown folder in Knowledge → Sources"; character JSON
  import lives on `/characters` (`empty-characters.txt`), map import in the Atlas editor
  (`app/map/ImportMapDialog.tsx`), audio in `/audio`, vault backup in Settings › Backup & history,
  the markdown ZIP in Settings › Vault connections. No surface lists them together and the Command
  Center has no import launcher. Fix: RC-UX-6.6.
- **ONB-12 · medium · The vault switcher does not introduce itself.** `switcher.png`: "Local
  vaults" opens with the current vault, an empty "Vault name" field with a disabled "Create vault",
  and "Explore the demo campaign" as a secondary button under the create form; the only way to
  find the demo after RC-UX-3.6 removes the sample step is to click the campaign chip. Inside the
  demo (`demo-switcher.png`) "Back to my campaign" and "Reset the demo" work. Fix: RC-UX-6.9.
- **ONB-13 · medium · AI tools are an onboarding step.** `desktop-step4-*.png`: a full step for a
  preference that defaults to None; copy says "You can change this later only from Settings"
  (it is Settings › Tool preferences, `support-settings-tools.txt`). RC-UX-3.6 keeps "optional AI"
  on step 2. Recommendation: remove it from onboarding for every tier; Tool preferences stays.
- **ONB-14 · medium · Voice and type rules broken in the flow.** Display face (Cinzel) at 14px on
  every choice card (`ExperienceStep.tsx:81`, `ChoiceCard.tsx`; RC-ENG-8.4 rule); em dashes in
  `onboarding.players.empty`, the completion toast, `onboarding.welcome.anySystem`; headline
  sentences with full stops ("Run a better table.", "You're ready to run.", "Bring your party.");
  "Start a session from Session". `en.ts:407-505`. Fix: inside the RC-UX-3.6 rewrite (copy is
  rewritten anyway); POL-1.18 covers the rest.
- **ONB-15 · medium · Session on an empty vault shows "2 recent changes to review".**
  `empty-session.txt` (Prep & recap · Carry into the session). I could not open the list (the text
  is not a control). Out of this review's scope (Session lane); noted for the Session reviewer.
- **ONB-16 · low · Spotlights teach nothing on the primary path.** Three spotlights exist
  (`onboarding.ts:2065-2071`: graph at 3 links, command palette, shortcuts; the last two need a
  keyboard). None covers screens, Standby vs live, projecting a map, preview as player, or the vault
  switcher. Fix: RC-UX-6.8.
- **ONB-17 · low · Keyboard-only copy on phones.** The Ready tour card says "Press ⌘K to go
  anywhere" on a phone (`phone-step6-*.png`); the phone palette is the top-bar search icon. Fix:
  inside the RC-UX-3.6 rewrite (the tour cards go away) and RC-UX-6.7 for the guides.
- **ONB-18 · low · Shortcuts overlay has a wrong row.** `support-shortcuts.txt`: "Space — Move
  between canvas widgets; move the selected widget while editing" duplicates the arrow-key row.
  `app/shortcuts/registry.ts`. Fix: RC-UX-6.7.

What works and should be kept: keyboard traversal of the wizard is complete (arrow keys move the
radio groups, Tab reaches every control, Escape inside a field leaves the field); the phone layout
of the wizard is clean; the demo vault opens, resets and returns without touching the GM vault;
the guides in `docs/user/*.md` are short and honest; the command palette on desktop is the best
navigation in the app.

## 3. Proposed stories — epic UX-6 "First run to first session"

Place after epic UX-5 in §16. All P3 except 6.1 (a defect on a primary path, P2 under §0.3 rule
12). Every story owns its own tests and the message catalogs through the manifest's companion
paths, so they are not repeated in `Owns:`.

- **RC-UX-6.1 — Help opens on desktop.** `S` · P2 · Owns:
  `apps/gm-react/src/app/help/HelpMenu.tsx`, `apps/gm-react/src/app/shell/TopBar.tsx`,
  `apps/gm-react/src/ds/components/overlay/Dialog.tsx`. Current state: the desktop Help trigger
  renders its Dialog inside the top bar, and the fixed scrim is trapped by a transformed ancestor,
  so the dialog measures 540×26 and nothing in it can be read (ONB-1). Move the Help dialog to the
  shell root (one `HelpMenu` instance, both triggers open it), and make the DS Dialog portal its
  scrim to `document.body` so no future launcher can repeat this. Acceptance: an e2e on both
  profiles opens Help from every trigger and asserts the dialog's bounding box is at least 320px
  tall with Getting started, the guides and What's new visible; a Dialog unit test mounts the
  component inside a `transform: translateZ(0)` ancestor and asserts the panel is viewport-sized;
  the `help-menu.spec.ts` suite stays green; axe clean on the open dialog on both profiles.
- **RC-UX-6.2 — Onboarding v3 (replaces RC-UX-3.6).** See the replacement text at the end of this
  section. Keep the id RC-UX-3.6 in the roadmap and store (edit in place with `sync-tasks.py`); it
  is listed here so the epic reads as one plan.
- **RC-UX-6.3 — The campaign has a name and a party.** `M` · P3 · Deps: UX-3.6, CAN-7.6 · Owns:
  `packages/core/src/state/command-center-state.ts`, `packages/core/src/commands/command-center.ts`,
  `apps/gm-react/src/platform/storage/localVaults.ts`, `apps/gm-react/src/app/shell/VaultSwitcher.tsx`,
  `apps/gm-react/src/app/shell/Sidebar.tsx`, `apps/gm-react/src/screens/settings/Players.tsx`,
  `docs/architecture/DATA_MODEL.md`. Current state: no campaign identity exists in core; every
  surface falls back to "Your campaign"; onboarding's party names are written to a device
  preference nothing reads; Settings › Players seeds "Default DM". Add an additive `campaign` block
  (name, system package id, GM display name) to the command-center slice with a
  `campaign.set-identity` command and a byte-identical round trip when absent (no schema bump);
  the vault name in the local-vault catalog follows the campaign name on rename; the hero, sidebar
  chip, switcher row, session archives, invite screens and the demo badge read one name. Party
  names entered in onboarding v3 or the first-session guide create player actors through the
  existing permission commands, so Settings › Players, the player view switcher and the hero
  avatars show them. The `partyNotes` preference is migrated once into actors and removed.
  Acceptance: reducer, schema and round-trip tests; e2e: name the campaign in onboarding, see it
  in the sidebar, hero and switcher, rename it from the switcher and see every surface follow;
  two party names become two player actors with no email stored; a pre-story vault opens with
  "Your campaign" only as a placeholder input, never as a stored name.
- **RC-UX-6.4 — The first-session guide.** `L` · P3 · Deps: UX-3.6, 6.3, CAN-7.6, WID-5.3 · Owns:
  `packages/core/src/state/onboarding.ts`, `apps/gm-react/src/app/widgets/builtin/GettingStartedBody.tsx`,
  `apps/gm-react/src/app/help/HelpMenu.tsx`, `apps/gm-react/src/screens/CommandCenter.tsx`,
  `apps/gm-react/src/runtime/demo-seed.ts`, `docs/user/getting-started.md`. Current state:
  `resolveOnboarding` has two steps that are wrong in every vault state (ONB-8); the Ready step's
  rows and the empty Command Center's "Create your first scene" are the only "what next" and both
  mislead (ONB-6, ONB-7). Replace the steps with a first-session list derived from real state and
  ordered for a first evening: name the campaign; add the party (or import characters); add a map
  or a note; build a screen from a template; run a session in Standby (roll, add a combatant);
  invite players or open the player view. Each row states why it matters in one sentence, deep-links
  to the existing creation flow through a WID-5.1 intent, and completes from state, never from a
  click. The list is the `getting-started` hub widget on the default Command Center for a fresh
  vault (bare presentation, first in reading order, dismissible and restorable from Help), the
  Getting started section of Help, and the last onboarding step's destination. Complete lists
  collapse to one line. Remove `home.noScenes`/`home.createFirstScene`; the scenes card empty state
  says "No screens yet · New screen from a template". Acceptance: unit tests for every row's
  done-condition on empty, partial and demo vaults; e2e on both profiles: a fresh vault shows six
  open rows, completing each through its link ticks it, dismiss hides the widget and Help restores
  it; the ENG-8.1 first-run journey asserts the guide is present and the health detector is clean;
  focus lands on the guide's first row after onboarding closes; the WID-5.5 parity test passes for
  the widget.
- **RC-UX-6.5 — Honest experience tiers.** `M` · P3 · Deps: UX-5.2, UX-3.6 · Owns:
  `packages/core/src/state/onboarding.ts`, `apps/gm-react/src/app/onboarding/steps/ExperienceStep.tsx`,
  `apps/gm-react/src/screens/settings/Experience.tsx`, `apps/gm-react/src/screens/settings/shared.tsx`,
  `apps/gm-react/src/app/shell/sections.ts`, `apps/gm-react/src/app/shell/MoreSheet.tsx`,
  `docs/reference/FEATURE_COMPLEXITY.md`. Current state: ONB-3. Make `intermediate` the default
  tier in core and in every reader; derive each tier card's list from `SECTION_FEATURE_GATES` as
  "what this tier hides" (Beginner: permissions, plugins, systems, AI, diagnostics, the widget
  builder's advanced steps; Standard: the advanced Settings sections; Expert: nothing), so the
  three cards never read the same; apply the tier to the primary surfaces: the More group and the
  phone More sheet hide Extensions and Community below their gate, the Command Center's Manage
  list and Create launchers hide Permissions and New widget below theirs (through the
  complexity-map data, not new booleans), with the honest gate page and "Show advanced settings"
  from RC-UX-5.2 as the deep-link fallback. The "Recommended" badge never wraps (badge above the
  title at narrow widths). Acceptance: a test asserts the three reveal lists are pairwise
  different and every entry names a real section id; e2e: a Beginner sees no New widget launcher,
  no Extensions entry and no Permissions row, switches to Expert in Settings and sees all three
  without a reload; the store's `DEFAULT_FEATURE_TIER` change has a migration note and the
  `onboarding-consent` and `settings` specs pass.
- **RC-UX-6.6 — Bring your existing material.** `M` · P3 · Deps: UX-3.6, KNW-5.1, 6.4 · Owns:
  `apps/gm-react/src/app/importHub/index.tsx` (new), `apps/gm-react/src/screens/settings/Vault.tsx`,
  `apps/gm-react/src/screens/knowledge/ImportPanel.tsx`, `apps/gm-react/src/screens/characters/RosterActions.tsx`,
  `apps/gm-react/src/app/map/ImportMapDialog.tsx`, `docs/user/getting-started.md`. Current state:
  ONB-11. One import hub, opened from the first-session guide, the Help menu, the command palette
  ("Import…") and Settings › Vault connections, lists every importer with what it accepts and what
  it does to existing items: a markdown folder or ZIP (notes, calendars, images), character JSON
  including D&D Beyond exports, map images and map JSON, audio files, a vault backup, and the
  system-package import; each row routes to the existing flow with its file picker already open.
  The pointer chain is fixed: onboarding, Settings › Vault connections and Knowledge › Sources all
  name the hub, and the "Connect a Markdown folder in Knowledge → Sources" cross-reference goes
  away. Nothing new is parsed in this story. Acceptance: e2e on both profiles opens the hub from
  each entry, starts each importer, and lands in the same dialog the existing specs use; a test
  asserts every importer registered in the app appears in the hub (fails when one is added
  without a row); the guide is updated in the same change.
- **RC-UX-6.7 — Help a lost GM can find and read.** `M` · P3 · Deps: 6.1, POL-1.22 · Owns:
  `apps/gm-react/src/app/help/HelpMenu.tsx`, `apps/gm-react/src/app/help/changelog.ts`,
  `apps/gm-react/src/app/help/helpTopics.ts`, `apps/gm-react/src/app/help/ShortcutsDialog.tsx`,
  `apps/gm-react/src/app/shortcuts/registry.ts`, `apps/gm-react/src/app/shell/Footer.tsx`,
  `docs/user`, `docs/reference/TOPBAR_CHARTER.md`. Current state: ONB-9, ONB-10, ONB-17, ONB-18.
  The Help trigger carries the word Help on every tier (a labelled top-bar control if the charter
  admits one, otherwise a sidebar footer row beside Settings; the phone row already exists); the
  unseen badge is a "New" chip on the What's new row, not a red dot on the icon. Help opens on the
  guide for the current route (a route-to-guide map: screens, session, characters, maps, notes,
  settings) with the full list one level up. What's new reads a `## For players and GMs` block per
  release from `CHANGELOG.md` and never renders code spans or engineering nouns; releases without
  the block show "No notes for this release". Every guide has a phone variant of keyboard copy
  (no ⌘K on touch tiers). The shortcuts registry row for Space is corrected and a test asserts no
  two rows share a description. Acceptance: e2e on both profiles finds Help by its visible name,
  opens it from `/session` and lands on Running a session; a changelog test rejects a backtick in
  rendered output; `help-menu.spec.ts` and `shortcuts.spec.ts` green; axe clean.
- **RC-UX-6.8 — Spotlights for the primary path.** `S` · P3 · Deps: 6.4, CAN-7.8, SES-6.2 · Owns:
  `packages/core/src/state/onboarding.ts`, `apps/gm-react/src/app/help/Spotlight.tsx`. Current
  state: ONB-16. Add spotlights, each with a trigger from real state, a target control and one
  action: the screen switcher the first time a second screen exists; Standby versus Go live the
  first time Session opens; project a map the first time a map is opened in Session; preview as a
  player the first time a player actor exists; the vault switcher and the demo the first time the
  campaign chip is visible after onboarding. Keep the idle-moment rule, one per vault, never on a
  phone when the target is hidden. Acceptance: a unit test per trigger; `feature-spotlight.spec.ts`
  extended with one new spotlight showing once and never again; no spotlight targets a control
  the current tier hides (test against the complexity map).
- **RC-UX-6.9 — The vault switcher explains itself.** `S` · P3 · Deps: 6.3, CAN-7.4 · Owns:
  `apps/gm-react/src/app/shell/VaultSwitcher.tsx`, `apps/gm-react/src/platform/storage/localVaults.ts`,
  `docs/user/getting-started.md`. Current state: ONB-12. On a device with one vault the dialog
  leads with one sentence on what a vault is, lists "Explore the demo campaign" as the first row
  with its badge, and folds "Create vault" behind a "New campaign" action that asks for the name
  (RC-UX-6.3) and opens the new vault; from inside the demo, "Start my own campaign" creates and
  opens a fresh vault in one step. The sidebar chip and rail button show the "Demo" badge while the
  demo is open. Acceptance: e2e on both profiles: first visit shows the sentence and the demo row
  first; "New campaign" asks for a name and opens an empty vault carrying it; from the demo, "Start
  my own campaign" lands on the new vault's Command Center with the first-session guide open;
  `local-vaults.spec.ts` and `demo-vault.spec.ts` green.

### Replacement text for RC-UX-3.6

- **RC-UX-3.6 — Onboarding v3: three steps to a named campaign.** `M` · P2 · Deps: 5.2, 5.3 ·
  Owns: `apps/gm-react/src/app/Onboarding.tsx`, `apps/gm-react/src/app/onboarding`,
  `apps/gm-react/src/cloud/vaultMode.ts`, `apps/gm-react/src/platform/preferences.ts`. Rewritten
  2026-09-29 after the loop/rc `7fab0ebd` review (findings ONB-2 to ONB-6, ONB-13, ONB-14,
  ONB-17); supersedes the 2026-09-12 text. Today's seven steps (welcome, vault, privacy,
  experience, tools, party, ready) become three, none of them a consent form for a Beginner or
  Standard GM. Step 1, "Your campaign": the campaign name (required, prefilled with nothing, the
  placeholder is an example name), the game system (5e or Generic, from the system packages) and
  one sentence on what Lamplight is; no marketing checklist, no headline with a full stop. Step 2,
  "How much on screen": Beginner, Standard and Expert with Standard selected and recommended; each
  card lists what that tier hides, read from the complexity map, so no two cards read alike (see
  RC-UX-6.5 for the data); Expert adds the Private (E2EE) or Cloud-Enhanced choice with the
  existing typed acknowledgement, and the Continue button on that step names the reason it is
  waiting in visible text, not a title. Step 3, "Ready": one paragraph that names the campaign, the
  tier and the storage mode in plain words (the ADR-042 disclosure, with a link to Settings ›
  Backup & history), and one primary action, "Open the Command Center", which lands on the
  first-session guide (RC-UX-6.4) with focus on its first row. Beginner and Standard create a
  Cloud-Enhanced vault silently, Expert records the chosen mode. Gone from onboarding: the
  sample-or-fresh choice (fresh vaults start empty; the demo lives in the switcher, RC-UX-3.7), the
  AI tools choice (Settings › Tool preferences only), the party names (the guide creates actors,
  RC-UX-6.3), the tour cards and the completion toast. Skip is allowed from step 1 for every tier
  and records the defaults; Escape and the platform back gesture skip too; a skipped Expert may
  still be asked for the storage mode later from Settings, never as a modal. The wizard fits 560px
  without an inner scroll on desktop and the phone layout scrolls only the content region; no
  display face below 24px; copy in the voice (sentence case, verbs first, no em dashes, no
  exclamation marks). The campaign name and system are written through the RC-UX-6.3 command when
  it has landed, and through the local-vault catalog's name until then. Acceptance: e2e on both
  profiles counts three steps or fewer and reaches the Command Center within 60 seconds of
  scripted input, in at most 5 clicks or 12 keystrokes from a fresh profile; a Beginner run never
  renders E2EE copy; an Expert run still requires the acknowledgement and a mistyped phrase names
  the problem in visible text; the campaign name shows in the sidebar chip within the same run;
  focus after finishing is inside `#main-content`; `onboarding-consent.spec.ts` rewritten to the
  ADR-042 rules; `golden-path.spec.ts` first-run journey updated to the new steps and green; the
  seeded e2e fixture vault still loads through its test hook; axe clean on every step on both
  profiles.

Dependency shape: 6.1 now (no deps) · 3.6 (rewritten) → 6.3 → 6.4 (needs CAN-7.6 + WID-5.3 for the
hub widget) → 6.6, 6.8, 6.9 · 6.5 after UX-5.2 · 6.7 after 6.1 and POL-1.22. RC-POL-1.18 should
add `6.4` and the rewritten 3.6 to its `Deps:` so the polish pass runs over the new wizard, and
RC-ENG-8.3's `Deps:` should add 6.1, 6.4 and 6.5 (the early-access gate cannot pass with Help
unusable on desktop and no first action).

## 4. Not checked

- Toast/undo coverage per destructive action (13 undo-bearing toasts across 41 files by grep; not
  exercised per flow).
- Onboarding under the `qps-ploc` pseudo-locale and Spanish (copy length in the 560px panel).
- Electron/Android shells (the `app-fixed-viewport` rule at `styles/index.css:159` only applies
  under `data-electron`).
- The "2 recent changes to review" count on an empty vault's Session (ONB-15): the element is not a
  control, so I could not open it.
- Replay setup from Settings (the `REPLAY_EVENT` path) and a skipped-then-replayed Expert run.
- Playwright MCP is not usable here (no Chrome channel); all evidence comes from the repo's
  Playwright via ad-hoc scripts, now deleted (`probe.tmp.mjs` kept).
