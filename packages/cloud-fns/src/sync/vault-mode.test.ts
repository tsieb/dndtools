import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD } from '@dndtools/core';

// RC-CLD-6.1 contract tests for the server-side vault-mode authority. The AWS layer is an in-memory
// fake keyed exactly as DynamoDB would key it (`${partition}|${sk}`), with switches for read and
// write failures. `isPlaintextUploadPermitted` runs the REAL core gate by default; a test that needs
// the post-review posture swaps in `approvedGate`, which opens for a cloud-enhanced registration only,
// so it can prove which registration reached the gate without minting a sanctioned record.
vi.hoisted(() => {
	process.env.SYNC_OPS_TABLE = 'ops';
	process.env.AWS_REGION = 'ca-central-1';
});

const fake = vi.hoisted(() => ({
	items: new Map<string, Record<string, string>>(),
	readFails: false,
	usageReadFails: false,
	writeFails: false,
	reads: [] as Array<{ table: string; key: Record<string, string>; consistent: boolean }>,
	beforeWrite: undefined as undefined | (() => void),
	afterWrite: undefined as undefined | (() => void),
	beforeInitialize: undefined as undefined | (() => void),
}));

vi.mock('../lib/aws.ts', () => {
	const put = async (
		_table: string,
		obj: Record<string, string | number | undefined>,
		condition: { expression: string; values?: Record<string, string | number> },
	) => {
		if (obj.sk === 'usage#quota') fake.beforeInitialize?.();
		if (fake.writeFails) throw new Error('simulated write outage');
		const key = `${obj.vaultId}|${obj.sk}`;
		const existing = fake.items.get(key);
		if (condition.expression === 'attribute_not_exists(#vault)') {
			if (existing) return false;
		} else if (condition.expression === '#generation = :generation AND #owner = :owner') {
			if (
				!existing ||
				existing.generation !== String(condition.values?.[':generation']) ||
				existing.ownerSub !== condition.values?.[':owner']
			) {
				return false;
			}
		} else {
			throw new Error(`unexpected condition ${condition.expression}`);
		}
		const row: Record<string, string> = {};
		for (const [name, value] of Object.entries(obj)) {
			if (value !== undefined) row[name] = String(value);
		}
		fake.items.set(key, row);
		return true;
	};
	return {
		getItem: async (table: string, key: Record<string, string>, consistent = false) => {
			fake.reads.push({ table, key, consistent });
			if (key.sk === 'usage#quota' && fake.usageReadFails)
				throw new Error('simulated usage outage');
			if (key.sk === 'mode#registration' && fake.readFails) throw new Error('simulated outage');
			const row = fake.items.get(`${key.vaultId}|${key.sk}`);
			return row ? { ...row } : undefined;
		},
		putItemConditional: put,
		queryPartition: async (_table: string, pk: { value: string }) =>
			[...fake.items.values()].filter((row) => row.vaultId === pk.value),
		transactQuotaWrite: async (_table: string, write: import('../lib/aws.ts').QuotaWrite) => {
			fake.beforeWrite?.();
			const usage = fake.items.get(`${write.usageKey.vaultId}|${write.usageKey.sk}`);
			if (!usage || usage.state !== 'active') return 'quota-exceeded';
			const { item, condition } = write.items[0]!;
			if (!(await put(_table, item, condition))) return 'item-conflict';
			fake.afterWrite?.();
			return 'written';
		},
		batchDeleteItems: async (_table: string, keys: Array<Record<string, string>>) => {
			for (const key of keys) fake.items.delete(`${key.vaultId}|${key.sk}`);
		},
	};
});

const gate = vi.hoisted(() => ({ approved: false }));
vi.mock('@dndtools/core', async (importOriginal) => {
	const core = await importOriginal<typeof import('@dndtools/core')>();
	return {
		...core,
		isPlaintextUploadPermitted: vi.fn(
			(mode: Parameters<typeof core.isPlaintextUploadPermitted>[0], record) =>
				gate.approved
					? mode === 'cloud-enhanced' &&
						record === core.DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD
					: core.isPlaintextUploadPermitted(mode, record),
		),
	};
});

const core = await import('@dndtools/core');
const {
	CLOUD_ENHANCED_CONSENT_VERSIONS,
	MODE_REGISTRATION_SK,
	ServerReadableRefused,
	VaultModeConflict,
	VaultModeRequestInvalid,
	VaultModeUnavailable,
	describeRegistration,
	readVaultModeRegistration,
	recordVaultModeConsent,
	requireServerReadableVault,
} = await import('./vault-mode.ts');

