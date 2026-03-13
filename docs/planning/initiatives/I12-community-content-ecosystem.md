# Initiative 12 — Community & Content Ecosystem

## Status: DEFERRED

**Outcome:** DND Tools is a platform. DMs can publish campaign modules, share custom
content, discover community-created templates and scene packages, and collectively
grow a library of high-quality reusable content. The community makes every DM's vault
richer without any individual doing all the work.

**Why this matters:** An isolated tool competes on features. A platform competes on
network effects. When a DM can find a ready-made "Waterdeep Merchant District" map
pack with linked notes, scene packages, and random tables — all importable in one
click — DND Tools becomes indispensable regardless of what competitors do.

---

## Epic 12.1 — Campaign Module Format & Vault Bundle Export

**Goal:** Vaults or subsets of vaults can be exported as installable, versioned
campaign modules — complete packages of notes, objects, maps, templates, and random
tables that can be imported by any DND Tools user.

**Stories:**

- **S12.1.1 — Campaign module manifest format**
  Define `module.json`: id, name, version (semver), author, description, system
  compatibility (e.g., `dnd5e`, `generic`), level range (min/max), content type
  tags (adventure, supplement, world, toolkit), license (CC BY, CC BY-SA, proprietary,
  etc.), dependencies (other module IDs), and a content manifest listing every
  included vault note, object, map, audio preset, and template. The manifest format
  is versioned and documented in `docs/MODULE_FORMAT.md`.

- **S12.1.2 — Module export workflow in-app**
  Add Settings → Content → Export Module. The DM selects: scope (entire vault,
  selected folder, tagged subset), content types to include (notes, objects, maps,
  audio, templates), and whether to include DM-private content. A pre-export
  validation step checks: broken internal links, missing asset files, and
  unlicensed external audio sources. The output is a `.dndmodule` ZIP containing
  the manifest and all selected files in a canonical directory structure.

- **S12.1.3 — Module import with dependency resolution**
  DMs can import a `.dndmodule` file via drag-and-drop or Settings → Content →
  Import Module. Pre-import: show a structured summary of the module (name,
  author, content count by type, dependencies). Dependency modules are detected
  and the user is prompted to install them first. Import respects vault naming
  conflicts with overwrite/skip/rename policies. Post-import: a summary report
  shows what was installed, what was skipped, and any warnings.

- **S12.1.4 — Module version tracking and update workflow**
  Installed modules are tracked in `.vault/modules.json` with their installed
  version. When a newer version of an installed module is available (checked
  against the Community Directory), a notification appears in Settings → Content.
  Update workflow: diff installed vs new content, show what changed, allow partial
  update (notes only, skip custom objects the DM has modified). Updates are
  non-destructive: the DM's edits to module content are preserved or highlighted
  as conflicts.

---

## Epic 12.2 — Community Content Directory

**Goal:** A hosted, searchable directory of community-published modules, maps, scene
packages, and template packs is discoverable from within the app. Installing content
takes one click.

**Stories:**

- **S12.2.1 — Community Directory API and backend**
  Build a publicly accessible REST API (AWS API Gateway + DynamoDB) for the
  content directory: `GET /modules` (search, filter, paginate), `GET /modules/{id}`
  (detail), `POST /modules` (publish, authenticated), `PUT /modules/{id}` (update,
  owner only). Module binaries are stored in S3 with CDN distribution. The API is
  documented with OpenAPI 3.0 and published at `api.dndtools.app/docs`.

- **S12.2.2 — In-app directory browser**
  Add a `/community` route accessible from the sidebar. The browser shows: featured
  modules at the top, search with filters (system, type, level range, license,
  rating), and a card grid showing name, author, thumbnail, short description,
  install count, and star rating. Selecting a module shows the full detail view
  with a changelog and user reviews. "Install" button downloads and runs the import
  workflow (S12.1.3) without leaving the app.

- **S12.2.3 — Rating, reviews, and community quality signals**
  Authenticated users can rate modules (1–5 stars) and leave a text review (250
  char max). Ratings require the user to have installed the module. A "verified
  purchase" badge distinguishes reviews from users who actually used the content.
  Aggregate rating, install count, and "last updated" date are displayed on cards
  and detail pages. A content moderation queue handles flagged reviews.

- **S12.2.4 — Curator picks and featured collections**
  The DND Tools team curates "Featured Collections" visible on the directory
  homepage: "Best Starter Adventures", "Atmospheric Scene Packs", "5e Monster
  Supplements". A `featured` flag is set via an admin API endpoint (restricted
  to project maintainers). Curated content has a badge on its card. The curation
  process is documented and open to community nominations via GitHub Discussions.

