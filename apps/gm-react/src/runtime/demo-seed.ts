import {
	DND5E_SYSTEM_PACKAGE_ID,
	VAULT_OBJECT_SUBTYPE_KEY,
	characterLevel,
	isLiveContentItem,
	listWidgetLibrary,
	resolveAddWidgetCommand,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type McpAgentInvocation,
	type McpAgentToolResult,
} from '@dndtools/core';
import { activeLocalVaultId, listLocalVaults } from '../platform/storage/coreStore';

/**
 * demo-seed — populate a FRESH vault with representative campaign content so the prototype resembles
 * the design-studio prototype (which is populated everywhere), not an empty shell. It runs only when
 * a slice is empty, dispatching the SAME commands a DM would (`character.quick-create`,
 * `content.create-item`, `content.create-object`, `content.update-item`, `scene.create`,
 * `scene.add-widget`, `content.define-calendar`,
 * `audio.configure-source`, `session.audio.play`) through the single choke point — so the demo content
 * persists to IndexedDB and survives reload identically to user-authored content, and the PER-SLICE
 * emptiness guards mean each category seeds independently and never double-seeds.
 *
 * The Command Center board is NOT seeded here — its system widgets come from `command-center.ensure-home`.
 * Session-only live state (delivered handouts) is intentionally NOT seeded: a handout requires an
 * `active` Session workflow, and forcing the vault "live" on first load would be incoherent (no players
 * connected) and would mask the real empty-state. An empty delivered-handout list with no live session
 * is correct domain behaviour, not a gap.
 */

interface Seedable {
	readonly state: CoreStateSlice;
	readonly defaultActorId: string;
	dispatch(command: CoreCommand): Promise<CommandResult>;
	/** The runtime's agent pipeline, for the showcase's one staged assistant proposal. */
	invokeAgentTool?(invocation: McpAgentInvocation): Promise<McpAgentToolResult>;
}

// Player characters. A PC is authored ONLY through the guided draft flow — `character.quick-create`'s
// `kind` enum excludes 'pc' (CHAR-001), so seeding a PC the quick-create way is silently REJECTED. Each
// PC below is seeded the way a real player builds one: the DM creates a draft owned by a player, that
// player fills the three guided steps (identity → point-buy abilities → class) and finalizes it into a
// `kind: 'pc'` character. `finalize-draft` forces `visibility: 'shared'` with the owning player
// (broadening to player-visible is a later CHAR epic with no command yet), so the DM sees the whole
// party while each player sees their own PC. Abilities must be a legal 27-point buy (each 8–15) or
// finalize rejects; combat stats are applied AFTER finalize via the DM-only `character.set-combat`
// (finalize seeds 0/0 HP, AC 10). Each PC is paired with a distinct seeded player actor as its owner.
const DEMO_PCS = [
	{
		owner: 'actor-player',
		name: 'Sera Duskwhisper',
		background: 'criminal',
		klass: 'rogue',
		abilities: { str: 8, dex: 15, con: 14, int: 12, wis: 10, cha: 13 }, // 0+9+7+4+2+5 = 27
		combat: { hp: 24, maxHp: 24, ac: 15 },
	},
	{
		owner: 'actor-player-2',
		name: 'Brother Calloway',
		background: 'acolyte',
		klass: 'cleric',
		abilities: { str: 13, dex: 10, con: 14, int: 8, wis: 15, cha: 12 }, // 5+2+7+0+9+4 = 27
		combat: { hp: 31, maxHp: 31, ac: 18 },
	},
	{
		owner: 'actor-player-3',
		name: 'Tormund Ironfist',
		background: 'folk-hero',
		klass: 'fighter',
		abilities: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 13 }, // 9+4+7+0+2+5 = 27
		combat: { hp: 42, maxHp: 42, ac: 17 },
	},
] as const;

const DEMO_NPCS = [
	{ name: 'Mira the Ferryman', visibility: 'dm-only', hp: 9, ac: 12 },
	{ name: 'The Hollow King', visibility: 'dm-only', hp: 76, ac: 19 },
] as const;

const DEMO_NOTES = [
	{
		title: 'Campaign Primer',
		body: 'The realm of Saltreach sits on the edge of a drowned empire. The party gathers at the Pier.',
		visibility: 'player-visible',
	},
	{
		title: 'The Sunken Crypt — DM notes',
		body: 'Beneath the old keep: flooded antechamber, a sealed reliquary, and something that breathes in the dark.',
		visibility: 'dm-only',
	},
	{
		title: 'Faction · The Ashen Hand',
		body: 'A cult of tide-priests bargaining with the Hollow King. Motive: raise the drowned empire.',
		visibility: 'dm-only',
	},
] as const;

// CONTENT-013 — faction dossiers as real note-backed Vault Objects (`content.create-object`, subtype
// `faction`), so the Campaign → Factions tab renders live core entities instead of sample data. Card
// data (kind/stance/leader/goals + the dm-only secret) lives in the validated frontmatter fields; the
// prose summary is the markdown body. One faction is player-visible so a previewed player still sees
// a populated (but secret-free) tab; the hostile cult stays dm-only.
const DEMO_FACTIONS = [
	{
		title: 'Brine Hand',
		visibility: 'dm-only',
		body: 'A drowned-god cult that took the Sunken Outpost as a smuggling waypoint and a temple. They move cargo at low tide and pray to something in the lower vaults at high.',
		fields: {
			name: 'Brine Hand',
			kind: 'cult',
			stance: 'hostile',
			leader: 'Mother Sild',
			goals: ['Wake what sleeps below the vaults', 'Keep the shipment route open through the 14th'],
			secret:
				'Sild doesn’t lead the cult so much as translate for it. If the Bell rings twice, she stops being in charge.',
		},
	},
	{
		title: 'Saltmarsh Watch',
		visibility: 'player-visible',
		body: 'The town militia — understaffed, underpaid, and quietly humiliated since they lost Sergeant Vorlag to the cult and never figured out how.',
		fields: {
			name: 'Saltmarsh Watch',
			kind: 'militia',
			stance: 'neutral',
			leader: 'Captain Roese',
			goals: ['Recover the missing shipment to save face', 'Find out who turned Vorlag'],
			secret: 'Roese suspects a second cult sympathizer still wears a watch tabard.',
		},
	},
	{
		title: 'Dockworkers’ Union',
		visibility: 'player-visible',
		body: 'The dockworkers’ guild — they know every tide, every bribe, and every crate that moves on the waterfront. Friendly, for a price.',
		fields: {
			name: 'Dockworkers’ Union',
			kind: 'guild',
			stance: 'friendly',
			leader: 'Dockmaster Pell',
			goals: ['Keep the docks working through the trouble'],
			secret:
				'Pell’s the leak — the tide schedule that let the cult take the shipment came from his own hand.',
		},
	},
] as const;

