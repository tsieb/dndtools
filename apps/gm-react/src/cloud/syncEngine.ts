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

import {
	opServerVisibleFields,
	assertServerSeesOnlyAllowedMetadata,
	DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
	validateEncryptedEnvelope,
	type CloudOpRecord,
	type CloudSnapshotRecord,
	type CoreStateSlice,
} from '@dndtools/core';
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
const MAX_CLOUD_OPERATION_REVISION = 250_000;
const MAX_CLOUD_OPERATION_COUNT = MAX_CLOUD_OPERATION_REVISION + 1;
const CLOUD_PARTICIPANT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
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

/** Byte length of a base64url string (no padding): 4 chars → 3 bytes. */
function b64urlBytes(s: string): number {
	return Math.floor((s.length * 3) / 4);
}

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

function plainRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseSnapshotResponse(value: unknown): CloudSnapshotRecord {
	if (
		!plainRecord(value) ||
		JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['envelope', 'meta']) ||
		!plainRecord(value.meta) ||
		JSON.stringify(Object.keys(value.meta).sort()) !==
			JSON.stringify(['contentHash', 'issuedAt', 'revision', 'size'])
	) {
		throw new Error('Cloud restore returned an invalid snapshot record.');
	}
	const { revision, size, contentHash, issuedAt } = value.meta;
	if (
		!Number.isSafeInteger(revision) ||
		Number(revision) < 0 ||
		!Number.isSafeInteger(size) ||
		Number(size) < 0 ||
		typeof contentHash !== 'string' ||
		typeof issuedAt !== 'string' ||
		!Number.isFinite(Date.parse(issuedAt))
	) {
		throw new Error('Cloud restore returned invalid snapshot metadata.');
	}
	validateEncryptedEnvelope(value.envelope);
	if (
		value.envelope.contentHash !== contentHash ||
		b64urlBytes(value.envelope.ct) !== Number(size)
	) {
		throw new Error('Cloud restore snapshot metadata does not match its ciphertext.');
	}
	return {
		meta: {
			revision: Number(revision),
			size: Number(size),
			contentHash,
			issuedAt,
		},
		envelope: value.envelope,
	};
}

export interface SyncEngineStatus {
	busy: boolean;
	lastPushedRevision: number;
	lastSyncedAt: string | null;
	lastError: string | null;
}

export interface CloudSyncEngine {
	start(): void;
	stop(): void;
	/** Force a snapshot + op-tail push now. Rejects on network, auth, or crypto failure. */
	syncNow(): Promise<void>;
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
	};

	function readPushedRev(): number {
		try {
			const raw = window.localStorage.getItem(pushedRevKey(accountId, vaultId));
			return raw ? Number(raw) : -1;
		} catch {
			return -1;
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
		status.busy = true;
		status.lastError = null;
		emit();
		try {
			const headers = await authHeaders();
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
			status.busy = false;
			emit();
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

	// Serialize every backup through a single chain: a debounce-fired run, a syncNow(), and a dispatch
	// arriving mid-sync must not run two doSync() concurrently (they'd read the same high-water, rebuild
	// the same op-tail, and race writePushedRev — duplicate pushes that only the server's idempotency
	// masks). Queue instead of overlap. A prior manual rejection is handled before the next queued run.
	function runSync(propagateErrors: boolean): Promise<void> {
		const prior = inFlight ? inFlight.catch(() => undefined) : Promise.resolve();
		const next = prior.then(() => doSync(propagateErrors));
		const tracked = next.finally(() => {
			if (inFlight === tracked) inFlight = null;
		});
		inFlight = tracked;
		return tracked;
	}

	function scheduleSync(): void {
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => {
			debounce = null;
			void runSync(false);
		}, PUSH_DEBOUNCE_MS);
	}

	return {
		start() {
			if (unsubscribe) return;
			unsubscribe = runtime.onDispatched(() => scheduleSync());
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
		async restoreFromCloud() {
			status.busy = true;
			status.lastError = null;
			emit();
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
					lastSnapshotRev = slice.sync.operations.length;
					status.lastSyncedAt = new Date().toISOString();
					return 'restored' as const;
				});
			} catch (error) {
				status.lastError = error instanceof Error ? error.message : String(error);
				throw error;
			} finally {
				status.busy = false;
				emit();
			}
		},
		getStatus() {
			return { ...status };
		},
	};
}
