# Documentation

Engineering reference for Lamplight: a canvas-first command platform for tabletop RPG play. The
primary application is the React GM app (`apps/gm-react`); the platform-independent processing
core (`packages/core`) holds commands, reducers, permissions, and queries and is shared by every
surface. The earlier SvelteKit app is archived at `archive/gm-svelte` (tag `svelte-gm-final`); the
v1 document editor is preserved at tag `v1-final` only.

## Map

| Question                                 | Read                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| How is the system built?                 | [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)                          |
| What is persisted, and how?              | [architecture/DATA_MODEL.md](architecture/DATA_MODEL.md)                              |
| Routes, shell, layout tiers, top bar     | [architecture/NAVIGATION.md](architecture/NAVIGATION.md)                              |
| Widgets, sandbox, trust review, builders | [architecture/WIDGETS.md](architecture/WIDGETS.md)                                    |
| Game systems as data                     | [architecture/SYSTEM_PACKAGES.md](architecture/SYSTEM_PACKAGES.md)                    |
| Combat tokens, AoE, movement on the map  | [architecture/COMBAT_ON_MAP.md](architecture/COMBAT_ON_MAP.md)                        |
| Scene undo and reversible destroy        | [architecture/SCENE_HISTORY.md](architecture/SCENE_HISTORY.md)                        |
| Electron, Android, PWA, auto-update      | [architecture/PLATFORMS.md](architecture/PLATFORMS.md)                                |
| Design sources, tokens, components       | [design/README.md](design/README.md); the vendored package is `design-package/`       |
| Icons                                    | [reference/ICON_VOCABULARY.md](reference/ICON_VOCABULARY.md)                          |
| Terms                                    | [GLOSSARY.md](GLOSSARY.md)                                                            |
| Setup, standards, boundaries             | [development/DEVELOPMENT.md](development/DEVELOPMENT.md)                              |
| Branches, gates, CI, PRs                 | [development/GIT_WORKFLOW.md](development/GIT_WORKFLOW.md)                            |
| Tests and `pnpm validate`                | [development/TESTING.md](development/TESTING.md)                                      |
| Accessibility gates and manual QA        | [development/ACCESSIBILITY.md](development/ACCESSIBILITY.md)                          |
| Performance budgets and measurement      | [development/PERFORMANCE.md](development/PERFORMANCE.md)                              |
| Translations                             | [development/LOCALIZATION.md](development/LOCALIZATION.md)                            |
| Product analytics                        | [development/PRODUCT_ANALYTICS.md](development/PRODUCT_ANALYTICS.md)                  |
| Copilot RAG measurement and contract     | [development/COPILOT_RAG_DERISK.md](development/COPILOT_RAG_DERISK.md)                |
| Cutting a release, promoting prod        | [development/RELEASING.md](development/RELEASING.md)                                  |
| Android build, signing, acceptance       | [runbooks/android-alpha.md](runbooks/android-alpha.md)                                |
| Stripe billing                           | [runbooks/stripe-billing.md](runbooks/stripe-billing.md)                              |
| SES production access                    | [runbooks/ses-production-access.md](runbooks/ses-production-access.md)                |
| Google OAuth client                      | [runbooks/google-oauth-setup.md](runbooks/google-oauth-setup.md)                      |
| Cloud stacks, accounts, cost             | [`../infra/README.md`](../infra/README.md); TURN TLS ops in `infra/turn/README.md`    |
| Threat model and security controls       | [security/README.md](security/README.md)                                              |
| What the app does today, with evidence   | [requirements/FEATURE-GAPS.md](requirements/FEATURE-GAPS.md) and `pnpm feature-audit` |
| The plan to RC1                          | [planning/README.md](planning/README.md) → `planning/RC_ROADMAP.md`                   |
| Decisions                                | [adr/README.md](adr/README.md)                                                        |
| Open debt                                | [`../DEBT.md`](../DEBT.md)                                                            |

## Rules for these docs

- Every behaviour claim maps to a real file path; use exact tool, script, and type names.
- Planned work is marked `TODO(APP)` (what is missing, why, owner, target, risk); never present it
  as implemented.
- When a contract changes, the doc changes in the same commit. Material runtime, storage, security,
  or platform decisions get an ADR.
- Keep one home per topic and link to it; do not restate another doc's content.