const alice = { sub: 'alice-sub', vaultId: 'primary' };
const bob = { sub: 'bob-sub', vaultId: 'primary' };
const consent = CLOUD_ENHANCED_CONSENT_VERSIONS[0]!;
const enhanced = JSON.stringify({ mode: 'cloud-enhanced', consentVersion: consent });
const rowKey = (owner: { sub: string; vaultId: string }) =>
	`${owner.sub}#${owner.vaultId}|${MODE_REGISTRATION_SK}`;

beforeEach(() => {
	fake.items.clear();
	fake.reads.length = 0;
	fake.readFails = false;
	fake.usageReadFails = false;
	fake.writeFails = false;
	fake.beforeWrite = undefined;
	fake.afterWrite = undefined;
	fake.beforeInitialize = undefined;
	gate.approved = false;
	vi.mocked(core.isPlaintextUploadPermitted).mockClear();
});

describe('an absent registration reads as Private', () => {
	it('reports Private, unregistered and not server-readable when no row exists', async () => {
		const registration = await readVaultModeRegistration(alice);
		expect(registration).toEqual({ mode: 'private-e2ee', registered: false, generation: 0 });
		expect(describeRegistration(registration)).toEqual({
			mode: 'private-e2ee',
			registered: false,
			serverReadable: false,
		});
	});

	it('refuses the server-readable gate for an unregistered vault, even with an approved record', async () => {
		gate.approved = true;
		await expect(requireServerReadableVault(alice)).rejects.toBeInstanceOf(ServerReadableRefused);
		expect(core.isPlaintextUploadPermitted).toHaveBeenCalledWith(
			'private-e2ee',
			DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
		);
	});

	it('reads with strong consistency so a just-changed mode is never served stale', async () => {
		await readVaultModeRegistration(alice);
		expect(fake.reads).toEqual([
			{
				table: 'ops',
				key: { vaultId: 'alice-sub#primary', sk: MODE_REGISTRATION_SK },
				consistent: true,
			},
			{ table: 'ops', key: { vaultId: 'alice-sub#primary', sk: 'usage#quota' }, consistent: true },
		]);
	});
});

describe('a read failure refuses', () => {
	it('throws VaultModeUnavailable instead of defaulting to any mode', async () => {
		fake.readFails = true;
		await expect(readVaultModeRegistration(alice)).rejects.toBeInstanceOf(VaultModeUnavailable);
	});

	it('refuses the server-readable gate when the read fails, even for a registered vault', async () => {
		await recordVaultModeConsent(alice, enhanced);
		gate.approved = true;
		await expect(requireServerReadableVault(alice)).resolves.toMatchObject({
			mode: 'cloud-enhanced',
		});
		fake.readFails = true;
		await expect(requireServerReadableVault(alice)).rejects.toBeInstanceOf(VaultModeUnavailable);
	});

	it('refuses a consent write when the current registration cannot be read', async () => {
		fake.readFails = true;
		await expect(recordVaultModeConsent(alice, enhanced)).rejects.toBeInstanceOf(
			VaultModeUnavailable,
		);
		expect(fake.items.size).toBe(0);
	});

	it('refuses a consent write when the purge state cannot be read', async () => {
		fake.usageReadFails = true;
		await expect(recordVaultModeConsent(alice, enhanced)).rejects.toBeInstanceOf(
			VaultModeUnavailable,
		);
		expect(fake.items.size).toBe(0);
	});

	it.each([
		['an unknown mode', { mode: 'cloud-everything' }],
		['a missing generation', { generation: undefined }],
		['a zero generation', { generation: '0' }],
		['a non-integer generation', { generation: '1.5' }],
		['an unknown schema version', { schemaVersion: '2' }],
		['a Cloud-Enhanced row without a recognised consent', { consentVersion: 'made-up' }],
		['a Private row carrying a consent version', { mode: 'private-e2ee' }],
		['a missing consent time', { consentedAt: undefined }],
		['a different owner', { ownerSub: 'bob-sub' }],
	])('treats %s as unreadable, not as a mode', async (_label, patch) => {
		await recordVaultModeConsent(alice, enhanced);
		const row = { ...fake.items.get(rowKey(alice))! };
		for (const [name, value] of Object.entries(patch)) {
			if (value === undefined) delete row[name];
			else row[name] = value;
		}
		fake.items.set(rowKey(alice), row);
		await expect(readVaultModeRegistration(alice)).rejects.toBeInstanceOf(VaultModeUnavailable);
		gate.approved = true;
		await expect(requireServerReadableVault(alice)).rejects.toBeInstanceOf(VaultModeUnavailable);
	});
});

