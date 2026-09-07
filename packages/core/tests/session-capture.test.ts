import { describe, expect, it } from 'vitest';
import {
	SESSION_LOG_SUBTYPE,
	VAULT_OBJECT_SUBTYPE_KEY,
	composeSessionLogMarkdown,
	dispatchCommand,
	getCalendarTimelineForActor,
	getContentItemsForActor,
	isEmptySessionLogCapture,
	normalizeSessionLogCapture,
	resolveVaultObjectSchema,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-SES-4.1 — the END-OF-SESSION CAPTURE. One capture writes two durable records through EXISTING
 * commands: the STRUCTURED recap onto the session archive (`session.author-recap`, extended with
 * `happened` / `changes` / `followUps`) and a `session-log` note in the vault
 * (`content.create-item`). The note is a normal content note, so it is readable in Knowledge, and it
 * carries the campaign date, so it lands on the campaign timeline.
 */

const LABELS = { happened: 'What happened', changes: 'What changed', followUps: 'Follow-ups' };

const HARPTOS = {
	id: 'cal-harptos',
	name: 'Calendar of Harptos',
	months: [
		{ id: 'm1', name: 'Hammer', days: 30 },
		{ id: 'm2', name: 'Alturiak', days: 28 },
	],
	epochLabel: 'DR',
};

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status, result.status === 'rejected' ? result.rejection.message : '').toBe(
		'accepted',
	);
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

/** A state whose session has been ended into recap, so an archive exists to capture onto. */
function archivedSession(): { state: CoreStateSlice; env: ReturnType<typeof makeEnvironment> } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	// An active session needs an active Scene, so seed the home Scene first (the same arrangement the
	// prep/recap digest tests use).
	state = accepted(dispatchCommand(state, env, cmd('command-center.ensure-home', {}))).nextState;
	const activeSceneId = state.commandCenter.homeSceneId!;
	state = accepted(
		dispatchCommand(state, env, cmd('session.set-workflow', { workflow: 'prep' })),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, cmd('session.set-workflow', { workflow: 'active', activeSceneId })),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, cmd('session.set-workflow', { workflow: 'recap' })),
	).nextState;
	expect(state.session.recapArchiveId).not.toBeNull();
	return { state, env };
}

describe('RC-SES-4.1 — composing the capture (pure)', () => {
	it('omits a section whose content is empty rather than rendering an empty heading', () => {
		const markdown = composeSessionLogMarkdown(
			{ happened: 'The party burned the manifest.', changes: [], followUps: [] },
			LABELS,
		);
		expect(markdown).toBe('## What happened\n\nThe party burned the manifest.');
	});

	it('renders what happened, the entity chips and the follow-ups in a stable order', () => {
		const markdown = composeSessionLogMarkdown(
			{
				happened: 'The party burned the manifest.',
				changes: [
					{ entityType: 'character', entityId: 'char-1', label: 'Harbour master' },
					{ entityType: 'content-item', entityId: 'item-1', label: 'Dockside quest' },
				],
				followUps: ['Send the guild reply', '  ', 'Name the harbour master'],
			},
			LABELS,
		);
		expect(markdown).toBe(
			[
				'## What happened',
				'',
				'The party burned the manifest.',
				'',
				'## What changed',
				'',
				'- Harbour master',
				'- Dockside quest',
				'',
				'## Follow-ups',
				'',
				'- Send the guild reply',
				'- Name the harbour master',
			].join('\n'),
		);
	});

	it('normalizing is idempotent, and an all-blank capture is empty', () => {
		const raw = {
			happened: '  ',
			changes: [{ entityType: 'character', entityId: 'char-1', label: '  ' }],
			followUps: ['', '   '],
		};
		const once = normalizeSessionLogCapture(raw);
		expect(once).toEqual({ happened: '', changes: [], followUps: [] });
		expect(normalizeSessionLogCapture(once)).toEqual(once);
		expect(isEmptySessionLogCapture(raw)).toBe(true);
	});
});

