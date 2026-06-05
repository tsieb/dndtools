import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	dispatchCommand,
	exportContent,
	type CommandResult,
	type ContentExport,
	type CoreCommand,
	type CoreStateSlice,
	type VaultContentState,
} from '../src';

/**
 * CONTENT-008 — FAIL-CLOSED export (the security crux). HARD non-leak assertions:
 *   - a PORTABLE export of a vault containing dm-only content contains NONE of that content's
 *     values/titles, NO absolute paths, NO secrets;
 *   - the DM-BACKUP mode INCLUDES the hidden content but STILL scrubs secrets/paths.
 */

// Device-local secrets surface two ways the redaction choke-point (`diagnostics/redaction.ts`) covers:
// a secret-NAMED structured field (`apiKey`), and a bearer-token-shaped secret in free text.
const SECRET_TOKEN = 'sk-live-ABCDEF0123456789';
const BEARER_IN_BODY = 'Bearer eyJhbGciOiJIUzI1NiZ9.payload.signature';
const ABSOLUTE_PATH = '/Users/dm/vault/secret-notes.md';

/** Build a content state with a dm-only secret note, a player-visible note, and a shared note. */
function vaultWithMixedVisibility(): VaultContentState {
	const now = '2026-06-05T00:00:00.000Z';
	const item = (
		id: string,
		title: string,
		visibility: 'dm-only' | 'player-visible' | 'shared',
		body: string,
		fields: Record<string, unknown> = {},
		sharedWith: string[] = [],
	) => ({
		id,
		kind: 'note' as const,
		title,
		body,
		fields,
		dateFields: {},
		timelineRefs: [],
		visibility,
		sharedWith,
		authorActorId: DM_ACTOR.id,
		createdAt: now,
		deletedAt: null,
		updatedAt: now,
		revision: 1,
	});
	return {
		calendars: {},
		schemaVersion: 1,
		items: {
			'i-secret': item(
				'i-secret',
				'The Lich Phylactery',
				'dm-only',
				`The phylactery is hidden under Highmoor. ${BEARER_IN_BODY} unlocks the vault at ${ABSOLUTE_PATH}.`,
				{ apiKey: SECRET_TOKEN, sourcePath: ABSOLUTE_PATH, tags: ['lore', 'secret'] },
			),
			'i-public': item('i-public', 'The Town of Highmoor', 'player-visible', 'A bustling town.', {
				tags: ['location'],
			}),
			'i-shared': item('i-shared', 'A Rumor for Player', 'shared', 'Whispered word.', {}, [
				PLAYER_ACTOR.id,
			]),
		},
	};
}

function permissionsFor(state: CoreStateSlice) {
	return state.permissions;
}

describe('CONTENT-008 export — portable mode (fail-closed visibility + redaction)', () => {
	it('AC1: a portable export omits dm-only content entirely — no title, body, or values leak', () => {
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const content = vaultWithMixedVisibility();
		const result = exportContent(content, permissionsFor(base), {
			mode: 'portable',
			portableViewerActorId: PLAYER_ACTOR.id,
		});

		const serialized = JSON.stringify(result);
		// HARD non-leak: the dm-only item's title, secret body, secret token, and absolute path are absent.
		expect(serialized).not.toContain('The Lich Phylactery');
		expect(serialized).not.toContain('phylactery');
		expect(serialized).not.toContain(SECRET_TOKEN);
		expect(serialized).not.toContain(ABSOLUTE_PATH);

		// The player-visible item IS present; the shared item (delivered to this player) is present.
		expect(serialized).toContain('The Town of Highmoor');
		expect(serialized).toContain('A Rumor for Player');
		// Two of three items exported; one omitted for visibility; clean self-check passes.
		expect(result.report.exportedItems).toBe(2);
		expect(result.report.omittedForVisibility).toBe(1);
		expect(result.report.clean).toBe(true);
	});

	it('a portable export viewed as an actor with no shared delivery omits the shared item too', () => {
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const content = vaultWithMixedVisibility();
		const result = exportContent(content, permissionsFor(base), {
			mode: 'portable',
			portableViewerActorId: OBSERVER_ACTOR.id,
		});
		// Observer: only player-visible survives; dm-only and the player-targeted shared item are omitted.
		const serialized = JSON.stringify(result);
		expect(result.report.exportedItems).toBe(1);
		expect(serialized).toContain('The Town of Highmoor');
		expect(serialized).not.toContain('A Rumor for Player');
		expect(serialized).not.toContain('The Lich Phylactery');
	});

	it('fail closed: an unknown portable viewer leaks nothing (empty export)', () => {
		const base = buildInitialState(DM_ACTOR);
		const result = exportContent(vaultWithMixedVisibility(), permissionsFor(base), {
			mode: 'portable',
			portableViewerActorId: 'actor-nobody',
		});
		expect(result.report.exportedItems).toBe(0);
		expect(JSON.stringify(result)).not.toContain('Highmoor');
	});
});

