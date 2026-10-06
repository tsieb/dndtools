# RC-WID-6.7 run journal

Base: `fe996760` (the task branch head at start).

## Implementation

- **Bundled starters install enabled** (`Plugins.tsx`, `PluginPackageCard.tsx`). The Starter
  library's Install builds the starter. If it asks for nothing (no host permission, no network
  destination, no player-visible write: `asksForNothing`), Install dispatches
  `widget.package.install` and then `widget.package.enable`, and toasts "Installed Torchlight. It is
  on and ready to place.". All seven starters qualify today, Torchlight (custom code, no permissions)
  included. A starter that asked for something would still go through `installStarter`
  (off, unreviewed).
  - No core change. Rendering a custom-code widget never needed `trusted`; only host-permission
    grants read the trust record (`approvedHostPermissions`). The record therefore stays
    `unreviewed` with every permission `denied`, which is the honest audit: nobody reviewed it. The
    alternative, a `basis: 'bundled'` written by the core, needs `commands/widget-package.ts`,
    which is neither owned nor a companion.
  - The card's "Bundled · no permissions" status comes from `isBundledWithoutPermissions`. The id
    must be a starter's, `authoring.createdBy` must be `starter-library`, and what runs must equal
    this build's starter: version, assets, and each widget's entrypoint, style, host permissions and
    network classes. The comparison can't be over the whole definition, because the core normalises
    command and field defaults on install (probed: every starter's stored `widgets` differs from
    `build()`, while the assets and entrypoints do not). A pasted package that borrows a starter id
    is judged like any other.