// GRAPH/CONTENT-006 — [[wikilinks]] between the seeded notes, so Knowledge backlinks and the Graph's
// wikilink edges are non-empty out of the box. Each line is APPENDED to an existing note body through
// the real `content.update-item` command. Wikilink targets resolve by note TITLE (case-insensitive;
// `state/wikilink-graph.ts`), and backlinks are computed between `kind: 'note'` items only — so every
// line below links note→note by exact seeded title. Player-safe: a player-visible source only names
// player-visible targets (a raw body leaks its link text to every reader of that note).
const DEMO_WIKILINK_APPENDS = [
	{
		source: 'Campaign Primer',
		line: 'The elders still speak of [[The Drowning of Saltreach]]; the company’s own story begins at [[The party makes landfall]].',
		targets: ['The Drowning of Saltreach', 'The party makes landfall'],
	},
	{
		source: 'The Sunken Crypt — DM notes',
		line: 'The rites below answer to [[Faction · The Ashen Hand]] — read [[The Hollow King stirs]] before the party descends.',
		targets: ['Faction · The Ashen Hand', 'The Hollow King stirs'],
	},
	{
		source: 'Faction · The Ashen Hand',
		line: 'Their next rite is staged beneath [[The Sunken Crypt — DM notes]].',
		targets: ['The Sunken Crypt — DM notes'],
	},
] as const;

const DEMO_SCENES = [
	{
		name: 'The Sunken Crypt',
		description:
			'A flooded antechamber beneath the old keep — the reliquary lies past the broken seal.',
		visibility: 'dm-only',
		tags: ['dungeon', 'combat'],
		seedWidgets: true,
	},
	{
		name: 'Harbor of Saltreach',
		description: 'The tide-worn docks where the party first makes landfall.',
		visibility: 'player-visible',
		tags: ['town', 'social'],
		seedWidgets: false,
	},
] as const;

// CONTENT-011 — a campaign calendar so the Campaign → Timeline tab (which reads notes' in-calendar
// dates via `getCalendarTimelineForActor`) renders populated instead of empty. The dated notes below
// reference this calendar by id; it must be defined BEFORE them (their dates are validated against it).
const DEMO_CALENDAR = {
	id: 'calendar-saltreach',
	name: 'Reckoning of Saltreach',
	epochLabel: 'AR',
	months: [
		{ id: 'cal-month-thaw', name: 'Thawmonth', days: 30 },
		{ id: 'cal-month-tide', name: 'Tidemarch', days: 30 },
		{ id: 'cal-month-bright', name: 'Brightmoor', days: 31 },
		{ id: 'cal-month-high', name: 'Highsun', days: 31 },
		{ id: 'cal-month-harvest', name: 'Harvestwane', days: 30 },
		{ id: 'cal-month-mourn', name: 'Mournfrost', days: 30 },
	],
} as const;

// Narrative beats with in-calendar dates → three rows on the campaign timeline (earliest first).
const DEMO_DATED_NOTES = [
	{
		title: 'The Drowning of Saltreach',
		body: 'Twenty-five years gone, the tide rose and never fell. The old city sank in a single night.',
		visibility: 'player-visible',
		date: { year: 1041, month: 2, day: 14 },
	},
	{
		title: 'The party makes landfall',
		body: 'Session 1 — the adventurers step onto the tide-worn pier at Saltreach as the bells toll.',
		visibility: 'player-visible',
		date: { year: 1066, month: 2, day: 3 },
	},
	{
		title: 'The Hollow King stirs',
		body: "Omens beneath the crypt. The Ashen Hand's ritual nears its hour — and the deep water listens.",
		visibility: 'dm-only',
		date: { year: 1066, month: 5, day: 21 },
	},
] as const;

// AUDIO-009/010 — a declared, supported web-stream source (cache behaviour declared ⇒ playback enabled)
// played as the session's now-playing track, so the Audio screen's now-playing strip is populated. A
// web-stream needs no imported asset bytes (the stream IS the track), so this seeds with no file import.
// The URL is a generated data: URI (a 0.25s silent WAV loop) rather than a fake remote host: the
// app-level playback driver mounts an <audio> for the now-playing track on every route, and a
// non-resolvable host would log a network error on every page (breaking the console-clean gates).
// Silence keeps the demo honest — the transport genuinely plays; there is just nothing to hear.
function silentWavDataUri(): string {
	const sampleRate = 8000;
	const samples = Math.round(sampleRate * 0.25);
	const bytes = new Uint8Array(44 + samples).fill(128, 44); // 8-bit unsigned silence
	const view = new DataView(bytes.buffer);
	const ascii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
	};
	ascii(0, 'RIFF');
	view.setUint32(4, 36 + samples, true);
	ascii(8, 'WAVE');
	ascii(12, 'fmt ');
	view.setUint32(16, 16, true); // fmt chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate, true); // byte rate (8-bit mono)
	view.setUint16(32, 1, true); // block align
	view.setUint16(34, 8, true); // bits per sample
	ascii(36, 'data');
	view.setUint32(40, samples, true);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return `data:audio/wav;base64,${btoa(bin)}`;
}

const DEMO_AUDIO = {
	source: {
		type: 'web-stream',
		displayName: 'Tides Beneath Saltreach (silent sample loop)',
		url: silentWavDataUri(),
		cacheBehavior: 'cache-required',
	},
	volume: 0.5,
} as const;

