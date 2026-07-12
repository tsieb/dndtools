# ADR-023: User-Defined (Custom) Vault Object Types

- Status: Accepted
- Date: 2026-07-11
- Deciders: Engineering
- Consulted: Product, Design, Security
- Supersedes: N/A
- Amends: N/A

## Context

Vault Objects (CONTENT-005) are note-backed `ContentItem`s whose frontmatter is validated against a
**code-defined** subtype schema registry (`packages/core/src/state/vault-object-schema.ts`:
`character`, `quest`, `spell`, …). Every type a DM could use was fixed at build time. The Extensions
screen surfaced this honestly with a "not supported yet" dead end: there was no command to define a
type, so a schema editor would have saved nowhere. DMs who wanted their own shape (a "Tavern", a
"Magic Item") had only the workaround of an unstructured note or a custom widget package.

A decision is needed on **how a DM authors their own object type**, **where those definitions live**,
and **how instances of a custom type are validated and projected** — without forking a second,
parallel object model or weakening the fail-closed validation the built-in types enjoy.

## Decision

Make user-defined types **first-class members of the existing vault-object model** by projecting each
one into the same `VaultObjectSchema` shape the built-in registry uses. There is **no parallel storage
or validation system**.

Concretely:

- A **custom type definition** (`packages/core/src/state/custom-object-type.ts`) carries an id, a
  human label, and an ordered field schema (each field a `key`, a `type` drawn from the CLOSED
  `VaultObjectFieldType` set, `required`, `dmOnly`, `description`). It is a pure, versioned data record.
- Type ids live in a **reserved `custom:<slug>` namespace** whose colon is impossible in any built-in
  subtype, so a custom id can **never collide** with a built-in — enforced at define time and again,
  belt-and-braces, at resolve time (built-in registry always wins).
- Definitions persist in the **existing content slice** (`VaultContentState.customObjectTypes`,
  keyed by id) — no new state document, no schema-version bump beyond the additive field. Hydration is
  tolerant and fail-closed: a malformed/hostile record is dropped rather than poisoning the registry.
- `customObjectTypeToSchema` projects a definition to a `VaultObjectSchema`, and
  `resolveVaultObjectSchema(subtype, customRegistry)` resolves built-in **then** custom. The shared
  `validateObjectFrontmatter` / `syncObjectToNote` / `syncNoteToObject` / `projectObjectFieldsForRole`
  functions take an optional custom registry, so **instances of a custom type flow through the exact
  same validate → persist → frontmatter-sync → actor-filtered-projection path** a built-in object does.
  An unknown subtype (e.g. a since-removed type) fails closed everywhere: nothing is projected to a
  non-DM, only the envelope is serialized, and visibility defaults to `dm-only`.
- Three DM-only commands manage the lifecycle (`content.define-object-type` /
  `content.update-object-type` / `content.delete-object-type`), reusing the **existing vault-authoring
  gate** (`actor.role === 'dm'`) — no new authority is invented. Define is create-only; update
  preserves author/`createdAt` and bumps a revision; each appends a durable op and emits
  `content.object-type-changed`.
- **Delete is refused while any live instance of the type still exists** (`custom-type-in-use`) — the
  safer of the two options — so a definition can never be pulled out from under its objects, orphaning
  them into an unresolvable subtype. The DM removes the instances first.
- Instance authoring reuses the **existing** `content.create-object` / `content.update-object`
  commands: their subtype input now admits a well-formed `custom:` id, and they thread the custom
  registry into validation. An instance with a missing required field, an undeclared field, or an
  unknown type is rejected `object-schema-invalid` exactly as a built-in would be.

## Consequences

### Positive

- The Extensions "not supported yet" dead end becomes a working define → create → list → edit surface;
  custom types appear alongside the built-ins with the same forms, counts, and DM-only field handling.
- Zero new validation/sync/projection code paths: one substrate, one fail-closed contract. A custom
  type's instances inherit every safety property (schema validation, DM-only projection, deterministic
  frontmatter ↔ body sync) for free.