- **One status per card** (`PluginPackageCard.tsx`). The four header badges (trust state, Built in,
  Generated, Needs review, Custom code) and the "Trust after review" recommendation in the meta
  line collapse into one badge, in this order:
  1. Update failed — review the package
  2. Blocked
  3. Built in
  4. Bundled · no permissions
  5. Allowed
  6. Needs review

  The meta line is now facts: "v1.0.0 · 1 widget · runs its own code" (plus "· drafted by the
  assistant" for a generated package). The permission badges became one sentence: "Asks for no
  permissions." or "Asks for: Clipboard.".

- **Review sheet** (`TrustReviewSheet.tsx`).
  - The primary is "Allow and enable". It records the review, then dispatches `widget.package.enable`
    unless the package is already on. A refused enable leaves the package allowed and off, and says
    why in a toast.
  - "Deny package" is now "Block".
  - The recommendation badge and the "v1.0.0 · Runs its own code in a sandbox. It writes nothing your
    players see." line are replaced by one verdict sentence in a tone-coloured Callout, with the
    `widgetTrust` help beside it. Example: "It runs its own code, kept apart from the rest of
    Lamplight, asks for the permissions below and shows your players nothing."
  - The verdict is eight whole-sentence keys (code × asks × players), not an ICU `select`. The
    catalog test's argument-shape check reads `{Word` at a branch start as an argument, and stitched
    fragments would be worse for translators.
- **Commands step** (`CommandsStep.tsx`).
  - The catalogue is one list named by outcome: Roll dice, Count up or down, Count up by one, Reset
    the count, Set the count, Show a message to players, Start a timer, Pause the timer, Resume the
    timer, Mark the quest done, Add a line to the note.
  - Who may press a button is said only in a DS `Tooltip` (hover and keyboard focus): "You, and any
    player you let use this widget, can press it." or "Only the {gm} can press it.". The
    "Operate — An operator at the table can fire this." group headings and the per-row badge are gone.
  - A declared command shows Name and Runs. Type, Needs, Writes to and Destination sit under a
    per-row `<details>` "Advanced" (WID-14's "the blank-command editor moves under Advanced").
  - The catalogue labels are the same keys the "Runs" picker uses, so it reads by outcome too.
- **Generate card** (`GenerateDialog.tsx`, `AddWidgetGallery.tsx`).
  - `useGenerateGate()` is the dialog's gate, now shared. It returns the first unmet prerequisite and
    the Settings tab that clears it:
    1. not the GM;
    2. assistant consent off → Tool preferences (the AI tab is hidden until consent is on, so linking
       there would land on Tool preferences under the wrong name);
    3. no usable provider route → AI & tools;
    4. agent access off → AI & tools;
    5. no agent allowed the widget tool → AI & tools.

    Otherwise it reports whether the assistant task routes to the local backend.

  - `CreateEntry` moved into `GenerateDialog.tsx`, re-exported from the gallery for
    `TemplatePicker`. It gained a `blocked` mode: not a button, but the dimmed label plus
    `GenerateGateNote`, i.e. the reason and a router `Link` "Open Settings › AI & tools". A link
    can't sit inside a button. The gallery was at 797 of the 800-line gate, and the move leaves it at 754.
  - A ready local model makes the card read "Generate (local)".
  - The dialog shows the same note and link when it is opened blocked (Extensions' "Generate a
    widget").

- **Gallery copy** (`AddWidgetGallery.tsx`). The last feature-local strings were the miniature's
  sample rows and message, chosen by `locale === 'es' ? … : …`. They are now catalog keys
  (`boardCanvas.add.sample*`) with ES. French keeps the English fallback through its `...en` spread.
- **Catalogs**: EN/ES for every new or changed key; `qps-ploc.ts` regenerated (`npx tsx
scripts/i18n-catalog.ts pseudo`). Keys left with no reader were removed from en/es (fr only
  spreads en):
  - `extensions.trust.trustPackage`, `.recommend.trusted`, `.version`, `.codeCustom`,
    `.codeTemplates`, `.writesPlayerVisible`, `.writesNothing`;
  - `extensions.plugins.trustTrusted`, `.trustUnreviewed`, `.trustDenied`, `.customCode`,
    `.noPerms`, `.generated`;
  - `builder.commandKind.operate`, `.configure`.

## Copy review against `docs/design-package/readme.md` (Content fundamentals)

| Rule                              | How the new copy meets it                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Person: address the GM as **you** | "Choose what this widget may use. Nothing is allowed until you say so." · "shows your players nothing" · "You, and any player you let use this widget, can press it."                                                                                                                                                                                                                               |
| "GM", supplied by the package     | Authority hint uses `{gm}` ("Only the {gm} can press it.", "…so only the {gm} can press it."), so 5e reads "DM" and a horror package its own word. No "campaign manager".                                                                                                                                                                                                                           |
| Sentence case                     | Every new label: "Allow and enable", "Bundled · no permissions", "Add a button", "Open Settings › AI & tools", "Generate (local)".                                                                                                                                                                                                                                                                  |
| Verbs first, terse                | Catalogue chips are imperative outcomes ("Roll dice", "Show a message to players", "Add a line to the note"); "Block" replaces "Deny package". "Allow and enable" is two verbs because the story names it.                                                                                                                                                                                          |
| State spoken plainly              | Card status is one fact ("Allowed", "Blocked", "Needs review", "Bundled · no permissions"); gate says what is missing ("No AI provider is set up.", "The assistant is off.") before where to fix it.                                                                                                                                                                                                |
| Safety language explicit          | Every verdict sentence ends on the player-visible question ("shows your players nothing" / "can show things to your players"); "Show a message to players" names the audience in the chip itself.                                                                                                                                                                                                   |
| No engine jargon                  | Gone from the surfaces this story owns: "package" (sheet primary, toasts), "trust", "host permissions", "Unreviewed", "Custom code", "Requires review", "operator", "campaign manager", "descriptor", "type id", "class of data", "Declared commands". The remaining technical fields (Type, Needs, Writes to, Destination) are behind Advanced. "Settings › AI & tools" is the nav label verbatim. |
| Emoji: none                       | None. `›` is the app's existing Settings breadcrumb mark (80 uses in `en.ts`); `·` is the existing list separator.                                                                                                                                                                                                                                                                                  |

Spanish follows the catalog's existing register (tú, "Configuración › IA y herramientas"). One line
was reworded to avoid "vosotros": "Lo puede pulsar cualquier jugador al que dejes usar este widget, y
también tú.".

## Tests and evidence

- **Catalog test** (`AddWidgetGallery.test.tsx`, "the Add panel copy"). It reads the gallery
  source with comments stripped and checks two things:
  - no `locale` and no `en:`/`es:`/`fr:` tables;
  - every dotted string literal in it is a key with an English source and a Spanish entry (29
    keys, conditional picks included). The sample-row and `generateLocal` keys must be really
    translated (ES ≠ EN).

  **Negative control:** with `label: useI18n().locale === 'es' ? 'Datos de ejemplo' : 'Sample
data'` put back, both tests fail (2 failed, 12 passed). Restored: 14/14.

- **Gate card unit tests** (same file):
  - assistant off: not a button, "The assistant is off.", link `/settings?tab=tools`;
  - assistant on, no provider: "No AI provider is set up.", link `/settings?tab=ai`, "Open
    Settings › AI & tools";
  - local route ready: a button named "Generate (local)" that calls `onGenerate`;
  - provider ready: "Generate with assistant".

  The existing "More ways to add" test now reads the group's labelled children, since the gated
  card is not a button.

- **Acceptance e2e** `tests/e2e/widget-install-words.spec.ts`, `--project=desktop-chromium
--project=mobile-chromium`: **4 passed**.
  1. Install on Torchlight: one click on "Install Torchlight". Then:
     - the card status is "Bundled · no permissions" and its switch is checked;
     - the toast says "Installed Torchlight. It is on and ready to place.";
     - no dialog opened;
     - the record is `enabled: true`, `unreviewed`, every permission `denied`.

     On the board (Edit layout → Add) there is no "Enable Torchlight" row, and one pick on "Add
     Torchlight" places it. It is focused and "Added Torchlight" is announced, and the sandboxed
     frame's own code drew its reading ("of 10").

  2. Generate gate: with consent on and no provider, the card (a group, not a button) says "No AI
     provider is set up." The link "Open Settings › AI & tools" navigates to `#/settings?tab=ai`,
     with no Generate dialog. At the default experience level Settings shows its own "Hidden at your
     experience level · AI & tools · Show advanced settings" gate, and one press later the "Provider
     API key" field is visible.

- Updated specs for the new copy and outcome:
  - `widget-trust-review`: the clipboard package is reviewed, and "Allow and enable" leaves it
    trusted, enabled and "Allowed" before it places. A new case: a bundled starter installs on,
    unreviewed, with nothing granted. The clipboard grant test now presses "Allow and enable".
  - `extensions-polish`, `widget-author-trust`: the "Allow and enable" button.
  - `widget-builder`: the outcome chips, tooltips asserted on hover, the forced-GM message under
    Advanced, and Advanced opened before axe.
  - `widget-commands`: "Roll dice", "Count up or down".
  - `widget-generate`: "drafted by the assistant" on the card; the no-key case sets consent and
    asserts the new message and link.
  - `add-panel`: the gated Generate card and its link.
- `tsc --noEmit` (app) exit 0. `eslint` on every changed TS/TSX file exit 0. Prettier was run on
  each changed file only (a stray glob reformatted two unrelated specs, which I reverted with
  `git checkout`).
- Related unit suites (i18n, widgetBuilder, canvas, screens/extensions, help): 20 files, **342
  passed**.
- Neighbouring e2e: the first run of 14 specs on both profiles was cut off at test 49/124 when the
  session ended, with no failure up to there. Re-run recorded below.
- Headroom tools were not used; I read native command output and log files directly.

## Scope notes

- Changed paths: the six owned files, plus companions only. Those are `i18n/messages/en.ts`,
  `es.ts`, `i18n/dev/qps-ploc.ts`, `AddWidgetGallery.test.tsx`, `tests/e2e/*.spec.ts` (one new,
  seven updated) and this journal. Not touched: `usePackageActions.ts`, `WidgetBuilder.tsx`,
  `vocabulary.ts` and core.
- HANDOFF (`WidgetBuilder.tsx`): the builder's `afterReview` still dispatches
  `widget.package.enable` after the embedded sheet closes trusted. The sheet now enables itself, so a
  custom-code build that is allowed from the builder appends two enable ops (the second is accepted
  and changes nothing). The builder could skip its enable when the record is already `enabled`.
- HANDOFF (`vocabulary.ts`, shared with the Data step): the "Needs" select under Advanced still reads
  Viewer / Operator / Campaign manager, and the builder's own Review summary still shows "Requires
  review" / "Trust after review" (`extensions.trust.recommend.review`/`.deny`,
  `extensions.plugins.recommendTrust`). These are outside this story's files.
- Not changed (RC-WID-6.2's note): the Extensions switch still enables any non-denied package,
  unreviewed custom code included. It is not in this story's acceptance.
- No push, promotion, loop launch, dispatcher state edit or additional agents.

## Attempt 2 — visual regression red (head `78e877f4`)

The pinned-container visual gate failed on 35 of 516 tests. Every failure was a screen this story
changes on purpose, and nothing else moved:

- `extensions-polish.spec.ts` `/extensions` and `/extensions named remove confirm`, five themes
  each on desktop, rail and phone (30 tests);
- `add-panel.spec.ts` "Add panel rows" on visual-rail (5 tests). That profile's crop reaches
  "More ways to add", where the Generate card is now the gated note; the desktop crop does not.

Before re-baselining I checked that `loop/rc` is an ancestor of the head, so there were no newer
integration baselines to collide with. I re-baselined only those two specs in the pinned image:

```
apps/gm-react/tests/visual/run-in-container.sh tests/visual/extensions-polish.spec.ts tests/visual/add-panel.spec.ts --update-snapshots=changed
```

The 35 rewritten PNGs are exactly the failing set. I inspected `visual-desktop/extensions--tavern.png`
and `visual-rail/add-panel--tavern.png`:

- built-in cards show one "Built-in" status, "v1.0.0 · 10 widgets · built from templates" and "Asks
  for no permissions.";
- the Starter library badge reads "Bundled · works offline", with the new intro;
- the Generate card reads "The assistant is off. Turn it on in Settings › Tool…", a link and no
  button.

The PNGs were recompressed losslessly (re-filter plus Zopfli, decoded rows asserted identical),
from 2,110,214 B to 1,441,303 B (−653 KiB). `check-baseline-budget.mjs` reports 32,702.0 KiB of
34,816.0 KiB. A compare-only re-run in the container (`--update-snapshots=none`) on the two specs:
**60 passed**.

Browser re-run on head `5d18cfb5`, `--project=desktop-chromium --project=mobile-chromium`:

- widget-trust-review, extensions-polish, widget-author-trust, widget-commands, widget-generate,
  add-panel, widget-install-words: **51 passed, 1 skipped**. The skip is `add-panel.spec.ts:159`,
  the hover test, which skips on touch by design.
- widget-builder and starter-widgets: **20 passed**.

The `Function components cannot be given refs` console warnings in these logs are the existing
builder Textarea warning (WID-17, `BuilderPanes.tsx`), not this change.