function sceneIdFromResult(result: CommandResult): string | null {
	if (result.status !== 'accepted') return null;
	for (const event of result.events) {
		const sceneId = (event as { sceneId?: unknown }).sceneId;
		if (typeof sceneId === 'string') return sceneId;
	}
	return null;
}

/** Pull a string field off the first emitted event of a given `kind` (e.g. the new draft/character id). */
function eventField(result: CommandResult, kind: string, field: string): string | null {
	if (result.status !== 'accepted') return null;
	for (const event of result.events) {
		if ((event as { kind?: string }).kind === kind) {
			const value = (event as Record<string, unknown>)[field];
			if (typeof value === 'string') return value;
		}
	}
	return null;
}

function sourceIdFromResult(result: CommandResult): string | null {
	if (result.status !== 'accepted') return null;
	for (const event of result.events) {
		const sourceId = (event as { sourceId?: unknown }).sourceId;
		if (typeof sourceId === 'string') return sourceId;
	}
	return null;
}

/** The first entity (by name) of one of `entityTypes` that a seeded widget can bind to, if any. */
function bindableEntity(
	state: CoreStateSlice,
	entityTypes: readonly string[],
): { entityType: string; entityId: string } | null {
	for (const entityType of entityTypes) {
		const candidates =
			entityType === 'character'
				? Object.entries(state.characters.characters).map(([id, c]) => ({ id, name: c.name }))
				: entityType === 'map'
					? Object.values(state.maps.maps).map((m) => ({ id: m.id, name: m.name }))
					: Object.values(state.content.items)
							.filter((item) => item.kind === entityType && isLiveContentItem(item))
							.map((item) => ({ id: item.id, name: item.title }));
		const first = candidates.sort((a, b) => a.name.localeCompare(b.name))[0];
		if (first) return { entityType, entityId: first.id };
	}
	return null;
}

// Surface a swallowed rejection in dev so a mis-shaped seed datum is visible, not silently dropped.
function expect(result: CommandResult, label: string): CommandResult {
	if (result.status === 'rejected' && import.meta.env.DEV) {
		console.warn(
			`[demo-seed] "${label}" was rejected:`,
			result.rejection?.message ?? result.rejection,
		);
	}
	return result;
}

/** Whether this document opened the demo vault (RC-UX-3.7). An unreadable catalog is not the demo. */
export function isDemoVaultDocument(): boolean {
	try {
		const id = activeLocalVaultId();
		return listLocalVaults().some((vault) => vault.id === id && vault.kind === 'demo');
	} catch {
		return false;
	}
}

/**
 * Seed a vault. Every vault that seeds gets the base content below; the demo vault the switcher opens
 * (RC-UX-3.7) also gets the showcase layer, so every surface has real content to borrow from. The
 * original vault never gets the showcase: its base seed is the e2e fixture every spec relies on.
 */
export async function seedDemoContent(
	rt: Seedable,
	options: { showcase?: boolean } = {},
): Promise<boolean> {
	const base = await seedBaseContent(rt);
	const showcase = (options.showcase ?? isDemoVaultDocument()) && (await seedShowcase(rt));
	return base || showcase;
}

