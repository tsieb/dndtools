import type { FileSystemAdapter } from '../../storage.js';
import { getIndexEntriesView, getLinkEntriesView } from '../shared/storage-view.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const DEFAULT_STALE_AFTER_DAYS = 45;
export const DEFAULT_MAX_EXAMPLES = 12;

type HealthStatus = 'healthy' | 'watch' | 'needs_attention';

type CoverageGapKey =
	| 'orphan_notes'
	| 'untagged_notes'
	| 'root_folder_notes'
	| 'duplicate_titles'
	| 'stale_notes';

type GapSeverity = 'low' | 'medium' | 'high';

interface CoverageGap {
	key: CoverageGapKey;
	severity: GapSeverity;
	count: number;
	ratio: number;
	message: string;
	suggestedAction: string;
	exampleNoteIds: string[];
}

interface NoteSnapshot {
	id: string;
	title: string;
	folder: string;
	tags: string[];
	updatedAt: string;
	daysSinceUpdate: number;
}

interface CampaignHealthDimension {
	name: 'connectivity' | 'organization' | 'freshness';
	score: number;
	detail: string;
}

interface CampaignHealth {
	score: number;
	status: HealthStatus;
	summary: string;
	dimensions: CampaignHealthDimension[];
}

interface TopLinkedNote {
	id: string;
	title: string;
	incomingLinks: number;
}

export interface VaultIntelligence {
	generatedAt: string;
	staleAfterDays: number;
	totals: {
		activeNotes: number;
		deletedNotes: number;
		links: number;
		objects: number;
		boards: number;
	};
	metrics: {
		orphanNotes: number;
		untaggedNotes: number;
		rootFolderNotes: number;
		duplicateTitleGroups: number;
		staleNotes: number;
		noIncomingNotes: number;
		noOutgoingNotes: number;
	};
	staleNotes: NoteSnapshot[];
	recentNotes: NoteSnapshot[];
	topLinkedNotes: TopLinkedNote[];
	coverageGaps: CoverageGap[];
	campaignHealth: CampaignHealth;
}

