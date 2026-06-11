import { describe, expect, it } from 'vitest';
import {
	buildQuickSwitcher,
	parseQuickSwitcherQuery,
	resolveQuickSwitcherEntry,
	type QuickSwitcherCommandEntry,
	type QuickSwitcherEntry,
	type QuickSwitcherNavigationEntry,
} from '../src/queries/quick-switcher-query';
import { dispatchCommand } from '../src/commands/dispatch';
import { createDemoMapState } from '../src/state/map-state';
import type { CommandActionContext } from '../src/queries/command-actions';
import type {
	CommandResult,
	CoreCommand,
	CoreEnvironment,
	CoreStateSlice,
} from '../src/commands/types';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * SRCH-002 — QUICK SWITCHER: title-first navigation across VISIBLE content AND COMMANDS. Tests are the
 * primary evidence.
 *
 * The quick switcher COMPOSES the existing visible search index (`searchVaultForActor`) for content/POI/
 * handout/session-artifact navigation and the existing actor-filtered command surface
 * (`listPaletteCommands`) for command discovery. These tests prove the THREE acceptance criteria:
 *
 *   - AC1: a TITLE match ranks above a body-only match.
 *   - AC2: an entry is resolved from its OWN current descriptor, so a stale selection never fires.
 *   - AC3: a player never receives a DM-only command, a hidden target, or a hidden command label/count —
 *     those entries are ABSENT (not disabled), and a present-but-blocked command resolves to null.
 */

const DESKTOP: CommandActionContext = { profileId: 'desktop' };
const MOBILE: CommandActionContext = { profileId: 'mobile' };