async function seedBaseContent(rt: Seedable): Promise<boolean> {
	const actorId = rt.defaultActorId;
	// Capture emptiness UP FRONT so a partial seed never double-seeds on the next load. Each category
	// guards independently — a vault seeded before these categories existed still backfills them.
	const needCharacters = Object.keys(rt.state.characters.characters).length === 0;
	const needNotes = Object.keys(rt.state.content.items).length === 0;
	const needScenes =
		Object.values(rt.state.scenes.scenes).filter((s) => !s?.templateMeta?.isTemplate).length === 0;
	const needCalendar = Object.keys(rt.state.content.calendars).length === 0;
	const needAudio = Object.keys(rt.state.audio.sources).length === 0;
	// Factions guard on THEIR OWN emptiness (any faction-subtype object), so a vault seeded before the
	// faction category existed still backfills it.
	const needFactions = !Object.values(rt.state.content.items).some(
		(item) => item.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'faction',
	);
	// Wikilinks guard on their own emptiness too: notes exist (or are about to be seeded) and NONE
	// carries a `[[wikilink]]` yet. The append pass itself re-reads live state AFTER the note/calendar
	// categories run, so it only ever links notes that actually exist in this vault.
	const liveNotesUpFront = Object.values(rt.state.content.items).filter(
		(item) => item.kind === 'note' && isLiveContentItem(item),
	);
	const needWikilinks =
		(needNotes || liveNotesUpFront.length > 0) &&
		liveNotesUpFront.every((item) => !item.body.includes('[['));
	// Owner grants guard on THEIR OWN absence, like factions/wikilinks: a vault seeded before the
	// per-PC owner grant existed has the demo PCs but no grants (finalize-draft never auto-grants,
	// PERM-004), leaving the player personas unable to level up or journal their own PC. Collect the
	// pre-existing demo PCs that are missing one so the pass below backfills exactly those.
	const hasOwnerGrant = (characterId: string, playerActorId: string) =>
		rt.state.permissions.grants.some(
			(g) =>
				g.entityType === 'character' &&
				g.entityId === characterId &&
				g.playerActorId === playerActorId &&
				g.capabilitySet === 'owner',
		);
	const ownerGrantBackfill = DEMO_PCS.flatMap((pc) => {
		const existing = Object.entries(rt.state.characters.characters).find(
			([, c]) => c.kind === 'pc' && c.name === pc.name,
		);
		return existing && !hasOwnerGrant(existing[0], pc.owner)
			? [{ name: pc.name, characterId: existing[0], owner: pc.owner }]
			: [];
	});
	// RC-ENG-8.2 backfill: a home board created before its Map tile was bound on creation opens on
	// "The linked map is missing or was removed." `command-center.ensure-home` repairs exactly that
	// (it binds an unbound Map tile to the default map), so it runs when the board has one and the
	// vault has a map to bind. A fresh vault's board is created bound, by the Board screen, after this.
	const homeScene = rt.state.commandCenter.homeSceneId
		? rt.state.scenes.scenes[rt.state.commandCenter.homeSceneId]
		: undefined;
	const needHomeMapBinding =
		Object.keys(rt.state.maps.maps).length > 0 &&
		(homeScene?.widgets.some((widget) => widget.type === 'map' && !widget.binding) ?? false);
	if (
		!needCharacters &&
		!needNotes &&
		!needScenes &&
		!needCalendar &&
		!needAudio &&
		!needFactions &&
		!needWikilinks &&
		!needHomeMapBinding &&
		ownerGrantBackfill.length === 0
	)
		return false;

	try {
		if (needCharacters) {
			// NPCs: DM quick-create (simple, DM-only).
			for (const c of DEMO_NPCS) {
				expect(
					await rt.dispatch({
						type: 'character.quick-create',
						actorId,
						payload: {
							kind: 'npc',
							name: c.name,
							visibility: c.visibility,
							combat: { hp: c.hp, maxHp: c.hp, ac: c.ac },
							attacks: [],
							data: {},
							dmOnlyFields: [],
						},
					}),
					`npc ${c.name}`,
				);
			}
			// PCs: the guided draft flow. create-draft is DM-only and assigns a PLAYER owner; the guided
			// steps and finalize are OWNER-ONLY, so they are dispatched AS the owning player (the runtime
			// passes the command's actorId straight through to the core authority check). finalize yields
			// the `kind: 'pc'` character; set-combat (DM-only) then gives it real HP/AC.
			for (const pc of DEMO_PCS) {
				const created = expect(
					await rt.dispatch({
						type: 'character.create-draft',
						actorId,
						payload: { ownerActorId: pc.owner, name: pc.name },
					}),
					`draft ${pc.name}`,
				);
				const draftId = eventField(created, 'character.draft-created', 'draftId');
				if (!draftId) continue;
				const step = (stepId: string, values: Record<string, unknown>) =>
					rt.dispatch({
						type: 'character.update-draft-step',
						actorId: pc.owner,
						payload: { draftId, stepId, values },
					});
				await step('identity', { name: pc.name, background: pc.background });
				await step('abilities', { ...pc.abilities });
				await step('class', { class: pc.klass });
				const finalized = expect(
					await rt.dispatch({
						type: 'character.finalize-draft',
						actorId: pc.owner,
						payload: { draftId },
					}),
					`finalize ${pc.name}`,
				);
				const characterId = eventField(finalized, 'character.created', 'characterId');
				if (!characterId) continue;
				expect(
					await rt.dispatch({
						type: 'character.set-combat',
						actorId,
						payload: { characterId, ...pc.combat },
					}),
					`combat ${pc.name}`,
				);
				// finalize-draft does NOT auto-grant the `owner` capability set (PERM-004 grants are
				// explicit), so without this the player persona can't level up or journal on their own PC.
				expect(
					await rt.dispatch({
						type: 'permission.grant-capability-set',
						actorId,
						payload: {
							entityType: 'character',
							entityId: characterId,
							playerActorId: pc.owner,
							capabilitySet: 'owner',
							expiresAt: null,
						},
					}),
					`owner grant ${pc.name}`,
				);
			}
		}

		// PERM-004 backfill for vaults seeded BEFORE the owner grant existed (needCharacters is false
		// there forever, so the in-loop grant above never runs for them).
		for (const grant of ownerGrantBackfill) {
			expect(
				await rt.dispatch({
					type: 'permission.grant-capability-set',
					actorId,
					payload: {
						entityType: 'character',
						entityId: grant.characterId,
						playerActorId: grant.owner,
						capabilitySet: 'owner',
						expiresAt: null,
					},
				}),
				`owner grant backfill ${grant.name}`,
			);
		}

		if (needNotes) {
			for (const n of DEMO_NOTES) {
				expect(
					await rt.dispatch({
						type: 'content.create-item',
						actorId,
						payload: { kind: 'note', title: n.title, body: n.body, visibility: n.visibility },
					}),
					`note ${n.title}`,
				);
			}
		}

		// Faction dossiers as real Vault Objects (CONTENT-013 subtype `faction`) → a populated Campaign
		// Factions tab. `content.create-object` schema-validates the frontmatter fields fail-closed.
		if (needFactions) {
			for (const f of DEMO_FACTIONS) {
				expect(
					await rt.dispatch({
						type: 'content.create-object',
						actorId,
						payload: {
							subtype: 'faction',
							title: f.title,
							fields: { ...f.fields, goals: [...f.fields.goals] },
							body: f.body,
							visibility: f.visibility,
						},
					}),
					`faction ${f.title}`,
				);
			}
		}

		// Campaign calendar + dated narrative beats → a populated Timeline tab. Define the calendar first
		// (the dated notes' dates are validated against it on dispatch).
		if (needCalendar) {
			expect(
				await rt.dispatch({
					type: 'content.define-calendar',
					actorId,
					payload: { ...DEMO_CALENDAR, months: [...DEMO_CALENDAR.months] },
				}),
				'calendar',
			);
			for (const n of DEMO_DATED_NOTES) {
				expect(
					await rt.dispatch({
						type: 'content.create-item',
						actorId,
						payload: {
							kind: 'note',
							title: n.title,
							body: n.body,
							visibility: n.visibility,
							dateFields: { occurred: { calendarId: DEMO_CALENDAR.id, ...n.date } },
						},
					}),
					`dated note ${n.title}`,
				);
			}
		}

		// [[Wikilinks]] between the seeded notes → non-empty Knowledge backlinks + Graph wikilink edges.
		// Runs AFTER the note/calendar categories so the titles it links exist; re-reads LIVE state (the
		// runtime state getter tracks each accepted dispatch) and appends through `content.update-item`.
		if (needWikilinks) {
			const notesByTitle = new Map(
				Object.values(rt.state.content.items)
					.filter((item) => item.kind === 'note' && isLiveContentItem(item))
					.map((item) => [item.title, item]),
			);
			for (const append of DEMO_WIKILINK_APPENDS) {
				const source = notesByTitle.get(append.source);
				// Only link notes that actually exist in THIS vault (categories seed independently — the
				// dated targets live under the calendar guard), and never double-append into a linked body.
				if (!source || source.body.includes('[[')) continue;
				if (!append.targets.every((title) => notesByTitle.has(title))) continue;
				expect(
					await rt.dispatch({
						type: 'content.update-item',
						actorId,
						payload: { itemId: source.id, body: `${source.body}\n\n${append.line}` },
					}),
					`wikilinks ${append.source}`,
				);
			}
		}

		if (needHomeMapBinding) {
			expect(
				await rt.dispatch({ type: 'command-center.ensure-home', actorId, payload: {} }),
				'home map binding',
			);
		}

		// Now-playing session audio: configure a declared web-stream source, then play it as the track.
		if (needAudio) {
			const configured = expect(
				await rt.dispatch({
					type: 'audio.configure-source',
					actorId,
					payload: { ...DEMO_AUDIO.source },
				}),
				'audio source',
			);
			const sourceId = sourceIdFromResult(configured);
			if (sourceId) {
				expect(
					await rt.dispatch({
						type: 'session.audio.play',
						actorId,
						payload: { sourceId, volume: DEMO_AUDIO.volume, online: true },
					}),
					'audio play',
				);
			}
		}

		if (needScenes) {
			for (const s of DEMO_SCENES) {
				const result = await rt.dispatch({
					type: 'scene.create',
					actorId,
					payload: {
						name: s.name,
						description: s.description,
						visibility: s.visibility,
						tags: [...s.tags],
					},
				});
				if (!s.seedWidgets) continue;
				const sceneId = sceneIdFromResult(result);
				if (!sceneId) continue;
				// Place the first few library widgets so the scene editor opens populated, not empty. A widget
				// that requires a binding is bound to a seeded entity of its type, or left out when the vault
				// has none: placed unbound, the Character tile opened on "No character linked" (RC-ENG-8.2).
				const library = listWidgetLibrary(rt.state.widgets, rt.state.permissions, actorId, {
					profileId: 'desktop',
					includeUnavailable: false,
				}).slice(0, 3);
				let i = 0;
				for (const entry of library) {
					const command = resolveAddWidgetCommand(entry, sceneId, { x: 48 + i * 280, y: 48 });
					if (!command) continue;
					const required = entry.requiredBindings[0];
					const target = required ? bindableEntity(rt.state, required.entityTypes) : null;
					if (required && !target) continue;
					const binding =
						required && target
							? {
									source: target,
									mode: required.mode,
									requiredCapability: required.requiredCapability,
								}
							: null;
					await rt.dispatch({
						type: command.type,
						actorId,
						payload: { ...command.payload, widget: { ...command.payload.widget, binding } },
					});
					i += 1;
				}
			}
		}
	} catch {
		// Best-effort: a rejected seed command leaves that slice empty so the next load retries it.
		return true;
	}
	return true;
}

