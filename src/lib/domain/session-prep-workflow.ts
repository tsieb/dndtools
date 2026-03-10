import { getStorage } from '$lib/platform/storage/index.js';
import type { StorageAdapter } from '$lib/types/storage.js';
import type { AppSettings } from '$lib/types/settings.js';
import type { SessionBoard } from '$lib/types/session-board.js';
import type { Note, Link } from '$lib/types/note.js';
import type { VaultObject, VaultObjectType } from '$lib/types/object.js';
import { parseToolEnvelope, type ToolResult } from '../../../mcp/tools/shared/response.js';
import { registerGetSessionPrepBundleTool } from '../../../mcp/tools/vault/get-session-prep-bundle.js';
import { registerGetOpenThreadsTool } from '../../../mcp/tools/vault/get-open-threads.js';
import { registerGetRecapGenerationBundleTool } from '../../../mcp/tools/vault/get-recap-generation-bundle.js';
import { registerGetContinuityCheckBundleTool } from '../../../mcp/tools/vault/get-continuity-check-bundle.js';

interface BundleStorageView {
	getAllNotes(options?: { includeDeleted?: boolean }): Promise<Note[]>;
	getAllObjects(options?: { type?: VaultObjectType; query?: string }): Promise<VaultObject[]>;
	getSessionBoards(): Promise<SessionBoard[]>;
	getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]>;
	getSessionState?(): Promise<unknown>;
	getIndexEntriesAsync(): Promise<
		Array<{
			id: string;
			title: string;
			folder: string;
			tags: string[];
			createdAt: string;
			updatedAt: string;
			deleted: boolean;
			deletedAt: string | null;
		}>
	>;
	getAllLinksFromIndexAsync(): Promise<
		Array<{ sourceId: string; targetId: string; displayText: string; position: number }>
	>;
}

type ToolHandler<TInput extends Record<string, unknown>> = (input: TInput) => Promise<ToolResult>;

class InlineToolServer<TInput extends Record<string, unknown>> {
	handler: ToolHandler<TInput> | null = null;

	tool(
		_name: string,
		_description: string,
		_schema: Record<string, unknown>,
		handler: ToolHandler<TInput>,
	): void {
		this.handler = handler;
	}
}

interface SessionPrepBundleData {
	generatedAt: string;
	recentScopedNotes: Array<{
		id: string;
		title: string;
		folder: string;
		tags: string[];
		updatedAt: string;
	}>;
	continuityFlags: Array<{
		key: string;
		severity: 'low' | 'medium' | 'high';
		count: number;
		message: string;
		exampleNoteIds: string[];
	}>;
}

interface OpenThreadsBundleData {
	quests: Array<{
		noteId: string;
		title: string;
		status: string | null;
		objective: string | null;
		updatedAt: string;
	}>;
	npcs: Array<{
		noteId: string;
		title: string;
		disposition: string | null;
		updatedAt: string;
		reason: string;
	}>;
}

interface RecapGenerationBundleData {
	since: string;
	changedNotes: Array<{ title: string }>;
	changedObjects: Array<{ name: string }>;
	changedBoards: Array<{ name: string }>;
	calendarSummaries: Array<{ title: string }>;
	tagMomentum: Array<{ tag: string; count: number }>;
}

interface ContinuityCheckBundleData {
	generatedAt: string;
	continuityRisks: Array<{
		key: string;
		severity: 'low' | 'medium' | 'high';
		count: number;
		message: string;
		exampleNoteIds: string[];
		suggestedAction: string;
	}>;
}

function createBundleStorageView(storage: StorageAdapter): BundleStorageView {
	const readSessionState = storage.getSessionState?.bind(storage);
	return {
		getAllNotes: (options) => storage.getAllNotes(options),
		getAllObjects: (options) => storage.getAllObjects(options),
		getSessionBoards: () => storage.getSessionBoards(),
		getSetting: (key) => storage.getSetting(key),
		getSessionState: readSessionState ? () => readSessionState() : undefined,
		getIndexEntriesAsync: async () => {
			const notes = await storage.getAllNotes({ includeDeleted: true });
			return notes.map((note) => ({
				id: String(note.id),
				title: note.title,
				folder: String(note.folder),
				tags: [...note.tags],
				createdAt: note.createdAt,
				updatedAt: note.updatedAt,
				deleted: note.deleted,
				deletedAt: note.deletedAt,
			}));
		},
		getAllLinksFromIndexAsync: async () => {
			const allLinks = storage.getAllLinks
				? await storage.getAllLinks()
				: await deriveLinksFromNotes(storage);
			return allLinks.map((link) => ({
				sourceId: String(link.sourceId),
				targetId: String(link.targetId),
				displayText: link.displayText,
				position: link.position,
			}));
		},
	};
}