describe('CONTENT-008 export — DM-backup mode (includes hidden, still scrubs secrets/paths)', () => {
	it('AC2: the backup includes the hidden content AND a validation report', () => {
		const base = buildInitialState(DM_ACTOR);
		const result = exportContent(vaultWithMixedVisibility(), permissionsFor(base), {
			mode: 'dm-backup',
			portableViewerActorId: '',
		});
		const serialized = JSON.stringify(result);
		// Hidden content is included — the dm-only note's title and (non-secret) prose are present.
		expect(serialized).toContain('The Lich Phylactery');
		expect(result.report.exportedItems).toBe(3);
		expect(result.report.omittedForVisibility).toBe(0);
		// The validation report exists and is clean.
		expect(result.report.mode).toBe('dm-backup');
		expect(result.report.clean).toBe(true);
	});

	it('the DM backup STILL scrubs device-local secrets and absolute paths', () => {
		const base = buildInitialState(DM_ACTOR);
		const result = exportContent(vaultWithMixedVisibility(), permissionsFor(base), {
			mode: 'dm-backup',
			portableViewerActorId: '',
		});
		const serialized = JSON.stringify(result);
		// HARD: the secret-named field value, the bearer token in the body, and the absolute path NEVER
		// appear, even in a DM backup.
		expect(serialized).not.toContain(SECRET_TOKEN);
		expect(serialized).not.toContain(BEARER_IN_BODY);
		expect(serialized).not.toContain(ABSOLUTE_PATH);
		// The secret-named property and the path were redacted, so the item is flagged + the export clean.
		expect(result.report.redactedItems).toBeGreaterThanOrEqual(1);
		expect(result.report.clean).toBe(true);
		const note = result.report.notes.find((n) => n.itemId === 'i-secret');
		expect(note?.severity).toBe('warning');
	});
});

describe('CONTENT-008 export — through the command path', () => {
	function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') throw new Error('expected accepted');
		return result;
	}

	function exportCmd(
		state: CoreStateSlice,
		mode: 'portable' | 'dm-backup',
		actorId: string,
		portableViewerActorId = PLAYER_ACTOR.id,
	): CommandResult {
		const command: CoreCommand = {
			type: 'content.export',
			actorId,
			payload: { mode, portableViewerActorId },
		};
		return dispatchCommand(state, makeEnvironment(), command);
	}

	it('export is DM-only and mutates no durable content', () => {
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const state: CoreStateSlice = { ...base, content: vaultWithMixedVisibility() };

		// A player cannot export.
		const playerResult = exportCmd(state, 'portable', PLAYER_ACTOR.id);
		expect(playerResult.status).toBe('rejected');
		if (playerResult.status === 'rejected') {
			expect(playerResult.rejection.code).toBe('actor-not-authorized');
		}

		// The DM export succeeds; the durable content slice is unchanged (read-only export).
		const beforeContent = JSON.stringify(state.content);
		const dmResult = accepted(exportCmd(state, 'portable', DM_ACTOR.id));
		expect(JSON.stringify(dmResult.nextState.content)).toBe(beforeContent);
		const event = dmResult.events[0] as { kind: string; export: ContentExport; clean: boolean };
		expect(event.kind).toBe('content.exported');
		expect(event.clean).toBe(true);
		// The portable export carried on the event leaks no dm-only content.
		expect(JSON.stringify(event.export)).not.toContain('The Lich Phylactery');
	});
});