// ── RC-UX-3.7 — the SHOWCASE layer: the demo vault only ─────────────────────────────────────────
// The demo vault opened from the vault switcher is where a GM borrows ideas, so every surface gets
// real content: a system-package switch, a screen with a map tile, a custom widget and a running
// encounter with tokens, a scene package with audio, quests, typed relationships, saved searches, a
// level-2 character with resources and one staged assistant proposal. Everything goes through the
// same commands a GM would dispatch, inside the same single commit as the base seed, and each group
// guards on its own absence so a partially seeded demo backfills instead of doubling up.

/** A fork of 5e, selected: the Systems screen shows a switched campaign with 5e one click away. */
const SHOWCASE_SYSTEM = {
	packageId: 'custom:saltreach-house-rules',
	displayName: 'Saltreach house rules (5e)',
} as const;

const SHOWCASE_WIDGET_PACKAGE_ID = 'workspace.tide-clock';
const SHOWCASE_WIDGET_TYPE = 'tide-clock';

/** A custom widget: sandboxed HTML/CSS/JS written against the documented host API. */
const SHOWCASE_WIDGET_PACKAGE = {
	id: SHOWCASE_WIDGET_PACKAGE_ID,
	version: '1.0.0',
	displayName: 'Tide clock',
	widgets: [
		{
			type: SHOWCASE_WIDGET_TYPE,
			version: '1.0.0',
			displayName: 'Tide clock',
			author: 'workspace',
			description: 'A custom widget: when the water turns in the Sunken Crypt.',
			placement: { surfaces: ['scene'], libraryListed: true },
			renderEntrypoint: {
				runtime: 'custom-html-js',
				sandbox: 'iframe',
				assetPath: `widgets/${SHOWCASE_WIDGET_TYPE}/index.html`,
				hostApiVersion: 1,
			},
			style: {
				isolation: 'iframe-document',
				stylesheetAssetPaths: [`widgets/${SHOWCASE_WIDGET_TYPE}/styles.css`],
				capabilities: ['css-variables', 'host-theme-tokens'],
				tokens: [{ name: 'tide', value: '#5f8fa8' }],
			},
			supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
			defaultSize: { width: 280, height: 160 },
			minSize: { width: 200, height: 120 },
			resizePolicy: 'free',
			requiredBindings: [],
			optionalBindings: [],
			configurationSchema: { type: 'object', additionalProperties: true },
			capabilitySets: ['manager', 'operator', 'viewer'],
			commands: [],
			events: [],
			hostPermissions: [],
		},
	],
	migrations: [],
	assets: [
		{
			path: `widgets/${SHOWCASE_WIDGET_TYPE}/index.html`,
			kind: 'html',
			entrypoint: true,
			content:
				'<!doctype html><html><head><link rel="stylesheet" href="./styles.css" /></head><body><h1>Tide clock</h1><p data-tide></p><script src="./main.js"></script></body></html>',
		},
		{
			path: `widgets/${SHOWCASE_WIDGET_TYPE}/styles.css`,
			kind: 'css',
			content:
				'h1 { margin: 0 0 4px; font: 600 14px system-ui, sans-serif; } p { margin: 0; color: var(--widget-tide, #5f8fa8); }',
		},
		{
			path: `widgets/${SHOWCASE_WIDGET_TYPE}/main.js`,
			kind: 'javascript',
			content: [
				'var api = window.dndtoolsWidget;',
				"var out = api.root.querySelector('[data-tide]');",
				"function draw(c) { out.textContent = (c && c.tide) || 'The water turns at the eleventh bell.'; }",
				'api.onRender(function (props) { draw(props.configuration); });',
				'api.onConfigChanged(draw);',
			].join('\n'),
		},
	],
	portabilityWarnings: [],
};

