import {
	VAULT_OBJECT_SUBTYPE_KEY,
	isLiveContentItem,
	listWidgetLibrary,
	resolveAddWidgetCommand,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';

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
			secret: 'Sild doesn’t lead the cult so much as translate for it. If the Bell rings twice, she stops being in charge.',
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
			secret: 'Pell’s the leak — the tide schedule that let the cult take the shipment came from his own hand.',
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
		description: 'A flooded antechamber beneath the old keep — the reliquary lies past the broken seal.',
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

export async function seedDemoContent(rt: Seedable): Promise<boolean> {
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
	if (
		!needCharacters &&
		!needNotes &&
		!needScenes &&
		!needCalendar &&
		!needAudio &&
		!needFactions &&
		!needWikilinks &&
		ownerGrantBackfill.length === 0
	)
		return false;

	// Surface a swallowed rejection in dev so a mis-shaped seed datum is visible, not silently dropped.
	const expect = (result: CommandResult, label: string): CommandResult => {
		if (result.status === 'rejected' && import.meta.env.DEV) {
			console.warn(`[demo-seed] "${label}" was rejected:`, result.rejection?.message ?? result.rejection);
		}
		return result;
	};

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
					await rt.dispatch({ type: 'character.finalize-draft', actorId: pc.owner, payload: { draftId } }),
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
				await rt.dispatch({ type: 'content.define-calendar', actorId, payload: { ...DEMO_CALENDAR, months: [...DEMO_CALENDAR.months] } }),
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

		// Now-playing session audio: configure a declared web-stream source, then play it as the track.
		if (needAudio) {
			const configured = expect(
				await rt.dispatch({ type: 'audio.configure-source', actorId, payload: { ...DEMO_AUDIO.source } }),
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
					payload: { name: s.name, description: s.description, visibility: s.visibility, tags: [...s.tags] },
				});
				if (!s.seedWidgets) continue;
				const sceneId = sceneIdFromResult(result);
				if (!sceneId) continue;
				// Place the first few library widgets so the scene editor opens populated, not empty.
				const library = listWidgetLibrary(rt.state.widgets, rt.state.permissions, actorId, {
					profileId: 'desktop',
					includeUnavailable: false,
				}).slice(0, 3);
				let i = 0;
				for (const entry of library) {
					const command = resolveAddWidgetCommand(entry, sceneId, { x: 48 + i * 280, y: 48 });
					if (!command) continue;
					await rt.dispatch({ type: command.type, actorId, payload: command.payload });
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
