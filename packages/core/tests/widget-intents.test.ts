import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	ALL_HOST_PERMISSIONS,
	PERMISSION_GATED_CAPABILITIES,
	PREVIEW_PLAYER_ACTOR_ID,
	auditScopeBoundary,
	dispatchCommand,
	findWidgetDefinition,
	getPlayerViewForActor,
	getPlayerViewSummary,
	permissionsWithPreviewActors,
	resolveHostCapability,
	resolvePreviewActor,
	resolveWidgetIntent,
	widgetMayNavigate,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetDefinition,
	type WidgetHostPermission,
	type WidgetIntentDescriptor,
	type WidgetPackageDefinition,
} from '../src';
import { widgetPackageDefinitionSchema } from '../src/schemas/widget-package';
import { VAULT_OBJECT_SUBTYPE_KEY } from '../src/state/vault-object';

/**
 * RC-WID-5.1 — NAVIGATION AND CREATION INTENTS. A widget can take its viewer somewhere without
 * writing anything, and every one of these tests is about where it must NOT be able to take them:
 * an entity the viewer may not read, a page their role doesn't reach, a creation flow they can't
 * author in, or — for code nobody at this end has read — anywhere at all until trust review approves
 * the `navigate` host permission. The resolver is pure, so each edge is a direct assertion.
 */

const env = makeEnvironment();

function accept(result: ReturnType<typeof dispatchCommand>) {
	if (result.status !== 'accepted') {
		throw new Error(`rejected: ${JSON.stringify(result.rejection)}`);
	}
	return result;
}

function run(state: CoreStateSlice, command: CoreCommand): CoreStateSlice {
	return accept(dispatchCommand(state, env, command)).nextState;
}

function newestId(record: Record<string, unknown>, before: Set<string>): string {
	const id = Object.keys(record).find((key) => !before.has(key));
	if (!id) throw new Error('nothing was created');
	return id;
}

/** A vault holding one entity of every kind, in a DM-only and a player-visible flavour. */
function vault() {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const ids = {} as Record<string, string>;

	const character = (name: string, visibility: 'dm-only' | 'player-visible') => {
		const before = new Set(Object.keys(state.characters.characters));
		state = run(state, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { kind: 'npc', name, visibility },
		} as CoreCommand);
		return newestId(state.characters.characters, before);
	};
	ids.secretNpc = character('Hidden Cultist', 'dm-only');
	ids.openNpc = character('Friendly Innkeeper', 'player-visible');

	const map = (name: string, visibility: 'dm-only' | 'player-visible') => {
		const before = new Set(Object.keys(state.maps.maps));
		state = run(state, {
			type: 'map.create',
			actorId: DM_ACTOR.id,
			payload: { name, visibility },
		} as CoreCommand);
		return newestId(state.maps.maps, before);
	};
	ids.secretMap = map('Lair', 'dm-only');
	ids.openMap = map('Town', 'player-visible');

	const item = (
		kind: 'note' | 'object',
		title: string,
		visibility: 'dm-only' | 'player-visible',
		fields: Record<string, unknown> = {},
	) => {
		const before = new Set(Object.keys(state.content.items));
		state = run(state, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind, title, body: 'Body.', visibility, fields },
		} as CoreCommand);
		return newestId(state.content.items, before);
	};
	ids.secretNote = item('note', 'Twist', 'dm-only');
	ids.openNote = item('note', 'Rumours', 'player-visible');
	ids.quest = item('object', 'Find the bell', 'player-visible', {
		[VAULT_OBJECT_SUBTYPE_KEY]: 'quest',
	});

	const scene = (name: string, visibility: 'dm-only' | 'player-visible') => {
		const before = new Set(Object.keys(state.scenes.scenes));
		state = run(state, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name, visibility },
		} as CoreCommand);
		return newestId(state.scenes.scenes, before);
	};
	ids.secretScreen = scene('Prep', 'dm-only');
	ids.openScreen = scene('Table', 'player-visible');

	return { state, ids };
}

