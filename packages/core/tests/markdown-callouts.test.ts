import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CALLOUT_KINDS,
	dispatchCommand,
	extractCallouts,
	getContentItemDetailForActor,
	getContentItemsForActor,
	listPushableContent,
	parseCalloutMarker,
	stripSecretCallouts,
	type CommandResult,
	type CoreCommand,
} from '../src';

/**
 * RC-KNW-1.1 — markdown callouts. Two things are proven here: the pure parse (which lines belong to a
 * callout, which flavour it is), and the security property the whole story hangs on — a `[!Secret]`
 * callout body is REMOVED BY THE CORE from every projection a non-DM receives. Not blurred, not
 * hidden with CSS: absent from the bytes.
 */

const SECRET_NOTE = [
	'# The Sunken Crypt',
	'',
	'A flooded stair descends into the dark.',
	'',
	'> [!Secret] The real reason',
	'> The lich seeded the flood himself.',
	'> He is watching from the third alcove.',
	'',
	'> [!Lore] Local legend',
	'> Fishermen call it the Drowned King.',
	'',
	'The stair ends at a sealed door.',
].join('\n');

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

describe('RC-KNW-1.1 callout parse (pure)', () => {
	it('recognizes each supported flavour case-insensitively, with and without a title', () => {
		for (const kind of CALLOUT_KINDS) {
			expect(parseCalloutMarker(`> [!${kind}]`)).toEqual({ kind, title: '' });
			expect(parseCalloutMarker(`> [!${kind.toUpperCase()}] A title`)).toEqual({
				kind,
				title: 'A title',
			});
			// Obsidian's fold hints must not defeat recognition.
			expect(parseCalloutMarker(`> [!${kind}]- Folded`)).toEqual({ kind, title: 'Folded' });
		}
	});

	it('leaves a plain blockquote and an unknown flavour unrecognized (degrade, never vanish)', () => {
		expect(parseCalloutMarker('> just a quote')).toBeNull();
		expect(parseCalloutMarker('> [!Todo] not one of ours')).toBeNull();
		expect(extractCallouts('> [!Todo] x\n> y')).toEqual([]);
	});

	it('spans the marker line through the last consecutive quoted line', () => {
		const blocks = extractCallouts(SECRET_NOTE);
		expect(blocks.map((b) => b.kind)).toEqual(['secret', 'lore']);
		expect(blocks[0]!.title).toBe('The real reason');
		expect(blocks[0]!.body).toBe(
			'The lich seeded the flood himself.\nHe is watching from the third alcove.',
		);
		expect(blocks[0]!.startLine).toBe(4);
		expect(blocks[0]!.endLine).toBe(6);
	});

	it('ignores a callout written inside a fenced code block', () => {
		const body = ['```md', '> [!Secret] example syntax', '> not a real secret', '```'].join('\n');
		expect(extractCallouts(body)).toEqual([]);
		expect(stripSecretCallouts(body)).toBe(body);
	});

	it('is total: empty input, a bare marker at EOF, and no callouts all round-trip safely', () => {
		expect(extractCallouts('')).toEqual([]);
		expect(stripSecretCallouts('')).toBe('');
		expect(stripSecretCallouts('plain prose')).toBe('plain prose');
		expect(extractCallouts('> [!Tip]')).toHaveLength(1);
	});
});

describe('RC-KNW-1.1 stripSecretCallouts', () => {
	it('removes the whole secret block and leaves every other callout intact', () => {
		const stripped = stripSecretCallouts(SECRET_NOTE);
		expect(stripped).not.toContain('[!Secret]');
		expect(stripped).not.toContain('lich');
		expect(stripped).not.toContain('third alcove');
		expect(stripped).not.toContain('The real reason');
		expect(stripped).toContain('[!Lore]');
		expect(stripped).toContain('Drowned King');
		expect(stripped).toContain('The stair ends at a sealed door.');
	});

	it('leaves no tell-tale gap where the block was', () => {
		expect(stripSecretCallouts(SECRET_NOTE)).not.toMatch(/\n{3,}/);
	});

	it('removes every secret block when there are several', () => {
		const body = ['> [!Secret]', '> one', '', 'mid', '', '> [!Secret]', '> two'].join('\n');
		const stripped = stripSecretCallouts(body);
		expect(stripped).toBe('mid');
	});
});

describe('RC-KNW-1.1 a player projection never contains a [!Secret] body', () => {
	function withSecretNote() {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.create-item', {
					kind: 'note',
					title: 'The Sunken Crypt',
					body: SECRET_NOTE,
					visibility: 'player-visible',
				}),
			),
		).nextState;
		const itemId = Object.values(state.content.items)[0]!.id;
		return { state, itemId };
	}

	it('strips the secret from the actor-scoped LIST projection but not the DM copy', () => {
		const { state } = withSecretNote();
		const dm = getContentItemsForActor(state.content, state.permissions, DM_ACTOR.id);
		const player = getContentItemsForActor(state.content, state.permissions, PLAYER_ACTOR.id);
		expect(dm[0]!.body).toContain('lich');
		expect(player[0]!.body).not.toContain('lich');
		expect(player[0]!.body).not.toContain('[!Secret]');
		// The rest of the player-visible note is untouched.
		expect(player[0]!.body).toContain('Drowned King');
	});

	it('strips the secret from the actor-scoped DETAIL projection', () => {
		const { state, itemId } = withSecretNote();
		const detail = getContentItemDetailForActor(
			state.content,
			state.permissions,
			PLAYER_ACTOR.id,
			itemId,
		);
		expect(detail.visible).toBe(true);
		if (!detail.visible) throw new Error('expected a visible detail');
		expect(detail.body).not.toContain('lich');
		expect(detail.body).not.toContain('[!Secret]');
	});

	it('strips the secret from the body offered to the push-to-players selector', () => {
		const { state } = withSecretNote();
		const pushable = listPushableContent(state, DM_ACTOR.id);
		expect(pushable).toHaveLength(1);
		expect(pushable[0]!.body).not.toContain('lich');
		expect(pushable[0]!.body).toContain('Drowned King');
	});
});