async function deriveLinksFromNotes(storage: StorageAdapter): Promise<Link[]> {
	const notes = await storage.getAllNotes({ includeDeleted: true });
	const linksPerNote = await Promise.all(notes.map((note) => storage.getLinksFrom(note.id)));
	return linksPerNote.flat();
}

async function invokeBundleTool<TInput extends Record<string, unknown>, TResult>(
	register: (server: InlineToolServer<TInput>, storage: BundleStorageView) => void,
	input: TInput,
	toolName: string,
): Promise<TResult> {
	const server = new InlineToolServer<TInput>();
	register(server, createBundleStorageView(getStorage()));
	if (!server.handler) {
		throw new Error(`${toolName} tool handler was not registered.`);
	}
	const result = await server.handler(input);
	const envelope = parseToolEnvelope(result);
	if (!envelope) {
		throw new Error(`${toolName} returned an unreadable envelope.`);
	}
	if (!envelope.ok) {
		throw new Error(`${toolName} failed: ${envelope.error.message}`);
	}
	return envelope.data as TResult;
}

function normalizeName(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

function normalizeLookupValue(value: string): string {
	return normalizeName(value).toLowerCase();
}

function extractFirstParagraph(content: string): string {
	const normalized = content.replace(/\r\n/g, '\n');
	const lines = normalized.split('\n');
	const parts: string[] = [];
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) {
			if (parts.length > 0) break;
			continue;
		}
		if (parts.length === 0 && (line.startsWith('#') || line.startsWith('- '))) {
			continue;
		}
		if (line.startsWith('## ')) break;
		parts.push(line);
	}
	return parts.join(' ').trim();
}

function formatIsoDate(value: string): string {
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) return value;
	return new Date(parsed).toLocaleString();
}

function buildRecapSignalLine(bundle: RecapGenerationBundleData): string {
	const tagText = bundle.tagMomentum
		.slice(0, 3)
		.map((entry) => `${entry.tag} (${entry.count})`)
		.join(', ');
	const base =
		`Bundle signal since ${new Date(bundle.since).toLocaleDateString()}: ` +
		`${bundle.changedNotes.length} note updates, ` +
		`${bundle.changedObjects.length} object updates, ` +
		`${bundle.calendarSummaries.length} timeline events.`;
	return tagText ? `${base} Top tags: ${tagText}.` : base;
}

function summarizeLastSession(
	notes: readonly Note[],
	recapBundle: RecapGenerationBundleData,
): string {
	const latestSessionNote =
		[...notes]
			.filter((note) => !note.deleted)
			.filter(
				(note) =>
					String(note.folder) === '/sessions' ||
					note.tags.some((tag) => normalizeLookupValue(tag) === 'session'),
			)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
	if (!latestSessionNote) {
		return buildRecapSignalLine(recapBundle);
	}
	const extracted = extractFirstParagraph(latestSessionNote.content);
	if (!extracted) {
		return buildRecapSignalLine(recapBundle);
	}
	return `${extracted} ${buildRecapSignalLine(recapBundle)}`;
}

function filterUndeliveredHandouts(
	notes: readonly Note[],
	board: SessionBoard | null,
): Array<{ id: string; title: string; updatedAt: string }> {
	const deliveredTitles = new Set(
		(board?.handoutHistory ?? [])
			.map((entry) => normalizeLookupValue(entry.title))
			.filter((title) => title.length > 0),
	);
	return [...notes]
		.filter((note) => !note.deleted)
		.filter((note) =>
			note.tags.some((tag) => {
				const normalized = normalizeLookupValue(tag);
				return normalized === 'handout' || normalized === 'player-facing';
			}),
		)
		.filter((note) => !deliveredTitles.has(normalizeLookupValue(note.title)))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.slice(0, 12)
		.map((note) => ({
			id: String(note.id),
			title: note.title,
			updatedAt: note.updatedAt,
		}));
}