describe('a client-supplied mode is never trusted', () => {
	it('keeps the shipped decision record closed even for a registered Cloud-Enhanced vault', async () => {
		await recordVaultModeConsent(alice, enhanced);
		expect(describeRegistration(await readVaultModeRegistration(alice))).toMatchObject({
			mode: 'cloud-enhanced',
			registered: true,
			serverReadable: false,
		});
		await expect(requireServerReadableVault(alice)).rejects.toBeInstanceOf(ServerReadableRefused);
	});

	it('hands the gate the server registration and the imported record, nothing from the caller', async () => {
		gate.approved = true;
		await recordVaultModeConsent(alice, JSON.stringify({ mode: 'private-e2ee' }));
		// A caller that tries to smuggle a mode alongside the owner gets no say in the outcome.
		const smuggled = { ...alice, mode: 'cloud-enhanced', registeredMode: 'cloud-enhanced' };
		await expect(requireServerReadableVault(smuggled)).rejects.toBeInstanceOf(
			ServerReadableRefused,
		);
		expect(core.isPlaintextUploadPermitted).toHaveBeenLastCalledWith(
			'private-e2ee',
			DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
		);
	});

	it('returns the fencing generation so a later write can detect a concurrent mode change', async () => {
		gate.approved = true;
		await recordVaultModeConsent(alice, enhanced);
		const before = await requireServerReadableVault(alice);
		await recordVaultModeConsent(alice, JSON.stringify({ mode: 'private-e2ee' }));
		await recordVaultModeConsent(alice, enhanced);
		const after = await requireServerReadableVault(alice);
		expect(after.generation).toBeGreaterThan(before.generation);
	});

	it.each([
		['a body that is not JSON', 'cloud-enhanced'],
		['an array body', '[]'],
		['an oversized body', JSON.stringify({ mode: 'private-e2ee', pad: 'x'.repeat(2048) })],
		['an unknown mode', JSON.stringify({ mode: 'server-readable' })],
		['Cloud-Enhanced without consent', JSON.stringify({ mode: 'cloud-enhanced' })],
		[
			'Cloud-Enhanced with an unknown consent version',
			JSON.stringify({ mode: 'cloud-enhanced', consentVersion: 'ADR-042-phase-2' }),
		],
		[
			'Private with a consent version',
			JSON.stringify({ mode: 'private-e2ee', consentVersion: consent }),
		],
		['a client-chosen owner', JSON.stringify({ mode: 'private-e2ee', ownerSub: 'bob-sub' })],
		['a client-chosen generation', JSON.stringify({ mode: 'private-e2ee', generation: 99 })],
		[
			'a client-chosen consent time',
			JSON.stringify({
				mode: 'cloud-enhanced',
				consentVersion: consent,
				consentedAt: '2020-01-01',
			}),
		],
		['a client-chosen vault', JSON.stringify({ mode: 'private-e2ee', vaultId: 'bob-sub#primary' })],
	])('rejects %s and writes nothing', async (_label, body) => {
		await expect(recordVaultModeConsent(alice, body)).rejects.toBeInstanceOf(
			VaultModeRequestInvalid,
		);
		expect(fake.items.size).toBe(0);
	});

	it('sets owner, generation and consent time on the server', async () => {
		const result = await recordVaultModeConsent(alice, enhanced);
		expect(result).toMatchObject({ mode: 'cloud-enhanced', registered: true, generation: 1 });
		expect(fake.items.get(rowKey(alice))).toMatchObject({
			vaultId: 'alice-sub#primary',
			sk: MODE_REGISTRATION_SK,
			ownerSub: 'alice-sub',
			mode: 'cloud-enhanced',
			consentVersion: consent,
			generation: '1',
			schemaVersion: '1',
		});
		expect(Number.isFinite(Date.parse(fake.items.get(rowKey(alice))!.consentedAt!))).toBe(true);
	});
});

