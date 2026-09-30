# Player views — findings (loop/rc `7fab0ebd`, 2026-09-29)

Evidence lives in `scratchpad/shots/player/`. Routes reviewed: `/play` (standalone companion, phone
390 light + dark, desktop 1440, solo and JOINED over the fake LAN transport), `/player` (the in-shell
"Player view"), `/characters/:id` (DM sheet, Sharing panel), the top-bar "Preview as another role"
menu and the scene-editor preview overlay, `/session` (Stage, Handouts, Table roster), `/display`,
`/join`, Settings › Players, and "Host a live table". Code read for every finding.

## 1. Verdict

**The player.** A player who opens the app on their phone sees a competent, quiet stage ("Now
playing · Waiting for your DM to start the session") with a party card, shared handouts and a
bottom bar of ten unlabeled icons. Two of the four first-minute jobs work: they can read a handout
and (once the DM has started the session) roll dice. The other two fail: the sheet is read-only
("Edits are made in your full character app" — an app the player's phone does not have), so they
cannot mark damage, a condition or a spent slot; and before joining, the sheet and party they see
belong to a seeded demo character ("Sera Duskwhisper", footer "Demo Player") that is not theirs.
The Party panel shows one member at a real table too, because PCs default to "shared with their
owner" rather than to the party. Dice stay locked until the DM presses Start session, although
the core has allowed rolling in Standby since RC-SES-6.1. Nothing DM-only leaks: the actor reads
hold, the scene preview overlay is honest, and the joined device receives a filtered snapshot.

**The GM.** Deciding what players see is five switches with no summary: character sharing (DM sheet
› Sharing: DM only / All players / Specific players), scene visibility (GM only / Shared), the
session's active scene (set at Start session, but NOT what players see), the Stage panel's
per-player scene views plus "Project to players" for the map, and handout push. After Start
session with a shared scene active, the joined player's stage still reads "Nothing is being shown
yet." (joined-3-stage.png) because no per-player view was assigned. No surface answers "what does
Demo Player see right now"; the preview tools answer only for scenes and screens, and "Preview as
Demo Player 2" then opening `/play` still shows Demo Player's character. The top bar spends two
eye icons on two different meanings (preview, start session) and a people icon on hosting.

## 2. Findings

Audit re-check (2026-09-12 items): **J1 three player views — still true** (`/play`, `/player`,
in-shell preview each render a different page; PLY-1/2/3). **E2 two character sheets — now three**
(`screens/play/Sheet.tsx` read-only summary, `screens/player/*` full sheet with rests and level-up,
`screens/characters/sheet/*` DM sheet; PLY-2). **D2 dice locked outside a live session — true on the
player side only** (PLY-4). **A1 eye = Go live without confirmation — half fixed**: ending confirms
(`ProjectionControl.tsx:47-53`), starting is one unlabeled click from every route but is now a
posture switch, not a teardown (PLY-11).

### PLY-1 · critical · A joined player cannot change anything on their own sheet

- Evidence: joined-4-my-character.png; `sheet controls: []` on the joined sheet (probe);
  `screens/play/Frame.tsx:113-190` and `Journal.tsx:300-306` are the only player writes (`dice.roll`,
  `combat.apply-resource` initiative, journal entries); copy `play.sheet.conditionsHelp`
  (`i18n/messages/en.ts:1259`): "Edits are made in your full character app."
- Impact: a player at the table must ask the DM to mark every hit, condition and spent slot, or keep
  paper.
- Fix: the companion sheet dispatches `character.update-combat-resource`, condition and spell-slot
  commands as command REQUESTS over the session (the host stamps identity, the core already
  authorises the owning player), with the same HP stepper `/player` has (`screens/player/Vitals.tsx`).

### PLY-2 · high · Three sheets, three feature sets, one character

- Evidence: play-phone-vp-my-character.png (abilities, HP, AC, slots, conditions; read-only),
  player-desktop.png (`/player`: Sheet/Resources/Party/Level up/Journal/History tabs, HP stepper,
  rests, print), gm-char-sheet.png (`/characters/:id`: Skills & saves, Attacks, Advancement with XP,
  Reference, Sharing). `screens/play/Sheet.tsx` 185 lines, `screens/player/*` 2,600 lines,
  `screens/characters/sheet/*`.
- Impact: what a player can do depends on which device and route they happen to hold; the GM's
  "Player view" (sidebar footer, `nav.ts:128-134`) is a fourth-wall sheet the GM has no character
  for; RC-POL-1.7 polishes the DM-side sheet but does not converge them.
- Fix: one sheet body (`screens/player/Sheet.tsx` + `Vitals.tsx` panels) rendered by all three
  routes with the actor's write authority deciding which controls appear; `/play`'s Sheet section
  hosts it; `/player` becomes the DM-shell alias of it.

### PLY-3 · high · Preview-as a specific player is not honoured on `/play`

- Evidence: gm-preview-player2-play.png — preview `{"role":"player","actorId":"actor-player-2"}` yet
  `/play` shows Sera Duskwhisper (Demo Player's PC) and footer "Demo Player";
  `screens/play/Frame.tsx:94-98` (`viewer = … runtime.preview?.role === 'co-dm' ? runtime.activeActorId : PLAYER_ACTOR_ID`). The Command Center in preview (gm-preview-player2-home.png)
  is a lone hero "Your live view of the table" inside the full DM sidebar, a page no player ever sees.
- Impact: the GM's only "trust me" tool lies about which player it shows and shows a chrome no
  player has.
- Fix: `/play` honours any active player/observer preview as the viewer (specific actor when
  `specific`), and "Preview as <player>" opens `/play` (or renders its frame in place) instead of the
  DM shell with a player actor.

### PLY-4 · high · Companion dice locked in Standby although the core allows it

- Evidence: play-phone-vp-dice.png "Rolling needs a live session — the dice unlock when your DM
  starts one."; `screens/play/Dice.tsx:71-119` disables on `!sessionActive`;
  `net/viewModels.ts:420` `sessionActive: state.session.workflow === 'active'`;
  `packages/core/src/commands/dice.ts:72` "Rolling works in every workflow state (RC-SES-6.1)".
- Impact: contradicts §1.6 D2 for players; a pre-session roll (initiative practice, downtime) is
  refused by the UI, never by the core.
- Fix: drop the UI gate; keep the honest note that only live rolls reach the session log
  (`play.dice.logFillsUp`), which the core already stamps per roll.

### PLY-5 · high · A not-yet-joined phone shows seeded demo data as if it were the player's

- Evidence: play-phone.png / joined-0-before-join.png (solo): "Sera Duskwhisper · You · 24/24",
  footer "Demo Player · Your own character"; `Frame.tsx:98` hard-codes `PLAYER_ACTOR_ID`
  (`shared.tsx:20`, the seed's demo participant).
- Impact: a real player's first screen is someone else's rogue; nothing says "join a table to see
  your own character".
- Fix: unjoined `/play` renders a join-first stage (what this app is, "Join a table" as the one
  primary, the code you need from your DM) and no sheet/party until joined or previewed.

### PLY-6 · high · The party panel shows one member because PCs default to owner-only sharing

- Evidence: play-phone-vp-party.png "1 member" and joined-4-party.png the same with three seeded
  PCs; `packages/core/src/queries/character-visibility.ts:20-24` (`shared` = `sharedWith` only);
  seed comment `runtime/demo-seed.ts:45` and `packages/core/src/commands/character.ts:588-597`
  (`finalize-draft` sets `visibility: 'shared'`, `sharedWith: [owner]`, with a comment deferring
  party visibility to "later CHAR epics (CHAR-003/011)" that never changed the default).
- Impact: "Party vitals — live as the DM shares them" is empty for every real table until the GM
  re-shares each PC to "All players"; nobody tells them.
- Fix: a party summary every player receives for every PC (name, portrait, HP bar, conditions, AC;
  the full sheet stays owner + DM) with an isolation test; Sharing panel copy explains the three
  levels in terms of the party.

### PLY-7 · high · After Start session, players still see "Nothing is being shown yet"

- Evidence: joined-3-stage.png with `session.workflow = active`, `activeSceneId = Harbor of
Saltreach` (player-visible); Stage panel text (probe): "PLAYER VIEWS · Demo Player — none —";
  `session/ActiveMap.tsx:38-128`; `packages/core/src/commands/player-view.ts`
  (`session.project-player-view`, one player per command).
- Impact: the GM believes the table is live and the scene is up; every player stares at an empty
  stage. Three notions (active scene, per-player view, projected map) with no default.
- Fix: Start session offers "Show <active scene> to everyone" (one atomic command for all
  participants), the Stage panel gets an "Everyone" row above the per-player rows, and the empty
  stage on a live table says what the GM has to do (player-safe wording).

### PLY-8 · medium · No single "what players see now" surface for the GM

- Evidence: five controls across `SharingPanel.tsx`, scene visibility (`CAN-6.4`),
  `ProjectionControl.tsx`, `session/ActiveMap.tsx`, `session/Handouts.tsx`; the Table roster
  (`session/Roster.tsx`) lists participants but not what each one sees.
- Impact: the GM cannot answer "can Demo Player 2 see the crypt map?" without opening four panels.
- Fix: a "Player view" summary widget (builtin over a new actor-scoped read) listing, per
  participant: connection, assigned scene, projected map, visible handouts count, and a Preview
  action. Goes on the Session screen by default (aligns with RC-CAN-7.8).

### PLY-9 · medium · Phone companion nav is ten unlabeled icons in two rows

- Evidence: play-phone-vp-stage.png; `styles/index.css:175-245` hides the labels under 640px,
  wraps to a second row, reserves 107px; locked rows render as icon + a detached "hidden" icon.
  Tab order: nav (visually at the bottom) → header → content (probe TAB ORDER 1-13).
- Impact: a first-time player cannot tell Journal from Inbox from Handouts; focus order contradicts
  visual order (WCAG 2.4.3).
- Fix: a five-tab labelled bottom bar (Stage, Sheet, Dice, Party, More) using the DS
  `BottomTabBar`; the rest under More; the frame's DOM order header → main → nav.

### PLY-10 · medium · Handouts badge prints raw entity kinds

- Evidence: play-phone-vp-handouts.png ("not e" wrapped, "object"); `screens/play/Handouts.tsx:94`
  `<Badge status="info">{n.kind}</Badge>`.
- Impact: engine jargon (guardrail 7) and a clipped badge at 390px.
- Fix: a message key per kind ("Note", "Prop") or no badge; the icon already carries the kind.

### PLY-11 · medium · Top bar: two eyes, two meanings, one people icon for hosting

- Evidence: TOPBAR probe: "Preview as another role" (eye), "Start session — Standby" (filled gold
  eye), "Host a live table" (people), "Help". `ProjectionControl.tsx`, `ViewAsControl.tsx`,
  `docs/reference/ICON_VOCABULARY.md`.
- Impact: the gold eye starts the session clock and log in one unlabeled click; the plain eye
  previews. New GMs press the wrong one. Navigation is frozen until RC-UX-5.5 (D6), so this is a
  note for that review, not a story here.

### PLY-12 · medium · Joining is a two-way code exchange with no guidance before it starts

- Evidence: joined-1-join-dialog.png, joined-2-reply-code.png ("Send this reply code back to your
  DM"), gm-host-dialog-hosting.png ("Invite participant → Create invite"); `net/HostModal.tsx`,
  `net/SessionPanel.tsx`.
- Impact: works, and is honest, but a player who opens the app has no idea a code is coming or
  where it comes from; the DM's dialog says "share the online join code" while online invites are
  "unavailable here" (Settings › Players).
- Fix: folded into PLY-5's join-first stage plus a QR path (`net/qr.ts` exists) on the host dialog.

### PLY-13 · low · Settings › Players shows actor ids as subtitles

- Evidence: probe text "Demo Player / actor-player / Player / Observer / Co-DM (no seats)";
  `screens/settings/Players.tsx`.
- Fix: subtitle = character played or "No character yet"; never the id.

### PLY-14 · low · `document.title` never changes on `/play`, `/join`, `/display`

- Evidence: every probe reports "Lamplight — Command Center" on those routes (`App.tsx:496-560`
  standalone routes mount outside the shell's title effect).
- Fix: set the title in each standalone route.

### PLY-15 · low · Journal opens three empty forms at once

- Evidence: play-phone-full-journal.png: Private notes (0), Bookmarks (0), NPC impressions (0),
  all expanded with inputs; `screens/play/Journal.tsx:339-447`.
- Fix: one "Write a note" primary; bookmarks and impressions as collapsed sections.

### PLY-16 · low · `/display` gives the GM no way back

- Evidence: display-desktop.png "No scene on display", no controls; `screens/SceneDisplay.tsx`;
  `sceneDisplay.waitingHelp` says "Keep the main window open" only in one state.
- Fix: covered by RC-POL-1.20 (done) only partially; add a persistent one-line help.

## 3. Proposed stories

All P3. `POL-1.7` and `POL-1.8` are blocked on write fences and own `screens/player` and
`screens/play`; these stories depend on them so the polish pass lands first and the fence is clear.

- **RC-CHR-6.1 — The companion sheet is the player's sheet: live edits over the session.** `L` ·
  P3 · Deps: POL-1.8, POL-1.7 · Owns: `apps/gm-react/src/screens/play/Sheet.tsx`,
  `apps/gm-react/src/screens/play/Frame.tsx`, `apps/gm-react/src/screens/player/Vitals.tsx`,
  `apps/gm-react/src/screens/player/Sheet.tsx`, `apps/gm-react/src/net/SessionHost.ts`,
  `apps/gm-react/src/net/SessionClient.ts`, `apps/gm-react/src/net/viewModels.ts`. Current
  state: the companion sheet is a read-only summary whose only copy says edits happen "in your full
  character app"; joined players hold no writes but dice, initiative and journal entries. What to
  build: the companion's Sheet section renders the same vitals block `/player` uses (HP stepper with
  undo, temporary HP, conditions, spell slots, class resources, rest) and dispatches the existing
  `character.*` commands as command requests when joined (the host stamps identity; the core's owner
  authority decides) or locally when previewing. A refused write says why in a toast; nothing is
  shown that the actor cannot dispatch. Delete the "full character app" copy. Acceptance: e2e over
  the fake LAN on both profiles: the joined player marks 3 damage, adds Poisoned, spends a slot; the
  DM's sheet and combat tracker show each within the delivery budget; a player editing another PC is
  rejected by the core (unit + e2e); axe clean on the sheet section; no control renders that a
  read-only preview would reject (fixture test).
- **RC-CHR-6.2 — One character sheet body for players, the DM shell and the DM sheet.** `L` · P3 ·
  Deps: 6.1, POL-1.7 · Owns: `apps/gm-react/src/screens/player/index.tsx`,
  `apps/gm-react/src/screens/player/Sheet.tsx`, `apps/gm-react/src/screens/player/Vitals.tsx`,
  `apps/gm-react/src/screens/player/Equipment.tsx`, `apps/gm-react/src/screens/player/Journal.tsx`,
  `apps/gm-react/src/screens/characters/CharacterSheet.tsx`,
  `apps/gm-react/src/screens/characters/sheet`, `apps/gm-react/src/screens/play/Sheet.tsx`,
  `docs/architecture/NAVIGATION.md`. Current state: three sheet implementations with three feature
  sets (skills, attacks and XP only on the DM sheet; rests, level-up and journal only on `/player`;
  nothing editable on `/play`). What to build: a single sheet composition (panels as components,
  capability-gated by the actor's write authority from the core, never by route) used by
  `/characters/:id`, `/player` and the companion; the DM sees Sharing and XP panels because the DM
  may dispatch them, the owner sees rests and level-up, everyone sees skills and attacks. `/player`
  keeps its route and picker as the DM-shell entry to the same body. Acceptance: a snapshot test per
  route proves the same panel set differs only by capability; the character-sheet, player-view and
  play specs pass with selector-only edits; the three files under 500 lines each; FEATURE-GAPS row
  for "two sheets" closed.
- **RC-CHR-6.3 — Party-visible by default: the party sees the party.** `M` · P3 · Owns:
  `packages/core/src/commands/character.ts`, `packages/core/src/queries/party-overview.ts`,
  `packages/core/src/queries/character-visibility.ts`,
  `apps/gm-react/src/screens/characters/sheet/SharingPanel.tsx`,
  `apps/gm-react/src/screens/play/Presence.tsx`, `docs/architecture/DATA_MODEL.md`. Current state:
  `finalize-draft` sets `visibility: 'shared'` with only the owner, so `getPartyOverviewForActor`
  returns one member to every player and the companion's Party panel reads "1 member" at a
  three-PC table. What to build: a party summary projection (name, portrait, level, HP bar,
  conditions, AC) that every player at the table receives for every PC regardless of sheet
  sharing, computed in the core read and never carrying private fields (journal, notes, inventory,
  backstory); the Sharing panel explains the three levels in party terms ("The party always sees
  vitals; this decides who opens the full sheet"). Additive, no schema bump. Acceptance: isolation
  unit tests (a player receives every PC's summary and no private field; an observer receives
  nothing; a DM-only NPC never appears); e2e: the joined companion's Party shows three members and
  follows a DM HP change; the Sharing copy in EN and ES.
- **RC-CHR-6.4 — The companion before joining: join first, then your character.** `M` · P3 · Deps:
  POL-1.8 · Owns: `apps/gm-react/src/screens/play/Frame.tsx`,
  `apps/gm-react/src/screens/play/Home.tsx`, `apps/gm-react/src/screens/play/shared.tsx`,
  `apps/gm-react/src/net/SessionPanel.tsx`, `apps/gm-react/src/net/SessionPanelParts.tsx`,
  `apps/gm-react/src/net/HostModal.tsx`, `apps/gm-react/src/net/qr.ts`. Current state: an
  unjoined `/play` reads as the seeded "Demo Player" and shows Sera Duskwhisper's sheet and a
  one-member party; the join dialog and the host dialog exchange two pasted codes with no lead-in;
  the host dialog mentions an online code Settings says is unavailable. What to build: unjoined and
  unpreviewed `/play` renders a join-first stage (one sentence on what this app is, "Join a table"
  as the only primary, "Ask your {gm} for an invite" with the two ways it can arrive, and a
  scan-a-QR path when the camera is available); the sheet, party and journal sections appear once
  joined or previewed; the host dialog shows the invite as a QR beside the code and drops the online
  code line while online invites are unavailable; no seeded demo participant is ever presented as
  "you". Acceptance: e2e both profiles: a fresh device on `/play` sees no character name and one
  primary; after the fake-LAN join the sheet is the invited participant's PC; the demo vault (UX-3.7)
  keeps its demo participant preview; axe clean; copy in the voice (no exclamation marks, {gm} not
  literal).
- **RC-CHR-6.5 — Preview is trustworthy: `/play` follows the previewed actor.** `M` · P3 · Deps:
  6.4 · Owns: `apps/gm-react/src/screens/play/Frame.tsx`, `apps/gm-react/src/app/ViewAsControl.tsx`,
  `apps/gm-react/src/screens/CommandCenter.tsx`, `apps/gm-react/src/app/shell/Sidebar.tsx`,
  `packages/core/src/queries/preview-mode.ts`. Current state: previewing as a specific player still
  renders Demo Player's PC on `/play`; previewing in the shell shows a lone hero inside the full DM
  sidebar. What to build: the companion's viewer is the previewed actor for player and observer
  previews (specific actor when chosen), and "Preview as <player>" from the top bar opens the
  companion frame itself (in place, with the exit banner) so the GM sees exactly the page that
  player's phone renders; the shell's player-preview hub is retired. Acceptance: e2e both
  profiles: preview as Demo Player 2 shows Brother Calloway on `/play` and the specific-player
  scene assignment; the preview banner and Escape exit still work; `collab.spec.ts` preview tests
  pass unchanged; no DM navigation is rendered while previewing as a player (aria snapshot).
- **RC-SES-7.1 — Rolling in Standby from the companion.** `S` · P3 · Deps: POL-1.8 · Owns:
  `apps/gm-react/src/screens/play/Dice.tsx`, `apps/gm-react/src/net/viewModels.ts`. Current state:
  the companion disables every die until `session.workflow === 'active'` although
  `dice.roll` accepts every workflow state (RC-SES-6.1). What to build: remove the gate; a
  Standby roll shows the result and a one-line note that only live rolls reach the table log;
  `sessionActive` stays in the view model for that note only. Acceptance: e2e both profiles: a
  Standby roll on `/play` records a roll stamped `idle` and the live log stays empty; a live roll
  appears in the DM's session log within budget; the `play.dice.needsSession` key removed from EN
  and ES.
- **RC-SES-7.2 — Show the scene to everyone: a default for what players see.** `M` · P3 · Deps:
  CAN-7.8 · Owns: `packages/core/src/commands/player-view.ts`,
  `packages/core/src/queries/player-view-control.ts`, `apps/gm-react/src/app/ProjectionControl.tsx`,
  `apps/gm-react/src/screens/session/ActiveMap.tsx`, `apps/gm-react/src/screens/play/Home.tsx`,
  `docs/architecture/ARCHITECTURE.md`. Current state: Start session records an active scene the
  players never receive; each player's stage stays "Nothing is being shown yet" until the Stage
  panel assigns a view per player (`session.project-player-view`, one player per command); the map
  needs its own project step. What to build: one core command that assigns a scene to every current
  player and observer atomically (the per-player command kept for exceptions), an "Everyone" row at
  the top of the Stage panel, a "Show <scene> to the table" option at Start session (default on
  when the active scene is shared), and a live-but-empty stage on the companion that says the {gm}
  has not shown a scene yet. Acceptance: reducer tests (atomic assignment, DM-only scene refused
  fail-closed, later joiners inherit the table view); e2e both profiles over the fake LAN: Start
  session with the shared scene puts it on the joined player's stage without touching the Stage
  panel; the per-player override still wins.
- **RC-SES-7.3 — "What players see" summary widget for the GM.** `M` · P3 · Deps: 7.2, CAN-7.8,
  WID-5.2 · Owns: `packages/core/src/queries/player-view-control.ts`,
  `apps/gm-react/src/app/widgets/builtin`, `apps/gm-react/src/screens/session/Roster.tsx`,
  `docs/architecture/WIDGETS.md`. Current state: character sharing, scene visibility, the active
  scene, per-player views, the projected map and handouts live in five panels; the Table roster
  lists participants without what they see. What to build: an actor-scoped read that returns, per
  participant, connection state, the scene on their stage, the projected map, the count of handouts
  they can open and the PCs whose full sheet they hold; a builtin widget (built on a query source so
  the builder can rebuild it, §0.3 rule 12) rendering one row per participant with a Preview action
  that opens RC-CHR-6.5's companion preview; placed on the default Session screen. Acceptance:
  isolation tests (the read never includes DM-only names for a player projection; the DM row set
  matches the roster); e2e: after Start session the rows match the joined companion's stage and
  handouts; the WID-5.5 parity test passes for the widget.
- **RC-CHR-6.6 — Companion frame: labelled tabs, reading order, honest badges.** `M` · P3 · Deps:
  POL-1.8, 6.4 · Owns: `apps/gm-react/src/screens/play/Frame.tsx`,
  `apps/gm-react/src/screens/play/Handouts.tsx`, `apps/gm-react/src/screens/play/Journal.tsx`,
  `apps/gm-react/src/styles/index.css`, `apps/gm-react/src/screens/settings/Players.tsx`,
  `apps/gm-react/src/screens/SceneDisplay.tsx`, `apps/gm-react/src/App.tsx`. Current state: under
  640px the companion's sidebar becomes ten icon-only 44px rows in two wrapped rows with the labels
  hidden and the locked rows drawn as two icons; the DOM puts the nav before the header and content
  so Tab reaches the bottom bar first; handouts print raw kinds ("object", "not e"); the journal opens
  three empty forms; standalone routes keep the shell's document title; Settings › Players prints
  actor ids. What to build: the DS `BottomTabBar` with five labelled tabs (Now playing, Sheet, Dice,
  Party, More) and the remaining sections plus locked Co-DM tools under More; DOM order header →
  main → nav; handout kinds as message keys; the journal with one primary "Write a note" and
  collapsed bookmark and impression sections; per-route titles; Players subtitles by character.
  Acceptance: axe and the 48dp target gate on `/play` at 390 and 200% text; a focus-order e2e (first
  Tab lands in the header); visual snapshots per theme at phone and desktop; no raw entity kind in
  an aria snapshot of Handouts; `player-private-notes.spec.ts` green with selector-only edits.

## 4. Not checked

- Cloud (internet) hosting and the online invite link: `/join?token=…` hits the fail-closed
  "not available in this edition" state here (join.spec.ts covers it); only the LAN path was driven.
- Co-DM elevated sections (`Elevated.tsx`): no co-DM seat exists on the plan in this vault.
- Dark theme: the app theme is a preference (`dndtools:react:theme`), not `prefers-color-scheme`;
  the "dark" probe rendered the default candle-lit theme, so per-theme contrast was not re-measured.
- The projected map on the companion: `session.set-active-map` rejected in my script (the seeded
  map needs an editor-side prerequisite); `golden-path.spec.ts` covers the map reaching a joined
  player, so it was not repeated.
- Second screen (`/display`) driven from the overlay: only the empty state was captured.