---

## Epic 12.3 — Creator Tooling & Module Publishing

**Goal:** Creating and publishing high-quality community content is supported by
in-app tooling: validation, previewing, versioning, and a streamlined publish
workflow that makes the barrier to sharing as low as possible.

**Stories:**

- **S12.3.1 — Module creator workspace**
  Add a "Module Creator" mode toggled in Settings → Content. In creator mode:
  the vault shows a "Module Contents" badge on every note and object included in
  the current module scope, a module metadata editor panel is accessible from the
  sidebar, and a live completeness score shows how much of the module's declared
  content is filled in (notes created, descriptions populated, dependencies
  resolved). Creator mode has no functional differences — it is purely a metadata
  and visibility overlay.

- **S12.3.2 — Module validation and quality checklist**
  Before publishing, a validation pipeline checks: manifest completeness, all
  declared files present and not corrupt, no broken internal wikilinks, no
  unlicensed content (audio files checked against bundled license metadata),
  recommended items (thumbnail image, system compatibility tag, level range).
  Each check is displayed with pass/warn/fail status. Fails block publish; warns
  are advisory. The checklist is documented in `docs/PUBLISHING_GUIDE.md`.

- **S12.3.3 — Versioned publishing and changelog**
  The publish workflow prompts for: semver version bump type (patch/minor/major),
  a changelog entry describing what changed, and confirmation of the license.
  Version history is stored in the directory backend. Each version's `.dndmodule`
  file is immutable after publish (replaced by a new version, not updated in place).
  A "yank" action can de-list a version from the directory without deleting it
  for users who have it installed.

- **S12.3.4 — Attribution and license enforcement**
  Module manifests declare a license from a curated list. Community directory
  filters can search by license (open only, CC variants). Attribution metadata
  flows into the import report: "This module includes content by [author] under
  [license]." In the importer, if a module includes non-commercial content, a
  reminder that the installed content may have use restrictions is displayed before
  installation completes.

---

## Epic 12.4 — Public Campaign Wiki & Live Sharing

**Goal:** DMs can publish a beautiful, public-facing campaign wiki from their vault
with one command. Players can bookmark and read it between sessions. The wiki is
a living document that updates as the vault does.

**Stories:**

- **S12.4.1 — Campaign wiki publish workflow**
  Add Settings → Sharing → Publish Wiki. The DM configures: which folder or tags
  to publish (only `visibility: public` and `visibility: shared` notes are
  eligible), the wiki slug (`username.dndtools.app/my-campaign`), a campaign
  description and hero image, and a theme (default / parchment / modern). Publishing
  triggers a server-side static site generation job that produces the wiki from
  the current vault snapshot. Subsequent publishes update the wiki incrementally.

- **S12.4.2 — Wiki reading experience**
  The published wiki renders vault markdown with wikilinks resolved to inter-page
  links, object embeds rendered as rich cards, and a navigation sidebar matching
  the vault folder structure (filtered to published content only). The wiki is
  fully indexed by search engines (proper meta tags, sitemap, structured data for
  TTRPGs). Mobile-responsive. No DND Tools account required to read.

- **S12.4.3 — Wiki access control and password protection**
  Access modes: Public (indexed, no auth), Unlisted (direct link only, not indexed),
  Password (password required to view, not indexed). Password is set in sharing
  settings and hashed server-side. Visitors enter the password once; a cookie
  persists access for 30 days. Access control is enforced server-side, not in
  JavaScript. The DM can reset the password to revoke access for specific links.

- **S12.4.4 — Session recap publication and subscriber notifications**
  Session recaps published via the I7.5.4 workflow appear as timestamped entries
  on the campaign wiki's home page, styled as a campaign journal. Visitors can
  subscribe to the wiki's RSS feed to receive recap notifications. An optional
  email digest (via AWS SES) sends new recaps to subscriber emails. All
  subscriptions are opt-in and unsubscribe requires one click.

---

---

## Sequencing & Execution Order

The Initiatives are ordered by dependency, not just priority. The execution sequence
for maximum value with minimum rework is:

```
Quarter 1   I1 (Foundation) + I2 (Engineering)          ← P0 gates
Quarter 2   I3 (Knowledge) + I6/E6.4 (a11y)             ← Core product maturity
Quarter 3   I4 (Session) + I5 (AI) + I9 (Maps)          ← DM value props
Quarter 4   I6 (Multi-Platform full) + I10 (Players)    ← All users on all devices
Year 2 Q1   I7 (Collaboration) + I11 (Atmosphere)       ← Network effects + immersion
Year 2 Q2   I8 (Extensibility) + I12 (Community)        ← Platform and ecosystem
```

