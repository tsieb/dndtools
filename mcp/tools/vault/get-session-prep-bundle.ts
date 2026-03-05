import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { buildVaultIntelligence, DEFAULT_STALE_AFTER_DAYS } from './vault-intelligence.js';
import { collectCalendarEventEntries } from '../../../src/lib/domain/world-calendar-events.js';
import {
	formatWorldDate,
	normalizeWorldCalendar,
	parseWorldDateInput,
} from '../../../src/lib/domain/world-calendar.js';
import type { MapObject } from '../../../src/lib/types/object.js';
import type { SessionPartyLocation } from '../../../src/lib/types/session-state.js';

function parseTimestamp(value: string): number {
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function pickActiveLocationNoteId(
	boards: Awaited<ReturnType<FileSystemAdapter['getSessionBoards']>>,
): string | null {
	const sortedBoards = [...boards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	for (const board of sortedBoards) {
		const locationItems = (board.sessionContext?.items ?? [])
			.filter((item) => item.category === 'location')
			.sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
		if (locationItems.length > 0) {
			return String(locationItems[0]!.noteId);
		}
	}
	return null;
}

function toMapSummary(map: MapObject): {
	id: string;
	name: string;
	filePath: string;
	areaNoteId: string | null;
	tags: string[];
	updatedAt: string;
	scale: MapObject['data']['scale'] | null;
	grid: MapObject['data']['grid'] | null;
	initialViewport: MapObject['data']['initialViewport'] | null;
	parentMapId: string | null;
	parentPoiId: string | null;
} {
	const areaNoteId = map.data.areaNoteId?.trim() || null;
	const parentMapId = map.data.parentMapId?.trim() || null;
	const parentPoiId = map.data.parentPoiId?.trim() || null;
	return {
		id: String(map.id),
		name: map.name,
		filePath: map.data.filePath.trim() || `.vault/assets/maps/${String(map.id)}`,
		areaNoteId,
		tags: map.tags,
		updatedAt: map.updatedAt,
		scale: map.data.scale ?? null,
		grid: map.data.grid ?? null,
		initialViewport: map.data.initialViewport ?? null,
		parentMapId,
		parentPoiId,
	};
}

function selectActiveMap(
	maps: readonly MapObject[],
	partyLocation: SessionPartyLocation | null,
	activeLocationNoteId: string | null,
): MapObject | null {
	if (partyLocation) {
		const mapFromPartyLocation = maps.find((map) => String(map.id) === partyLocation.mapId);
		if (mapFromPartyLocation) return mapFromPartyLocation;
	}
	if (!activeLocationNoteId) return null;
	return (
		[...maps]
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.find((map) => map.data.areaNoteId === activeLocationNoteId) ?? null
	);
}

function resolveCurrentLocationContext(
	partyLocation: SessionPartyLocation | null,
	mapById: Readonly<Record<string, MapObject>>,
): {
	mapId: string;
	mapName: string | null;
	x: number;
	y: number;
	poiId: string | null;
	poiLabel: string | null;
	source: 'poi' | 'point';
	updatedAt: string;
} | null {
	if (!partyLocation) return null;
	const locationMap = mapById[partyLocation.mapId];
	const poi = partyLocation.poiId
		? (locationMap?.data.pois ?? []).find((entry) => entry.id === partyLocation.poiId)
		: null;
	return {
		mapId: partyLocation.mapId,
		mapName: locationMap?.name ?? null,
		x: partyLocation.x,
		y: partyLocation.y,
		poiId: partyLocation.poiId ?? null,
		poiLabel: poi?.label ?? null,
		source: partyLocation.source,
		updatedAt: partyLocation.updatedAt,
	};
}

function resolveParentMapContext(
	activeMap: MapObject | null,
	mapById: Readonly<Record<string, MapObject>>,
): {
	id: string;
	name: string;
	filePath: string;
	areaNoteId: string | null;
	tags: string[];
	updatedAt: string;
	locationOnParent: {
		poiId: string;
		poiLabel: string;
		coordinates: { x: number; y: number };
	} | null;
} | null {
	const parentMapId = activeMap?.data.parentMapId?.trim();
	if (!parentMapId) return null;
	const parent = mapById[parentMapId];
	if (!parent) return null;
	const parentPoiId = activeMap?.data.parentPoiId?.trim() || null;
	const parentPoi = parentPoiId
		? (parent.data.pois ?? []).find((entry) => entry.id === parentPoiId)
		: null;
	return {
		id: String(parent.id),
		name: parent.name,
		filePath: parent.data.filePath.trim() || `.vault/assets/maps/${String(parent.id)}`,
		areaNoteId: parent.data.areaNoteId?.trim() || null,
		tags: parent.tags,
		updatedAt: parent.updatedAt,
		locationOnParent: parentPoi
			? {
					poiId: parentPoi.id,
					poiLabel: parentPoi.label,
					coordinates: {
						x: parentPoi.x,
						y: parentPoi.y,
					},
				}
			: null,
	};
}

export function registerGetSessionPrepBundleTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'get_session_prep_bundle',
		'Build a session-prep bundle with priority notes, stale risks, and board context.',
		{
			focusTag: z.string().min(1).optional(),
			worldDate: z.union([z.string().min(1), z.number().int()]).optional(),
			staleAfterDays: z
				.number()
				.int()
				.min(1)
				.max(3650)
				.optional()
				.default(DEFAULT_STALE_AFTER_DAYS),
			recentLimit: z.number().int().min(1).max(100).optional().default(12),
			boardLimit: z.number().int().min(1).max(25).optional().default(8),
		},
		async ({ focusTag, worldDate, staleAfterDays, recentLimit, boardLimit }) => {
			const [insights, notes, boards, worldCalendarRaw, mapObjects, sessionState] =
				await Promise.all([
					buildVaultIntelligence(storage, {
						staleAfterDays,
						maxExamples: Math.max(recentLimit, boardLimit),
					}),
					storage.getAllNotes(),
					storage.getSessionBoards(),
					storage.getSetting('worldCalendar'),
					storage.getAllObjects({ type: 'map' }),
					typeof storage.getSessionState === 'function'
						? storage.getSessionState().catch(() => null)
						: Promise.resolve(null),
				]);
			const worldCalendar = normalizeWorldCalendar(worldCalendarRaw);
			const parsedWorldDate = parseWorldDateInput(worldCalendar, worldDate);
			const effectiveWorldDateOffset = parsedWorldDate?.dayOffset ?? worldCalendar.currentDayOffset;
			const maps = mapObjects.filter((object): object is MapObject => object.type === 'map');
			const mapById: Record<string, MapObject> = {};
			for (const map of maps) {
				mapById[String(map.id)] = map;
			}
			const partyLocation = sessionState?.partyLocation ?? null;

			const normalizedFocusTag = focusTag?.trim().toLowerCase();
			const activeNotes = notes.filter((note) => !note.deleted);
			const scopedNotes = normalizedFocusTag
				? activeNotes.filter((note) =>
						note.tags.some((tag) => tag.toLowerCase() === normalizedFocusTag),
					)
				: activeNotes;

			const recentScopedNotes = [...scopedNotes]
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, recentLimit)
				.map((note) => ({
					id: note.id,
					title: note.title,
					folder: note.folder,
					tags: note.tags,
					updatedAt: note.updatedAt,
				}));

			const staleCutoff = Date.now() - staleAfterDays * 24 * 60 * 60 * 1000;
			const staleScopedNotes = scopedNotes
				.filter((note) => parseTimestamp(note.updatedAt) <= staleCutoff)
				.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
				.slice(0, recentLimit)
				.map((note) => ({
					id: note.id,
					title: note.title,
					folder: note.folder,
					tags: note.tags,
					updatedAt: note.updatedAt,
				}));

			const boardContext = [...boards]
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, boardLimit)
				.map((board) => ({
					id: board.id,
					name: board.name,
					updatedAt: board.updatedAt,
					tileCount: board.tiles.length,
				}));
			const activeLocationNoteId = pickActiveLocationNoteId(boards);
			const activeMap = selectActiveMap(maps, partyLocation, activeLocationNoteId);
			const currentLocation = resolveCurrentLocationContext(partyLocation, mapById);
			const parentMap = resolveParentMapContext(activeMap, mapById);

			const continuityFlags = insights.coverageGaps
				.filter((gap) => gap.severity === 'high' || gap.severity === 'medium')
				.slice(0, 6);
			const calendarHighlights = collectCalendarEventEntries(activeNotes, worldCalendar, {
				fromDayOffset: effectiveWorldDateOffset - 30,
				toDayOffset: effectiveWorldDateOffset + 90,
			})
				.slice(0, recentLimit)
				.map((event) => ({
					noteId: event.noteId,
					title: event.title,
					kind: event.kind,
					dayOffset: event.dayOffset,
					dateShort: formatWorldDate(worldCalendar, event.dayOffset, 'short'),
					dateIso: formatWorldDate(worldCalendar, event.dayOffset, 'iso'),
					summary: event.summary,
				}));

			return jsonResult({
				bundle: 'session_prep',
				generatedAt: insights.generatedAt,
				worldDate: {
					dayOffset: effectiveWorldDateOffset,
					short: formatWorldDate(worldCalendar, effectiveWorldDateOffset, 'short'),
					iso: formatWorldDate(worldCalendar, effectiveWorldDateOffset, 'iso'),
				},
				focusTag: normalizedFocusTag ?? null,
				campaignHealth: insights.campaignHealth,
				recentScopedNotes,
				staleScopedNotes,
				calendarHighlights,
				boardContext,
				activeMap: activeMap ? toMapSummary(activeMap) : null,
				currentLocation,
				parentMap,
				continuityFlags,
				recommendedToolFlow: [
					'get_campaign_health',
					'get_coverage_gaps',
					'search_notes',
					'estimate_travel_time',
					'read_note',
				],
				safeOperatingPattern:
					'Keep edits staged by default; use this bundle to prioritize what to inspect before mutation.',
			});
		},
	);
}
