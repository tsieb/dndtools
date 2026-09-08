// THE ENCRYPTED OFF-DEVICE BACKUP ENGINE. Additive over the local-first runtime: it observes accepted
// dispatches (SceneRuntime.onDispatched — the "op-log grew" signal) and, when cloud backup is enabled +
// the user is authed + this device holds the vault key, pushes to the sync-api:
//   - a debounced full-state SNAPSHOT (the materialized manual-restore unit — there is no generic
//     op-applier, so restore downloads the latest snapshot, not an op replay), and
//   - the encrypted OP-LOG TAIL (fine-grained durable backup / audit).
// Everything is END-TO-END ENCRYPTED client-side via vaultKeyManager before it leaves the device; the
// server only ever sees ciphertext + the six allowed metadata classes.
//
// Local-first is preserved: scheduled backups never block a dispatch and record/swallow network errors.
// Explicit syncNow() calls reject so the initiating UI can report failure. Restore only works where the
// same client-held vault key is already present; this engine does not distribute keys to fresh devices.
//
// RC-CLD-2.4 adds the PULL half, which turns the backup into cross-device sync. Before pushing, the
// engine fetches the vault's ciphertext op-log from the sync-api, decrypts it, and hands it to the core
// (`sync.merge-remote`), which compares the two logs and decides what the comparison means. That
// comparison is not optional: the sync-api stores operations FIRST-WRITE-WINS per revision and rejects
// a snapshot below the stored revision, so a second device that pushed blindly had its work silently
// dropped. Now:
//   - `fast-forward` (the cloud strictly contains this device's history) adopts the cloud snapshot, so
//     opening the tablet after editing on the laptop brings the tablet up to date;
//   - `diverged` (both devices moved) applies NOTHING and BLOCKS the push. The core has recorded a
//     durable conflict per entity both devices changed, and the DM resolves them with the same
//     `conflict.resolve` command every other conflict in the vault uses.

import {
	opServerVisibleFields,
	assertServerSeesOnlyAllowedMetadata,
	DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
	type CloudOpRecord,
	type CloudSnapshotRecord,
	type CoreStateSlice,
	type CrossDeviceMergeOutcome,
} from '@dndtools/core';
import {
	MAX_CLOUD_OPERATION_REVISION,
	b64urlBytes,
	parseOperationsResponse,
	parseSnapshotResponse,
	type PulledOperation,
} from './syncWire';
import type { SceneRuntime } from '../runtime/SceneRuntime';
import { restoreCoreState, validateRestoredCoreState } from '../platform/storage/coreStore';
import { vaultKeyManager } from './vaultKey';
import { getIdToken } from './auth';

/** The single cloud vault namespace for this account's primary vault (server also scopes by Cognito sub). */
export const CLOUD_VAULT_ID = 'primary';

const PUSH_DEBOUNCE_MS = 1500;
const MAX_OPS_PER_PUSH = 200;
/** Server-side per-record ceiling; enforce before upload so a large command fails locally and clearly. */
const MAX_OPERATION_CIPHERTEXT_BYTES = 64 * 1024;
const MAX_CLOUD_OPERATION_COUNT = MAX_CLOUD_OPERATION_REVISION + 1;
const CLOUD_PARTICIPANT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** The sync-api returns at most 500 operations per pull; page until it says there is no more. */
const MAX_PULL_PAGES = 600;
/** Conservative ceiling below Lambda/API Gateway synchronous payload limits, including JSON/base64. */
const MAX_SYNC_REQUEST_BYTES = 4 * 1024 * 1024;
// Scope the high-water by the ACCOUNT too: localStorage is per-origin and shared across Cognito
// accounts on one install, so a key scoped only by vaultId ('primary') would let one account's
// pushed-revision bleed into another's engine — skipping real pushes or overwriting the other
// account's op rows (same revision index, different ciphertext).
const pushedRevKey = (accountId: string, vaultId: string) =>
	// v2 deliberately does not reuse v1's high-water: every legacy unbound operation must be pushed
	// once as a context-bound envelope. The server conditionally upgrades matching revisions in place.
	`dndtools:react:cloud-pushed-rev-v2:${accountId}:${vaultId}`;
