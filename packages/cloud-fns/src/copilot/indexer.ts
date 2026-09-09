import {
	DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
	isPlaintextUploadPermitted,
	type RegisteredVaultPrivacyMode,
} from '@dndtools/core';
import { parseCopilotSnapshot, type CopilotScope, type CopilotSnapshot } from './contract';

/** Trusted server adapters. Implementations must enforce these scope and atomicity contracts. */
export interface CopilotIndexerPorts {
	/** Resolve current membership and registration from server storage on every call; no cached grant. */
	authorize(scope: CopilotScope): Promise<{
		role: 'dm' | 'player' | null;
		registeredMode: RegisteredVaultPrivacyMode | undefined;
	}>;
	/** Enforce current access at the read boundary and use actor-scoped core queries.
	 * Never decrypt or inspect an E2EE envelope. */
	readSnapshotForActor(scope: CopilotScope): Promise<unknown>;
	/** Enforce current access for this scope before disclosing one bounded batch to the provider.
	 * A provider/model change must rebuild the entire index. */
	embed(scope: CopilotScope, texts: string[]): Promise<number[][]>;
	/** Atomically require current DM membership, Cloud-Enhanced registration and source revision
	 * when replacing this account/vault/actor index. Reject access revocation and stale revisions;
	 * never resurrect a revoked index. Empty snapshots clear old chunks, never append deleted ones. */
	replaceIfCurrent(
		scope: CopilotScope,
		snapshot: CopilotSnapshot,
		vectors: number[][],
	): Promise<boolean>;
}

function requireReleaseApproval() {
	const record = DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD;
	if (!isPlaintextUploadPermitted('cloud-enhanced', record)) {
		throw new Error('Copilot is waiting for the Cloud-Enhanced security review.');
	}
	return record;
}

async function requireCurrentAccess(scope: CopilotScope, ports: CopilotIndexerPorts) {
	requireReleaseApproval();
	const access = await ports.authorize(scope);
	const record = requireReleaseApproval();
	if (access.role !== 'dm' || !isPlaintextUploadPermitted(access.registeredMode, record)) {
		throw new Error('Copilot access is unavailable.');
	}
}

/** Recheck access before each disclosure/write; adapters must also enforce it at their I/O boundary. */
export async function indexCopilotSnapshot(inputScope: CopilotScope, ports: CopilotIndexerPorts) {
	// Bind every asynchronous stage to the same server-resolved identity, even if the caller changes it.
	const scope = Object.freeze({
		accountId: inputScope.accountId,
		vaultId: inputScope.vaultId,
		actorId: inputScope.actorId,
	});
	await requireCurrentAccess(scope, ports);
	const snapshot = parseCopilotSnapshot(await ports.readSnapshotForActor(scope));
	const vectors: number[][] = [];
	let dimensions: number | undefined;
	for (let start = 0; start < snapshot.chunks.length; start += 32) {
		const batch = snapshot.chunks.slice(start, start + 32);
		await requireCurrentAccess(scope, ports);
		const embedded = await ports.embed(
			scope,
			batch.map((chunk) => chunk.text),
		);
		if (!Array.isArray(embedded) || embedded.length !== batch.length) {
			throw new Error('Invalid Copilot embeddings.');
		}
		for (const vector of embedded) {
			if (
				!Array.isArray(vector) ||
				vector.length === 0 ||
				vector.length > 4096 ||
				(dimensions !== undefined && vector.length !== dimensions) ||
				!vector.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
				!vector.some((n) => n !== 0)
			)
				throw new Error('Invalid Copilot embeddings.');
			dimensions = vector.length;
			vectors.push([...vector]);
		}
	}
	await requireCurrentAccess(scope, ports);
	if (!(await ports.replaceIfCurrent(scope, snapshot, vectors))) {
		throw new Error('Copilot index changed. Try again.');
	}
	return { revision: snapshot.revision, chunkCount: snapshot.chunks.length };
}
