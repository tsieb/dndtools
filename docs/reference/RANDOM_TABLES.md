# Random Generation and Tables

This document defines the production contract for Epic 4.7 random generation.

## 1. Vault Random Table Format

Random tables are normal markdown notes tagged `random-table` with a fenced block:

````md
---
title: Loot Table
tags: [random-table]
---

```random-table
3 | 10 gp
1 | Potion of healing
1 | {{table: Trinkets}}
```
````

Rules:

- `weight | result` sets direct weight (`3 | ...` means weight 3).
- `start-end | result` creates range weight (`5-8 | ...` means weight 4).
- Nested table references are supported via `{{table: Name}}` or `[[table: Name]]`.
- Cycles and runaway nesting are rejected safely.

## 2. Built-In System Library

The app ships read-only 5e/SRD-oriented system tables (`source: system`) for:

- Encounters by terrain (`dungeon`, `wilderness`, `urban`)
- NPC personality matrices (trait, bond, flaw, ideal)
- Treasure hoards by tier
- Weather by climate
- Dungeon room content
- Tavern names
- Name tables (common/northern/desert) for NPC/location generation

System tables can be copied into vault notes for customization from the Generator panel.

## 3. MCP Tool

`roll_table` rolls by table name with strict contract validation:

- input: `name`, optional `includeSystem`, optional `maxDepth`
- output: resolved result text, references, trace, index counts

## 4. Editor and Reader Workflow

- In editor:
  - `/table <name>` + Enter inserts `{{roll: Name}}`
  - Insert menu includes direct roll-block insertion
- In reading mode:
  - roll blocks render as interactive dice controls
  - repeated rolls append history under the block
  - accepting a result replaces the block in note content

## 5. Context-Aware Generation

NPC quick generation is algorithmic (no AI dependency):

- Uses vault notes/objects + link graph degree for weighted context.
- Faction/location/name candidates prefer high-signal vault entities.
- Active region culture (from session context location metadata) biases name tables.
- New NPC names are de-duplicated against existing NPC roster.