describe('consent writes', () => {
	it('is idempotent for a replay and keeps the original consent time', async () => {
		const first = await recordVaultModeConsent(alice, enhanced);
		const replay = await recordVaultModeConsent(alice, enhanced);
		expect(replay).toEqual(first);
		expect(fake.items.get(rowKey(alice))?.generation).toBe('1');
	});

	it('advances the generation on every change of mode', async () => {
		await recordVaultModeConsent(alice, enhanced);
		const back = await recordVaultModeConsent(alice, JSON.stringify({ mode: 'private-e2ee' }));
		expect(back).toMatchObject({ mode: 'private-e2ee', registered: true, generation: 2 });
		expect(fake.items.get(rowKey(alice))?.consentVersion).toBeUndefined();
	});

	it('refuses a write that lost a race with another device, leaving the winner intact', async () => {
		await recordVaultModeConsent(alice, JSON.stringify({ mode: 'private-e2ee' }));
		// Another device commits between this request's read and its conditional write.
		fake.beforeWrite = () => {
			fake.beforeWrite = undefined;
			fake.items.set(rowKey(alice), { ...fake.items.get(rowKey(alice))!, generation: '2' });
		};
		await expect(recordVaultModeConsent(alice, enhanced)).rejects.toBeInstanceOf(VaultModeConflict);
		expect(fake.items.get(rowKey(alice))).toMatchObject({ mode: 'private-e2ee', generation: '2' });
	});

	it('refuses the first registration when another device created one concurrently', async () => {
		fake.beforeWrite = () => {
			fake.beforeWrite = undefined;
			fake.items.set(rowKey(alice), {
				vaultId: 'alice-sub#primary',
				sk: MODE_REGISTRATION_SK,
				ownerSub: 'alice-sub',
				mode: 'private-e2ee',
				generation: '1',
				schemaVersion: '1',
				consentedAt: new Date().toISOString(),
			});
		};
		await expect(recordVaultModeConsent(alice, enhanced)).rejects.toBeInstanceOf(VaultModeConflict);
		expect(fake.items.get(rowKey(alice))?.mode).toBe('private-e2ee');
	});

	it('does not record a mode on a vault that is being purged', async () => {
		fake.items.set('alice-sub#primary|usage#quota', {
			state: 'deleting',
			storedBytes: '0',
			operationCount: '0',
		});
		await expect(recordVaultModeConsent(alice, enhanced)).rejects.toBeInstanceOf(VaultModeConflict);
		expect(fake.items.has(rowKey(alice))).toBe(false);
	});

	it.each(['deleting', 'deleted'])(
		'never honors leftover consent behind a %s marker',
		async (state) => {
			await recordVaultModeConsent(alice, enhanced);
			fake.items.set('alice-sub#primary|usage#quota', {
				state,
				storedBytes: '0',
				operationCount: '0',
			});
			expect(await readVaultModeRegistration(alice)).toMatchObject({
				mode: 'private-e2ee',
				registered: false,
			});
			await expect(recordVaultModeConsent(alice, enhanced)).rejects.toBeInstanceOf(
				VaultModeConflict,
			);
			gate.approved = true;
			await expect(requireServerReadableVault(alice)).rejects.toBeInstanceOf(ServerReadableRefused);
		},
	);

	it('cannot resurrect consent when deletion completes before commit and later reads fail', async () => {
		fake.beforeWrite = () => {
			fake.items.set('alice-sub#primary|usage#quota', {
				state: 'deleted',
				storedBytes: '0',
				operationCount: '0',
			});
			fake.items.delete(rowKey(alice));
			fake.usageReadFails = true;
		};
		await expect(recordVaultModeConsent(alice, enhanced)).rejects.toBeInstanceOf(VaultModeConflict);
		expect(fake.items.has(rowKey(alice))).toBe(false);
		fake.usageReadFails = false;
		expect(await readVaultModeRegistration(alice)).toMatchObject({ registered: false });
	});

	it('cannot initialize over a tombstone installed while the marker was absent', async () => {
		fake.beforeInitialize = () => {
			fake.items.set('alice-sub#primary|usage#quota', {
				state: 'deleted',
				storedBytes: '0',
				operationCount: '0',
			});
		};
		await expect(recordVaultModeConsent(alice, enhanced)).rejects.toBeInstanceOf(VaultModeConflict);
		expect(fake.items.has(rowKey(alice))).toBe(false);
		expect(fake.items.get('alice-sub#primary|usage#quota')?.state).toBe('deleted');
	});

	it('needs no writer cleanup if the process stops after commit and purge completes', async () => {
		fake.afterWrite = () => {
			fake.items.set('alice-sub#primary|usage#quota', {
				state: 'deleted',
				storedBytes: '0',
				operationCount: '0',
			});
			fake.items.delete(rowKey(alice));
			throw new Error('process interrupted after commit');
		};
		await expect(recordVaultModeConsent(alice, enhanced)).rejects.toThrow('process interrupted');
		expect(fake.items.has(rowKey(alice))).toBe(false);
		expect(await readVaultModeRegistration(alice)).toMatchObject({ registered: false });
	});

	it('refuses reads and replay when the usage read fails for an existing consent', async () => {
		await recordVaultModeConsent(alice, enhanced);
		fake.usageReadFails = true;
		await expect(readVaultModeRegistration(alice)).rejects.toBeInstanceOf(VaultModeUnavailable);
		await expect(recordVaultModeConsent(alice, enhanced)).rejects.toBeInstanceOf(
			VaultModeUnavailable,
		);
	});

	it.each([undefined, 'unknown'])(
		'refuses a missing or malformed active fence (%s)',
		async (state) => {
			await recordVaultModeConsent(alice, enhanced);
			if (state) fake.items.set('alice-sub#primary|usage#quota', { state });
			else fake.items.delete('alice-sub#primary|usage#quota');
			await expect(readVaultModeRegistration(alice)).rejects.toBeInstanceOf(VaultModeUnavailable);
		},
	);

	it('surfaces a storage write failure without inventing a registration', async () => {
		fake.writeFails = true;
		await expect(recordVaultModeConsent(alice, enhanced)).rejects.toBeInstanceOf(
			VaultModeUnavailable,
		);
		expect(await readVaultModeRegistration(alice)).toMatchObject({ registered: false });
	});
});

