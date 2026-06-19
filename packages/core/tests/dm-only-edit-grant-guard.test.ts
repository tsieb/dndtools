import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	dispatchCommand,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';

/**
 * CONTENT-009 AC4 / Architecture Contract 3 (Axis 2 rule 4): a non-DM player can NEVER write to a
 * `dm-only` content item, EVEN when they hold a write-capable grant (`section-editor`/`contributor`)
 * on that item. A grant never bypasses a visibility barrier — the grant is invalid (the DM sees a
 * `write-grant-on-hidden-content` consistency error), so allowing the edit would let the player
 * circumvent the visibility barrier by exploiting a stale grant.
 *
 * The guard exists in `commands/content.ts` (`content.update-item`), but was silently OMITTED from
 * sibling edit paths that copy-pasted the `actorMayEditItem` helper and dropped the dm-only check:
 * `content.update-object` / wikilink rename+repair (vault-object), `dice.append-to-note` (dice), and
 * `content.insert-snippet` (content-templates — its own check is belt-and-suspenders for notes since
 * it re-dispatches through the guarded `content.update-item`, but a dm-only OBJECT re-dispatches
 * through the UNGUARDED vault-object path). Each omission is a fail-OPEN write hole. These tests pin
 * the contract across ALL edit paths so the guard cannot diverge again.
 */

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, ...actors);
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

/** DM grants the player a `section-editor` write grant on the given content item. */
function grantSectionEditor(state: CoreStateSlice, env: CoreEnvironment, itemId: string): CoreStateSlice {
	return accepted(
		dispatchCommand(
			state,
			env,
			cmd('permission.grant-capability-set', {
				entityType: CONTENT_ITEM_ENTITY_TYPE,
				entityId: itemId,
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'section-editor',
			}),
		),
	).nextState;
}

/** DM creates a dm-only note + grants the player a write grant on it. */
function dmOnlyNoteWithPlayerGrant(state: CoreStateSlice = base(), env = makeEnvironment()): {
	state: CoreStateSlice;
	env: CoreEnvironment;
	itemId: string;
} {
	const created = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', { kind: 'note', title: 'Secret', body: 'Original.', visibility: 'dm-only' }),
		),
	);
	const itemId = Object.values(created.nextState.content.items)[0]!.id;
	return { state: grantSectionEditor(created.nextState, env, itemId), env, itemId };
}

/** DM creates a dm-only vault OBJECT + grants the player a write grant on it. */
function dmOnlyObjectWithPlayerGrant(): { state: CoreStateSlice; env: CoreEnvironment; itemId: string } {
	const env = makeEnvironment();
	const created = accepted(
		dispatchCommand(
			base(),
			env,
			cmd('content.create-object', {
				subtype: 'note',
				title: 'Secret object',
				body: 'Original.',
				visibility: 'dm-only',
			}),
		),
	);
	const itemId = Object.values(created.nextState.content.items)[0]!.id;
	return { state: grantSectionEditor(created.nextState, env, itemId), env, itemId };
}

/** An active session (SES gating) so dice can be rolled. */
function activeSession(): { state: CoreStateSlice; env: CoreEnvironment } {
	const env = makeEnvironment();
	const home = accepted(dispatchCommand(base(), env, cmd('command-center.ensure-home', {}))).nextState;
	const active = accepted(
		dispatchCommand(
			home,
			env,
			cmd('session.set-workflow', { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId }),
		),
	).nextState;
	return { state: active, env };
}

describe('CONTENT-009 AC4 — a write grant never lets a non-DM edit a dm-only item', () => {
	it('content.update-item (reference path) already blocks the granted player', () => {
		const { state, env, itemId } = dmOnlyNoteWithPlayerGrant();
		const result = rejected(
			dispatchCommand(state, env, cmd('content.update-item', { itemId, body: 'Hacked.' }, PLAYER_ACTOR.id)),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(state.content.items[itemId]!.body).toBe('Original.');
	});

	it('content.update-object blocks the granted player (vault-object)', () => {
		const { state, env, itemId } = dmOnlyObjectWithPlayerGrant();
		const result = rejected(
			dispatchCommand(state, env, cmd('content.update-object', { itemId, body: 'Hacked.' }, PLAYER_ACTOR.id)),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(state.content.items[itemId]!.body).toBe('Original.');
	});

	it('content.insert-snippet blocks the granted player on a dm-only OBJECT (vault re-dispatch)', () => {
		const { state, env, itemId } = dmOnlyObjectWithPlayerGrant();
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.insert-snippet', { itemId, snippetId: 'stat-line' }, PLAYER_ACTOR.id),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(state.content.items[itemId]!.body).toBe('Original.');
	});

	it('content.insert-snippet blocks the granted player on a dm-only note', () => {
		const { state, env, itemId } = dmOnlyNoteWithPlayerGrant();
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.insert-snippet', { itemId, snippetId: 'stat-line' }, PLAYER_ACTOR.id),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(state.content.items[itemId]!.body).toBe('Original.');
	});

	it('dice.append-to-note blocks the granted player (dice)', () => {
		const session = activeSession();
		const { state, env, itemId } = dmOnlyNoteWithPlayerGrant(session.state, session.env);
		const rolled = accepted(dispatchCommand(state, env, cmd('dice.roll', { expression: '1d6' })));
		const rollId = rolled.nextState.session.diceHistory[0]!.id;
		const result = rejected(
			dispatchCommand(
				rolled.nextState,
				env,
				cmd('dice.append-to-note', { rollId, itemId }, PLAYER_ACTOR.id),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(rolled.nextState.content.items[itemId]!.body).toBe('Original.');
	});
});
