# DND Tools Documentation Index

This folder is the project source of truth for product direction, architecture, and engineering standards.

## Project Goals

1. Build a local-first D&D notes app that works fully offline.
2. Keep the app lightweight for low-end devices (initial bundle target: < 100KB gzipped).
3. Support markdown + Obsidian-style wikilinks with backlinks and search.
4. Preserve user trust with autosave, soft delete, and exportable data.
5. Evolve cleanly toward cloud sync and collaborative features without rewriting core layers.
6. Provide structured AI agent access via an MCP server for campaign planning and note management.

## Current Status

- The repository is currently documentation-first.
- Roadmap implementation starts at Phase 0 in `docs/ROADMAP.md`.
- Documents define the target architecture and development standards to apply as code is scaffolded.

## Documentation Map

- `docs/README.md`: Documentation index and source-of-truth ownership.
- `docs/ROADMAP.md`: Product sequencing and milestone exit criteria.
- `docs/ARCHITECTURE.md`: System layering and data flow.
- `docs/DATA_MODEL.md`: Canonical data contracts and `StorageAdapter` interface.
- `docs/TECH_STACK.md`: Technology choices and dependency constraints.
- `docs/UX_GUIDELINES.md`: UX principles, accessibility, and interaction behavior.
- `docs/DEVELOPMENT.md`: Coding standards, workflow, and contributor practices.
- `docs/TESTING.md`: Test strategy, organization, and CI expectations.
- `CLAUDE.md`: Agent-focused implementation guardrails.

## Consistency Rules

1. `docs/DATA_MODEL.md` owns data contracts (`Note`, `AppSettings`, `StorageAdapter`, `FileSystemAdapter`).
2. `docs/ROADMAP.md` owns phase ordering and delivery scope.
3. `docs/UX_GUIDELINES.md` owns UX/accessibility interaction expectations.
4. `docs/ARCHITECTURE.md` owns the MCP server design and layer responsibilities.
5. Other docs should reference these sources rather than redefining contracts.
6. Any behavior change must update all impacted docs in the same change.