**Exit gates between phases:**

- Cannot begin I3 until: atomic writes, IPC hardening, and CI pipeline are live.
- Cannot begin I4/I5 until: object system is complete and all MCP tool tests pass.
- Cannot begin I9 until: I3 object system is stable (maps are objects; POIs link
  to notes and objects via the same graph engine).
- Cannot begin I10 until: I4 session tracker and I3 object schemas are complete
  (character sheet builds on the 5e campaign system module).
- Cannot begin I7 until: I6 Android build produces a working APK and I3
  import/export is stable for vault portability across devices.
- Cannot begin I8 until: the campaign system module boundary is formally extracted
  (I8/E8.2) because plugins that register object types depend on it.
- Cannot begin I11 until: I4 session infrastructure is stable (atmosphere triggers
  depend on combat tracker and session board events).
- Cannot begin I12 until: I7 cloud backend is live (directory and wiki require
  hosted infrastructure) and I8 module format is defined.

**Parallel work opportunities within phases:**

- I2 Engineering runs continuously as a support initiative alongside all other work.
- I6.4 (Accessibility) is a continuous obligation, not a one-time effort — each
  new Initiative introduces new components that must meet WCAG 2.1 AA.
- I5 AI tools and I9 Maps can be developed in parallel after I3 is complete.
- I10 Player Suite and I11 Atmosphere are independent after I4 is stable.

**Dependency graph (compact):**

```
I1 → I2 → I3 → I4 → I5
                I3 → I9
                I3 → I6 → I7 → I12
                I4 → I10
                I4 → I11
                I2 → I8 → I12
```

---

## Definition of Done (Cross-Initiative)

Every Initiative is complete only when all its Epics meet these criteria:

1. All Stories reviewed, merged to main, and CI green.
2. Test coverage at or above target thresholds for all affected modules.
3. Docs in `docs/` reflect current behavior — no aspirational claims.
4. Performance budgets measured and within target.
5. Accessibility gate passes (no critical/serious axe violations on primary routes).
6. ADR written (or updated) for any architectural decision made during delivery.
7. Release notes entry drafted for user-visible changes.
8. Privacy impact assessed: no new data collection without explicit user consent.
9. Graceful degradation verified: every new feature defines behavior when its
   dependencies (network, AI, audio context, Electron) are unavailable.
10. Localization-readiness: all user-facing strings in new code use i18n message keys
    (enforced by lint rule once I8.7.1 is complete).

---

## Architecture Quality Standards (Cross-Initiative)

These standards apply to every Story merged after I2 is complete. They are the
implementation expression of the Guiding Principles.

**Boundary enforcement:**

- Renderer code never imports Node-only modules (lint rule, CI-enforced).
- MCP code never imports Svelte/UI modules (lint rule, CI-enforced).
- Route components contain no business logic — they compose domain services and
  display stores. Business logic lives in `src/lib/domain/` or `src/lib/state/`.

**Testing requirements by tier:**

- Domain logic (`src/lib/domain/**`): ≥ 90% branch coverage, pure unit tests.
- MCP tools (`mcp/tools/**`): 100% of write tools, 90% of read tools.
- Storage operations: integration tests with real filesystem via `tmp` directories.
- UI workflows: E2E Playwright tests for all P0 and P1 user-facing stories.
- Performance: benchmark assertions for all operations with hard budgets (I2.5).

**Observability contract:**

- Every new async operation has a `performance.mark` at start and end.
- Every new error path has a taxonomy entry in `src/lib/domain/error-taxonomy.ts`.
- Every new MCP tool response includes structured metadata (timing, vault version,
  tool version) for agent diagnostics.

**Security review checklist (for every PR touching IPC, MCP, or cloud):**

- [ ] All user-controlled input is validated with Zod before any business logic.
- [ ] No new broad IPC channel patterns (explicit channels only).
- [ ] No plaintext storage of credentials or tokens.
- [ ] Threat model doc (`docs/SECURITY.md`) updated if attack surface changes.

---

_This document lives at `docs/MASTER_PLAN.md`. It is the single source of truth for
strategic initiative planning at Tiers 1–3. Epics (Tier 2) are tracked in
`docs/TODO.md`. Stories (Tier 3) are tracked as GitHub issues. Tasks (Tier 4) are
tracked in PR descriptions and commit messages. Atomics (Tier 5) are session-context
only (TodoWrite). See `docs/PLANNING_TIERS.md` for the full hierarchy definition._

---

_12 Initiatives. 62 Epics. The definitive TTRPG companion._
