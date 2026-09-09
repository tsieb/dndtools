# ADR-035: Player-Private Device-Local Store

- Status: Accepted
- Date: 2026-09-07
- Deciders: Engineering
- Consulted: Product, Design, Security
- Supersedes: N/A
- Amends: ADR-004 (the `StorageAdapter` boundary now covers a SECOND, per-character database that is
  deliberately outside the sync/backup/MCP surface) and ADR-019 (which fixed `dndtools-v2` as the one
  device-local database; this adds a second family of databases with the opposite replication
  posture — where ADR-019's blobs are device-local for SIZE reasons and are still referenced by
  replicated metadata, these records are device-local for PRIVACY reasons and are referenced by
  nothing).

## Context

RC-CHR-4.1 gives a player a place to write things their DM must not read: what their character
actually thinks, an annotation on a handout, a running impression of an NPC. Every other write in
the app is a core command against shared table state, which is exactly the wrong shape here — a core
command is dispatched, journalled into the operation log, replicated to joined devices, folded into a
cloud backup, and readable by the assistant's MCP tools. "DM-only" and "player-visible" are both
_table_ visibilities decided by the DM; there is no existing visibility that means _the DM cannot
see this_, and adding one would be a promise the storage layer could not keep.

The requirement is therefore not a new visibility value but a different place to put the bytes.

## Decision

Player-private records live in their **own Dexie database, one per character**, named
`dndtools-private-<characterId>`, owned by `apps/gm-react/src/platform/storage/privateStore.ts`.

Concretely:

1. **Separate database, not a separate table.** `dndtools-v2` (ADR-019) is the database the sync,
   backup and restore paths know how to open; a private table inside it would be one forgotten
   `.toArray()` away from a leak. A different database name is not reachable by any code that does
   not name it, and nothing enumerates databases.
2. **One database per character.** A shared device seats different players in turn. Splitting by
   character means switching seats cannot open someone else's notes, and "forget my notes" is a
   whole-database delete rather than a filtered wipe. An empty character id fails closed rather than
   opening one shared `dndtools-private-` database.
3. **Nothing crosses into the core.** Private records never enter `CoreStateSlice`, the operation
   log, a `SyncOperation`, a cloud backup envelope, or a player view-model. They therefore cannot
   appear in an MCP read, which is derived entirely from core state (ADR-002/025).
4. **Sharing is one explicit act, and it is a command.** The one path from private to shared is the
   player pressing "Share with the DM" on a single NPC impression. That sends an ordinary
   `character.add-journal-entry` command request (`kind: 'npc-impression'`, `visibility: 'shared'`)
   — the host stamps the authenticated identity and the DM's authority decides, exactly like a dice
   roll. The private record keeps a local `sharedAt` stamp written only after the table ACCEPTED,
   and rewriting the body clears the stamp, so the screen never claims the DM has words the DM has
   not been sent.
5. **The isolation is tested, not asserted.** `privateStore.test.ts` carries a three-part leak test:
   the persisted core slice round-trip contains none of the private text; the replicated
   `buildPlayerData` snapshot contains none of it; and an import allowlist proves no module under
   `net/`, `cloud/` or the MCP path imports the store at all. Widening that allowlist requires
   amending this ADR.
6. **No schema version bump anywhere.** Nothing about the shared, persisted, replicated shape
   changes; the private database carries its own independent version, starting at 1.

## Consequences

### Positive

- A player gets a place to write that the app can honestly describe as private, backed by structure
  rather than by a policy flag someone could mis-set.
- The sync, backup and MCP surfaces are unchanged, so nothing that already works can regress.
- Deleting a character's private store is a single database delete — a clean answer to "remove my
  data from this device".

### Negative

- Private notes do **not** sync between a player's own devices and are **not** in a backup. Losing
  the device loses the notes. This is the intended trade: any replication path is a path the DM's
  host could be on. If cross-device private sync is ever wanted it needs its own ADR and its own
  key custody, not a relaxation of this one.
- A second storage family to keep in mind during storage work, and one more place a future migration
  has to consider.
- The privacy guarantee is only as strong as the device: anyone with the player's unlocked device (or
  its IndexedDB) can read the notes. The app says "on this device", not "encrypted".

## Rejected Alternatives

| Alternative                                      | Why Rejected                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A `player-private` visibility on journal entries | The entry would still be core state: in the op log, in a backup, in an MCP read. The DM's own device would hold the bytes. The promise would be a lie. |
| A private table inside `dndtools-v2`             | One unfiltered read on the backup or sync path leaks it; the safety would rest on remembering to exclude it everywhere, forever.                       |
| One private database for the whole device        | A shared device would let the next player open the previous player's notes by taking their seat.                                                       |
| Encrypt private records into shared state        | Adds key custody for no gain: the DM's host would still hold the ciphertext, and a lost key is the same as a lost device, only more confusing.         |
| Keep private notes in a separate "character app" | That app does not exist. The old journal copy pointed at it, which meant the feature was permanently unavailable while claiming to exist elsewhere.    |

## Migration Impact

- Additive only. No existing database, document, schema version or command changes.
- First run creates `dndtools-private-<characterId>` lazily, on the first private write.
- The old `play.journal.privateNote` copy ("author private notes in your full character app") is
  replaced, because that app was never built and the notes now live here.

## Rollback Plan

- Trigger: the private store is implicated in a leak or in a storage-quota regression.
- Rollback action: remove the private panels from `screens/play/Journal.tsx`. The store is imported
  by nothing else (the allowlist test proves it), so the module can be deleted independently.
- Data safety: rolling back strands the private databases on-device but destroys nothing; a re-land
  reads them back. `resetPrivateStore` is the explicit delete.
- Risk: low. No shared state, no schema version, no wire format participates.

## Verification and Evidence

- `apps/gm-react/src/platform/storage/privateStore.ts` — the store, the per-character database name,
  the fail-closed empty-id guard.
- `apps/gm-react/src/platform/storage/privateStore.test.ts` — CRUD, per-character isolation, and the
  three-part leak test (core slice, replicated snapshot, import allowlist).
- `apps/gm-react/src/screens/play/Journal.tsx` — the "Only you" section and the single share path.
- `apps/gm-react/tests/e2e/player-private-notes.spec.ts` — the private records survive a reload and
  never appear in the core state the host replicates.
