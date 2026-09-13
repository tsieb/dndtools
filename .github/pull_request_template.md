## Summary

Describe the problem and resulting behavior.

## Validation

List commands run and results, plus any checks still pending. For UI changes, link
reviewed visual snapshots and identify the themes and tiers verified.

## Design conformance

Source: [RC roadmap §20.2 — Design fidelity](../docs/planning/RC_ROADMAP.md#202-design-fidelity).
Check each verified item. Leave unverified items unchecked; explain pending checks,
non-applicable items, and deviations with rationale below.

- [ ] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory).
- [ ] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale.
- [ ] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`.
- [ ] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono.
- [ ] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable.
- [ ] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed.
- [ ] Motion uses named tokens; nothing animates under `data-motion='reduced'`.
- [ ] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists.

### Evidence and exceptions

Link supporting evidence and explain any unchecked items or deviations.
