# Rollable Tables

How rollable tables work in the current app. A rollable table is a **`dice-table`
Vault Object** — a `ContentItem` (`kind: 'object'`) with a declared `dice-table`
subtype. Drawing one is a session action, resolved deterministically in the
framework-free core (SES-008).

## 1. Table shape

A `dice-table` object declares two fields:

- `dice` — a dice expression (e.g. `1d20`, `2d6`), parsed by the core dice engine.
- `entries` — an ordered list of result strings, one per row.

Validation is fail-closed: a table with no dice expression, no rows, or an invalid
expression is rejected before any draw. See `readDiceTable` in
`packages/core/src/commands/dice.ts`.

## 2. Drawing a table

Drawing is the `session.roll-table` command (`handleRollTable`,
`packages/core/src/commands/dice.ts`; input contract `rollTableInputSchema` in
`packages/core/src/schemas/commands.ts`, keyed by `tableItemId`).

Resolution is `resolveTableDraw(dice, entries, seed)` in
`packages/core/src/state/dice.ts`:

- The `dice` expression is rolled deterministically from the draw seed.
- The total maps to a 1-based row (`row N` = total N), **clamped** into `[1, rowCount]`
  so an out-of-band total can never select a missing row.
- Pure and deterministic: the same `(table, seed)` always selects the same row, so
  every session participant sees the same result.

## 3. Authority

A rollable table is a DM session asset. Only the DM — or a player holding a
write-capable grant on the table item — may draw it (`actorMayUseTable`,
`packages/core/src/commands/dice.ts`). This is enforced in core, not the UI.

---

> **Historical note.** Earlier drafts of this document described an Epic 4.7 system of
> markdown notes tagged `random-table` with weighted/range rows, nested `{{table:}}`
> references, a built-in SRD table library, a `roll_table` MCP tool, and `/table` editor
> commands. That was the retired SvelteKit app (`archive/gm-svelte`). None of it exists
> in the current React/core codebase; the `dice-table` model above supersedes it.
