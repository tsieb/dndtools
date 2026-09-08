import {
	DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
	isPlaintextUploadPermitted,
	type RegisteredVaultPrivacyMode,
} from '@dndtools/core';
import { parseCopilotSnapshot, type CopilotScope, type CopilotSnapshot } from './contract';

/** Trusted server adapters. Implementations must enforce these scope and atomicity contracts. */
export interface CopilotIndexerPorts {
	/** Resolve membership and registration from server storage, not caller-supplied mode/role. */
	authorize(scope: CopilotScope): Promise<{
		role: 'dm' | 'player' | null;
		registeredMode: RegisteredVaultPrivacyMode | undefined;
	}>;
	/** Use actor-scoped core queries. Never decrypt or inspect an E2EE envelope. */
	readSnapshotForActor(scope: CopilotScope): Promise<unknown>;
	/** One bounded batch; a provider/model change must rebuild the entire index. */
	embed(texts: string[]): Promise<number[][]>;
	/** Atomically replace this account/vault/actor index only if the source revision is still current.
	 * Empty snapshots clear old chunks. Reject stale revisions; never append deleted source chunks. */
	replaceIfCurrent(
		scope: CopilotScope,
		snapshot: CopilotSnapshot,
		vectors: number[][],
	): Promise<boolean>;
}

/** No content reads, embedding calls, or writes before both security gates pass. */
export async function indexCopilotSnapshot(scope: CopilotScope, ports: CopilotIndexerPorts) {
	const record = DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD;
	if (!isPlaintextUploadPermitted('cloud-enhanced', record)) {
		throw new Error('Copilot is waiting for the Cloud-Enhanced security review.');
	}
	const access = await ports.authorize(scope);
	if (access.role !== 'dm' || !isPlaintextUploadPermitted(access.registeredMode, record)) {
		throw new Error('Copilot access is unavailable.');
	}
	const snapshot = parseCopilotSnapshot(await ports.readSnapshotForActor(scope));
	const vectors: number[][] = [];
	let dimensions: number | undefined;
	for (let start = 0; start < snapshot.chunks.length; start += 32) {
		const batch = snapshot.chunks.slice(start, start + 32);
		const embedded = await ports.embed(batch.map((chunk) => chunk.text));
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
	if (!(await ports.replaceIfCurrent(scope, snapshot, vectors))) {
		throw new Error('Copilot index changed. Try again.');
	}
	return { revision: snapshot.revision, chunkCount: snapshot.chunks.length };
}