const INTENTS: WidgetIntentDescriptor[] = [
	{
		id: 'open-character',
		displayName: 'Open character',
		kind: 'open-entity',
		entityKind: 'character',
	},
	{ id: 'open-map', displayName: 'Open map', kind: 'open-entity', entityKind: 'map' },
	{ id: 'open-note', displayName: 'Open note', kind: 'open-entity', entityKind: 'note' },
	{ id: 'open-quest', displayName: 'Open quest', kind: 'open-entity', entityKind: 'quest' },
	{ id: 'open-screen', displayName: 'Open screen', kind: 'open-screen' },
	{ id: 'scenes', displayName: 'Scenes', kind: 'open-route', route: '/scenes' },
	{ id: 'roster', displayName: 'Characters', kind: 'open-route', route: '/characters' },
	{ id: 'new-map', displayName: 'New map', kind: 'create', target: 'map' },
	{ id: 'new-character', displayName: 'New character', kind: 'create', target: 'character' },
	{ id: 'new-widget', displayName: 'New widget', kind: 'create', target: 'widget' },
	{ id: 'permissions', displayName: 'Permissions', kind: 'open-settings', tab: 'permissions' },
	{ id: 'appearance', displayName: 'Appearance', kind: 'open-settings', tab: 'appearance' },
	{ id: 'preview', displayName: 'Preview', kind: 'preview-participant' },
	{
		id: 'preview-fixed',
		displayName: 'Preview the player',
		kind: 'preview-participant',
		targetId: PLAYER_ACTOR.id,
	},
];

function definition(
	runtime: 'template' | 'custom-html-js',
	intents: WidgetIntentDescriptor[] = INTENTS,
): Pick<WidgetDefinition, 'intents' | 'renderEntrypoint'> {
	return {
		intents,
		renderEntrypoint:
			runtime === 'template'
				? { runtime: 'template', template: 'action-panel', hostApiVersion: 1 }
				: { runtime: 'custom-html-js', sandbox: 'iframe', assetPath: 'x.html', hostApiVersion: 1 },
	};
}

function resolve(
	state: CoreStateSlice,
	actorId: string,
	intentId: string,
	options: {
		targetId?: string | null;
		runtime?: 'template' | 'custom-html-js';
		approved?: WidgetHostPermission[];
		intents?: WidgetIntentDescriptor[];
	} = {},
) {
	return resolveWidgetIntent({
		widgetInstanceId: 'widget-1',
		definition: definition(options.runtime ?? 'template', options.intents),
		request: { intentId, targetId: options.targetId ?? null },
		approvedPermissions: options.approved ?? [],
		state,
		actorId,
	});
}

