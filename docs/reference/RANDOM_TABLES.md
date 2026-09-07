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

Drawing is the `dice.roll-table` command (`handleRollTable`,
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

## 4. Where a DM draws one (RC-SES-2.3)

`/session` carries a **Rollable tables** panel
(`apps/gm-react/src/screens/session/Tables.tsx`). It lists every visible `dice-table`
object from the actor-scoped content read, draws with `dice.roll-table` (so the result
lands in the session roll log with `source: 'table'` beside every other roll), shows the
row the draw selected, and pins a table to quick reference as a `dice-table`
`QuickReferencePanel` (`packages/core/src/queries/quick-reference-query.ts`). A table
whose declared `dice`/`entries` are missing or malformed is not listed at all rather than
offered with a Roll the core would refuse.

Because §2's mapping is CLAMPED, rows are weighted only by how a table is authored —
repeat a row and it comes up more often — and an expression that can roll past the last
row funnels every higher total into it. The panel states that per table rather than
letting the results skew silently. Genuine per-row weight ranges would need a new
optional field on the table object plus a change to `resolveTableDraw`; neither exists.

---

> **Historical note.** Earlier drafts of this document described an Epic 4.7 system of
> markdown notes tagged `random-table` with weighted/range rows, nested `{{table:}}`
> references, a built-in SRD table library, a `roll_table` MCP tool, and `/table` editor
> commands. That was the retired SvelteKit app (`archive/gm-svelte`). None of it exists
> in the current React/core codebase; the `dice-table` model above supersedes it.
