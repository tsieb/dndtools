# ADR-037: Cross-Device Merge by Op-Log Comparison, Not Op Replay

- Status: Accepted
- Date: 2026-09-07
- Deciders: Engineering
- Consulted: Product
- Supersedes: N/A
- Amends: ADR-010 (the three-way conflict resolution it specifies now also has a cross-device
  producer, and offline queue divergence is detected before a push rather than after one)

## Context

Encrypted cloud backup has shipped for a while as a one-way street. A device pushes a full-state
snapshot and its op-log tail; a device can pull the latest snapshot back as an explicit, destructive
restore. Between those two there was nothing, which meant two devices on one account were never
actually synchronised — the second one just quietly lost.

"Quietly" is the part that matters. The sync-api stores each operation under a client-assigned
revision and keeps the FIRST writer of that revision; a later write of the same revision with
different ciphertext is dropped, not rejected. Snapshots are stricter: a `PUT` below the stored
revision returns 409. So a laptop and a tablet that both edited offline produced this: the tablet's
operations vanished on push, its snapshot was refused, and the tablet's status line said the backup
had failed for reasons that had nothing to do with the actual problem. Nothing in the product told
anyone that two devices had diverged, and nothing offered a way to settle it.

The obvious fix is to replay the other device's operations locally. That is not available. An
operation in this system records WHAT changed — entity, path, value, revision — for audit and
durable backup. It is not a re-executable command payload, and there is no generic op-applier
anywhere in the core; the restore path downloads a snapshot precisely because a log cannot be
replayed. Building one would mean a second, parallel write path into every slice, which is exactly
what Architecture Contract 1 exists to prevent.

## Decision

Cross-device sync is a **comparison of two op-logs**, and the comparison drives one of four honest
outcomes. It is never an op-by-op merge.

**1. Compare by operation id, positionally, from an agreed revision.** Operation ids are durable and
globally unique. `packages/core/src/sync/conflict-lifecycle.ts` walks this device's log and the
cloud's from the last revision both are known to share, while the ids match. The matching prefix is
history both devices hold; each remainder is that side's private history. The device stores the new
agreed revision locally (`dndtools:react:cloud-agreed-rev-v1:<account>:<vault>`), so a long history
is compared once, not on every sync. That key is deliberately distinct from the pushed high-water: a
push that landed proves nothing about agreement, because the server may have kept another writer.

**2. Four outcomes, and only one of them touches state.**

| Outcome        | Meaning                                           | What happens                                                           |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| `up-to-date`   | The logs agree                                    | Nothing                                                                |
| `fast-forward` | The cloud strictly contains this device's history | Adopt the cloud snapshot — nothing local is lost, so this is the merge |
| `push-only`    | This device is ahead                              | The ordinary push                                                      |
| `diverged`     | Both sides hold operations the other lacks        | Apply nothing; record conflicts; BLOCK the push                        |

**3. A divergence becomes an ordinary conflict record.** For every entity both devices changed, the
DM-only `sync.merge-remote` command appends one `<entityType>.merge-conflict` operation carrying the
common ancestor revision and each side's newest edit. That opType already satisfies the detection
test in `state/conflict-lifecycle.ts`, so the record derives, displays, and resolves through the
machinery that was already there: the actor-filtered view in `queries/conflict-lifecycle.ts` and the
DM-only `conflict.resolve` command with its audit trail. ADR-010's three-way conflict UI gains a new
producer; it does not gain a second implementation. Conflict record ids are derived from the two
operation ids that produced them, so re-running a comparison is idempotent.

**4. Compare before pushing, and fail closed if you cannot.** The engine refuses a push whenever the
last comparison said `diverged`, because a push then would be silently dropped by the server. The
comparison runs on launch in the background and again ahead of every explicit "Sync now".

## Consequences

A campaign now genuinely follows the user between devices in the common case: edit on one, open the
other, and the second device catches up without being asked. The failure case is no longer silent —
divergence is named on Settings › Sync, per entity, with each version shown and two buttons.

What this does not do is merge two edits to the same thing. The DM picks a side. That is the same
promise ADR-010 made and the same one the character-collaboration path already keeps, so the product
tells one story about conflicts instead of two.

The cost is that a first comparison on an account with a long history reads the whole cloud log once.
Paging is capped; a log too long to compare in one pass says so and points at whole-vault restore
instead of pretending. `fast-forward` adoption replaces local state wholesale, which is safe only
because the comparison proved the local log is a prefix of the cloud's — if that proof is ever
weakened, the adoption must go with it.

SYNC-017 stays open. This changes how two devices reconcile; it does not change the key-custody
model, and it does not distribute a vault key to a device that does not already hold one.