// The revision this device and the cloud are PROVEN to agree on: every operation up to it matched by
// id in both logs. It is deliberately separate from the pushed high-water — a push that landed says
// nothing about agreement, because the server keeps the FIRST writer of a revision and drops the rest.
// Scoped by account for the same reason the pushed high-water is.
const agreedRevKey = (accountId: string, vaultId: string) =>
	`dndtools:react:cloud-agreed-rev-v1:${accountId}:${vaultId}`;

/** A snapshot serializes the whole slice; the sync slice's Set isn't JSON-safe, so carry only its ops. */
function normalizeSliceForSnapshot(slice: CoreStateSlice): unknown {
	// Presence is ephemeral and may contain current player/session details. Select durable slices rather
	// than spreading CoreStateSlice so a future ephemeral field cannot silently enter cloud backup.
	return {
		scenes: slice.scenes,
		maps: slice.maps,
		permissions: slice.permissions,
		session: slice.session,
		widgets: slice.widgets,
		commandCenter: slice.commandCenter,
		characters: slice.characters,
		content: slice.content,
		encounters: slice.encounters,
		audio: slice.audio,
		mcp: slice.mcp,
		sync: { operations: slice.sync.operations },
	};
}

function jsonBytes(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

/** What a cross-device comparison found. Counts only — no campaign content ever reaches this. */
export interface MergeSummary {
	outcome: CrossDeviceMergeOutcome;
	/** The revision both logs are now proven to agree on. */
	agreedRevision: number;
	/** Operations the cloud holds and this device does not. */
	incomingCount: number;
	/** Operations this device holds and the cloud does not. */
	outgoingCount: number;
	/** Entities both devices changed — each is a durable conflict for the DM. */
	conflictCount: number;
	/** Whether the cloud copy was adopted (only ever on a fast-forward). */
	adopted: boolean;
}

export interface SyncEngineStatus {
	busy: boolean;
	lastPushedRevision: number;
	lastSyncedAt: string | null;
	lastError: string | null;
	/** When this device last compared its history with the cloud. */
	lastMergedAt: string | null;
	/** The last comparison's result. Null until one has run. */
	merge: MergeSummary | null;
}

export interface CloudSyncEngine {
	start(): void;
	stop(): void;
	/**
	 * Force a snapshot + op-tail push now. Rejects on network, auth, or crypto failure, and refuses
	 * outright while the last comparison says this device has diverged — the server keeps the FIRST
	 * writer of each revision, so pushing then would drop this device's work without saying so.
	 */
	syncNow(): Promise<void>;
	/** Compare this device's history with the cloud. Run this BEFORE a push, and on launch. */
	mergeNow(): Promise<MergeSummary>;
	/** Manual same-key restore from the latest cloud snapshot. */
	restoreFromCloud(): Promise<'restored' | 'no-snapshot'>;
	getStatus(): SyncEngineStatus;
}

export interface SyncEngineOptions {
	runtime: SceneRuntime;
	apiUrl: string;
	/** The authenticated account id (Cognito sub) — namespaces the device-local high-water. */
	accountId: string;
	vaultId?: string;
	onStatus?: (status: SyncEngineStatus) => void;
}

export function createSyncEngine(opts: SyncEngineOptions): CloudSyncEngine {
	const { runtime, apiUrl, onStatus } = opts;
	const accountId = opts.accountId || 'anon';
	const vaultId = opts.vaultId ?? CLOUD_VAULT_ID;
	const base = apiUrl.replace(/\/$/, '');

	let unsubscribe: (() => void) | null = null;
	let debounce: ReturnType<typeof setTimeout> | null = null;
	let inFlight: Promise<void> | null = null;
	// Keep the exact encrypted request bodies across ambiguous failures (for example, the
	// server accepted a write but the response was lost). AES-GCM intentionally produces
	// different ciphertext on every encryption; regenerating here would create a second
	// content hash / S3 object version for the same logical revision.
	let pendingSnapshot: { revision: number; body: string } | null = null;
	let pendingOpBatch: { from: number; end: number; body: string } | null = null;
	// The op-count the last successfully-pushed snapshot reflected. A snapshot re-encrypts + re-uploads
	// the WHOLE vault, so skip it when nothing new has been dispatched since the last one.
	let lastSnapshotRev = -1;
	const status: SyncEngineStatus = {
		busy: false,
		lastPushedRevision: readPushedRev(),
		lastSyncedAt: null,
		lastError: null,
		lastMergedAt: null,
		merge: null,
	};

	function readRev(key: string): number {
		try {
			const raw = window.localStorage.getItem(key);
			if (!raw) return -1;
			const parsed = Number(raw);
			return Number.isSafeInteger(parsed) && parsed >= -1 ? parsed : -1;
		} catch {
			return -1;
		}
	}

	function readPushedRev(): number {
		return readRev(pushedRevKey(accountId, vaultId));
	}

	function readAgreedRev(): number {
		return readRev(agreedRevKey(accountId, vaultId));
	}

	function writeAgreedRev(rev: number): void {
		try {
			window.localStorage.setItem(agreedRevKey(accountId, vaultId), String(rev));
		} catch {
			/* localStorage unavailable — the next comparison simply starts from the beginning again */
		}
	}
	function writePushedRev(rev: number): void {
		status.lastPushedRevision = rev;
		try {
			window.localStorage.setItem(pushedRevKey(accountId, vaultId), String(rev));
		} catch {
			/* localStorage unavailable — high-water is best-effort; a re-push is idempotent server-side */
		}
	}
	function emit(): void {
		onStatus?.({ ...status });
	}

	// A merge can nest a restore inside a sync, and each of those reports progress. Count the nesting
	// so an inner step finishing does not tell the UI the whole run is over.
	let busyDepth = 0;
	function enterBusy(): void {
		busyDepth += 1;
		status.busy = true;
		emit();
	}
	function exitBusy(): void {
		busyDepth = Math.max(0, busyDepth - 1);
		status.busy = busyDepth > 0;
		emit();
	}

	async function authHeaders(): Promise<Record<string, string>> {
		const token = await getIdToken();
		if (!token) throw new Error('Not signed in — encrypted cloud backup requires an account.');
		if (jwtSubject(token) !== accountId)
			throw new Error('The signed-in account changed before the backup could start.');
		return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
	}

	function jwtSubject(token: string): string | null {
		try {
			const payload = token.split('.')[1];
			if (!payload) return null;
			const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
			const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
			const parsed = JSON.parse(globalThis.atob(padded)) as { sub?: unknown };
			return typeof parsed.sub === 'string' && parsed.sub ? parsed.sub : null;
		} catch {
			return null;
		}
	}

	async function pushOpTail(slice: CoreStateSlice, headers: Record<string, string>): Promise<void> {
		const ops = slice.sync.operations;
		if (ops.length > MAX_CLOUD_OPERATION_COUNT) {
			throw new Error(
				'Campaign history reached the encrypted cloud-backup limit. Your local campaign is safe; export a local backup before compacting its history.',
			);
		}
		let from = status.lastPushedRevision + 1;
		while (from < ops.length) {
			if (!pendingOpBatch || pendingOpBatch.from !== from) {
				const records: CloudOpRecord[] = [];
				let end = from;
				while (end < ops.length && records.length < MAX_OPS_PER_PUSH) {
					const rev = end;
					const op = ops[rev]!;
					if (
						rev > MAX_CLOUD_OPERATION_REVISION ||
						!CLOUD_PARTICIPANT_ID.test(op.actorId) ||
						op.issuedAt.length > 40 ||
						!Number.isFinite(Date.parse(op.issuedAt))
					) {
						throw new Error(
							'One local campaign change has an actor or timestamp that cloud backup cannot safely accept. Export a local backup and repair imported history before retrying.',
						);
					}
					const envelope = await vaultKeyManager.encrypt(
						{ accountId, vaultId, kind: 'operation', revision: rev },
						op,
					); // encrypts the WHOLE op (E2EE)
					const ciphertextBytes = b64urlBytes(envelope.ct);
					if (ciphertextBytes > MAX_OPERATION_CIPHERTEXT_BYTES) {
						throw new Error(
							'One campaign change is too large for encrypted cloud backup. Your local campaign is safe; export a local backup and reduce that change before retrying.',
						);
					}
					const meta = {
						participantId: op.actorId,
						revision: rev,
						size: ciphertextBytes,
						contentHash: envelope.contentHash,
						issuedAt: op.issuedAt,
					};
					// Client-side belt: prove we send only allowed metadata classes, no plaintext content.
					assertServerSeesOnlyAllowedMetadata(
						DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
						opServerVisibleFields(vaultId, meta),
					);
					const candidate = { meta, envelope };
					const nextBody = JSON.stringify({ ops: [...records, candidate] });
					if (jsonBytes(nextBody) > MAX_SYNC_REQUEST_BYTES) {
						if (records.length === 0) {
							throw new Error(
								'One encrypted operation is too large for a safe cloud-backup request.',
							);
						}
						break;
					}
					records.push(candidate);
					end += 1;
				}
				pendingOpBatch = { from, end, body: JSON.stringify({ ops: records }) };
			}
			const batch = pendingOpBatch;
			const res = await fetch(`${base}/vaults/${vaultId}/operations`, {
				method: 'POST',
				headers,
				body: batch.body,
			});
			if (!res.ok) throw new Error(await responseError(res, 'Operation backup failed'));
			writePushedRev(batch.end - 1);
			from = batch.end;
			if (pendingOpBatch === batch) pendingOpBatch = null;
		}
	}

	async function pushSnapshot(
		slice: CoreStateSlice,
		headers: Record<string, string>,
	): Promise<void> {
		const revision = slice.sync.operations.length;
		if (revision > MAX_CLOUD_OPERATION_COUNT) {
			throw new Error(
				'Campaign history reached the encrypted cloud-backup limit. Your local campaign is safe; export a local backup before compacting its history.',
			);
		}
		if (pendingSnapshot) {
			const upload = pendingSnapshot;
			const res = await fetch(`${base}/vaults/${vaultId}/snapshot`, {
				method: 'PUT',
				headers,
				body: upload.body,
			});
			if (!res.ok) throw new Error(await responseError(res, 'Campaign backup failed'));
			lastSnapshotRev = upload.revision;
			if (pendingSnapshot === upload) pendingSnapshot = null;
			if (revision === lastSnapshotRev) return;
		}
		if (revision === lastSnapshotRev) return; // nothing new since the last snapshot — skip the full re-upload
		const envelope = await vaultKeyManager.encrypt(
			{ accountId, vaultId, kind: 'snapshot', revision },
			normalizeSliceForSnapshot(slice),
		);
		const record: CloudSnapshotRecord = {
			meta: {
				revision,
				size: b64urlBytes(envelope.ct),
				contentHash: envelope.contentHash,
				issuedAt: new Date().toISOString(),
			},
			envelope,
		};
		const body = JSON.stringify(record);
		if (jsonBytes(body) > MAX_SYNC_REQUEST_BYTES) {
			throw new Error(
				'This campaign backup is too large for a safe upload. Export a local backup and compact campaign history before retrying cloud backup.',
			);
		}
		pendingSnapshot = { revision, body };
		const upload = pendingSnapshot;
		const res = await fetch(`${base}/vaults/${vaultId}/snapshot`, {
			method: 'PUT',
			headers,
			body: upload.body,
		});
		if (!res.ok) throw new Error(await responseError(res, 'Campaign backup failed'));
		lastSnapshotRev = revision;
		if (pendingSnapshot === upload) pendingSnapshot = null;
	}

	async function doSync(propagateErrors: boolean): Promise<void> {
		enterBusy();
		status.lastError = null;
		try {
			const headers = await authHeaders();
			// Fail closed on a known divergence: the server keeps the FIRST writer of each revision, so
			// pushing over another device's history would drop this device's work without saying so. The
			// DM resolves the recorded conflicts first; the next comparison then clears this.
			if (status.merge?.outcome === 'diverged') {
				throw new Error(
					'Another device changed this campaign too. Resolve the sync conflicts before backing up.',
				);
			}
			const slice = runtime.authoritativeState;
			// Snapshot FIRST: manual same-key restore is snapshot-only (no op replay), so it must
			// reflect the full current state before we advance the op high-water. If the op-tail push then
			// fails, its high-water is not advanced and it re-pushes next time (idempotent) — but the
			// snapshot already captured those ops, so a restore is never missing them.
			await pushSnapshot(slice, headers);
			await pushOpTail(slice, headers);
			status.lastSyncedAt = new Date().toISOString();
		} catch (err) {
			// Scheduled failures stay in status so local dispatch remains uninterrupted. A manual
			// syncNow() rethrows after recording the same status so its caller can report failure.
			status.lastError = err instanceof Error ? err.message : String(err);
			if (propagateErrors) throw err;
		} finally {
			exitBusy();
		}
	}

	async function responseError(response: Response, fallback: string): Promise<string> {
		try {
			const body = (await response.json()) as { error?: unknown };
			if (typeof body.error === 'string' && body.error.length <= 500) return body.error;
		} catch {
			/* non-JSON gateway error */
		}
		return `${fallback} (${response.status}).`;
	}

	// Serialize every cloud run through a single chain: a debounce-fired push, a syncNow(), a launch
	// comparison, and a dispatch arriving mid-sync must not overlap (they'd read the same high-water,
	// rebuild the same op-tail, and race writePushedRev — duplicate pushes that only the server's
	// idempotency masks). Queue instead. The tracked tail never rejects, so one run's failure does not
	// reject the next queued one; each caller still sees its own rejection.
	function chain<T>(operation: () => Promise<T>): Promise<T> {
		const prior = inFlight ?? Promise.resolve();
		const next = prior.then(operation);
		const tracked: Promise<void> = next
			.then(
				() => undefined,
				() => undefined,
			)
			.finally(() => {
				if (inFlight === tracked) inFlight = null;
			});
		inFlight = tracked;
		return next;
	}

	function runSync(propagateErrors: boolean): Promise<void> {
		return chain(() => doSync(propagateErrors));
	}

	/**
	 * Fetch and decrypt the vault's cloud operations after `since` (exclusive). Every record is
	 * integrity-checked against its server metadata before decryption, and decryption is bound to the
	 * same account/vault/revision context the push used — a record moved to a different revision or a
	 * different account's vault fails to open rather than merging into this campaign.
	 */
	async function pullRemoteOperations(
		headers: Record<string, string>,
		since: number,
	): Promise<PulledOperation[]> {
		const pulled: PulledOperation[] = [];
		let cursor = since;
		for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
			const res = await fetch(
				`${base}/vaults/${vaultId}/operations?since=${encodeURIComponent(String(cursor))}`,
				{ headers },
			);
			if (!res.ok) throw new Error(await responseError(res, 'Reading cloud changes failed'));
			const body = parseOperationsResponse(await res.json());
			for (const record of body.ops) {
				const operation = await vaultKeyManager.decrypt(
					{ accountId, vaultId, kind: 'operation', revision: record.meta.revision },
					record.envelope,
				);
				pulled.push({ revision: record.meta.revision, operation });
			}
			if (!body.hasMore) return pulled;
			if (body.highWater <= cursor) {
				// The server says there is more but did not advance; stop rather than loop forever.
				throw new Error('Reading cloud changes stalled. Try syncing again.');
			}
			cursor = body.highWater;
		}
		throw new Error(
			'This campaign’s cloud history is too long to compare in one pass. Restore this device from the cloud copy instead.',
		);
	}

	/**
	 * Compare this device's history with the cloud's and act on the answer. The CORE does the
	 * comparing and the conflict recording (`sync.merge-remote`); this function only supplies the
	 * decrypted cloud tail and carries out the one outcome that has a transport consequence —
	 * adopting the cloud snapshot when the cloud strictly contains this device's history.
	 */
	async function doMerge(headers: Record<string, string>): Promise<MergeSummary> {
		const since = readAgreedRev();
		const pulled = await pullRemoteOperations(headers, since);
		// The cloud stores each operation at the revision its author assigned, and the local log is
		// indexed the same way, so a gap means the cloud history is not the contiguous run this
		// comparison assumes. Fail closed rather than comparing misaligned positions.
		pulled.forEach((entry, offset) => {
			if (entry.revision !== since + 1 + offset) {
				throw new Error(
					'The cloud change history has a gap. Restore this device from the cloud copy instead.',
				);
			}
		});
		const result = await runtime.dispatch({
			type: 'sync.merge-remote',
			actorId: runtime.defaultActorId,
			payload: {
				remoteOperations: pulled.map((entry) => entry.operation),
				baseRevision: since,
			},
		});
		if (result.status !== 'accepted') {
			throw new Error(result.rejection?.message ?? 'Comparing this device with the cloud failed.');
		}
		const event = result.events?.find((entry) => entry.kind === 'sync.merge-recorded') as
			| {
					outcome: CrossDeviceMergeOutcome;
					agreedRevision: number;
					incomingCount: number;
					outgoingCount: number;
					conflictCount: number;
			  }
			| undefined;
		if (!event) throw new Error('Comparing this device with the cloud returned no result.');
		writeAgreedRev(event.agreedRevision);

		let adopted = false;
		if (event.outcome === 'fast-forward') {
			// Nothing on this device is missing from the cloud, so taking the cloud copy loses nothing
			// and is exactly the merge the user asked for. Divergence never reaches here.
			adopted = (await restoreFromCloud()) === 'restored';
		}
		const summary: MergeSummary = {
			outcome: event.outcome,
			agreedRevision: event.agreedRevision,
			incomingCount: event.incomingCount,
			outgoingCount: event.outgoingCount,
			conflictCount: event.conflictCount,
			adopted,
		};
		status.merge = summary;
		status.lastMergedAt = new Date().toISOString();
		return summary;
	}

	/**
	 * Run a comparison on the same single chain the pushes use, so a merge and a push can never read
	 * the same high-water at once. Always rejects on failure — a comparison that did not finish knows
	 * nothing, and reporting it as "up to date" would be exactly the fake success this engine avoids.
	 * The launch comparison swallows the rejection at its call site; the error stays in status.
	 */
	function runMerge(): Promise<MergeSummary> {
		return chain(async () => {
			enterBusy();
			status.lastError = null;
			try {
				return await doMerge(await authHeaders());
			} catch (err) {
				status.lastError = err instanceof Error ? err.message : String(err);
				throw err;
			} finally {
				exitBusy();
			}
		});
	}

	function scheduleSync(): void {
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => {
			debounce = null;
			void runSync(false);
		}, PUSH_DEBOUNCE_MS);
	}

	async function restoreFromCloud(): Promise<'restored' | 'no-snapshot'> {
		enterBusy();
		status.lastError = null;
		try {
			const headers = await authHeaders();
			const res = await fetch(`${base}/vaults/${vaultId}/snapshot/latest`, { headers });
			if (res.status === 404) return 'no-snapshot';
			if (!res.ok) throw new Error(await responseError(res, 'Cloud restore failed'));
			const body = parseSnapshotResponse(await res.json());
			const context = {
				accountId,
				vaultId,
				kind: 'snapshot' as const,
				revision: body.meta.revision,
			};
			const decrypted = await vaultKeyManager.decrypt(context, body.envelope);
			const slice = validateRestoredCoreState(decrypted);
			if (slice.sync.operations.length !== body.meta.revision) {
				throw new Error(
					'Cloud restore snapshot revision does not match its operation history; the local campaign was not changed.',
				);
			}
			return await runtime.runExclusiveMaintenance(async () => {
				const previous = normalizeSliceForSnapshot(runtime.authoritativeState);
				await restoreCoreState(slice);
				try {
					await runtime.reloadFromStorage();
				} catch (error) {
					// Storage replacement is atomic, and a post-write runtime failure rolls the prior valid
					// slice back before the error is surfaced. A bad restore never strands the user empty.
					await restoreCoreState(previous);
					await runtime.reloadFromStorage();
					throw error;
				}
				writePushedRev(slice.sync.operations.length - 1); // already present in the cloud
				// This device now holds exactly the cloud's history, so the two agree all the way to its
				// end and the next comparison can start there instead of re-reading the whole log.
				writeAgreedRev(slice.sync.operations.length - 1);
				lastSnapshotRev = slice.sync.operations.length;
				status.lastSyncedAt = new Date().toISOString();
				return 'restored' as const;
			});
		} catch (error) {
			status.lastError = error instanceof Error ? error.message : String(error);
			throw error;
		} finally {
			exitBusy();
		}
	}

	return {
		start() {
			if (unsubscribe) return;
			unsubscribe = runtime.onDispatched(() => scheduleSync());
			// Background comparison on launch: whatever the other device did while this one was closed
			// is picked up without the user asking. It runs before the first push is due, so a diverged
			// device is caught before it can overwrite. A failure here stays in status — local work is
			// never blocked by the cloud being unreachable.
			void runMerge().catch(() => undefined);
			scheduleSync(); // capture the current state on enable (first snapshot)
		},
		stop() {
			if (debounce) clearTimeout(debounce);
			debounce = null;
			unsubscribe?.();
			unsubscribe = null;
		},
		async syncNow() {
			if (debounce) {
				clearTimeout(debounce);
				debounce = null;
			}
			await runSync(true);
		},
		mergeNow() {
			return runMerge();
		},
		restoreFromCloud,
		getStatus() {
			return { ...status };
		},
	};
}
