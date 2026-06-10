import { describe, expect, it } from 'vitest';
import {
	AUTHORITATIVE_OWNERS,
	CANONICAL_FIELD_SIGNAL_KEYS,
	CORE_CONTENT_OWNERSHIP,
	NON_AUTHORITATIVE_STORE_CLASSES,
	SOURCE_OF_TRUTH_VERSION,
	auditSourceOfTruthOwnership,
	findWidgetLocalSourceOfTruthViolation,
	isWidgetLocalSourceOfTruth,
	summarizeSourceOfTruth,
	vaultUsableWithoutCloud,
	type CoreContentOwnership,
	type SourceOfTruthProblem,
} from '../src';

/**
 * CON-005 — THE SOURCE-OF-TRUTH CONSTRAINT GATE. CON-005's statement: "The system must never treat cloud
 * storage, external sources, generated snapshots, player-device caches, or widget-local state as the sole
 * source of truth for core vault content." Its acceptance criteria:
 *
 *   AC1 — Given cloud storage is UNAVAILABLE, when LOCAL authoritative content exists, then the vault
 *         REMAINS USABLE and CAN QUEUE OPERATIONS.
 *   AC2 — Given a widget persists LOCAL STATE, when inspected, then CANONICAL ENTITY DATA still resides in
 *         the owning ENTITY / SESSION / MAP state document.
 *
 * This file IS the gate. It mirrors the established mechanical-gate meta-tests (CON-003/004/006, SEC-008,
 * PLAT-010): the constraint is the single source of truth, and reality is cross-checked against it so the
 * project can never silently make a derived/remote/cache/widget store the sole source of truth. The
 * adversarial blocks at the bottom prove the gate goes RED on a deliberate source-of-truth violation and
 * GREEN on the real codebase.
 */

function kinds(problems: SourceOfTruthProblem[]): string[] {
	return problems.map((p) => p.kind).sort();
}

describe('CON-005 AC1 — the vault remains usable and can queue operations when cloud is unavailable', () => {
	it('with cloud off, the vault stays usable and the durable operation log is written locally', () => {
		expect(vaultUsableWithoutCloud()).toBe(true);
	});
});

describe('CON-005 AC2 — canonical entity data never lives solely in widget-local state', () => {
	it('accepts transient/declared presentation state in widget-local state', () => {
		const transient = { collapsed: true, activeTab: 'stats', scrollTop: 120, lastHoveredId: 'w-3' };
		expect(findWidgetLocalSourceOfTruthViolation(transient)).toBeNull();
		expect(isWidgetLocalSourceOfTruth(transient)).toBe(false);
	});

	it('rejects a widget-local state that persists a canonical field (e.g. hp / characterData / grants)', () => {
		for (const key of ['hp', 'characterData', 'noteBody', 'grants', 'fogOperations']) {
			const finding = findWidgetLocalSourceOfTruthViolation({ [key]: 'canonical' });
			expect(finding?.kind, `"${key}" should be flagged`).toBe('canonical-field-in-local-state');
			expect(finding?.message).toMatch(/CON-005 AC2/);
			expect(isWidgetLocalSourceOfTruth({ [key]: 'canonical' })).toBe(true);
		}
	});

	it('is case / separator insensitive on canonical field keys', () => {
		expect(findWidgetLocalSourceOfTruthViolation({ 'current-hp': 5 })?.kind).toBe(
			'canonical-field-in-local-state',
		);
		expect(findWidgetLocalSourceOfTruthViolation({ Character_Data: {} })?.kind).toBe(
			'canonical-field-in-local-state',
		);
	});

	it('rejects a widget-local state that declares itself authoritative / the source of truth', () => {
		const finding = findWidgetLocalSourceOfTruthViolation({ authoritative: true, value: 7 });
		expect(finding?.kind).toBe('authoritative-flag');
		expect(findWidgetLocalSourceOfTruthViolation({ isCanonical: true })?.kind).toBe(
			'authoritative-flag',
		);
		expect(findWidgetLocalSourceOfTruthViolation({ sourceOfTruth: true })?.kind).toBe(
			'authoritative-flag',
		);
	});

	it('an authoritative FLAG that is not set to true is not a violation by itself', () => {
		expect(findWidgetLocalSourceOfTruthViolation({ authoritative: false })).toBeNull();
	});

	it('a non-object widget-local state makes no canonical claim (null/undefined/primitive)', () => {
		expect(findWidgetLocalSourceOfTruthViolation(null)).toBeNull();
		expect(findWidgetLocalSourceOfTruthViolation(undefined)).toBeNull();
		expect(findWidgetLocalSourceOfTruthViolation('collapsed')).toBeNull();
	});

	it('every canonical signal key is actually caught', () => {
		for (const key of CANONICAL_FIELD_SIGNAL_KEYS) {
			expect(isWidgetLocalSourceOfTruth({ [key]: 'x' }), `"${key}"`).toBe(true);
		}
	});
});

