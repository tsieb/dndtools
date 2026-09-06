# Feature Tiers

Progressive-disclosure maturity model for `apps/gm-react`. A fresh vault starts at the
`core` tier and reveals authoring/admin capability as the user matures. Tier assignment
governs which surfaces and controls are shown.

The tiers, gates, and visibility logic are declared data with a pure resolver in
`packages/core/src/state/onboarding.ts` (`FeatureTier`, `FEATURE_GATES`,
`visibleFeatures(tier)`, `isFeatureVisible(...)`). The React app reads them
(e.g. `apps/gm-react/src/screens/settings/`, `apps/gm-react/src/app/Onboarding.tsx`).
Design decision: ADR-012 (`docs/adr/012-progressive-disclosure-vault-maturity.md`).

This registry documents intent; `FEATURE_GATES` is the source of truth. If they diverge,
the code wins — update this file.

## Core

Visible on a fresh vault; never hidden.

- Command Center (`/`)
- Scenes (`/scene/:id`, built and staged from the Scenes sidebar group)
- Maps (`/atlas`)
- Navigation

## Intermediate

Revealed once the user reaches the `intermediate` tier.

- Widget library
- Command Center presets
- Player views

## Advanced

Revealed at the `advanced` tier (admin/diagnostic surfaces under `/settings/`).

- System diagnostics
- Platform support status
- Permission grants

## Governance Rules

- Tier classification determines how prominently a capability is surfaced.
- Core capabilities are never hidden.
- Intermediate capabilities are discoverable by use progression, not front-loaded.
- Advanced capabilities stay out of the way until the tier is reached.
- A gate for an unknown feature fails closed (hidden), never shown.
