# Technical Debt Register

This file is the canonical debt register for long-lived refactors and deferred architectural work.

Last reviewed: 2026-03-01

## Entry Requirements

Each debt item must include:

- `ID`: stable identifier (for example `DEBT-2026-001`)
- `Severity`: `critical`, `high`, `medium`, or `low`
- `Impact`: concrete risk if deferred
- `Owner`: accountable maintainer
- `Resolution Window`: target quarter/date range
- `Targets`: concrete files/modules
- `Status`: `open`, `in_progress`, or `resolved`

## Active Debt Items

| ID              | Severity | Impact                                                                                         | Owner    | Resolution Window       | Targets                                                                           | Status   |
| --------------- | -------- | ---------------------------------------------------------------------------------------------- | -------- | ----------------------- | --------------------------------------------------------------------------------- | -------- |
| `DEBT-2026-002` | high     | Desktop distribution trust posture is weaker without automated installer signing/notarization. | `@trent` | 2026-Q3 (by 2026-09-30) | `.github/workflows/release-assets.yml`, `electron-builder.yml`, `docs/RELEASE.md` | resolved |

## Usage Notes

- Reference debt IDs in PR descriptions when deferring architectural work.
- If a code comment uses `TODO(APP)` and remains unresolved for more than one quarter, add/update a debt entry here before merge.