describe('RC-WID-5.1: the navigate host permission', () => {
	it('is a declared, permission-gated host capability that starts denied', () => {
		expect(ALL_HOST_PERMISSIONS).toContain('navigate');
		expect(PERMISSION_GATED_CAPABILITIES.navigate).toBe('navigate');
		expect(resolveHostCapability('w', 'navigate', { approvedPermissions: [] }).decision).toBe(
			'undeclared',
		);
		expect(
			resolveHostCapability('w', 'navigate', { approvedPermissions: ['navigate'] }).decision,
		).toBe('available');
		// The CON-006 scope audit still passes: the new surface was declared, not smuggled in.
		expect(auditScopeBoundary()).toEqual([]);
	});

	it('a template widget needs no permission; a custom widget needs navigate approved', () => {
		expect(widgetMayNavigate('w', definition('template'), [])).toBe(true);
		expect(widgetMayNavigate('w', definition('custom-html-js'), [])).toBe(false);
		expect(widgetMayNavigate('w', definition('custom-html-js'), ['network', 'clipboard'])).toBe(
			false,
		);
		expect(widgetMayNavigate('w', definition('custom-html-js'), ['navigate'])).toBe(true);
	});

	it('drops a denied custom widget intent with an audit record that names no target', () => {
		const { state, ids } = vault();
		const result = resolve(state, DM_ACTOR.id, 'open-character', {
			runtime: 'custom-html-js',
			targetId: ids.openNpc,
		});
		expect(result.decision).toBe('permission-denied');
		expect(result.destination).toBeNull();
		expect(result.audit).toMatchObject({
			widgetInstanceId: 'widget-1',
			intentId: 'open-character',
			intentKind: 'open-entity',
			decision: 'permission-denied',
		});
		expect(result.audit.reason).toMatch(/navigate/);
		expect(JSON.stringify(result.audit)).not.toContain(ids.openNpc!);
	});

	it('the same custom widget resolves once trust review approved navigate', () => {
		const { state, ids } = vault();
		const result = resolve(state, DM_ACTOR.id, 'open-character', {
			runtime: 'custom-html-js',
			approved: ['navigate'],
			targetId: ids.openNpc,
		});
		expect(result.decision).toBe('resolved');
		expect(result.destination).toEqual({
			path: `/characters/${ids.openNpc}`,
			state: null,
		});
	});

	it('approval never skips the read gate', () => {
		const { state, ids } = vault();
		const result = resolve(state, PLAYER_ACTOR.id, 'open-character', {
			runtime: 'custom-html-js',
			approved: ['navigate'],
			targetId: ids.secretNpc,
		});
		expect(result.decision).toBe('not-visible');
	});

	it('trust review can approve or deny navigate like any other permission', () => {
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const pkg: WidgetPackageDefinition = {
			id: 'workspace.launcher',
			version: '1.0.0',
			displayName: 'Launcher',
			widgets: [
				{
					type: 'launcher',
					version: '1.0.0',
					displayName: 'Launcher',
					author: 'workspace',
					renderEntrypoint: { runtime: 'template', template: 'action-panel', hostApiVersion: 1 },
					supportedProfiles: ['desktop'],
					defaultSize: { width: 200, height: 120 },
					minSize: { width: 120, height: 80 },
					resizePolicy: 'free',
					requiredBindings: [],
					optionalBindings: [],
					configurationSchema: { type: 'object', additionalProperties: true },
					capabilitySets: ['manager', 'operator', 'viewer'],
					commands: [],
					intents: [INTENTS[7]!],
					events: [],
					hostPermissions: ['navigate'],
				},
			],
			migrations: [],
			assets: [],
			portabilityWarnings: [],
		};
		state = run(state, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: pkg },
		} as CoreCommand);
		expect(state.widgets.packages[pkg.id]?.trust.hostPermissions.navigate).toBe('denied');
		// The declared intents survive install unchanged.
		expect(state.widgets.packages[pkg.id]?.package.widgets[0]?.intents).toEqual([INTENTS[7]]);

		const approved = run(state, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: {
				packageId: pkg.id,
				trustState: 'trusted',
				hostPermissions: { navigate: 'approved' },
			},
		} as CoreCommand);
		expect(approved.widgets.packages[pkg.id]?.trust.hostPermissions.navigate).toBe('approved');

		const denied = run(state, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: {
				packageId: pkg.id,
				trustState: 'trusted',
				hostPermissions: { navigate: 'denied' },
			},
		} as CoreCommand);
		expect(denied.widgets.packages[pkg.id]?.trust.hostPermissions.navigate).toBe('denied');
	});
});