describe('RC-SES-4.1 — session.author-recap carries the structured capture', () => {
	it('stores what happened, the entity references and the follow-ups on the archive', () => {
		const { state, env } = archivedSession();
		const archiveId = state.session.recapArchiveId!;
		const next = accepted(
			dispatchCommand(
				state,
				env,
				cmd('session.author-recap', {
					archiveId,
					markdown: '## What happened\n\nThe party burned the manifest.',
					happened: 'The party burned the manifest.',
					changes: [{ entityType: 'character', entityId: 'char-1', label: 'Harbour master' }],
					followUps: ['Send the guild reply'],
				}),
			),
		).nextState;

		const recap = next.session.archives[archiveId]!.recap!;
		expect(recap.happened).toBe('The party burned the manifest.');
		expect(recap.changes).toEqual([
			{ entityType: 'character', entityId: 'char-1', label: 'Harbour master' },
		]);
		expect(recap.followUps).toEqual(['Send the guild reply']);
		expect(recap.revision).toBe(1);
	});

	it('a markdown-only recap stores exactly what it always did (the fields stay absent)', () => {
		const { state, env } = archivedSession();
		const archiveId = state.session.recapArchiveId!;
		const next = accepted(
			dispatchCommand(state, env, cmd('session.author-recap', { archiveId, markdown: 'Prose.' })),
		).nextState;
		const recap = next.session.archives[archiveId]!.recap!;
		expect(Object.keys(recap).sort()).toEqual(['authoredAt', 'authoredBy', 'markdown', 'revision']);
	});

	it('a player still cannot author a capture (DM-only, fail closed)', () => {
		const { state, env } = archivedSession();
		const result = dispatchCommand(
			state,
			env,
			cmd(
				'session.author-recap',
				{ markdown: 'Mine now.', happened: 'Mine now.' },
				PLAYER_ACTOR.id,
			),
		);
		expect(result.status).toBe('rejected');
	});

	it('rejects a change reference with no label (a chip must say what it is)', () => {
		const { state, env } = archivedSession();
		const result = dispatchCommand(
			state,
			env,
			cmd('session.author-recap', {
				markdown: 'Prose.',
				changes: [{ entityType: 'character', entityId: 'char-1', label: '' }],
			}),
		);
		expect(result.status).toBe('rejected');
	});
});

describe('RC-SES-4.1 — the session-log note', () => {
	it('is a registered vault-object subtype', () => {
		const schema = resolveVaultObjectSchema(SESSION_LOG_SUBTYPE);
		expect(schema?.subtype).toBe('session-log');
		expect(schema?.defaultVisibility).toBe('dm-only');
	});

	it('lands in the vault as a DM-only note and on the campaign timeline at the campaign date', () => {
		const { state, env } = archivedSession();
		let next = accepted(
			dispatchCommand(state, env, cmd('content.define-calendar', HARPTOS)),
		).nextState;
		next = accepted(
			dispatchCommand(
				next,
				env,
				cmd('session.set-campaign-date', {
					date: { calendarId: HARPTOS.id, year: 1372, month: 1, day: 10 },
				}),
			),
		).nextState;
		next = accepted(
			dispatchCommand(
				next,
				env,
				cmd('content.create-item', {
					kind: 'note',
					title: 'Session log — the drowned vault',
					body: '## What happened\n\nThe party burned the manifest.',
					visibility: 'dm-only',
					fields: {
						[VAULT_OBJECT_SUBTYPE_KEY]: SESSION_LOG_SUBTYPE,
						sessionArchiveId: next.session.recapArchiveId,
						happened: 'The party burned the manifest.',
						followUps: ['Send the guild reply'],
					},
					dateFields: { occurred: { calendarId: HARPTOS.id, year: 1372, month: 1, day: 10 } },
				}),
			),
		).nextState;

		// Knowledge reads the actor-filtered content list and shows `note` items.
		const dmNotes = getContentItemsForActor(next.content, next.permissions, DM_ACTOR.id);
		const log = dmNotes.find((n) => n.fields[VAULT_OBJECT_SUBTYPE_KEY] === SESSION_LOG_SUBTYPE);
		expect(log?.kind).toBe('note');
		expect(log?.title).toBe('Session log — the drowned vault');

		// The Campaign timeline is the same actor-filtered dated read.
		const timeline = getCalendarTimelineForActor(
			next.content,
			next.permissions,
			DM_ACTOR.id,
			HARPTOS.id,
		);
		expect(timeline.some((row) => row.itemId === log!.id)).toBe(true);

		// A player sees neither: the capture is DM only on both surfaces (fail closed).
		expect(
			getContentItemsForActor(next.content, next.permissions, PLAYER_ACTOR.id).some(
				(n) => n.id === log!.id,
			),
		).toBe(false);
		expect(
			getCalendarTimelineForActor(next.content, next.permissions, PLAYER_ACTOR.id, HARPTOS.id).some(
				(row) => row.itemId === log!.id,
			),
		).toBe(false);
	});
});