function base(...actors: Parameters<typeof buildInitialState>): CoreStateSlice {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, ...actors);
	// The demo map gives the switcher visible POIs (and DM-only POIs the player must never see).
	return { ...state, maps: createDemoMapState() };
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got ${JSON.stringify(result.rejection)}`);
	}
	return result;
}

interface NoteInput {
	title: string;
	body?: string;
	visibility?: 'dm-only' | 'player-visible' | 'shared';
	kind?: 'note' | 'object';
}

function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	input: NoteInput,
): { state: CoreStateSlice; itemId: string } {
	const result = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: input.kind ?? 'note',
				title: input.title,
				body: input.body ?? `Body of ${input.title}`,
				visibility: input.visibility ?? 'player-visible',
			}),
		),
	);
	const item = Object.values(result.nextState.content.items).find((i) => i.title === input.title);
	if (!item) throw new Error(`item ${input.title} not created`);
	return { state: result.nextState, itemId: item.id };
}

/** Configure the Command Center home so DM command actions (presets, widgets) are available. */
function withHome(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	return accepted(
		dispatchCommand(state, env, cmd('command-center.ensure-home', {})),
	).nextState;
}

function build(
	state: CoreStateSlice,
	actorId: string,
	query: string,
	context: CommandActionContext = DESKTOP,
): QuickSwitcherEntry[] {
	return buildQuickSwitcher(state, actorId, context, query);
}

function navEntries(entries: QuickSwitcherEntry[]): QuickSwitcherNavigationEntry[] {
	return entries.filter((e): e is QuickSwitcherNavigationEntry => e.kind === 'navigation');
}

function cmdEntries(entries: QuickSwitcherEntry[]): QuickSwitcherCommandEntry[] {
	return entries.filter((e): e is QuickSwitcherCommandEntry => e.kind === 'command');
}

describe('SRCH-002 quick switcher — fail-closed basics', () => {
	it('returns an empty list for an unknown actor (both composed surfaces fail closed)', () => {
		const env = makeEnvironment();
		const state = createNote(base(), env, { title: 'Visible Lore' }).state;
		expect(build(state, 'nobody', 'lore')).toEqual([]);
		expect(build(state, 'nobody', '')).toEqual([]);
	});

	it('opens to a usable default with an empty query (visible content + eligible commands)', () => {
		const env = makeEnvironment();
		let state = withHome(base(), env);
		state = createNote(state, env, { title: 'Town of Highmoor' }).state;
		const entries = build(state, DM_ACTOR.id, '');
		expect(entries.some((e) => e.kind === 'navigation' && e.title === 'Town of Highmoor')).toBe(true);
		// The DM gets eligible commands too (navigation/scene/action).
		expect(cmdEntries(entries).length).toBeGreaterThan(0);
	});
});

describe('SRCH-002 AC1 — title matches rank above body-only matches', () => {
	it('a title hit outranks a note whose body-only mentions the query', () => {
		const env = makeEnvironment();
		let state = base();
		// "Dragon" in the TITLE.
		state = createNote(state, env, { title: 'Dragon Cult', body: 'Followers gather in shadow.' }).state;
		// "dragon" only in the BODY.
		state = createNote(state, env, { title: 'Harbor Watch', body: 'A dragon was sighted offshore.' }).state;

		const nav = navEntries(build(state, DM_ACTOR.id, 'dragon'));
		const titles = nav.map((e) => e.title);
		expect(titles).toContain('Dragon Cult');
		expect(titles).toContain('Harbor Watch');
		// The title match sorts strictly before the body-only match.
		expect(titles.indexOf('Dragon Cult')).toBeLessThan(titles.indexOf('Harbor Watch'));
		const titleHit = nav.find((e) => e.title === 'Dragon Cult');
		const bodyHit = nav.find((e) => e.title === 'Harbor Watch');
		expect(titleHit?.score).toBe(2);
		expect(bodyHit?.score).toBe(1);
	});

	it('navigation entries (content) rank above command entries at equal score', () => {
		const env = makeEnvironment();
		let state = withHome(base(), env);
		// A note whose TITLE matches "scene", and the DM "Create Scene" command also matches "scene".
		state = createNote(state, env, { title: 'Scene Notes', body: 'Prep.' }).state;
		const entries = build(state, DM_ACTOR.id, 'scene');
		const firstNav = entries.findIndex((e) => e.kind === 'navigation' && e.title === 'Scene Notes');
		const firstCmd = entries.findIndex((e) => e.kind === 'command');
		expect(firstNav).toBeGreaterThanOrEqual(0);
		expect(firstCmd).toBeGreaterThanOrEqual(0);
		// The title-matching navigation hit (score 2) sorts before any command.
		expect(firstNav).toBeLessThan(firstCmd);
	});

	it('is deterministic across repeated runs and fresh fixtures (stable tie-break)', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Alpha Keep' }).state;
		state = createNote(state, env, { title: 'Beta Keep' }).state;
		const a = build(state, DM_ACTOR.id, 'keep').map((e) => e.id);
		const b = build(state, DM_ACTOR.id, 'keep').map((e) => e.id);
		expect(a).toEqual(b);
	});
});

describe('SRCH-002 AC2 — Enter executes the current selection, not stale state', () => {
	it('resolves a navigation entry to its route', () => {
		const env = makeEnvironment();
		const state = createNote(base(), env, { title: 'Town of Highmoor' }).state;
		const entry = navEntries(build(state, DM_ACTOR.id, 'highmoor'))[0]!;
		const resolved = resolveQuickSwitcherEntry(entry);
		expect(resolved).toEqual({ kind: 'navigate', route: '/knowledge/' });
	});

	it('resolves a chosen command entry to the SAME core command a visible control dispatches', () => {
		const env = makeEnvironment();
		const state = withHome(base(), env);
		const entries = build(state, DM_ACTOR.id, 'preset');
		const saveEntry = cmdEntries(entries).find((e) => e.command.id === 'cc.preset.save');
		expect(saveEntry).toBeDefined();
		// The same input the visible "Save preset" form collects resolves the identical command.
		const resolved = resolveQuickSwitcherEntry(saveEntry!, { name: 'Combat Night' });
		expect(resolved?.kind).toBe('palette');
		if (resolved?.kind !== 'palette' || resolved.resolved.kind !== 'dispatch') {
			throw new Error('expected a dispatch resolution');
		}
		expect(resolved.resolved.command.type).toBe('command-center.save-preset');
		// And dispatching it is accepted by the core (it is the real command path).
		const result = dispatchCommand(state, env, {
			...resolved.resolved.command,
			actorId: DM_ACTOR.id,
		} as CoreCommand);
		expect(result.status).toBe('accepted');
	});

	it('resolving from the CURRENT entry never fires a stale selection after the query changes', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Alpha' }).state;
		state = createNote(state, env, { title: 'Beta' }).state;
		// User typed "alpha", the top entry is Alpha; then the query changes to "beta".
		const alphaTop = navEntries(build(state, DM_ACTOR.id, 'alpha'))[0]!;
		const betaTop = navEntries(build(state, DM_ACTOR.id, 'beta'))[0]!;
		expect(alphaTop.title).toBe('Alpha');
		expect(betaTop.title).toBe('Beta');
		// Pressing Enter resolves the CURRENT (beta) entry, never the stale alpha one. Both are notes, so
		// the route is the Knowledge section; the load-bearing point is it resolves from the BETA entry.
		expect(betaTop.contentType).toBe('note');
		expect(resolveQuickSwitcherEntry(betaTop)).toEqual({ kind: 'navigate', route: '/knowledge/' });
		// The two entries are distinct objects with distinct ids; no shared index is consulted.
		expect(alphaTop.id).not.toBe(betaTop.id);
	});

	it('resolves a command missing a required input to null (cannot fire an unfilled command)', () => {
		const env = makeEnvironment();
		const state = withHome(base(), env);
		const saveEntry = cmdEntries(build(state, DM_ACTOR.id, 'preset')).find(
			(e) => e.command.id === 'cc.preset.save',
		)!;
		// No input provided ⇒ resolves to null, so Enter cannot dispatch an incomplete command.
		expect(resolveQuickSwitcherEntry(saveEntry, {})).toBeNull();
	});

	it('resolves a present-but-unavailable command to null (a blocked command cannot fire)', () => {
		// No home configured ⇒ the preset-save command is present but unavailable for the DM.
		const state = base();
		const saveEntry = cmdEntries(build(state, DM_ACTOR.id, 'preset')).find(
			(e) => e.command.id === 'cc.preset.save',
		);
		expect(saveEntry).toBeDefined();
		expect(saveEntry!.command.availability.status).toBe('unavailable');
		expect(resolveQuickSwitcherEntry(saveEntry!, { name: 'X' })).toBeNull();
	});
});

describe('SRCH-002 AC3 — a player never discovers DM-only/hidden content or commands', () => {
	it('a dm-only note is absent from a player switcher (no hit, no count, no label)', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Public Festival', visibility: 'player-visible' }).state;
		state = createNote(state, env, { title: 'Secret Ritual', visibility: 'dm-only' }).state;

		const dm = build(state, DM_ACTOR.id, 'ritual');
		expect(dm.some((e) => e.kind === 'navigation' && e.title === 'Secret Ritual')).toBe(true);

		const player = build(state, PLAYER_ACTOR.id, 'ritual');
		expect(player.some((e) => e.title === 'Secret Ritual')).toBe(false);
		// The hidden title appears NOWHERE in the player's switcher (no facet/hint/label leak).
		expect(JSON.stringify(player)).not.toContain('Secret Ritual');
	});

	it('a dm-only POI (demo hidden-camps layer) is never a player navigation entry', () => {
		const state = base();
		const dmPoiIds = new Set(navEntries(build(state, DM_ACTOR.id, '')).map((e) => e.id));
		const playerPoiIds = new Set(navEntries(build(state, PLAYER_ACTOR.id, '')).map((e) => e.id));
		// Every POI the player can switch to is also visible to the DM (a subset), and the DM sees strictly
		// more (the hidden-camp POI), so no hidden POI ever surfaces for the player.
		expect(dmPoiIds.size).toBeGreaterThan(playerPoiIds.size);
		expect([...playerPoiIds].every((id) => dmPoiIds.has(id))).toBe(true);
	});

	it('DM-only commands are ABSENT (not disabled) for a player and observer', () => {
		const env = makeEnvironment();
		let state = withHome(base(), env);
		// Give the DM a saveable preset target so DM command actions exist.
		state = createNote(state, env, { title: 'Tavern Notes' }).state;

		const dmCmds = cmdEntries(build(state, DM_ACTOR.id, ''));
		// The DM has Command Center action commands (preset save / add-widget).
		expect(dmCmds.some((e) => e.command.id === 'cc.preset.save')).toBe(true);

		for (const role of [PLAYER_ACTOR, OBSERVER_ACTOR]) {
			const entries = build(state, role.id, '');
			// A non-DM never receives ANY Command Center action command — absent, not merely disabled.
			expect(entries.some((e) => e.kind === 'command' && e.command.kind === 'core-command')).toBe(
				false,
			);
			// Nor a scene-author "Create Scene" command, nor the DM-only Scenes navigation section.
			expect(entries.some((e) => e.title === 'Create Scene')).toBe(false);
			// Serialized result never mentions a DM-only command label.
			const json = JSON.stringify(entries);
			expect(json).not.toContain('Create Scene');
			expect(json).not.toContain('Save Command Center preset');
		}
	});

	it('a player switcher is identical across desktop and mobile for non-widget entries (no profile leak)', () => {
		const env = makeEnvironment();
		let state = withHome(base(), env);
		state = createNote(state, env, { title: 'Harbor Map Notes' }).state;
		const desktop = build(state, PLAYER_ACTOR.id, '', DESKTOP).map((e) => e.id);
		const mobile = build(state, PLAYER_ACTOR.id, '', MOBILE).map((e) => e.id);
		// A player has no widget/core commands, so the actor-filtered result is profile-independent.
		expect(desktop).toEqual(mobile);
	});
});

describe('SRCH-005 — `>` command mode lists commands, never entity titles', () => {
	it('parses a leading `>` into command mode with the residual needle', () => {
		expect(parseQuickSwitcherQuery('>export')).toEqual({ commandMode: true, needle: 'export' });
		expect(parseQuickSwitcherQuery('>  Create  ')).toEqual({ commandMode: true, needle: 'create' });
		expect(parseQuickSwitcherQuery('>')).toEqual({ commandMode: true, needle: '' });
		expect(parseQuickSwitcherQuery('dragon')).toEqual({ commandMode: false, needle: 'dragon' });
	});

	it('a `>` query returns ONLY command entries, even when a note title would match', () => {
		const env = makeEnvironment();
		let state = withHome(base(), env);
		// A note whose title contains "scene" would normally be a navigation hit for the bare query.
		state = createNote(state, env, { title: 'Scene Notes', body: 'Prep.' }).state;

		// Bare query "scene" surfaces the note (navigation) AND the Create Scene command.
		const bare = build(state, DM_ACTOR.id, 'scene');
		expect(bare.some((e) => e.kind === 'navigation' && e.title === 'Scene Notes')).toBe(true);
		expect(bare.some((e) => e.kind === 'command')).toBe(true);

		// Command mode ">scene" lists ONLY commands — the note title is absent entirely.
		const commandMode = build(state, DM_ACTOR.id, '>scene');
		expect(commandMode.length).toBeGreaterThan(0);
		expect(commandMode.every((e) => e.kind === 'command')).toBe(true);
		expect(commandMode.some((e) => e.title === 'Scene Notes')).toBe(false);
		expect(commandMode.some((e) => e.title === 'Create Scene')).toBe(true);
	});

	it('a bare `>` lists every eligible command and no navigation entry', () => {
		const env = makeEnvironment();
		let state = withHome(base(), env);
		state = createNote(state, env, { title: 'Town of Highmoor' }).state;
		const all = build(state, DM_ACTOR.id, '>');
		expect(all.length).toBeGreaterThan(0);
		expect(all.every((e) => e.kind === 'command')).toBe(true);
		// The note that the bare empty query would surface as navigation is absent in command mode.
		expect(all.some((e) => e.title === 'Town of Highmoor')).toBe(false);
	});

	it('command mode stays fail-closed: a player never sees a DM-only command via `>`', () => {
		const env = makeEnvironment();
		const state = withHome(base(), env);
		// The DM sees Create Scene in command mode; the player never does (absent, not disabled).
		expect(build(state, DM_ACTOR.id, '>create scene').some((e) => e.title === 'Create Scene')).toBe(
			true,
		);
		const player = build(state, PLAYER_ACTOR.id, '>create scene');
		expect(player.some((e) => e.title === 'Create Scene')).toBe(false);
		expect(JSON.stringify(player)).not.toContain('Create Scene');
	});
});