/** The "screen": a map tile, the initiative tracker and the custom widget around a running fight. */
const SHOWCASE_SCREEN = {
	name: 'Showdown at the reliquary',
	description: 'The fight the party walked into: the map, the initiative order and the tide.',
	visibility: 'dm-only',
	tags: ['combat', 'showcase'],
	widgetTypes: ['map', 'initiative-tracker', SHOWCASE_WIDGET_TYPE],
} as const;

const SHOWCASE_ENCOUNTER = {
	title: 'Ambush at the reliquary',
	terrainNotes:
		'Knee-deep water across the antechamber: difficult terrain. The reliquary seal is warded.',
	monsters: [
		{
			name: 'Drowned acolyte',
			quantity: 2,
			challengeRating: 0.5,
			maxHp: 13,
			ac: 12,
			initiative: 12,
		},
		{ name: 'Mother Sild', quantity: 1, challengeRating: 3, maxHp: 45, ac: 14, initiative: 14 },
	],
	party: { size: 3, averageLevel: 2 },
} as const;

/**
 * The package's track is one of the starter-pack loops the app already serves (RC-AUD-1.3), streamed
 * from this origin: web streams must be http(s), so the base seed's `data:` loop is refused. The seed
 * plays it only long enough to save the preset, then stops, so opening the demo never starts a drone.
 */
function starterTrackUrl(file: string): string | null {
	if (typeof document === 'undefined') return null;
	try {
		const url = new URL(`audio/starter/${file}`, document.baseURI);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
	} catch {
		return null;
	}
}

const SHOWCASE_SCENE_PACKAGE = {
	trackFile: 'cavern-drone.wav',
	trackName: 'Cavern drone (starter pack)',
	presetName: 'Tides beneath Saltreach',
	title: 'Landfall at the pier',
	mood: 'exploration',
	lightingHint: 'dim',
	flavorText:
		'Bells toll across the grey water as the ferry bumps the pier. Somewhere under the planks, the tide is singing.',
	visibility: 'player-visible',
} as const;

const SHOWCASE_QUESTS = [
	{
		title: 'The missing shipment',
		status: 'active',
		visibility: 'dm-only',
		objectives: [
			{
				id: 'find-the-ledger',
				text: 'Find the dock ledger that lists the lost crates',
				done: true,
			},
			{
				id: 'follow-the-tide',
				text: 'Follow the low-tide route to the Sunken Outpost',
				done: false,
			},
			{ id: 'confront-pell', text: 'Ask Dockmaster Pell who sold the tide schedule', done: false },
		],
		body: 'Captain Roese wants the crates back before the Watch loses face again. The Brine Hand wants them kept.',
	},
	{
		title: 'Silence the second bell',
		status: 'paused',
		visibility: 'dm-only',
		objectives: [
			{ id: 'learn-the-rite', text: 'Learn what ringing the Bell twice would wake', done: false },
			{
				id: 'reach-the-bell',
				text: 'Reach the bell tower before the high tide on the 14th',
				done: false,
			},
		],
		body: 'If the Bell rings twice, Mother Sild stops being in charge. Nobody wants to meet whoever is next.',
	},
] as const;

/** Typed relationships are declared in a note's `relations:` front matter (RC-KNW-3.3, note→note). */
const SHOWCASE_RELATIONS = [
	{
		source: 'Faction · The Ashen Hand',
		relations: [
			'serves :: The Hollow King stirs',
			'performs rites in :: The Sunken Crypt — DM notes',
		],
	},
] as const;

/** A quest hook note, so the faction and the quest are connected by typed edges both ways. */
const SHOWCASE_QUEST_HOOK = {
	title: 'Quest hook · The missing shipment',
	visibility: 'dm-only',
	relations: ['stolen by :: Faction · The Ashen Hand', 'hidden in :: The Sunken Crypt — DM notes'],
	body: 'Three crates of lamp oil vanished off the Saltreach pier on a moonless low tide. The Watch blames smugglers; the ledger says otherwise.',
} as const;

const SHOWCASE_SAVED_SEARCHES = [
	{ name: 'Everything about the cult', filter: { query: 'cult' }, pinned: true },
	{ name: 'The Sunken Crypt', filter: { query: 'crypt' }, pinned: false },
] as const;

/** The fighter reaches level 2 and gets his 5e fighter resources. */
const SHOWCASE_LEVEL_UP = {
	name: 'Tormund Ironfist',
	className: 'Fighter',
	hitPointsGained: 8,
	resources: [
		{ id: 'second-wind', name: 'Second Wind', max: 1, recharge: 'short' },
		{ id: 'action-surge', name: 'Action Surge', max: 1, recharge: 'short' },
	],
} as const;

const SHOWCASE_ASSISTANT = {
	agentId: 'prep-assistant',
	label: 'Prep assistant',
	note: 'Campaign Primer',
	addedParagraph:
		'Twenty-five years after the Drowning, the bells still toll at low tide, and the Dockworkers’ Union charges double to row anyone past the old keep.',
} as const;

function withRelations(relations: readonly string[], body: string): string {
	return `---\nrelations:\n${relations.map((line) => `  - ${line}`).join('\n')}\n---\n${body}`;
}

/** The first string `field` on any event of an accepted result (ids the command minted). */
function eventString(result: CommandResult, field: string): string | null {
	if (result.status !== 'accepted') return null;
	for (const event of result.events) {
		const value = (event as Record<string, unknown>)[field];
		if (typeof value === 'string') return value;
	}
	return null;
}

function liveNoteByTitle(state: CoreStateSlice, title: string) {
	return Object.values(state.content.items).find(
		(item) => item.kind === 'note' && item.title === title && isLiveContentItem(item),
	);
}