function buildOpenThreadCards(bundle: OpenThreadsBundleData): SessionPrepThreadCard[] {
	const quests = bundle.quests.map<SessionPrepThreadCard>((entry) => ({
		noteId: entry.noteId,
		title: entry.title,
		kind: 'quest',
		detail: entry.status ?? entry.objective ?? 'Open quest thread',
		updatedAt: entry.updatedAt,
	}));
	const npcs = bundle.npcs.map<SessionPrepThreadCard>((entry) => ({
		noteId: entry.noteId,
		title: entry.title,
		kind: 'npc',
		detail: entry.disposition ?? entry.reason.replace(/_/g, ' '),
		updatedAt: entry.updatedAt,
	}));
	return [...quests, ...npcs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);
}

export interface SessionPrepThreadCard {
	noteId: string;
	title: string;
	kind: 'quest' | 'npc';
	detail: string;
	updatedAt: string;
}

export interface SessionPrepViewModel {
	generatedAt: string;
	openThreads: SessionPrepThreadCard[];
	notesToReview: Array<{
		id: string;
		title: string;
		folder: string;
		tags: string[];
		updatedAt: string;
	}>;
	lastSessionSummary: string;
	handoutsToDeliver: Array<{
		id: string;
		title: string;
		updatedAt: string;
	}>;
	continuityFlags: Array<{
		key: string;
		severity: 'low' | 'medium' | 'high';
		count: number;
		message: string;
		exampleNoteIds: string[];
	}>;
}

export interface BuildSessionLogInput {
	sessionBoardId: string | null;
	startedAt: string | null;
	endedAt: string;
	whatHappened: string;
	npcNames: string[];
	locationNames: string[];
	questNames: string[];
	followUp: string;
	rollLogMarkdown: string;
}

export interface SessionContinuitySummary {
	generatedAt: string;
	continuityRisks: Array<{
		key: string;
		severity: 'low' | 'medium' | 'high';
		message: string;
		suggestedAction: string;
		exampleNoteIds: string[];
	}>;
	missingNpcNames: string[];
	unmappedLocationNames: string[];
}

export function parseTagEntryInput(value: string): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of value.split(/[\n,;]+/)) {
		const normalized = normalizeName(raw);
		if (!normalized) continue;
		const key = normalizeLookupValue(normalized);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(normalized);
	}
	return result;
}

