// THE CLOUD SYNC ENGINE (Stage 3). Additive over the local-first runtime: it observes accepted
// dispatches (SceneRuntime.onDispatched — the "op-log grew" signal) and, when cloud sync is enabled +
// the user is authed + this device holds the vault key, pushes to the sync-api:
//   - a debounced full-state SNAPSHOT (the materialized restore unit — there is no generic op-applier,
//     so fresh-device restore downloads the latest snapshot, not an op replay), and
//   - the encrypted OP-LOG TAIL (fine-grained durable backup / audit).
// Everything is END-TO-END ENCRYPTED client-side via vaultKeyManager before it leaves the device; the
// server only ever sees ciphertext + the six allowed metadata classes.
//
// Local-first is preserved: the engine never blocks a dispatch, swallows network errors (surfaced as
// status, not thrown), and does nothing at all unless explicitly enabled. Killing the network leaves the
// app fully usable; sync resumes on the next successful push.

import {
	createOperationLog,
	opServerVisibleFields,
	assertServerSeesOnlyAllowedMetadata,
	DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
	type CloudOpRecord,
	type CloudSnapshotRecord,
	type CoreStateSlice,
	type EncryptedEnvelope,
	type SyncOperation,
} from '@dndtools/core';
import type { SceneRuntime } from '../runtime/SceneRuntime';
import { restoreCoreState } from '../platform/storage/coreStore';
import { vaultKeyManager } from './vaultKey';
import { getIdToken } from './auth';

/** The single cloud vault namespace for this account's primary vault (server also scopes by Cognito sub). */
export const CLOUD_VAULT_ID = 'primary';

const PUSH_DEBOUNCE_MS = 1500;
const pushedRevKey = (vaultId: string) => `dndtools:react:cloud-pushed-rev:${vaultId}`;

/** Byte length of a base64url string (no padding): 4 chars → 3 bytes. */
function b64urlBytes(s: string): number {
	return Math.floor((s.length * 3) / 4);
}

/** A snapshot serializes the whole slice; the sync slice's Set isn't JSON-safe, so carry only its ops. */
function normalizeSliceForSnapshot(slice: CoreStateSlice): unknown {
	return { ...slice, sync: { operations: slice.sync.operations } };
}

/** Rebuild a live CoreStateSlice from a decrypted snapshot (reconstruct the op-log incl. its idempotency Set). */
function reviveSlice(parsed: unknown): CoreStateSlice {
	const s = parsed as CoreStateSlice & { sync?: { operations?: SyncOperation[] } };
	return { ...(s as CoreStateSlice), sync: createOperationLog(s.sync?.operations ?? []) };
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
	/** Force a snapshot + op-tail push now. Resolves when done (or throws on hard auth/crypto failure). */
	syncNow(): Promise<void>;
	/** Fresh-device restore from the latest cloud snapshot. Returns 'no-snapshot' if the cloud is empty. */
	restoreFromCloud(): Promise<'restored' | 'no-snapshot'>;
	getStatus(): SyncEngineStatus;
}

export interface SyncEngineOptions {
	runtime: SceneRuntime;
	apiUrl: string;
	vaultId?: string;
	onStatus?: (status: SyncEngineStatus) => void;
}