- Core purity is untouched: definitions are pure serializable data in the existing content slice; each
  mutation is an ordinary op that replays deterministically and syncs like any sibling vault command.
- The reserved namespace makes built-in/custom collision structurally impossible, not merely checked.

### Negative

- Editing a type's field schema does not retro-validate existing instances; a removed field's stored
  value is simply dropped on the instance's next edit (the shared `declaredFields` filter drops
  undeclared keys). This is a documented, benign cascade rather than a migration.
- Custom-type metadata is DM-authored and DM-scoped; the actor-filtered read does not deliver the
  definition registry to players (instances still project per-field via the shared visibility rules).
- Delete-blocks-while-in-use trades convenience for safety: bulk-removing a type means removing its
  objects first. Accepted as the fail-closed default.

## Rejected Alternatives

| Alternative                                            | Why Rejected                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A separate custom-object storage + validation subsystem | Duplicates the note-backed substrate, the schema validator, the frontmatter sync, and the visibility projection; two code paths to keep fail-closed.    |
| Open/free-form objects (no declared schema)            | Loses the fail-closed frontmatter validation that is the whole point of a "type"; can't drive forms/columns; can't enforce DM-only fields.              |
| Custom types as custom widget packages (existing seam) | Widgets model scene vocabulary, not vault records; no note backing, wikilinks, calendar dates, or content visibility — a different problem.             |
| Cascade-delete a type's instances with it              | Silent bulk data loss; a fat-fingered type delete would tombstone every tavern. Blocking-while-in-use is the safer, recoverable default.                |
| Storing definitions in a new top-level state slice      | Unnecessary new document + schema version + hydration seam; the content slice already owns the object model these types extend.                          |

## Migration Impact

- `packages/core`: additive `VaultContentState.customObjectTypes` (hydrated fail-closed, older vaults
  restore with an empty registry); new `state/custom-object-type.ts`; the shared vault-object
  state/schema functions gain an **optional** custom-registry parameter (built-in-only callers
  unaffected); new `commands/custom-object-type.ts`; three command types, one event kind, and four
  rejection codes added; `createVaultObjectInputSchema.subtype` widened to admit a `custom:` id.
- `apps/gm-react`: the Extensions "Custom object types" panel becomes a real define/list/edit UI plus
  an instance-create dialog, all dispatching the new/updated commands through the runtime. No restyle,
  no new design tokens.
- No deploy, no infra, no cloud-contract change: definitions and instances sync as ordinary content ops.

## Rollback Plan

- Trigger: a defect in custom-type validation/projection, or unexpected authoring confusion.
- Steps: revert the app UI to a passive "not supported" panel (or hide it) — the command handlers can
  remain dormant. The `customObjectTypes` field is additive and inert when empty; leaving it in place
  is harmless.
- Data recovery: custom-type definitions and their instances are ordinary content records; a rollback
  that removes the resolver simply degrades their instances to the fail-closed unknown-subtype states
  (envelope-only serialization, nothing projected to non-DM) without data loss.

## Verification and Evidence

- Model + projection: `packages/core/src/state/custom-object-type.ts`,
  `packages/core/src/state/vault-object-schema.ts` (`resolveVaultObjectSchema`),
  `packages/core/src/state/vault-object.ts` (custom-registry threading).
- Commands: `packages/core/src/commands/custom-object-type.ts`,
  `packages/core/src/commands/vault-object.ts`, wired in `packages/core/src/commands/dispatch.ts`.
- Tests: `packages/core/tests/content-custom-object-type.test.ts` (24 tests: definition validation
  fail-closed, DM-only authority, define/update/delete lifecycle, instance validation fail-closed,
  delete-blocked-while-in-use, DM-only field projection, tolerant hydration).
- App: `apps/gm-react/src/screens/Extensions.tsx` (`CustomObjectTypes`,
  `CustomObjectInstanceDialog`).
