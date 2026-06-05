import { describe, expect, it } from 'vitest';
import {
	CLOUD_SYNC_PREREQUISITE_IDS,
	UNMET_CLOUD_SYNC_SECURITY_MODEL,
	canEnableCloudSync,
	evaluateCloudSyncGate,
	evaluateCloudSyncPrerequisites,
	isCloudSyncEnabled,
	type CloudSyncSecurityModel,
} from '../src';

/**
 * SYNC-017 — the encryption-prerequisite enablement gate. Default OFF, fail-closed. These tests prove
 * the security crux: the gate BLOCKS enablement while any prerequisite is unmet, cloud sync is
 * disabled by default, and a stored/forced enabled flag cannot bypass the security model.
 */

const FULLY_SATISFIED: CloudSyncSecurityModel = {
	encryptionAtRest: true,
	encryptionInTransit: true,
	keyCustodyDeclared: true,
	keyRotationSupported: true,
	recovery: 'supported',
};

describe('SYNC-017 default-off, fail-closed gate', () => {
	it('cloud sync is disabled by default (no input)', () => {
		const gate = evaluateCloudSyncGate();
		expect(gate.enabled).toBe(false);
		expect(gate.canEnable).toBe(false);
		expect(isCloudSyncEnabled()).toBe(false);
	});

	it('the deferred-crypto default model leaves all prerequisites unmet', () => {
		const gate = evaluateCloudSyncGate({ securityModel: UNMET_CLOUD_SYNC_SECURITY_MODEL });
		expect(gate.canEnable).toBe(false);
		expect(new Set(gate.unmetPrerequisiteIds)).toEqual(new Set(CLOUD_SYNC_PREREQUISITE_IDS));
		expect(canEnableCloudSync()).toBe(false);
	});

	it('the gate blocks enable while ANY single prerequisite is unmet', () => {
		const eachUnmet: CloudSyncSecurityModel[] = [
			{ ...FULLY_SATISFIED, encryptionAtRest: false },
			{ ...FULLY_SATISFIED, encryptionInTransit: false },
			{ ...FULLY_SATISFIED, keyCustodyDeclared: false },
			{ ...FULLY_SATISFIED, keyRotationSupported: false },
			{ ...FULLY_SATISFIED, recovery: 'undeclared' },
		];
		for (const model of eachUnmet) {
			const gate = evaluateCloudSyncGate({ securityModel: model });
			expect(gate.canEnable).toBe(false);
			expect(gate.unmetPrerequisiteIds.length).toBe(1);
			expect(canEnableCloudSync(model)).toBe(false);
		}
	});

	it('a stored/forced enabled flag cannot bypass unmet prerequisites', () => {
		// Even if a caller insists cloud sync is "currently enabled", the gate forces it back to
		// disabled while prerequisites are unmet (fail closed).
		const gate = evaluateCloudSyncGate({
			securityModel: UNMET_CLOUD_SYNC_SECURITY_MODEL,
			currentlyEnabled: true,
		});
		expect(gate.canEnable).toBe(false);
		expect(gate.enabled).toBe(false);
		expect(isCloudSyncEnabled({ currentlyEnabled: true })).toBe(false);
	});
});

describe('SYNC-017 gate opens only when the full model is satisfied', () => {
	it('canEnable is true when every prerequisite is met', () => {
		const gate = evaluateCloudSyncGate({ securityModel: FULLY_SATISFIED });
		expect(gate.canEnable).toBe(true);
		expect(gate.unmetPrerequisiteIds).toEqual([]);
		expect(canEnableCloudSync(FULLY_SATISFIED)).toBe(true);
	});

	it('a fully satisfied model is still DISABLED until explicitly opted in (off by default)', () => {
		const gate = evaluateCloudSyncGate({ securityModel: FULLY_SATISFIED });
		expect(gate.enabled).toBe(false);
		expect(gate.summary).toMatch(/off by default/i);
	});

	it('becomes enabled only when the gate allows AND the flag is explicitly true', () => {
		expect(isCloudSyncEnabled({ securityModel: FULLY_SATISFIED, currentlyEnabled: true })).toBe(true);
		expect(isCloudSyncEnabled({ securityModel: FULLY_SATISFIED, currentlyEnabled: false })).toBe(false);
	});
});

describe('SYNC-017 AC3 recovery declaration', () => {
	it('an intentionally-unsupported recovery satisfies the recovery prerequisite', () => {
		const model: CloudSyncSecurityModel = { ...FULLY_SATISFIED, recovery: 'unsupported-by-design' };
		const statuses = evaluateCloudSyncPrerequisites(model);
		const recovery = statuses.find((s) => s.id === 'key-recovery');
		expect(recovery?.met).toBe(true);
		expect(canEnableCloudSync(model)).toBe(true);
	});

	it('an undeclared recovery mode leaves the recovery prerequisite unmet', () => {
		const model: CloudSyncSecurityModel = { ...FULLY_SATISFIED, recovery: 'undeclared' };
		const recovery = evaluateCloudSyncPrerequisites(model).find((s) => s.id === 'key-recovery');
		expect(recovery?.met).toBe(false);
	});
});

describe('SYNC-017 prerequisite status surface', () => {
	it('every prerequisite is reported with a label and a non-empty detail when unmet', () => {
		const statuses = evaluateCloudSyncPrerequisites(UNMET_CLOUD_SYNC_SECURITY_MODEL);
		expect(statuses.map((s) => s.id)).toEqual([...CLOUD_SYNC_PREREQUISITE_IDS]);
		for (const status of statuses) {
			expect(status.label.length).toBeGreaterThan(0);
			expect(status.detail.length).toBeGreaterThan(0);
			expect(status.met).toBe(false);
		}
	});

	it('the blocked summary names how many prerequisites are unmet', () => {
		const gate = evaluateCloudSyncGate();
		expect(gate.summary).toMatch(/Cloud sync is disabled/i);
		expect(gate.summary).toMatch(/security prerequisite/i);
	});
});