async function placeLibraryWidget(
	rt: Seedable,
	sceneId: string,
	type: string,
	position: { x: number; y: number },
): Promise<void> {
	const entry = listWidgetLibrary(rt.state.widgets, rt.state.permissions, rt.defaultActorId, {
		profileId: 'desktop',
		includeUnavailable: false,
	}).find((candidate) => candidate.type === type);
	if (!entry) return;
	const command = resolveAddWidgetCommand(entry, sceneId, position);
	if (!command) return;
	const required = entry.requiredBindings[0];
	const target = required ? bindableEntity(rt.state, required.entityTypes) : null;
	if (required && !target) return;
	const binding =
		required && target
			? { source: target, mode: required.mode, requiredCapability: required.requiredCapability }
			: null;
	expect(
		await rt.dispatch({
			type: command.type,
			actorId: rt.defaultActorId,
			payload: { ...command.payload, widget: { ...command.payload.widget, binding } },
		}),
		`showcase widget ${type}`,
	);
}

async function seedShowcase(rt: Seedable): Promise<boolean> {
	const actorId = rt.defaultActorId;
	const state = () => rt.state;
	let seeded = false;
	const run = async (command: CoreCommand, label: string): Promise<CommandResult> => {
		const result = expect(await rt.dispatch(command), label);
		if (result.status === 'accepted') seeded = true;
		return result;
	};

	try {
		// A system-package switch: fork 5e into house rules and play them.
		if (!state().systems.packages[SHOWCASE_SYSTEM.packageId]) {
			const forked = await run(
				{
					type: 'system.fork',
					actorId,
					payload: { sourcePackageId: DND5E_SYSTEM_PACKAGE_ID, ...SHOWCASE_SYSTEM },
				},
				'showcase system fork',
			);
			if (forked.status === 'accepted') {
				await run(
					{ type: 'system.select', actorId, payload: { packageId: SHOWCASE_SYSTEM.packageId } },
					'showcase system select',
				);
			}
		}

		// The custom widget package, installed and enabled like any workspace package.
		if (!state().widgets.packages[SHOWCASE_WIDGET_PACKAGE_ID]) {
			const installed = await run(
				{
					type: 'widget.package.install',
					actorId,
					payload: { package: SHOWCASE_WIDGET_PACKAGE },
				},
				'showcase widget install',
			);
			if (installed.status === 'accepted') {
				await run(
					{
						type: 'widget.package.enable',
						actorId,
						payload: { packageId: SHOWCASE_WIDGET_PACKAGE_ID },
					},
					'showcase widget enable',
				);
			}
		}

		// The level-2 fighter with resources.
		const fighter = Object.entries(state().characters.characters).find(
			([, character]) => character.kind === 'pc' && character.name === SHOWCASE_LEVEL_UP.name,
		);
		const fighterOwner = DEMO_PCS.find((pc) => pc.name === SHOWCASE_LEVEL_UP.name)!.owner;
		if (fighter && characterLevel(fighter[1]) < 2) {
			await run(
				{
					type: 'character.apply-advancement',
					actorId,
					payload: {
						characterId: fighter[0],
						mode: 'milestone',
						className: SHOWCASE_LEVEL_UP.className,
						hitPointsGained: SHOWCASE_LEVEL_UP.hitPointsGained,
					},
				},
				'showcase level up',
			);
		}
		for (const resource of SHOWCASE_LEVEL_UP.resources) {
			if (!fighter || fighter[1].resources?.classResources?.[resource.id]) continue;
			await run(
				{
					type: 'character.set-class-resource',
					actorId: fighterOwner,
					payload: { characterId: fighter[0], ...resource },
				},
				`showcase resource ${resource.id}`,
			);
		}

		// Quests on the Campaign → Quests tab.
		const hasQuests = Object.values(state().content.items).some(
			(item) => item.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'quest',
		);
		if (!hasQuests) {
			for (const quest of SHOWCASE_QUESTS) {
				await run(
					{
						type: 'content.create-object',
						actorId,
						payload: {
							subtype: 'quest',
							title: quest.title,
							fields: {
								title: quest.title,
								status: quest.status,
								objectives: quest.objectives.map((objective) => ({ ...objective })),
							},
							body: quest.body,
							visibility: quest.visibility,
						},
					},
					`showcase quest ${quest.title}`,
				);
			}
		}

		// Typed relationships: the faction note declares its ties; the quest hook points back at it.
		for (const declaration of SHOWCASE_RELATIONS) {
			const source = liveNoteByTitle(state(), declaration.source);
			if (!source || source.body.startsWith('---')) continue;
			await run(
				{
					type: 'content.update-item',
					actorId,
					payload: { itemId: source.id, body: withRelations(declaration.relations, source.body) },
				},
				`showcase relations ${declaration.source}`,
			);
		}
		if (!liveNoteByTitle(state(), SHOWCASE_QUEST_HOOK.title)) {
			await run(
				{
					type: 'content.create-item',
					actorId,
					payload: {
						kind: 'note',
						title: SHOWCASE_QUEST_HOOK.title,
						body: withRelations(SHOWCASE_QUEST_HOOK.relations, SHOWCASE_QUEST_HOOK.body),
						visibility: SHOWCASE_QUEST_HOOK.visibility,
					},
				},
				'showcase quest hook',
			);
		}

		if (Object.keys(state().content.savedSearches).length === 0) {
			for (const search of SHOWCASE_SAVED_SEARCHES) {
				await run(
					{
						type: 'content.create-saved-search',
						actorId,
						payload: { name: search.name, filter: { ...search.filter }, pinned: search.pinned },
					},
					`showcase saved search ${search.name}`,
				);
			}
		}

		// A scene package: the now-playing track saved as a preset, carried by a scene card.
		const trackUrl = starterTrackUrl(SHOWCASE_SCENE_PACKAGE.trackFile);
		if (Object.keys(state().session.sceneCards.cards).length === 0 && trackUrl) {
			const configured = await run(
				{
					type: 'audio.configure-source',
					actorId,
					payload: {
						type: 'web-stream',
						displayName: SHOWCASE_SCENE_PACKAGE.trackName,
						url: trackUrl,
						cacheBehavior: 'cache-required',
						licenseNote: 'CC0 1.0 Universal (Lamplight starter pack)',
					},
				},
				'showcase audio source',
			);
			const sourceId = sourceIdFromResult(configured);
			let audioPresetId: string | null = null;
			if (sourceId) {
				await run(
					{
						type: 'session.audio.play',
						actorId,
						payload: { sourceId, volume: DEMO_AUDIO.volume, online: true },
					},
					'showcase audio play',
				);
				audioPresetId = eventString(
					await run(
						{
							type: 'audio.save-preset',
							actorId,
							payload: { name: SHOWCASE_SCENE_PACKAGE.presetName, category: 'urban' },
						},
						'showcase audio preset',
					),
					'presetId',
				);
				await run({ type: 'session.audio.stop', actorId, payload: {} }, 'showcase audio stop');
			}
			await run(
				{
					type: 'scene-card.create',
					actorId,
					payload: {
						title: SHOWCASE_SCENE_PACKAGE.title,
						mood: SHOWCASE_SCENE_PACKAGE.mood,
						flavorText: SHOWCASE_SCENE_PACKAGE.flavorText,
						audioPresetId,
						lightingHint: SHOWCASE_SCENE_PACKAGE.lightingHint,
						visibility: SHOWCASE_SCENE_PACKAGE.visibility,
					},
				},
				'showcase scene package',
			);
		}

		// The screen: a map tile, the combat tracker and the custom widget, around a running fight.
		const hasScreen = Object.values(state().scenes.scenes).some(
			(scene) => scene.name === SHOWCASE_SCREEN.name,
		);
		if (!hasScreen) {
			const created = await run(
				{
					type: 'scene.create',
					actorId,
					payload: {
						name: SHOWCASE_SCREEN.name,
						description: SHOWCASE_SCREEN.description,
						visibility: SHOWCASE_SCREEN.visibility,
						tags: [...SHOWCASE_SCREEN.tags],
					},
				},
				'showcase screen',
			);
			const sceneId = sceneIdFromResult(created);
			if (sceneId) {
				let x = 48;
				for (const type of SHOWCASE_SCREEN.widgetTypes) {
					await placeLibraryWidget(rt, sceneId, type, { x, y: 48 });
					x += 360;
				}
				await seedRunningEncounter(rt, run, sceneId);
			}
		}

		await seedStagedProposal(rt, run);
	} catch {
		// Best-effort, like the base seed: whatever landed commits; the guards retry the rest.
	}
	return seeded;
}

