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
