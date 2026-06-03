# DND Tools 0.2.0 Requirements Package

This package is the authoritative v2 requirements set for the DND Tools remake. The former
single-file requirements document has been split by domain to improve traceability, reviewability,
and developer experience.

Authoritative requirements live in `docs/remake-review/requirements/`. The file
`requirements/_archive/legacy-unsplit-source.txt` is retained only as an audit trail for the
pre-split source and is not authoritative.

## Source Basis

Canonical v2 sources:

- `00-vision-brief.md`
- `08-glossary.md`
- `09-architecture-contracts.md`

Evidence sources:

- `01-project-overview.md`
- `05-feature-inventory.md`
- `07-known-defects.md`
- `docs/development/ACCESSIBILITY.md`
- `docs/architecture/SECURITY.md`
- `docs/development/UX_GUIDELINES.md`

When evidence sources conflict with the v2 vision or architecture contracts, the v2 documents win.
Conflicts must be called out in the affected requirement rather than silently resolved.

## Package Map

| File                                      | Domains                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `requirements/00-quality-traceability.md` | Quality standard, glossary addendum, traceability audit, priority corrections |
| `requirements/01-canvas-scene-widgets.md` | CANVAS                                                                        |
| `requirements/02-command-center.md`       | CMD                                                                           |
| `requirements/03-maps.md`                 | MAP                                                                           |
| `requirements/04-characters.md`           | CHAR                                                                          |
| `requirements/05-sessions.md`             | SES                                                                           |
| `requirements/06-content.md`              | CONTENT                                                                       |
| `requirements/07-graph.md`                | GRAPH                                                                         |
| `requirements/08-search.md`               | SRCH                                                                          |
| `requirements/09-sync.md`                 | SYNC                                                                          |
| `requirements/10-collaboration.md`        | COLLAB                                                                        |
| `requirements/11-permissions.md`          | PERM                                                                          |
| `requirements/12-audio.md`                | AUDIO                                                                         |
| `requirements/13-mcp-ai.md`               | MCP                                                                           |
| `requirements/14-platform.md`             | PLAT                                                                          |
| `requirements/15-navigation.md`           | NAV                                                                           |
| `requirements/16-accessibility.md`        | A11Y                                                                          |
| `requirements/17-security.md`             | SEC                                                                           |
| `requirements/18-performance.md`          | PERF                                                                          |
| `requirements/19-constraints.md`          | CON                                                                           |

## Count Audit

This table must be generated or validated from requirement headings during docs validation; it is
not an independent source of truth.

| Domain    |   Count |
| --------- | ------: |
| CANVAS    |      18 |
| CMD       |       8 |
| MAP       |      20 |
| CHAR      |      16 |
| SES       |      12 |
| CONTENT   |      13 |
| GRAPH     |      10 |
| SRCH      |      11 |
| SYNC      |      17 |
| COLLAB    |      14 |
| PERM      |      14 |
| AUDIO     |      13 |
| MCP       |      13 |
| PLAT      |      18 |
| NAV       |      10 |
| A11Y      |      11 |
| SEC       |      12 |
| PERF      |       9 |
| CON       |       6 |
| **Total** | **245** |

## Compatibility Audit

Every Must-have feature requirement has a compatibility row. Compatibility terms are:

- `Offline: yes` means the behavior works with zero network for local or cached data.
- `Offline: no` means the behavior requires network access and has no local equivalent.
- `Offline: degrade` means local state remains safe and usable, but remote delivery, presence, or
  first-time authorization is unavailable.
- `Multi-user: yes` means the behavior is valid in collaborative contexts with actor filtering.
- `Multi-user: no` means the behavior is explicitly single-user.
- `Multi-user: dm-only` means only the DM can perform or administer the behavior in a multi-user
  session.
- `Multi-user: not applicable` means the behavior is build, release, or local platform machinery.
- `Mobile: yes` means the behavior is required without product-level reduction on mobile.
- `Mobile: slim` means the same command and core result are required, but the GUI may use a
  focused, density-reduced surface.
- `Mobile: not applicable` means the behavior applies only to desktop/native-only machinery.
- `Player-safe: yes` means the requirement may operate in player/observer contexts after actor
  filtering.
- `Player-safe: dm-only` means the requirement is a DM-only authoring or administration capability
  and must not expose player data surfaces.

## Traceability Rules

1. Every requirement belongs to a visible capability tree in its domain file.
2. Every noun used repeatedly in a requirement must be defined in `08-glossary.md` or in the
   glossary addendum in `requirements/00-quality-traceability.md`.
3. Acceptance criteria are binary pass/fail checks. Broad statements require enough criteria to
   verify each distinct behavior.
4. Must-have priorities are reserved for capabilities required for the v2 product promise,
   architecture contracts, security/privacy boundaries, local-first behavior, and primary feature
   viability.
5. Missing or intentionally deferred requirements are documented as gaps in
   `requirements/00-quality-traceability.md`; they are not silently omitted.