export interface VaultIntelligenceOptions {
	staleAfterDays?: number;
	maxExamples?: number;
	now?: Date;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function parseTimestamp(value: string): number {
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRatio(count: number, total: number): number {
	if (total <= 0) return 0;
	return count / total;
}

function roundRatio(value: number): number {
	return Number.parseFloat(value.toFixed(3));
}

function toDaysSince(updatedAt: string, nowMs: number): number {
	const ts = parseTimestamp(updatedAt);
	if (ts <= 0) return 9999;
	return Math.max(0, Math.floor((nowMs - ts) / MS_PER_DAY));
}

function gapSeverity(ratio: number, highThreshold = 0.25, mediumThreshold = 0.1): GapSeverity {
	if (ratio >= highThreshold) return 'high';
	if (ratio >= mediumThreshold) return 'medium';
	return 'low';
}

function clampScore(score: number): number {
	return clamp(Math.round(score), 0, 100);
}

function healthStatus(score: number): HealthStatus {
	if (score >= 80) return 'healthy';
	if (score >= 60) return 'watch';
	return 'needs_attention';
}

export async function buildVaultIntelligence(
	storage: FileSystemAdapter,
	options: VaultIntelligenceOptions = {},
): Promise<VaultIntelligence> {
	const staleAfterDays = clamp(options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS, 1, 3650);
	const maxExamples = clamp(options.maxExamples ?? DEFAULT_MAX_EXAMPLES, 1, 200);
	const now = options.now ?? new Date();
	const nowMs = now.getTime();

	const [entries, rawLinks, objects, boards] = await Promise.all([
		getIndexEntriesView(storage),
		getLinkEntriesView(storage),
		storage.getAllObjects(),
		storage.getSessionBoards(),
	]);

	const activeEntries = entries.filter((entry) => !entry.deleted);
	const deletedCount = entries.length - activeEntries.length;
	const activeIdSet = new Set(activeEntries.map((entry) => entry.id));

	const links = rawLinks.filter(
		(link) => activeIdSet.has(link.sourceId) && activeIdSet.has(link.targetId),
	);

	const incomingCounts = new Map<string, number>();
	const outgoingCounts = new Map<string, number>();
	for (const link of links) {
		incomingCounts.set(link.targetId, (incomingCounts.get(link.targetId) ?? 0) + 1);
		outgoingCounts.set(link.sourceId, (outgoingCounts.get(link.sourceId) ?? 0) + 1);
	}

	const untagged = activeEntries.filter((entry) => entry.tags.length === 0);
	const rootFolder = activeEntries.filter((entry) => entry.folder === '/');
	const noIncoming = activeEntries.filter((entry) => !incomingCounts.has(entry.id));
	const noOutgoing = activeEntries.filter((entry) => !outgoingCounts.has(entry.id));
	const orphanEntries = activeEntries.filter(
		(entry) => !incomingCounts.has(entry.id) && !outgoingCounts.has(entry.id),
	);

	const duplicateTitleGroups = new Map<string, string[]>();
	for (const entry of activeEntries) {
		const key = entry.title.toLowerCase().trim();
		const group = duplicateTitleGroups.get(key);
		if (group) {
			group.push(entry.id);
		} else {
			duplicateTitleGroups.set(key, [entry.id]);
		}
	}
	const duplicateGroups = [...duplicateTitleGroups.values()].filter((group) => group.length > 1);

	const staleCutoff = nowMs - staleAfterDays * MS_PER_DAY;
	const staleNotes = activeEntries
		.filter((entry) => parseTimestamp(entry.updatedAt) <= staleCutoff)
		.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
		.slice(0, maxExamples)
		.map((entry) => ({
			id: entry.id,
			title: entry.title,
			folder: entry.folder,
			tags: entry.tags,
			updatedAt: entry.updatedAt,
			daysSinceUpdate: toDaysSince(entry.updatedAt, nowMs),
		}));

	const recentNotes = [...activeEntries]
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.slice(0, maxExamples)
		.map((entry) => ({
			id: entry.id,
			title: entry.title,
			folder: entry.folder,
			tags: entry.tags,
			updatedAt: entry.updatedAt,
			daysSinceUpdate: toDaysSince(entry.updatedAt, nowMs),
		}));

	const entryById = new Map(activeEntries.map((entry) => [entry.id, entry]));
	const topLinkedNotes = [...incomingCounts.entries()]
		.sort((a, b) => {
			if (b[1] !== a[1]) return b[1] - a[1];
			return (entryById.get(a[0])?.title ?? '').localeCompare(entryById.get(b[0])?.title ?? '');
		})
		.slice(0, maxExamples)
		.map(([id, incomingLinks]) => ({
			id,
			title: entryById.get(id)?.title ?? 'Unknown',
			incomingLinks,
		}));

	const total = activeEntries.length;
	const orphanRatio = normalizeRatio(orphanEntries.length, total);
	const untaggedRatio = normalizeRatio(untagged.length, total);
	const rootFolderRatio = normalizeRatio(rootFolder.length, total);
	const duplicateRatio = normalizeRatio(duplicateGroups.length, total);
	const staleRatio = normalizeRatio(staleNotes.length, total);
	const noIncomingRatio = normalizeRatio(noIncoming.length, total);
	const noOutgoingRatio = normalizeRatio(noOutgoing.length, total);

	const coverageGaps: CoverageGap[] = [];

	if (orphanEntries.length > 0) {
		coverageGaps.push({
			key: 'orphan_notes',
			severity: gapSeverity(orphanRatio, 0.2, 0.08),
			count: orphanEntries.length,
			ratio: roundRatio(orphanRatio),
			message: `${orphanEntries.length} notes are isolated from the link graph.`,
			suggestedAction: 'Link isolated notes to at least one related topic before session prep.',
			exampleNoteIds: orphanEntries.slice(0, maxExamples).map((entry) => entry.id),
		});
	}

	if (untagged.length > 0) {
		coverageGaps.push({
			key: 'untagged_notes',
			severity: gapSeverity(untaggedRatio, 0.4, 0.15),
			count: untagged.length,
			ratio: roundRatio(untaggedRatio),
			message: `${untagged.length} notes have no tags and are harder to retrieve quickly.`,
			suggestedAction: 'Add at least one domain tag per note (npc, quest, location, session).',
			exampleNoteIds: untagged.slice(0, maxExamples).map((entry) => entry.id),
		});
	}

	if (rootFolder.length > 0) {
		coverageGaps.push({
			key: 'root_folder_notes',
			severity: gapSeverity(rootFolderRatio, 0.35, 0.12),
			count: rootFolder.length,
			ratio: roundRatio(rootFolderRatio),
			message: `${rootFolder.length} notes remain in the root folder.`,
			suggestedAction: 'Move notes into campaign subfolders for stronger information scent.',
			exampleNoteIds: rootFolder.slice(0, maxExamples).map((entry) => entry.id),
		});
	}

	if (duplicateGroups.length > 0) {
		const duplicateIds = duplicateGroups.flat().slice(0, maxExamples);
		coverageGaps.push({
			key: 'duplicate_titles',
			severity: gapSeverity(duplicateRatio, 0.08, 0.03),
			count: duplicateGroups.length,
			ratio: roundRatio(duplicateRatio),
			message: `${duplicateGroups.length} duplicate title groups can cause ambiguous wikilinks.`,
			suggestedAction: 'Rename or merge duplicate titles to remove link ambiguity.',
			exampleNoteIds: duplicateIds,
		});
	}

	if (staleNotes.length > 0) {
		coverageGaps.push({
			key: 'stale_notes',
			severity: gapSeverity(staleRatio, 0.5, 0.25),
			count: staleNotes.length,
			ratio: roundRatio(staleRatio),
			message: `${staleNotes.length} notes are stale (>${staleAfterDays} days since update).`,
			suggestedAction: 'Refresh stale notes before prep to prevent continuity drift.',
			exampleNoteIds: staleNotes.slice(0, maxExamples).map((entry) => entry.id),
		});
	}

	const connectivityScore = clampScore(
		100 - (orphanRatio * 60 + noOutgoingRatio * 20 + noIncomingRatio * 20) * 100,
	);
	const organizationScore = clampScore(
		100 - (untaggedRatio * 45 + rootFolderRatio * 25 + duplicateRatio * 30) * 100,
	);
	const freshnessScore = clampScore(100 - staleRatio * 100);
	const score = clampScore((connectivityScore + organizationScore + freshnessScore) / 3);
	const status = healthStatus(score);

	const campaignHealth: CampaignHealth = {
		score,
		status,
		summary:
			status === 'healthy'
				? 'Campaign knowledge base is in strong shape for agent workflows.'
				: status === 'watch'
					? 'Campaign is usable, but quality gaps are accumulating.'
					: 'Campaign needs targeted cleanup before high-confidence automation.',
		dimensions: [
			{
				name: 'connectivity',
				score: connectivityScore,
				detail: `${orphanEntries.length} orphan notes, ${noIncoming.length} with no incoming links, ${noOutgoing.length} with no outgoing links.`,
			},
			{
				name: 'organization',
				score: organizationScore,
				detail: `${untagged.length} untagged notes, ${rootFolder.length} root-folder notes, ${duplicateGroups.length} duplicate title groups.`,
			},
			{
				name: 'freshness',
				score: freshnessScore,
				detail: `${staleNotes.length} stale notes based on ${staleAfterDays}-day threshold.`,
			},
		],
	};

	return {
		generatedAt: now.toISOString(),
		staleAfterDays,
		totals: {
			activeNotes: activeEntries.length,
			deletedNotes: deletedCount,
			links: links.length,
			objects: objects.length,
			boards: boards.length,
		},
		metrics: {
			orphanNotes: orphanEntries.length,
			untaggedNotes: untagged.length,
			rootFolderNotes: rootFolder.length,
			duplicateTitleGroups: duplicateGroups.length,
			staleNotes: staleNotes.length,
			noIncomingNotes: noIncoming.length,
			noOutgoingNotes: noOutgoing.length,
		},
		staleNotes,
		recentNotes,
		topLinkedNotes,
		coverageGaps,
		campaignHealth,
	};
}