describe('CON-005 — every core content class is owned by a durable local state document (GREEN)', () => {
	it('the real registry passes the source-of-truth ownership audit with no problems', () => {
		const problems = auditSourceOfTruthOwnership();
		expect(problems, `problems: ${problems.map((p) => p.message).join('; ')}`).toEqual([]);
	});

	it('every content class names an authoritative durable-local owner', () => {
		for (const entry of CORE_CONTENT_OWNERSHIP) {
			expect(AUTHORITATIVE_OWNERS.includes(entry.canonicalOwner), `"${entry.contentClass}"`).toBe(
				true,
			);
		}
	});

	it('no content class is owned by a non-authoritative store class', () => {
		const owners = new Set(CORE_CONTENT_OWNERSHIP.map((e) => e.canonicalOwner));
		for (const store of NON_AUTHORITATIVE_STORE_CLASSES) {
			expect(owners.has(store as never)).toBe(false);
		}
	});

	it('summarizes the constraint as local-is-authoritative', () => {
		const summary = summarizeSourceOfTruth();
		expect(summary.localIsAuthoritative).toBe(true);
		expect(summary.version).toBe(SOURCE_OF_TRUTH_VERSION);
		expect(summary.coreContentClassCount).toBe(CORE_CONTENT_OWNERSHIP.length);
		expect(summary.nonAuthoritativeStoreCount).toBe(NON_AUTHORITATIVE_STORE_CLASSES.length);
	});

	it('exposes a constraint-registry version', () => {
		expect(SOURCE_OF_TRUTH_VERSION).toBe(1);
	});
});

describe('CON-005 — the gate goes RED on a deliberate source-of-truth violation (adversarial)', () => {
	it('RED: a content class owned by cloud-storage is flagged as non-authoritative-owner', () => {
		const rogue: CoreContentOwnership[] = [
			{ contentClass: 'note', canonicalOwner: 'cloud-storage' as never },
		];
		const problems = auditSourceOfTruthOwnership(rogue);
		expect(kinds(problems)).toContain('non-authoritative-owner');
		expect(problems[0]?.message).toMatch(/CON-005/);
	});

	it('RED: a content class owned by widget-local-state / player-device-cache is flagged', () => {
		expect(
			kinds(
				auditSourceOfTruthOwnership([
					{ contentClass: 'character', canonicalOwner: 'widget-local-state' as never },
				]),
			),
		).toContain('non-authoritative-owner');
		expect(
			kinds(
				auditSourceOfTruthOwnership([
					{ contentClass: 'map-entity', canonicalOwner: 'player-device-cache' as never },
				]),
			),
		).toContain('non-authoritative-owner');
	});

	it('RED: a content class with an unknown owner is flagged as unknown-owner', () => {
		expect(
			kinds(
				auditSourceOfTruthOwnership([
					{ contentClass: 'note', canonicalOwner: 'mystery-store' as never },
				]),
			),
		).toContain('unknown-owner');
	});

	it('RED: a duplicate content class is flagged', () => {
		const dupe: CoreContentOwnership[] = [
			{ contentClass: 'note', canonicalOwner: 'vault-state' },
			{ contentClass: 'note', canonicalOwner: 'vault-state' },
		];
		expect(kinds(auditSourceOfTruthOwnership(dupe))).toContain('duplicate-content-class');
	});

	it('GREEN again: a clean fixture (all durable-local owners) passes the audit', () => {
		const clean: CoreContentOwnership[] = [
			{ contentClass: 'note', canonicalOwner: 'vault-state' },
			{ contentClass: 'combat-state', canonicalOwner: 'session-state' },
		];
		expect(auditSourceOfTruthOwnership(clean)).toEqual([]);
	});

	it('is deterministic — identical violating input yields identical problems', () => {
		const input: CoreContentOwnership[] = [
			{ contentClass: 'note', canonicalOwner: 'cloud-storage' as never },
		];
		expect(auditSourceOfTruthOwnership(input)).toEqual(auditSourceOfTruthOwnership(input));
	});
});