describe('RC-WID-5.1: the intent resolver', () => {
	it('refuses an intent the definition does not declare', () => {
		const { state } = vault();
		const result = resolve(state, DM_ACTOR.id, 'open-the-vault-file');
		expect(result.decision).toBe('undeclared');
		expect(result.audit.intentKind).toBeNull();
	});

	it("opens a character only through the viewer's read gate", () => {
		const { state, ids } = vault();
		expect(
			resolve(state, DM_ACTOR.id, 'open-character', { targetId: ids.secretNpc }).destination,
		).toEqual({ path: `/characters/${ids.secretNpc}`, state: null });
		expect(
			resolve(state, PLAYER_ACTOR.id, 'open-character', { targetId: ids.openNpc }).decision,
		).toBe('resolved');
		expect(
			resolve(state, PLAYER_ACTOR.id, 'open-character', { targetId: ids.secretNpc }).decision,
		).toBe('not-visible');
	});

	it('a hidden target and a missing one are indistinguishable', () => {
		const { state, ids } = vault();
		const hidden = resolve(state, PLAYER_ACTOR.id, 'open-character', { targetId: ids.secretNpc });
		const missing = resolve(state, PLAYER_ACTOR.id, 'open-character', { targetId: 'no-such-id' });
		expect(hidden.decision).toBe(missing.decision);
		expect(hidden.audit.reason).toBe(missing.audit.reason);
	});

	it("a declared target cannot be swapped for the request's", () => {
		const { state, ids } = vault();
		const fixed: WidgetIntentDescriptor[] = [
			{
				id: 'innkeeper',
				displayName: 'Innkeeper',
				kind: 'open-entity',
				entityKind: 'character',
				targetId: ids.openNpc!,
			},
		];
		const result = resolve(state, DM_ACTOR.id, 'innkeeper', {
			intents: fixed,
			targetId: ids.secretNpc,
		});
		expect(result.destination?.path).toBe(`/characters/${ids.openNpc}`);
	});

	it('an open intent with no target is refused', () => {
		const { state } = vault();
		expect(resolve(state, DM_ACTOR.id, 'open-character').decision).toBe('missing-target');
		expect(resolve(state, DM_ACTOR.id, 'open-screen', { targetId: '  ' }).decision).toBe(
			'missing-target',
		);
	});

	it('opens maps, notes, quests and screens through their own read gates', () => {
		const { state, ids } = vault();
		expect(
			resolve(state, PLAYER_ACTOR.id, 'open-map', { targetId: ids.openMap }).destination,
		).toEqual({ path: `/atlas?map=${ids.openMap}`, state: null });
		expect(resolve(state, PLAYER_ACTOR.id, 'open-map', { targetId: ids.secretMap }).decision).toBe(
			'not-visible',
		);

		expect(
			resolve(state, PLAYER_ACTOR.id, 'open-note', { targetId: ids.openNote }).destination,
		).toEqual({ path: `/knowledge/${ids.openNote}`, state: null });
		expect(
			resolve(state, PLAYER_ACTOR.id, 'open-note', { targetId: ids.secretNote }).decision,
		).toBe('not-visible');

		expect(
			resolve(state, PLAYER_ACTOR.id, 'open-quest', { targetId: ids.quest }).destination,
		).toEqual({ path: '/campaign', state: { openQuestId: ids.quest } });
		// The kind has to match: a note is not a quest, and a quest is not a note.
		expect(resolve(state, DM_ACTOR.id, 'open-quest', { targetId: ids.openNote }).decision).toBe(
			'not-visible',
		);
		expect(resolve(state, DM_ACTOR.id, 'open-note', { targetId: ids.quest }).decision).toBe(
			'not-visible',
		);

		expect(
			resolve(state, PLAYER_ACTOR.id, 'open-screen', { targetId: ids.openScreen }).destination,
		).toEqual({ path: `/scene/${ids.openScreen}`, state: null });
		expect(
			resolve(state, PLAYER_ACTOR.id, 'open-screen', { targetId: ids.secretScreen }).decision,
		).toBe('not-visible');
	});

	it('an allow-listed route still has to be reachable for the viewer', () => {
		const { state } = vault();
		expect(resolve(state, DM_ACTOR.id, 'scenes').destination).toEqual({
			path: '/scenes',
			state: null,
		});
		expect(resolve(state, PLAYER_ACTOR.id, 'scenes').decision).toBe('not-authorized');
		expect(resolve(state, PLAYER_ACTOR.id, 'roster').decision).toBe('resolved');
	});

	it('starts the existing creation flows, and only for someone who can author', () => {
		const { state } = vault();
		expect(resolve(state, DM_ACTOR.id, 'new-map').destination).toEqual({
			path: '/atlas',
			state: { create: true },
		});
		expect(resolve(state, DM_ACTOR.id, 'new-character').destination).toEqual({
			path: '/characters',
			state: { create: true },
		});
		expect(resolve(state, DM_ACTOR.id, 'new-widget').destination).toEqual({
			path: '/board',
			state: { addWidget: true },
		});
		expect(resolve(state, PLAYER_ACTOR.id, 'new-map').decision).toBe('not-authorized');
	});

	it.each(['scene', 'screen'] as const)(
		'starts the %s creation dialog only for an author',
		(target) => {
			const { state } = vault();
			const intents: WidgetIntentDescriptor[] = [
				{ id: 'new-screen', displayName: 'Create', kind: 'create', target },
			];
			expect(resolve(state, DM_ACTOR.id, 'new-screen', { intents }).destination).toEqual({
				path: '/scenes',
				state: { createScreen: true },
			});
			const denied = resolve(state, PLAYER_ACTOR.id, 'new-screen', { intents });
			expect(denied.decision).toBe('not-authorized');
			expect(denied.destination).toBeNull();
		},
	);

	it('opens a Settings tab, keeping the campaign-administration tabs for the DM', () => {
		const { state } = vault();
		expect(resolve(state, PLAYER_ACTOR.id, 'appearance').destination).toEqual({
			path: '/settings?tab=appearance',
			state: null,
		});
		expect(resolve(state, DM_ACTOR.id, 'permissions').decision).toBe('resolved');
		expect(resolve(state, PLAYER_ACTOR.id, 'permissions').decision).toBe('not-authorized');
	});

	it('an actor the vault does not know resolves nothing', () => {
		const { state } = vault();
		expect(resolve(state, 'actor-stranger', 'appearance').decision).toBe('not-authorized');
		expect(resolve(state, 'actor-stranger', 'roster').decision).toBe('not-authorized');
	});
});