function normalizeRollLogSection(markdown: string): string {
	const trimmed = markdown.trim();
	if (!trimmed) return '';
	if (trimmed.startsWith('## Session Roll Log')) {
		return trimmed.replace(/^## Session Roll Log\s*/u, '').trim();
	}
	return trimmed;
}

export function buildSessionLogNoteContent(input: BuildSessionLogInput): string {
	const boardHref = input.sessionBoardId
		? `/session/boards?board=${encodeURIComponent(input.sessionBoardId)}`
		: null;
	const whatHappened = input.whatHappened.trim() || 'No recap captured.';
	const followUp = input.followUp.trim() || 'No explicit follow-up items captured.';
	const rollLog = normalizeRollLogSection(input.rollLogMarkdown);
	const lines = [
		'# Session Log',
		'',
		`- Started: ${input.startedAt ? formatIsoDate(input.startedAt) : 'Unknown'}`,
		`- Ended: ${formatIsoDate(input.endedAt)}`,
		`- Captured: ${formatIsoDate(input.endedAt)}`,
		boardHref ? `- Session Board: [Open board](${boardHref})` : '- Session Board: Not linked',
		'',
		'## What Happened This Session',
		whatHappened,
		'',
		'## What Changed',
		`- NPCs encountered: ${input.npcNames.length > 0 ? input.npcNames.join(', ') : 'None noted'}`,
		`- Locations visited: ${input.locationNames.length > 0 ? input.locationNames.join(', ') : 'None noted'}`,
		`- Quests advanced: ${input.questNames.length > 0 ? input.questNames.join(', ') : 'None noted'}`,
		'',
		'## Follow-Up',
		followUp,
	];
	if (rollLog) {
		lines.push('', '## Session Roll Log', rollLog);
	}
	return lines.join('\n');
}

export async function loadSessionPrepViewModel(input: {
	boardId: string | null;
}): Promise<SessionPrepViewModel> {
	const storage = getStorage();
	const [prepBundle, openThreads, recapBundle, notes, boards] = await Promise.all([
		invokeBundleTool<
			{
				staleAfterDays: number;
				recentLimit: number;
				boardLimit: number;
			},
			SessionPrepBundleData
		>(
			registerGetSessionPrepBundleTool as never,
			{ staleAfterDays: 45, recentLimit: 16, boardLimit: 8 },
			'get_session_prep_bundle',
		),
		invokeBundleTool<{ limitPerType: number }, OpenThreadsBundleData>(
			registerGetOpenThreadsTool as never,
			{ limitPerType: 8 },
			'get_open_threads',
		),
		invokeBundleTool<
			{ noteLimit: number; boardLimit: number; objectLimit: number },
			RecapGenerationBundleData
		>(
			registerGetRecapGenerationBundleTool as never,
			{ noteLimit: 16, boardLimit: 8, objectLimit: 8 },
			'get_recap_generation_bundle',
		),
		storage.getAllNotes({ includeDeleted: true }),
		storage.getSessionBoards(),
	]);

	const openThreadCards = buildOpenThreadCards(openThreads);
	const openThreadIds = new Set(openThreadCards.map((entry) => entry.noteId));
	const linkedRecent = prepBundle.recentScopedNotes.filter((entry) => openThreadIds.has(entry.id));
	const notesToReview = (
		linkedRecent.length > 0 ? linkedRecent : prepBundle.recentScopedNotes
	).slice(0, 10);
	const board =
		(input.boardId ? boards.find((entry) => String(entry.id) === input.boardId) : null) ??
		boards[0] ??
		null;

	return {
		generatedAt: prepBundle.generatedAt,
		openThreads: openThreadCards,
		notesToReview,
		lastSessionSummary: summarizeLastSession(notes, recapBundle),
		handoutsToDeliver: filterUndeliveredHandouts(notes, board),
		continuityFlags: prepBundle.continuityFlags.slice(0, 4).map((entry) => ({
			key: entry.key,
			severity: entry.severity,
			count: entry.count,
			message: entry.message,
			exampleNoteIds: [...entry.exampleNoteIds],
		})),
	};
}

function collectMappedLocationNames(objects: readonly VaultObject[]): Set<string> {
	const names = new Set<string>();
	for (const object of objects) {
		if (object.type !== 'map') continue;
		names.add(normalizeLookupValue(object.name));
		for (const poi of object.data.pois ?? []) {
			names.add(normalizeLookupValue(poi.label));
		}
	}
	return names;
}

export async function loadSessionContinuitySummary(input: {
	npcNames: string[];
	locationNames: string[];
}): Promise<SessionContinuitySummary> {
	const storage = getStorage();
	const [bundle, notes, objects, npcObjects] = await Promise.all([
		invokeBundleTool<{ staleAfterDays: number; maxExamples: number }, ContinuityCheckBundleData>(
			registerGetContinuityCheckBundleTool as never,
			{ staleAfterDays: 45, maxExamples: 6 },
			'get_continuity_check_bundle',
		),
		storage.getAllNotes({ includeDeleted: true }),
		storage.getAllObjects({ type: 'map' }),
		storage.getAllObjects({ type: 'npc' }),
	]);

	const noteTitleSet = new Set(
		notes.filter((note) => !note.deleted).map((note) => normalizeLookupValue(note.title)),
	);
	const npcNameSet = new Set(
		npcObjects.map((entry) => normalizeLookupValue(entry.name)).filter((entry) => entry.length > 0),
	);
	const mappedLocationNames = collectMappedLocationNames(objects);

	const missingNpcNames = input.npcNames.filter((name) => {
		const key = normalizeLookupValue(name);
		return !noteTitleSet.has(key) && !npcNameSet.has(key);
	});
	const unmappedLocationNames = input.locationNames.filter((name) => {
		const key = normalizeLookupValue(name);
		return !mappedLocationNames.has(key);
	});

	return {
		generatedAt: bundle.generatedAt,
		continuityRisks: bundle.continuityRisks.slice(0, 4).map((entry) => ({
			key: entry.key,
			severity: entry.severity,
			message: entry.message,
			suggestedAction: entry.suggestedAction,
			exampleNoteIds: entry.exampleNoteIds,
		})),
		missingNpcNames,
		unmappedLocationNames,
	};
}
