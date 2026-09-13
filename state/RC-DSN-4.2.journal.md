# RC-DSN-4.2 — Design conformance checklist

## Implementation

- Inspected the roadmap §20.2 source, development definition of done, package scripts,
  formatting configuration, quality-gate implementation, and CI guardrail tests.
- Added all eight source checklist items verbatim to the PR template and linked it from §5.
- Added evidence and exception guidance; no runtime behavior changes.
- No Headroom tools or applicable AGENTS.md files were available.
- Dispatcher review-profile wiring is outside the owned paths and remains for the operator.

## Validation

- Python assertions passed: all eight checklist items match §20.2 verbatim, §5 links
  the template, and every added relative link and heading anchor resolves.
- `pnpm exec prettier --check .github/pull_request_template.md state/RC-DSN-4.2.journal.md`
  passed. Existing development-document formatting was preserved outside §5.
- `git diff --check` passed. No application tests were run for this documentation-only change.
- Full repository gates and independent review remain with the central operator.