async function seedRunningEncounter(
	rt: Seedable,
	run: (command: CoreCommand, label: string) => Promise<CommandResult>,
	sceneId: string,
): Promise<void> {
	const actorId = rt.defaultActorId;
	const map = Object.values(rt.state.maps.maps).sort((a, b) => a.name.localeCompare(b.name))[0];
	if (Object.keys(rt.state.encounters.encounters).length > 0) return;
	if (rt.state.session.combat.status === 'running') return;
	const party = DEMO_PCS.flatMap((pc) => {
		const found = Object.entries(rt.state.characters.characters).find(
			([, character]) => character.kind === 'pc' && character.name === pc.name,
		);
		return found
			? [
					{
						kind: 'character' as const,
						name: pc.name,
						characterId: found[0],
						ac: pc.combat.ac,
						maxHp: pc.combat.maxHp,
					},
				]
			: [];
	});
	const built = await run(
		{
			type: 'encounter.build',
			actorId,
			payload: {
				title: SHOWCASE_ENCOUNTER.title,
				combatants: [
					...party,
					...SHOWCASE_ENCOUNTER.monsters.map((monster) => ({
						kind: 'monster' as const,
						...monster,
					})),
				],
				party: { ...SHOWCASE_ENCOUNTER.party },
				terrainNotes: SHOWCASE_ENCOUNTER.terrainNotes,
			},
		},
		'showcase encounter',
	);
	const encounterId = eventString(built, 'encounterId');
	if (!encounterId) return;
	// Combat is live-session state: the session goes live on the screen, the map goes active (so the
	// start places every combatant's token on it) and the encounter starts.
	const live = await run(
		{
			type: 'session.set-workflow',
			actorId,
			payload: { workflow: 'active', activeSceneId: sceneId, title: SHOWCASE_ENCOUNTER.title },
		},
		'showcase session live',
	);
	if (live.status !== 'accepted') return;
	if (map) {
		// The active map lives on the Command Center home, which the Board would otherwise create on
		// first paint; creating it here binds both map tiles to the same map.
		if (!rt.state.commandCenter.homeSceneId) {
			await run({ type: 'command-center.ensure-home', actorId, payload: {} }, 'showcase home');
		}
		await run(
			{ type: 'session.set-active-map', actorId, payload: { mapId: map.id } },
			'showcase active map',
		);
	}
	await run({ type: 'combat.start', actorId, payload: { encounterId } }, 'showcase combat');
}

async function seedStagedProposal(
	rt: Seedable,
	run: (command: CoreCommand, label: string) => Promise<CommandResult>,
): Promise<void> {
	if (!rt.invokeAgentTool || Object.keys(rt.state.mcp.proposals).length > 0) return;
	const actorId = rt.defaultActorId;
	const note = liveNoteByTitle(rt.state, SHOWCASE_ASSISTANT.note);
	if (!note) return;
	await run({ type: 'mcp.set-enabled', actorId, payload: { enabled: true } }, 'showcase mcp');
	await run(
		{
			type: 'mcp.set-agent-binding',
			actorId,
			payload: { agentId: SHOWCASE_ASSISTANT.agentId, actorId, label: SHOWCASE_ASSISTANT.label },
		},
		'showcase agent binding',
	);
	await run(
		{
			type: 'mcp.set-agent-policy',
			actorId,
			payload: {
				agentId: SHOWCASE_ASSISTANT.agentId,
				mode: 'strict_review',
				allowedToolIds: ['note.update'],
			},
		},
		'showcase agent policy',
	);
	const current = liveNoteByTitle(rt.state, SHOWCASE_ASSISTANT.note)!;
	await rt.invokeAgentTool({
		agentId: SHOWCASE_ASSISTANT.agentId,
		toolId: 'note.update',
		input: {
			itemId: current.id,
			baseRevision: current.revision,
			body: `${current.body}\n\n${SHOWCASE_ASSISTANT.addedParagraph}`,
		},
	});
}
