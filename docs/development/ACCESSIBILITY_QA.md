# Accessibility QA Checklist

Owner: UI Platform (A11y)  
Release gate: execute before every minor and major release.

## Scope

Run this checklist in all required environments:

- VoiceOver + Safari (macOS)
- NVDA + Chrome (Windows)
- TalkBack + Chrome (Android)

Document results in the release notes, including:

- date executed
- tester
- pass/fail by section
- issues found, workarounds, and ticket links

Known unresolved screen-reader issues must include:

- WCAG criterion
- user impact
- workaround
- target fix release

## Common Preconditions

- Use a recent production candidate build.
- Start from a non-empty vault with at least one note, one folder, and one session board.
- Confirm screen reader is enabled before launching the app.

## VoiceOver + Safari (macOS)

1. Primary section navigation

- Use VoiceOver rotor landmarks to move to `Primary` navigation.
- Navigate to Knowledge, Session, Campaign, Settings, and Player sections.
- Confirm each section announces a level-1 heading and expected landmark regions.

2. Open and read a note

- Go to Knowledge -> Notes.
- Open a note from the list using keyboard/VoiceOver commands only.
- Confirm note title, heading structure, and markdown content are read in order.

3. Command palette search

- Open command palette (`Ctrl+P`).
- Search for an existing note and activate it.
- Confirm focus lands in the destination note view and title is announced.

4. Dice tray flow

- Open dice tray (`Ctrl+D`).
- Move focus to a die control, roll a die, verify roll result announcement.
- Close the dialog with `Escape` and confirm focus returns to the trigger context.

5. Settings form labels

- Navigate through all Settings tabs.
- Confirm every input/select/checkbox/radio has an announced label and role.

## NVDA + Chrome (Windows)

1. Primary section navigation

- Use NVDA landmark and heading shortcuts to traverse all primary sections.
- Confirm route changes announce the new page heading.

2. Open and read a note

- Open a note from Knowledge -> Notes.
- Validate heading hierarchy and reading order in browse mode.

3. Command palette search

- Open command palette, search for a note, and activate result.
- Confirm dialog semantics (`dialog`, labelled title, controlled focus) are announced.

4. Dice tray flow

- Open dice tray, tab to die controls, roll, and confirm result announcement.
- Dismiss with `Escape`; verify focus restoration.

5. Settings form labels

- Traverse all interactive form controls in Settings.
- Confirm no unlabeled form fields or ambiguous control names.

## TalkBack + Chrome (Android)

1. Primary section navigation

- Swipe through bottom navigation and open each section.
- Confirm TalkBack announces section names and selected state.

2. Open and read a note

- Open a note from the notes list.
- Confirm heading and markdown content are announced correctly.

3. Command palette search

- Open command palette from available control.
- Search for and open a note using TalkBack gestures only.

4. Dice tray flow

- Open dice tray, activate a die button, and confirm result is announced.
- Close tray and confirm navigation context is restored.

5. Settings form labels

- Review all settings controls and verify announced labels, roles, and states.

## Release Notes Template

Use this block in release notes:

```md
### Accessibility QA

- Executed on: YYYY-MM-DD
- Environments: VoiceOver/Safari (macOS), NVDA/Chrome (Windows), TalkBack/Chrome (Android)
- Result: PASS | PASS WITH KNOWN ISSUES | FAIL
- Findings:
  - [ID] Summary (WCAG X.X.X) - Status - Workaround
```

## V2 Surfaces (UX-A11Y-018)

Epic `UX-A11Y-release-gates-and-contrast` extends this release checklist to the v2 remake surfaces.
Run the v2 sections below in all three environments (VoiceOver+Safari, NVDA+Chrome, TalkBack+Chrome)
before every minor and major release, in addition to the automated gate (`pnpm a11y:gate`, see
`docs/development/ACCESSIBILITY.md` §9).

### Required v2 environments

- VoiceOver + Safari (macOS) — Desktop profile, keyboard.
- NVDA + Chrome (Windows) — Desktop profile, keyboard.
- TalkBack + Chrome (Android) — Mobile profile, touch.

### V2 surface checks (each environment)

1. Primary navigation and route announcements

- Traverse the seven global destinations (Command Center, Session, Characters, Atlas, Campaign,
  Knowledge, Settings) by landmark/heading shortcuts.
- Confirm each route exposes exactly one `h1`, the route landmark receives focus, and the polite
  live region announces the new route.

2. Scene canvas keyboard model and Scene Outline

- Tab from the toolbar into the canvas; confirm a visible focus ring lands on the first widget.
- Move/resize/layer/dock a widget by keyboard or touch handles (no drag-only step) and confirm
  position/size announcements.
- Open the Scene Outline and confirm every widget is announced by name + type in layer order; an
  empty canvas announces the empty-state hint.

3. Map summary panel

- Open the map accessibility summary; confirm visible POIs/routes/areas are listed and activating
  one centres the map and announces the POI.

4. Combat live announcements (run as DM session AND Player session separately)

- Confirm turn advance, HP/status changes (polite) and incapacitation/death (assertive) announce at
  the right politeness level, debounced under rapid events.

5. Drag alternatives (WCAG 2.5.7)

- For every drag (widget move/resize, map pin, initiative reorder, file import), confirm a
  keyboard/menu/numeric single-pointer alternative reaches the same state.

6. Visibility-boundary no-leak check (UX-A11Y-008) — REQUIRED, Player role

- In a Player-role session with a DM-only canvas widget, DM-only map POI, and a hidden combatant
  present: confirm via the screen reader and a DOM/ARIA inspection that NONE of the DM-only names,
  labels, descriptions, alt text, or live-region announcements are present or reachable in the
  player context (not in Tab order, Scene Outline, map summary, search, or any announcement).
- Record this as an explicit pass/fail line; a leak is a release blocker, never a known issue.

### V2 release notes template

```md
### Accessibility QA — V2 Surfaces

- Executed on: YYYY-MM-DD
- Build: <production candidate>
- Automated gate: `pnpm a11y:gate` — PASS | FAIL (link merged report)
- Environments:
  - VoiceOver/Safari (macOS): PASS | PASS WITH KNOWN ISSUES | FAIL
  - NVDA/Chrome (Windows): PASS | PASS WITH KNOWN ISSUES | FAIL
  - TalkBack/Chrome (Android): PASS | PASS WITH KNOWN ISSUES | FAIL
- Player-role visibility-boundary no-leak check (UX-A11Y-008): PASS | FAIL
- Findings:
  - [ID] Summary (WCAG X.X.X) - Severity - Status - Workaround - Target fix release
```