describe('RC-SES-7.3: the participant-preview intent', () => {
	const CO_DM = { id: 'actor-co-dm', role: 'co-dm' as const, displayName: 'Test Co-DM' };
	function seated() {
		return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, CO_DM);
	}

	it('opens the companion previewed as the row participant, for the DM', () => {
		const state = seated();
		expect(resolve(state, DM_ACTOR.id, 'preview', { targetId: PLAYER_ACTOR.id })).toMatchObject({
			decision: 'resolved',
			destination: {
				path: '/play',
				state: null,
				preview: { role: 'player', playerActorId: PLAYER_ACTOR.id },
			},
		});
		// An observer row previews that observer's seat, not the generic observer.
		expect(
			resolve(state, DM_ACTOR.id, 'preview', { targetId: OBSERVER_ACTOR.id }).destination,
		).toEqual({
			path: '/play',
			state: null,
			preview: { role: 'observer', playerActorId: OBSERVER_ACTOR.id },
		});
	});

	it('each row’s Preview shows the stage that row reports, observers included', () => {
		let state = seated();
		state = run(state, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Observer table stage', visibility: 'shared' },
		} as CoreCommand);
		const scene = Object.values(state.scenes.scenes).find(
			(entry) => entry.name === 'Observer table stage',
		)!;
		state = run(state, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: scene.id },
		} as CoreCommand);
		const summary = getPlayerViewSummary(state, DM_ACTOR.id);
		if (summary.kind !== 'available') throw new Error(summary.reason);
		const definition = findWidgetDefinition(state.widgets, 'player-views')!;
		const permissions = permissionsWithPreviewActors(state.permissions);
		for (const row of summary.participants) {
			const { destination } = resolveWidgetIntent({
				state,
				actorId: DM_ACTOR.id,
				widgetInstanceId: 'summary',
				definition,
				approvedPermissions: [],
				request: { intentId: 'preview', targetId: row.actorId },
			});
			const preview = resolvePreviewActor(state.permissions, destination!.preview!);
			expect(preview, row.actorId).toMatchObject({ actorId: row.actorId, specific: true });
			const stage = getPlayerViewForActor(
				state.scenes,
				permissions,
				state.session,
				preview.actorId,
				{
					widgetPackages: state.widgets,
				},
			);
			expect(stage, row.actorId).toMatchObject({ kind: 'assigned', id: row.stage?.id });
		}
		expect(summary.participants.map((row) => row.stage?.id)).toContain(scene.id);
	});

	it('is the DM’s alone: a co-DM, a player, an observer and a stranger are refused', () => {
		const state = seated();
		for (const viewer of [CO_DM.id, PLAYER_ACTOR.id, OBSERVER_ACTOR.id, 'actor-stranger'])
			expect(
				resolve(state, viewer, 'preview', { targetId: PLAYER_ACTOR.id }).decision,
				viewer,
			).toBe('not-authorized');
	});

	it('previews only a registered player or observer seat, one outcome for every other id', () => {
		// The previewing runtime seats the generic preview actors; they are never a preview target.
		const generic = { id: PREVIEW_PLAYER_ACTOR_ID, role: 'player' as const, displayName: 'Player' };
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, CO_DM, generic);
		const refusals = [DM_ACTOR.id, CO_DM.id, PREVIEW_PLAYER_ACTOR_ID, 'no-such-actor'].map(
			(targetId) => resolve(state, DM_ACTOR.id, 'preview', { targetId }),
		);
		for (const refusal of refusals) {
			expect(refusal.decision).toBe('not-visible');
			expect(refusal.destination).toBeNull();
			expect(refusal.audit.reason).toBe(refusals[0]!.audit.reason);
		}
		expect(resolve(state, DM_ACTOR.id, 'preview').decision).toBe('missing-target');
	});

	it('a declared participant cannot be swapped for the request’s', () => {
		const state = seated();
		expect(
			resolve(state, DM_ACTOR.id, 'preview-fixed', { targetId: OBSERVER_ACTOR.id }).destination
				?.preview,
		).toEqual({ role: 'player', playerActorId: PLAYER_ACTOR.id });
	});

	it('custom code never previews, even with navigate approved', () => {
		const state = seated();
		const result = resolve(state, DM_ACTOR.id, 'preview', {
			targetId: PLAYER_ACTOR.id,
			runtime: 'custom-html-js',
			approved: ['navigate'],
		});
		expect(result.decision).toBe('not-authorized');
		expect(result.audit.reason).not.toContain(PLAYER_ACTOR.id);
	});

	it('the schema takes an actor id and nothing that could carry a path', () => {
		const parse = (intent: unknown) =>
			widgetPackageDefinitionSchema.safeParse({
				id: 'workspace.preview',
				version: '1.0.0',
				displayName: 'Preview',
				widgets: [
					{
						type: 'preview',
						version: '1.0.0',
						displayName: 'Preview',
						author: 'workspace',
						supportedProfiles: ['desktop'],
						defaultSize: { width: 200, height: 120 },
						minSize: { width: 120, height: 80 },
						resizePolicy: 'free',
						requiredBindings: [],
						optionalBindings: [],
						configurationSchema: { type: 'object' },
						capabilitySets: ['viewer'],
						commands: [],
						intents: [intent],
						events: [],
						hostPermissions: [],
					},
				],
			}).success;
		expect(parse({ id: 'p', displayName: 'P', kind: 'preview-participant' })).toBe(true);
		expect(
			parse({ id: 'p', displayName: 'P', kind: 'preview-participant', targetId: 'actor-1' }),
		).toBe(true);
		expect(parse({ id: 'p', displayName: 'P', kind: 'preview-participant', route: '/play' })).toBe(
			false,
		);
		expect(parse({ id: 'p', displayName: 'P', kind: 'preview-participant', role: 'co-dm' })).toBe(
			false,
		);
	});
});

