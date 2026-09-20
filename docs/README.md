# Documentation

User guides and engineering reference for Lamplight, a canvas-first command platform for tabletop
RPG play. Start with the guides below to prepare your first table.

The primary application is the React GM app (`apps/gm-react`); the platform-independent processing
core (`packages/core`) holds commands, reducers, permissions, and queries and is shared by every
surface. The earlier SvelteKit app is archived at `archive/gm-svelte` (tag `svelte-gm-final`); the
v1 document editor is preserved at tag `v1-final` only.

## User guides

Open the info button in the top bar, or Help above the tab bar on a phone, to read these
guides without leaving your table. All eight guides ship with the app. They are in English;
the implementation references below each page are for maintainers and are hidden in the app.

- [Getting started](user/getting-started.md)
- [Running a session](user/running-a-session.md)
- [Maps](user/maps.md)
- [Widgets & builders](user/widgets-and-builders.md)
- [Systems](user/systems.md)
- [Remote play](user/remote-play.md)
- [Privacy modes](user/privacy-modes.md)
- [Android/desktop install](user/android-desktop-install.md)

Source-review scope and validation: [RC-DOC-1.3 journal](user/RC-DOC-1.3.journal.md).

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
| Component reference (DEV gallery)        | [design/COMPONENTS.md](design/COMPONENTS.md)                                          |
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
| Dispatcher run journals                  | [development/run-journals/](development/run-journals/)                                |
| Decisions                                | [adr/README.md](adr/README.md)                                                        |
| Open debt                                | [`../DEBT.md`](../DEBT.md)                                                            |

## Rules for these docs

- Every behaviour claim maps to a real file path; use exact tool, script, and type names.
- Planned work is marked `TODO(APP)` (what is missing, why, owner, target, risk); never present it
  as implemented.
- When a contract changes, the doc changes in the same commit. Material runtime, storage, security,
  or platform decisions get an ADR.
- Keep one home per topic and link to it; do not restate another doc's content.
- Every file under `docs/` must be reachable from this page through relative links, and every
  relative link must resolve. `pnpm gates` checks both; see
  [development/TESTING.md](development/TESTING.md) §7.