export function createSyncEngine(opts: SyncEngineOptions): CloudSyncEngine {
	const { runtime, apiUrl, onStatus } = opts;
	const vaultId = opts.vaultId ?? CLOUD_VAULT_ID;
	const base = apiUrl.replace(/\/$/, '');

	let unsubscribe: (() => void) | null = null;
	let debounce: ReturnType<typeof setTimeout> | null = null;
	let inFlight: Promise<void> | null = null;
	const status: SyncEngineStatus = {
		busy: false,
		lastPushedRevision: readPushedRev(),
		lastSyncedAt: null,
		lastError: null,
	};

	function readPushedRev(): number {
		try {
			const raw = window.localStorage.getItem(pushedRevKey(vaultId));
			return raw ? Number(raw) : -1;
		} catch {
			return -1;
		}
	}
	function writePushedRev(rev: number): void {
		status.lastPushedRevision = rev;
		try {
			window.localStorage.setItem(pushedRevKey(vaultId), String(rev));
		} catch {
			/* localStorage unavailable — high-water is best-effort; a re-push is idempotent server-side */
		}
	}
	function emit(): void {
		onStatus?.({ ...status });
	}

	async function authHeaders(): Promise<Record<string, string>> {
		const token = await getIdToken();
		if (!token) throw new Error('Not signed in — cloud sync requires an account.');
		return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
	}

	async function pushOpTail(slice: CoreStateSlice, headers: Record<string, string>): Promise<void> {
		const from = status.lastPushedRevision + 1;
		const ops = slice.sync.operations;
		if (from >= ops.length) return;
		const records: CloudOpRecord[] = [];
		for (let rev = from; rev < ops.length; rev += 1) {
			const op = ops[rev]!;
			const envelope = await vaultKeyManager.encrypt(vaultId, op); // encrypts the WHOLE op (E2EE)
			const meta = {
				participantId: op.actorId,
				revision: rev,
				size: b64urlBytes(envelope.ct),
				contentHash: envelope.contentHash,
				issuedAt: op.issuedAt,
			};
			// Client-side belt: prove we send only allowed metadata classes, no plaintext content.
			assertServerSeesOnlyAllowedMetadata(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, opServerVisibleFields(vaultId, meta));
			records.push({ meta, envelope });
		}
		const res = await fetch(`${base}/vaults/${vaultId}/operations`, {
			method: 'POST',
			headers,
			body: JSON.stringify({ ops: records }),
		});
		if (!res.ok) throw new Error(`op push failed (${res.status})`);
		writePushedRev(ops.length - 1);
	}

	async function pushSnapshot(slice: CoreStateSlice, headers: Record<string, string>): Promise<void> {
		const envelope = await vaultKeyManager.encrypt(vaultId, normalizeSliceForSnapshot(slice));
		const record: CloudSnapshotRecord = {
			meta: {
				revision: slice.sync.operations.length,
				size: b64urlBytes(envelope.ct),
				contentHash: envelope.contentHash,
				issuedAt: new Date().toISOString(),
			},
			envelope,
		};
		const res = await fetch(`${base}/vaults/${vaultId}/snapshot`, {
			method: 'PUT',
			headers,
			body: JSON.stringify(record),
		});
		if (!res.ok) throw new Error(`snapshot push failed (${res.status})`);
	}

	async function doSync(): Promise<void> {
		status.busy = true;
		status.lastError = null;
		emit();
		try {
			const headers = await authHeaders();
			const slice = runtime.authoritativeState;
			await pushOpTail(slice, headers);
			await pushSnapshot(slice, headers);
			status.lastSyncedAt = new Date().toISOString();
		} catch (err) {
			// Network / transient failures are surfaced as status, NOT thrown — local-first stays intact.
			status.lastError = err instanceof Error ? err.message : String(err);
		} finally {
			status.busy = false;
			emit();
		}
	}

	function scheduleSync(): void {
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => {
			debounce = null;
			inFlight = doSync().finally(() => {
				inFlight = null;
			});
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
			if (inFlight) await inFlight;
			await doSync();
		},
		async restoreFromCloud() {
			status.busy = true;
			status.lastError = null;
			emit();
			try {
				const headers = await authHeaders();
				const res = await fetch(`${base}/vaults/${vaultId}/snapshot/latest`, { headers });
				if (res.status === 404) return 'no-snapshot';
				if (!res.ok) throw new Error(`restore fetch failed (${res.status})`);
				const body = (await res.json()) as { meta: { revision: number }; envelope: EncryptedEnvelope };
				const decrypted = await vaultKeyManager.decrypt(vaultId, body.envelope);
				const slice = reviveSlice(decrypted);
				await restoreCoreState(slice);
				await runtime.load(); // reload the runtime from the freshly-restored storage
				writePushedRev(slice.sync.operations.length - 1); // those ops are already in the cloud
				status.lastSyncedAt = new Date().toISOString();
				return 'restored';
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
