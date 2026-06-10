import { describe, expect, it } from 'vitest';
import {
	GUI_HIDING_CONSTRAINT_VERSION,
	NON_DM_DELIVERY_SURFACES,
	assertProjectionHasNoDmOnlyField,
	auditGuiHidingReliance,
	findDmOnlyFieldLeaks,
	projectEntityForActor,
	summarizeGuiHidingConstraint,
	type EntityVisibilityMetadata,
	type GuiHidingProblem,
	type NonDmDeliverySurface,
	type StreamPrivacyNeedle,
} from '../src';
import { DM_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

/**
 * CON-001 — THE "GUI HIDING IS NEVER AUTHORITATIVE" CONSTRAINT GATE. CON-001's statement: "The system must
 * never rely on GUI hiding as the authoritative enforcement mechanism for visibility, permissions, sync
 * filtering, or security decisions." Its acceptance criteria:
 *
 *   AC1 — Given a PLAYER QUERY is made for hidden data, when data LEAVES the storage/query layer, then the
 *         hidden data is ALREADY ABSENT.
 *   AC2 — Given a UI component accidentally renders EVERY FIELD it receives, when player data is supplied,
 *         then NO DM-ONLY FIELD is present to leak.
 *
 * This file IS the gate. It mirrors the established mechanical-gate meta-tests (CON-003/004/006 constraint
 * gates, SEC-008 regression-gate coverage, PLAT-010 quality-gate registry): the constraint is the single
 * source of truth, and reality is cross-checked against it so the project can never silently start relying
 * on GUI hiding. The adversarial blocks at the bottom prove the gate goes RED on a deliberate GUI-hiding
 * reliance and GREEN on the real codebase.
 */

/**
 * A DM-only note: a player-visible entity that carries a hidden `dmNotes` field and a hidden `secrets`
 * section. The DM-only field value is the exact secret a leak would expose (`CODEX-PR5-DM-NOTES-LEAK`).
 */
const NOTE_META: EntityVisibilityMetadata = {
	entityType: 'note',
	entityId: 'note-1',
	entity: { level: 'player-visible' },
	sections: { secrets: { level: 'dm-only' }, intro: { level: 'player-visible' } },
	fields: { 'data.dmNotes': { level: 'dm-only' }, 'data.summary': { level: 'player-visible' } },
};

const NOTE_CONTENT = {
	sectionIds: ['intro', 'secrets'],
	fields: {
		'data.summary': 'The party reaches the gate.',
		'data.dmNotes': 'SECRET-AMBUSH-BEHIND-THE-GATE',
	},
};

const DM_NOTES_SECRET = 'SECRET-AMBUSH-BEHIND-THE-GATE';

function kinds(problems: GuiHidingProblem[]): string[] {
	return problems.map((p) => p.kind).sort();
}

describe('CON-001 AC1 — hidden data is already absent when it leaves the storage/query layer', () => {
	it('a player query routed through the data layer omits the DM-only field and section', () => {
		const projection = projectEntityForActor(NOTE_META, NOTE_CONTENT, PLAYER_ACTOR);
		expect(projection.visible).toBe(true);
		// The DM-only field and section are ABSENT from the projection — not redacted downstream, omitted here.
		expect(Object.keys(projection.visibleFields)).toEqual(['data.summary']);
		expect(projection.visibleSectionIds).toEqual(['intro']);
		expect(projection.redactedFieldPaths).toContain('data.dmNotes');
		expect(projection.redactedSectionIds).toContain('secrets');
	});

	it('the DM still receives the full payload (the data layer enforces by actor, not the GUI)', () => {
		const projection = projectEntityForActor(NOTE_META, NOTE_CONTENT, DM_ACTOR);
		expect(projection.visibleFields['data.dmNotes']).toBe(DM_NOTES_SECRET);
		expect(projection.visibleSectionIds).toEqual(['intro', 'secrets']);
	});

	it('fails closed: a hidden entity returns the empty hidden result for a player (not-found shaped)', () => {
		const hiddenMeta: EntityVisibilityMetadata = {
			entityType: 'note',
			entityId: 'note-secret',
			entity: { level: 'dm-only' },
		};
		const projection = projectEntityForActor(hiddenMeta, NOTE_CONTENT, PLAYER_ACTOR);
		expect(projection.visible).toBe(false);
		expect(projection.visibleFields).toEqual({});
		expect(projection.visibleSectionIds).toEqual([]);
	});

	it('fails closed: absent visibility metadata defaults to dm-only (player gets nothing)', () => {
		const bareMeta: EntityVisibilityMetadata = { entityType: 'note', entityId: 'note-bare' };
		const projection = projectEntityForActor(bareMeta, NOTE_CONTENT, PLAYER_ACTOR);
		expect(projection.visible).toBe(false);
	});

	it('fails closed: an unknown/unauthenticated actor receives the empty hidden result', () => {
		const projection = projectEntityForActor(NOTE_META, NOTE_CONTENT, undefined);
		expect(projection.visible).toBe(false);
	});
});

describe('CON-001 AC2 — no DM-only field is present to leak even if a UI renders everything', () => {
	const needles: readonly StreamPrivacyNeedle[] = [
		{ domain: 'notes', kind: 'value', secret: DM_NOTES_SECRET },
		{ domain: 'notes', kind: 'id', secret: 'secrets' },
	];

	it("the player-facing payload carries none of the DM-only secrets (a naive UI render can't leak them)", () => {
		const projection = projectEntityForActor(NOTE_META, NOTE_CONTENT, PLAYER_ACTOR);
		// The GUI renders ONLY the actor-facing subset (visible sections + fields). The redacted-key list
		// on FilteredContent is a DM/diagnostics aid that never reaches a player surface.
		const playerFacing = {
			visible: projection.visible,
			sectionIds: projection.visibleSectionIds,
			fields: projection.visibleFields,
		};
		expect(findDmOnlyFieldLeaks(playerFacing, needles)).toEqual([]);
		expect(() => assertProjectionHasNoDmOnlyField(playerFacing, needles)).not.toThrow();
	});

	it('detects a leak if a surface accidentally hands a DM-only field to a non-DM projection', () => {
		// A regression: the raw content (with the DM-only field) is serialized to a player. The guard catches it.
		const leakyProjection = { fields: NOTE_CONTENT.fields };
		const leaks = findDmOnlyFieldLeaks(leakyProjection, needles);
		expect(leaks.length).toBeGreaterThan(0);
		expect(leaks.some((l) => l.secret === DM_NOTES_SECRET)).toBe(true);
		expect(() => assertProjectionHasNoDmOnlyField(leakyProjection, needles)).toThrow(/CON-001/);
	});

	it('the DM projection legitimately contains the secret (the guard runs only on non-DM projections)', () => {
		const dmProjection = projectEntityForActor(NOTE_META, NOTE_CONTENT, DM_ACTOR);
		expect(findDmOnlyFieldLeaks(dmProjection, needles).some((l) => l.secret === DM_NOTES_SECRET)).toBe(
			true,
		);
	});
});

describe('CON-001 — every non-DM delivery surface enforces at the data layer (GREEN)', () => {
	it('the real registry passes the GUI-hiding-reliance audit with no problems', () => {
		const problems = auditGuiHidingReliance();
		expect(problems, `problems: ${problems.map((p) => p.message).join('; ')}`).toEqual([]);
	});

	it('no declared delivery surface enforces gui-only', () => {
		for (const surface of NON_DM_DELIVERY_SURFACES) {
			expect(surface.enforcement, `"${surface.id}"`).not.toBe('gui-only');
			expect(surface.guardSurface.trim().length).toBeGreaterThan(0);
		}
	});

	it('summarizes the constraint as data-layer enforced', () => {
		const summary = summarizeGuiHidingConstraint();
		expect(summary.dataLayerEnforced).toBe(true);
		expect(summary.version).toBe(GUI_HIDING_CONSTRAINT_VERSION);
		expect(summary.deliverySurfaceCount).toBe(NON_DM_DELIVERY_SURFACES.length);
	});

	it('exposes a constraint-registry version', () => {
		expect(GUI_HIDING_CONSTRAINT_VERSION).toBe(1);
	});
});

describe('CON-001 — the gate goes RED on a deliberate GUI-hiding reliance (adversarial)', () => {
	it('RED: a delivery surface declared gui-only is flagged as gui-only-enforcement', () => {
		const rogue: NonDmDeliverySurface[] = [
			{ id: 'leaky-player-render', enforcement: 'gui-only', guardSurface: 'CSS display:none' },
		];
		const problems = auditGuiHidingReliance(rogue);
		expect(kinds(problems)).toContain('gui-only-enforcement');
	});

	it('RED: a delivery surface with no data-layer guard is flagged as missing-guard-surface', () => {
		const rogue: NonDmDeliverySurface[] = [
			{ id: 'unguarded', enforcement: 'data-layer', guardSurface: '   ' },
		];
		expect(kinds(auditGuiHidingReliance(rogue))).toContain('missing-guard-surface');
	});

	it('RED: a duplicate surface id is flagged', () => {
		const dupe: NonDmDeliverySurface[] = [
			{ id: 'x', enforcement: 'data-layer', guardSurface: 'g' },
			{ id: 'x', enforcement: 'data-layer', guardSurface: 'g' },
		];
		expect(kinds(auditGuiHidingReliance(dupe))).toContain('duplicate-surface-id');
	});

	it('GREEN again: a clean fixture (all data-layer, guarded) passes the audit', () => {
		const clean: NonDmDeliverySurface[] = [
			{ id: 'a', enforcement: 'data-layer', guardSurface: 'filterEntityForActor' },
			{ id: 'b', enforcement: 'sync-stream', guardSurface: 'filterReplicationStream' },
		];
		expect(auditGuiHidingReliance(clean)).toEqual([]);
	});

	it('is deterministic — identical input yields identical problems', () => {
		const input: NonDmDeliverySurface[] = [
			{ id: 'q', enforcement: 'gui-only', guardSurface: '' },
		];
		expect(auditGuiHidingReliance(input)).toEqual(auditGuiHidingReliance(input));
	});
});
