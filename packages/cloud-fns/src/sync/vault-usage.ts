// Shared quota initialization and deletion fence for ciphertext and consent writes.
import { getItem, putItemConditional, queryPartition } from '../lib/aws.ts';

const SYNC_OPS_TABLE = process.env.SYNC_OPS_TABLE!;
const USAGE_SK = 'usage#quota';
const SNAPSHOT_SK = 'snapshot#latest';
const nowIso = () => new Date().toISOString();

export class VaultUsageConflict extends Error {}

function positiveIntegerEnv(name: string, fallback: number, maximum: number): number {
	const parsed = Number(process.env[name]);
	return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}
// One primary vault per account. The byte quota includes every accepted operation ciphertext
// plus the ONE currently referenced snapshot; superseded snapshots are deleted immediately.
export const MAX_VAULT_CIPHERTEXT_BYTES = positiveIntegerEnv(
	'MAX_VAULT_CIPHERTEXT_BYTES',
	256 * 1024 * 1024,
	16 * 1024 * 1024 * 1024,
);
export const MAX_VAULT_OPERATIONS = positiveIntegerEnv('MAX_VAULT_OPERATIONS', 50_000, 250_001);

export function usageNumbers(row: Record<string, string>): {
	storedBytes: number;
	operationCount: number;
} {
	const storedBytes = Number(row.storedBytes);
	const operationCount = Number(row.operationCount);
	if (
		!Number.isSafeInteger(storedBytes) ||
		storedBytes < 0 ||
		!Number.isSafeInteger(operationCount) ||
		operationCount < 0
	) {
		throw new Error('invalid vault usage row');
	}
	return { storedBytes, operationCount };
}

/**
 * Lazily initialize quota accounting for pre-quota vaults. Conditional creation serializes
 * concurrent initializers; all new-code writers wait for this row before their atomic quota write.
 * A legacy vault already beyond the operation ceiling is initialized saturated and can still read,
 * replay existing revisions, replace a same-sized snapshot, or delete its backup, but cannot grow.
 */
export async function ensureVaultUsage(pk: string): Promise<Record<string, string>> {
	const key = { vaultId: pk, sk: USAGE_SK };
	const existing = await getItem(SYNC_OPS_TABLE, key, true);
	if (existing) {
		usageNumbers(existing);
		if (existing.state !== 'active') {
			throw new VaultUsageConflict(
				'This cloud backup is being removed and cannot accept new data.',
			);
		}
		return existing;
	}
	const rows = await queryPartition(
		SYNC_OPS_TABLE,
		{ name: 'vaultId', value: pk },
		undefined,
		1000,
		MAX_VAULT_OPERATIONS + 3,
		true,
	);
	const operationRows = rows.filter((row) => row.sk.startsWith('op#'));
	const snapshot = rows.find((row) => row.sk === SNAPSHOT_SK);
	const legacyOverflow = operationRows.length > MAX_VAULT_OPERATIONS;
	let storedBytes = operationRows.reduce((sum, row) => sum + Number(row.size || 0), 0);
	storedBytes += Number(snapshot?.size || 0);
	if (!Number.isSafeInteger(storedBytes) || storedBytes < 0) {
		throw new Error('invalid legacy vault usage');
	}
	if (legacyOverflow) storedBytes = Math.max(storedBytes, MAX_VAULT_CIPHERTEXT_BYTES);
	const initialized = {
		vaultId: pk,
		sk: USAGE_SK,
		storedBytes,
		operationCount: operationRows.length,
		state: 'active',
		schemaVersion: 1,
		updatedAt: nowIso(),
	};
	const created = await putItemConditional(SYNC_OPS_TABLE, initialized, {
		expression: 'attribute_not_exists(#vault)',
		names: { '#vault': 'vaultId' },
	});
	if (created) {
		return Object.fromEntries(
			Object.entries(initialized).map(([name, value]) => [name, String(value)]),
		);
	}
	const winner = await getItem(SYNC_OPS_TABLE, key, true);
	if (!winner) throw new Error('vault usage initialization lost without a winner');
	usageNumbers(winner);
	if (winner.state !== 'active') {
		throw new VaultUsageConflict('This cloud backup is being removed and cannot accept new data.');
	}
	return winner;
}