describe('cross-tenant isolation of the registration store', () => {
	it('scopes every row to the authenticated owner partition', async () => {
		await recordVaultModeConsent(alice, enhanced);
		expect([...fake.items.keys()].sort()).toEqual([rowKey(alice), 'alice-sub#primary|usage#quota']);
	});

	it("never lets one owner read another owner's registration", async () => {
		await recordVaultModeConsent(alice, enhanced);
		expect(await readVaultModeRegistration(bob)).toEqual({
			mode: 'private-e2ee',
			registered: false,
			generation: 0,
		});
		gate.approved = true;
		await expect(requireServerReadableVault(alice)).resolves.toMatchObject({
			mode: 'cloud-enhanced',
		});
		await expect(requireServerReadableVault(bob)).rejects.toBeInstanceOf(ServerReadableRefused);
	});

	it("never lets one owner's consent change another owner's registration", async () => {
		await recordVaultModeConsent(alice, enhanced);
		await recordVaultModeConsent(bob, JSON.stringify({ mode: 'private-e2ee' }));
		expect(fake.items.get(rowKey(alice))).toMatchObject({
			mode: 'cloud-enhanced',
			generation: '1',
		});
		expect(fake.items.get(rowKey(bob))).toMatchObject({
			mode: 'private-e2ee',
			ownerSub: 'bob-sub',
			generation: '1',
		});
	});

	it("refuses a row copied into another owner's partition", async () => {
		await recordVaultModeConsent(alice, enhanced);
		// Even if a row reached bob's key (restore mistake, operator copy), it still names alice.
		fake.items.set(rowKey(bob), { ...fake.items.get(rowKey(alice))!, vaultId: 'bob-sub#primary' });
		await expect(readVaultModeRegistration(bob)).rejects.toBeInstanceOf(VaultModeUnavailable);
	});

	it("does not let one owner's purge state block another owner's consent", async () => {
		fake.items.set('alice-sub#primary|usage#quota', {
			state: 'deleted',
			storedBytes: '0',
			operationCount: '0',
		});
		await expect(recordVaultModeConsent(bob, enhanced)).resolves.toMatchObject({
			mode: 'cloud-enhanced',
		});
		await expect(recordVaultModeConsent(alice, enhanced)).rejects.toBeInstanceOf(VaultModeConflict);
	});

	it.each([
		['an empty sub', { sub: '', vaultId: 'primary' }],
		['a sub that could alias a partition', { sub: 'alice-sub#primary', vaultId: 'x' }],
		['a sub with a path separator', { sub: 'alice/sub', vaultId: 'primary' }],
		['a vault id that could alias a partition', { sub: 'alice-sub', vaultId: 'primary#x' }],
	])('refuses %s instead of building a key from it', async (_label, owner) => {
		await expect(readVaultModeRegistration(owner)).rejects.toBeInstanceOf(VaultModeUnavailable);
		await expect(recordVaultModeConsent(owner, enhanced)).rejects.toBeInstanceOf(
			VaultModeUnavailable,
		);
		expect(fake.reads).toHaveLength(0);
		expect(fake.items.size).toBe(0);
	});
});
