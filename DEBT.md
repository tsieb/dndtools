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

| ID              | Severity | Impact                                                                                                                 | Owner    | Resolution Window       | Targets                                                                    | Status |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------- | -------------------------------------------------------------------------- | ------ |
| `DEBT-2026-001` | high     | Regressions can ship in low-coverage renderer routes because coverage thresholds are not enforced in CI.               | `@trent` | 2026-Q2 (by 2026-06-30) | `vite.config.ts`, `.github/workflows/ci.yml`, `tests/**/*`                 | open   |
| `DEBT-2026-002` | high     | Desktop distribution trust posture is weaker without automated installer signing/notarization.                         | `@trent` | 2026-Q3 (by 2026-09-30) | `.github/workflows/release-assets.yml`, desktop packaging/signing pipeline | open   |
| `DEBT-2026-003` | medium   | Accessibility regressions may escape when key flows are not automatically audited in E2E.                              | `@trent` | 2026-Q2 (by 2026-06-30) | `tests/e2e*`, `docs/UX_GUIDELINES.md`, accessibility assertions            | open   |
| `DEBT-2026-004` | medium   | Export interoperability remains limited while JSON-only export lacks a markdown archive profile and validation report. | `@trent` | 2026-Q3 (by 2026-09-30) | `src/lib/domain/export.ts`, `src/routes/settings/+page.svelte`             | open   |

## Usage Notes

- Reference debt IDs in PR descriptions when deferring architectural work.
- If a code comment uses `TODO(APP)` and remains unresolved for more than one quarter, add/update a debt entry here before merge.