describe('RC-WID-5.1: the intent descriptor schema is closed', () => {
	function packageWith(intents: unknown[]) {
		return {
			id: 'workspace.intents',
			version: '1.0.0',
			displayName: 'Intents',
			widgets: [
				{
					type: 'intents',
					version: '1.0.0',
					displayName: 'Intents',
					author: 'workspace',
					supportedProfiles: ['desktop'],
					defaultSize: { width: 200, height: 120 },
					minSize: { width: 120, height: 80 },
					resizePolicy: 'free',
					requiredBindings: [],
					optionalBindings: [],
					configurationSchema: { type: 'object' },
					capabilitySets: ['viewer'],
					commands: [],
					intents,
					events: [],
					hostPermissions: ['navigate'],
				},
			],
		};
	}

	it('accepts every declared kind', () => {
		expect(widgetPackageDefinitionSchema.safeParse(packageWith(INTENTS)).success).toBe(true);
	});

	it('has nowhere to put a URL', () => {
		const withUrl = packageWith([
			{
				id: 'out',
				displayName: 'Out',
				kind: 'open-route',
				route: '/characters',
				url: 'https://example.invalid',
			},
		]);
		expect(widgetPackageDefinitionSchema.safeParse(withUrl).success).toBe(false);
		const asRoute = packageWith([
			{ id: 'out', displayName: 'Out', kind: 'open-route', route: 'https://example.invalid' },
		]);
		expect(widgetPackageDefinitionSchema.safeParse(asRoute).success).toBe(false);
		const nested = packageWith([
			{ id: 'out', displayName: 'Out', kind: 'open-route', route: '/characters/abc' },
		]);
		expect(widgetPackageDefinitionSchema.safeParse(nested).success).toBe(false);
	});

	it('rejects an unknown kind, entity kind, creation target or Settings tab', () => {
		for (const intent of [
			{ id: 'a', displayName: 'A', kind: 'open-url' },
			{ id: 'a', displayName: 'A', kind: 'open-entity', entityKind: 'raw-file' },
			{ id: 'a', displayName: 'A', kind: 'create', target: 'vault' },
			{ id: 'a', displayName: 'A', kind: 'open-settings', tab: 'secrets' },
		]) {
			expect(widgetPackageDefinitionSchema.safeParse(packageWith([intent])).success).toBe(false);
		}
	});

	it('rejects two intents with one id', () => {
		const result = widgetPackageDefinitionSchema.safeParse(
			packageWith([INTENTS[0], { ...INTENTS[1], id: INTENTS[0]!.id }]),
		);
		expect(result.success).toBe(false);
	});
});
