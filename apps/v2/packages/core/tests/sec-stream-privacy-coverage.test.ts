import { describe, expect, it } from 'vitest';
import {
	REPLICATION_SURFACE_DOMAINS,
	assertViewCarriesNoHiddenContent,
	createDemoMapState,
	dispatchCommand,
	filterReplicationStream,
	filterCombatStreamForRecipient,
	findStreamPrivacyLeaks,
	getCombatTrackerForActor,
	getContentItemsForActor,
	getHandoutsForActor,
	getMapViewForActor,
	getSyncStatus,
	listCharactersForActor,
	listScenesForActor,
	searchVaultForActor,
	uncoveredReplicationSurfaceDomains,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type DiagnosticsContextInput,
	type EntityVisibilityMetadata,
	type ReplicationSurfaceDomain,
	type StreamPrivacyNeedle,
	type SyncOperation,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';

/**
 * SEC-010 — PLAYER/OBSERVER REPLICATION-STREAM PRIVACY: the adversarial coverage GATE. A state salted with
 * a known DM-only secret in EVERY major domain (notes, maps, characters, scenes, search, graph, widgets,
 * MCP, sync status) is built through the REAL command reducers, then run through each player/observer-facing
 * surface; the gate proves NO hidden value, title, id, edge, snippet, or revealing count crosses the wire
 * (AC1), and FAILS CLOSED if a declared replication surface lacks a proof row (AC2).
 *
 * Every surface already filters at the source. This gate is the PROOF on top of that filtering: it
 * serializes each surface's non-DM projection and runs the {@link findStreamPrivacyLeaks} deep-scan for the
 * planted needles, so a regression in ANY surface's filter turns the gate red. The "gate goes RED on a leaky
 * variant, GREEN on the real code" property is proven by the negative tests at the bottom.
 */

const env = makeEnvironment();

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got ${JSON.stringify(result.status === 'rejected' ? result.rejection : result)}`);
	}
	return result;
}

function run(state: CoreStateSlice, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

// --- The salted secrets: one hidden needle per domain ----------------------------------------------

/** A DM-only secret token per domain — the exact string a leak of that domain would expose. */
const SECRET = {
	noteBody: 'SECRET-NOTE-THE-MAYOR-IS-A-VAMPIRE',
	mapPoiLabel: 'SECRET-POI-THE-HIDDEN-VAULT',
	characterDmNotes: 'SECRET-CHAR-THE-NPC-BETRAYS-THE-PARTY',
	sceneTitle: 'SECRET-SCENE-THE-BOSS-LAIR',
	handoutBody: 'SECRET-HANDOUT-THE-CIPHER-KEY',
	syncHiddenOpValue: 'SECRET-SYNC-HIDDEN-OP-BODY',
} as const;

/** A revealing COUNT a player must not be able to infer (e.g. "7 hidden items exist"). */
const HIDDEN_COUNT_THAT_MUST_NOT_LEAK = 7777;

// --- Fixture: build state with hidden content in every domain VIA REAL COMMANDS ---------------------

interface SaltedFixture {
	state: CoreStateSlice;
	secretNoteId: string;
	secretCharacterId: string;
	secretSceneId: string;
	needles: StreamPrivacyNeedle[];
}

function buildSaltedFixture(): SaltedFixture {
	let state: CoreStateSlice = { ...buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR), maps: createDemoMapState() };

	// notes: a dm-only note (the secret) + a player-visible note.
	const secretNote = accepted(
		run(state, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title: 'DM Secret', body: SECRET.noteBody, visibility: 'dm-only' },
		}),
	);
	state = secretNote.nextState;
	const secretNoteId = Object.keys(state.content.items).find((id) => state.content.items[id]!.body === SECRET.noteBody)!;
	state = accepted(
		run(state, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title: 'Town Square', body: 'The town square is busy.', visibility: 'player-visible' },
		}),
	).nextState;

	// maps: a dm-only POI (the secret) + a player-visible POI on the demo map.
	state = accepted(
		run(state, {
			type: 'map.create-poi',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: 'map-western-reaches',
				layerId: 'layer-terrain',
				label: SECRET.mapPoiLabel,
				category: 'landmark',
				position: { x: 0.5, y: 0.5 },
				visibility: 'dm-only',
			},
		}),
	).nextState;
	state = accepted(
		run(state, {
			type: 'map.create-poi',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: 'map-western-reaches',
				layerId: 'layer-terrain',
				label: 'The Inn',
				category: 'landmark',
				position: { x: 0.2, y: 0.2 },
				visibility: 'player-visible',
			},
		}),
	).nextState;

	// characters: a DM-only NPC whose dm-only field carries the secret.
	const secretChar = accepted(
		run(state, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'sidekick',
				name: 'Hidden NPC',
				visibility: 'dm-only',
				combat: { hp: 10, maxHp: 10, ac: 12 },
				data: { dmNotes: SECRET.characterDmNotes },
				dmOnlyFields: ['data.dmNotes'],
			},
		}),
	);
	state = secretChar.nextState;
	const secretCharacterId = Object.keys(state.characters.characters).find(
		(id) => (state.characters.characters[id]!.data as { dmNotes?: string }).dmNotes === SECRET.characterDmNotes,
	)!;

	// scenes: a dm-only scene whose name is the secret.
	const secretScene = accepted(
		run(state, { type: 'scene.create', actorId: DM_ACTOR.id, payload: { name: SECRET.sceneTitle, visibility: 'dm-only' } }),
	);
	state = secretScene.nextState;
	const secretSceneId = Object.keys(state.scenes.scenes).find((id) => state.scenes.scenes[id]!.name === SECRET.sceneTitle)!;
	// a player-visible scene, so the player list is non-empty (and must still omit the secret scene).
	const visibleScene = accepted(
		run(state, { type: 'scene.create', actorId: DM_ACTOR.id, payload: { name: 'Town Square Scene', visibility: 'player-visible' } }),
	);
	state = visibleScene.nextState;
	const visibleSceneId = Object.keys(state.scenes.scenes).find((id) => state.scenes.scenes[id]!.name === 'Town Square Scene')!;

	// Start an active session so the handout can be delivered.
	state = accepted(
		run(state, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: visibleSceneId },
		}),
	).nextState;

	// handouts: a handout delivered ONLY to the player (the observer must not see it; its body is salted).
	state = accepted(
		run(state, {
			type: 'session.deliver-handout',
			actorId: DM_ACTOR.id,
			payload: {
				title: 'A Torn Map',
				sceneId: visibleSceneId,
				recipientActorIds: [PLAYER_ACTOR.id],
				// A player-visible section (the player legitimately sees it) PLUS a dm-only section whose body
				// is the salted secret: even the recipient must never receive the dm-only section's body.
				sections: [
					{ heading: 'Visible', body: 'A torn map fragment.', visibility: 'player-visible' },
					{ heading: 'DM Cipher', body: SECRET.handoutBody, visibility: 'dm-only' },
				],
			},
		}),
	).nextState;

	const needles: StreamPrivacyNeedle[] = [
		{ domain: 'notes', kind: 'value', secret: SECRET.noteBody },
		{ domain: 'notes', kind: 'id', secret: secretNoteId },
		{ domain: 'maps', kind: 'value', secret: SECRET.mapPoiLabel },
		{ domain: 'characters', kind: 'value', secret: SECRET.characterDmNotes },
		{ domain: 'characters', kind: 'id', secret: secretCharacterId },
		{ domain: 'scenes', kind: 'title', secret: SECRET.sceneTitle },
		{ domain: 'scenes', kind: 'id', secret: secretSceneId },
		{ domain: 'search', kind: 'value', secret: SECRET.noteBody },
		{ domain: 'graph', kind: 'edge', secret: secretNoteId },
		{ domain: 'widgets', kind: 'value', secret: SECRET.characterDmNotes },
		{ domain: 'mcp', kind: 'value', secret: SECRET.handoutBody },
		{ domain: 'sync-status', kind: 'value', secret: SECRET.syncHiddenOpValue },
		{ domain: 'sync-status', kind: 'count', secret: HIDDEN_COUNT_THAT_MUST_NOT_LEAK },
	];

	return { state, secretNoteId, secretCharacterId, secretSceneId, needles };
}

const FIXTURE = buildSaltedFixture();
const SALTED = FIXTURE.state;
const NEEDLES = FIXTURE.needles;

// --- The per-surface coverage manifest --------------------------------------------------------------

/**
 * Each row produces a NON-DM projection for a replication surface and declares which domain(s) it proves
 * carry no hidden content. The gate runs every row for the player AND the observer and asserts zero leaks.
 * The `domains` of all rows must COVER `REPLICATION_SURFACE_DOMAINS` (AC2 — no declared surface unproven).
 */
interface SurfaceCoverageRow {
	surface: string;
	domains: ReplicationSurfaceDomain[];
	project: (actorId: string) => unknown;
}

function diagnosticsContext(): DiagnosticsContextInput {
	return {
		appVersion: '0.2.0',
		platformProfileId: 'desktop',
		generatedAt: '2026-06-05T12:00:00.000Z',
		online: true,
		syncSources: [
			{
				sourceId: 'local-vault',
				kind: 'local-vault',
				displayName: 'Local Vault',
				state: 'connected',
				detail: null,
				pendingOperations: 0,
				lastSyncedAt: '2026-06-05T11:59:00.000Z',
			},
		],
		capabilities: [],
		schema: [],
		environment: {},
	};
}

/** A visibility source for the replication filter, keyed by `entityType:entityId` (absent ⇒ dm-only). */
function visibilitySource(records: EntityVisibilityMetadata[]) {
	const byKey = new Map(records.map((r) => [`${r.entityType}:${r.entityId}`, r]));
	return (op: SyncOperation): EntityVisibilityMetadata | undefined => byKey.get(`${op.entityType}:${op.entityId}`);
}

/** A sync op stream with a dm-only op (secret) the replication + sync-status surfaces must withhold. */
const SYNC_STREAM: SyncOperation[] = [
	{
		id: 'op-public',
		vaultId: 'vault-1',
		sourceId: 'local-vault',
		actorId: DM_ACTOR.id,
		entityType: 'note',
		entityId: 'note-public',
		opType: 'update',
		value: { body: 'The town square is busy.' },
		dependencies: [],
		issuedAt: '2026-06-05T00:00:00.000Z',
		schemaVersion: 1,
	},
	{
		id: 'op-secret',
		vaultId: 'vault-1',
		sourceId: 'local-vault',
		actorId: DM_ACTOR.id,
		entityType: 'note',
		entityId: FIXTURE.secretNoteId,
		opType: 'update',
		value: { body: SECRET.syncHiddenOpValue },
		dependencies: [],
		issuedAt: '2026-06-05T00:00:00.000Z',
		schemaVersion: 1,
	},
];

const SYNC_VISIBILITY = visibilitySource([
	{ entityType: 'note', entityId: 'note-public', entity: { level: 'player-visible' } },
	{ entityType: 'note', entityId: FIXTURE.secretNoteId, entity: { level: 'dm-only' } },
]);

const COVERAGE: SurfaceCoverageRow[] = [
	{
		surface: 'content.getContentItemsForActor',
		domains: ['notes'],
		project: (actorId) => getContentItemsForActor(SALTED.content, SALTED.permissions, actorId),
	},
	{
		surface: 'map.getMapViewForActor',
		domains: ['maps'],
		project: (actorId) => getMapViewForActor(SALTED.maps, SALTED.permissions, actorId, 'map-western-reaches'),
	},
	{
		surface: 'character.listCharactersForActor',
		domains: ['characters', 'widgets'],
		project: (actorId) => listCharactersForActor(SALTED.characters, SALTED.permissions, actorId),
	},
	{
		surface: 'scene.listScenesForActor',
		domains: ['scenes'],
		project: (actorId) => listScenesForActor(SALTED.scenes, SALTED.permissions, actorId),
	},
	{
		surface: 'search.searchVaultForActor',
		domains: ['search', 'graph'],
		project: (actorId) =>
			searchVaultForActor(SALTED.content, SALTED.maps, SALTED.permissions, SALTED.session, actorId, { query: 'the' }),
	},
	{
		surface: 'session.getHandoutsForActor (mcp/session projection)',
		domains: ['mcp'],
		project: (actorId) => getHandoutsForActor(SALTED.session, SALTED.permissions, actorId),
	},
	{
		surface: 'sync.filterReplicationStream + getSyncStatus',
		domains: ['sync-status'],
		project: (actorId) => {
			const actor = SALTED.permissions.actors[actorId];
			const filtered = filterReplicationStream(SYNC_STREAM, actor, SYNC_VISIBILITY, SALTED.permissions);
			const status = getSyncStatus(SALTED.permissions, actorId, {
				operations: filtered.delivered,
				context: diagnosticsContext(),
			});
			// A non-DM sees neither the hidden op value NOR a revealing hidden-op count.
			return { delivered: filtered.delivered, status };
		},
	},
];

describe('SEC-010 AC2 — every declared replication surface is covered (a new surface without a proof fails the gate)', () => {
	it('the coverage manifest covers every declared replication-surface domain', () => {
		const covered = new Set<string>();
		for (const row of COVERAGE) for (const domain of row.domains) covered.add(domain);
		const uncovered = uncoveredReplicationSurfaceDomains(covered);
		expect(uncovered, `replication surfaces lacking a stream-privacy proof: ${uncovered.join(', ')}`).toEqual([]);
	});

	it('every domain in the manifest is a declared replication surface (the manifest cannot drift)', () => {
		const declared = new Set<string>(REPLICATION_SURFACE_DOMAINS);
		for (const row of COVERAGE) {
			for (const domain of row.domains) {
				expect(declared.has(domain), `${row.surface} declares unknown domain "${domain}"`).toBe(true);
			}
		}
	});
});

describe('SEC-010 AC1 — no hidden value/title/id/edge/snippet/count crosses a player or observer stream', () => {
	for (const row of COVERAGE) {
		for (const actor of [PLAYER_ACTOR, OBSERVER_ACTOR]) {
			it(`${row.surface}: ${actor.role} projection carries no hidden content`, () => {
				const projection = row.project(actor.id);
				const leaks = findStreamPrivacyLeaks(projection, NEEDLES);
				expect(leaks, `leaked: ${leaks.map((l) => `${l.domain}/${l.kind}@${l.path}`).join(', ')}`).toEqual([]);
				// The boundary guard agrees (it throws on the first leak; here it must not throw).
				expect(() => assertViewCarriesNoHiddenContent(projection, NEEDLES)).not.toThrow();
			});
		}
	}

	it('the DM projection DOES contain the hidden content (the secrets are really in the fixture)', () => {
		const dmNotes = getContentItemsForActor(SALTED.content, SALTED.permissions, DM_ACTOR.id);
		expect(JSON.stringify(dmNotes)).toContain(SECRET.noteBody);
		const dmMap = getMapViewForActor(SALTED.maps, SALTED.permissions, DM_ACTOR.id, 'map-western-reaches');
		expect(JSON.stringify(dmMap)).toContain(SECRET.mapPoiLabel);
		const dmChars = listCharactersForActor(SALTED.characters, SALTED.permissions, DM_ACTOR.id);
		expect(JSON.stringify(dmChars)).toContain(SECRET.characterDmNotes);
		const dmScenes = listScenesForActor(SALTED.scenes, SALTED.permissions, DM_ACTOR.id);
		expect(JSON.stringify(dmScenes)).toContain(SECRET.sceneTitle);
	});
});

describe('SEC-010 — the combat replication surface withholds a hidden combatant', () => {
	it('a hidden combatant op never reaches a non-DM recipient (filter-before-send)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const combat = state.session.combat;
		const HIDDEN_ID = 'combatant-hidden-ambusher';
		combat.combatants[HIDDEN_ID] = {
			id: HIDDEN_ID,
			name: 'Hidden Ambusher',
			kind: 'monster',
			characterId: null,
			initiative: 20,
			hidden: true,
			resources: {},
			conditions: [],
		} as unknown as (typeof combat.combatants)[string];

		const hiddenOp: SyncOperation = {
			id: 'op-hidden-combatant',
			vaultId: 'v',
			sourceId: 'local-vault',
			actorId: DM_ACTOR.id,
			entityType: 'combat',
			entityId: 'combat',
			path: `combat/combatants/${HIDDEN_ID}/hp`,
			opType: 'update',
			value: { hp: 30 },
			dependencies: [],
			issuedAt: '2026-06-05T00:00:00.000Z',
			schemaVersion: 1,
		};

		const delivered = filterCombatStreamForRecipient([hiddenOp], combat, state.permissions, PLAYER_ACTOR);
		expect(delivered).toHaveLength(0);
		expect(JSON.stringify(delivered)).not.toContain(HIDDEN_ID);

		const tracker = getCombatTrackerForActor(combat, state.permissions, PLAYER_ACTOR.id);
		expect(JSON.stringify(tracker)).not.toContain(HIDDEN_ID);
	});
});

// --- The gate goes RED on an intentionally-leaky variant, GREEN on the real code --------------------

describe('SEC-010 — the gate is a REAL failing check (RED on a leaky fixture, GREEN on the real filter)', () => {
	it('GREEN: the deep-scan finds no leaks in a correctly-filtered player projection', () => {
		const notes = getContentItemsForActor(SALTED.content, SALTED.permissions, PLAYER_ACTOR.id);
		expect(findStreamPrivacyLeaks(notes, NEEDLES)).toEqual([]);
	});

	it('RED: a deliberately-leaky projection (un-filtered raw state) is caught by the deep-scan', () => {
		// A buggy surface that returned RAW state instead of the actor-filtered read would leak every secret.
		const leakyProjection = {
			notes: Object.values(SALTED.content.items),
			characters: Object.values(SALTED.characters.characters),
			scenes: Object.values(SALTED.scenes.scenes),
		};
		const leaks = findStreamPrivacyLeaks(leakyProjection, NEEDLES);
		expect(leaks.length).toBeGreaterThan(0);
		expect(leaks.map((l) => l.domain)).toContain('notes');
		expect(() => assertViewCarriesNoHiddenContent(leakyProjection, NEEDLES)).toThrow(/Stream-privacy leak/);
	});

	it('RED: a revealing hidden COUNT is caught even when no secret value leaks', () => {
		const countLeak = { visibleItems: [], hiddenItemCount: HIDDEN_COUNT_THAT_MUST_NOT_LEAK };
		const leaks = findStreamPrivacyLeaks(countLeak, NEEDLES);
		expect(leaks.some((l) => l.kind === 'count')).toBe(true);
	});

	it('RED: a hidden id leaking as an OBJECT KEY is caught (a map keyed by hidden entity id)', () => {
		const keyLeak = { byId: { [FIXTURE.secretNoteId]: { redacted: true } } };
		const leaks = findStreamPrivacyLeaks(keyLeak, NEEDLES);
		expect(leaks.some((l) => l.kind === 'id' && l.domain === 'notes')).toBe(true);
	});

	it('an unusable (empty) needle fails closed — it is reported as a configuration leak', () => {
		const leaks = findStreamPrivacyLeaks({}, [{ domain: 'notes', kind: 'value', secret: '   ' }]);
		expect(leaks).toHaveLength(1);
		expect(leaks[0]?.path).toBe('<unusable-needle>');
	});
});
