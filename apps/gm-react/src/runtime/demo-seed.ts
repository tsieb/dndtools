import {
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
 * `content.create-item`, `scene.create`, `scene.add-widget`, `content.define-calendar`,
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
const DEMO_AUDIO = {
	source: {
		type: 'web-stream',
		displayName: 'Tides Beneath Saltreach',
		url: 'https://stream.dndtools.local/saltreach-ambience',
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
	if (!needCharacters && !needNotes && !needScenes && !needCalendar && !needAudio) return false;

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
			}
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
