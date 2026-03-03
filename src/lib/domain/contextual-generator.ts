import type { Note } from '$lib/types/note.js';
import type { VaultObject } from '$lib/types/object.js';
import {
	buildRandomTableIndex,
	rollRandomTable,
	type RandomTableIndex,
	type RandomTableNoteSource,
} from './random-tables.js';

type CultureKey = 'common' | 'northern' | 'desert';

export interface ContextualLinkEdge {
	sourceId: string;
	targetId: string;
}

export interface ContextualGeneratorInput {
	notes: Array<
		Pick<Note, 'id' | 'title' | 'tags' | 'folder' | 'frontmatter' | 'content' | 'updatedAt'>
	>;
	objects: Array<Pick<VaultObject, 'id' | 'type' | 'name' | 'data'>>;
	links: ContextualLinkEdge[];
	activeRegionCulture?: string | null;
	includeSystemTables?: boolean;
}

interface WeightedName {
	name: string;
	weight: number;
}

export interface ContextualGeneratorState {
	index: RandomTableIndex;
	npcRoster: string[];
	factionCandidates: WeightedName[];
	locationCandidates: WeightedName[];
	cultureKey: CultureKey;
}

export interface GeneratedNpcQuick {
	name: string;
	trait: string;
	bond: string;
	flaw: string;
	ideal: string;
	motivation: string;
	factionAffiliation: string;
	culture: CultureKey;
}

const MAX_FALLBACK_ATTEMPTS = 12;
const UNIQUE_NPC_SUFFIXES = ['II', 'the Younger', 'Junior', 'of the Second House', 'the Third'];

function normalizeKey(value: string): string {
	return value.trim().toLowerCase();
}

function inferCultureKey(value: string | null | undefined): CultureKey {
	const normalized = (value ?? '').trim().toLowerCase();
	if (!normalized) return 'common';
	if (
		normalized.includes('north') ||
		normalized.includes('frost') ||
		normalized.includes('norse') ||
		normalized.includes('ice')
	) {
		return 'northern';
	}
	if (
		normalized.includes('desert') ||
		normalized.includes('sands') ||
		normalized.includes('dune') ||
		normalized.includes('sun') ||
		normalized.includes('arid')
	) {
		return 'desert';
	}
	return 'common';
}

function tableForNpcNames(culture: CultureKey): string {
	if (culture === 'northern') return '5e NPC Name Northern';
	if (culture === 'desert') return '5e NPC Name Desert';
	return '5e NPC Name Common';
}

function tableForLocationNames(culture: CultureKey): string {
	if (culture === 'northern') return '5e Location Name Northern';
	if (culture === 'desert') return '5e Location Name Desert';
	return '5e Location Name Common';
}

function safeFrontmatterValue(frontmatter: Record<string, unknown>, key: string): string {
	const value = frontmatter[key];
	return typeof value === 'string' ? value.trim() : '';
}

function safeObjectValue(data: unknown, key: string): string {
	if (!data || typeof data !== 'object') return '';
	const value = (data as Record<string, unknown>)[key];
	return typeof value === 'string' ? value.trim() : '';
}

function computeLinkDegree(links: ContextualLinkEdge[]): Map<string, number> {
	const degree = new Map<string, number>();
	for (const edge of links) {
		const source = String(edge.sourceId);
		const target = String(edge.targetId);
		degree.set(source, (degree.get(source) ?? 0) + 1);
		degree.set(target, (degree.get(target) ?? 0) + 1);
	}
	return degree;
}

function upsertWeightedName(into: Map<string, WeightedName>, name: string, weight: number): void {
	const clean = name.trim();
	if (!clean) return;
	const key = normalizeKey(clean);
	if (!key) return;
	const existing = into.get(key);
	if (!existing || existing.weight < weight) {
		into.set(key, { name: clean, weight });
	}
}

function weightedFromMap(source: Map<string, WeightedName>): WeightedName[] {
	return [...source.values()]
		.sort((a, b) => {
			if (b.weight !== a.weight) return b.weight - a.weight;
			return a.name.localeCompare(b.name);
		})
		.slice(0, 80);
}

function toRandomTableNotes(notes: ContextualGeneratorInput['notes']): RandomTableNoteSource[] {
	return notes.map((note) => ({
		id: String(note.id),
		title: note.title,
		content: note.content,
		tags: note.tags,
		folder: String(note.folder),
		updatedAt: note.updatedAt,
	}));
}

function pickWeighted(entries: WeightedName[], random: () => number): string | null {
	if (entries.length === 0) return null;
	const total = entries.reduce((sum, entry) => sum + Math.max(1, Math.trunc(entry.weight)), 0);
	const sample = random();
	if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
		throw new Error('Contextual generator received an invalid random sample.');
	}
	const target = Math.floor(sample * total);
	let cursor = 0;
	for (const entry of entries) {
		cursor += Math.max(1, Math.trunc(entry.weight));
		if (target < cursor) return entry.name;
	}
	return entries[entries.length - 1]?.name ?? null;
}

function uniqueNpcName(
	candidate: string,
	existingNames: Set<string>,
	random: () => number,
): string {
	if (!existingNames.has(normalizeKey(candidate))) return candidate;
	for (const suffix of UNIQUE_NPC_SUFFIXES) {
		const next = `${candidate} ${suffix}`;
		if (!existingNames.has(normalizeKey(next))) return next;
	}
	const numeric = Math.max(2, Math.floor(random() * 900) + 100);
	return `${candidate} ${numeric}`;
}

function createMotivation(input: { ideal: string; bond: string; flaw: string }): string {
	const idealCore = input.ideal.replace(/^[^:]+:\s*/i, '').trim();
	const flawCore = input.flaw.trim();
	if (!idealCore) return `Acts from ${input.bond.toLowerCase()} despite ${flawCore.toLowerCase()}.`;
	return `Pursues ${idealCore.toLowerCase()} while constrained by ${flawCore.toLowerCase()}.`;
}

export function buildContextualGeneratorState(
	input: ContextualGeneratorInput,
): ContextualGeneratorState {
	const degree = computeLinkDegree(input.links);
	const factionByName = new Map<string, WeightedName>();
	const locationByName = new Map<string, WeightedName>();
	const npcByName = new Map<string, WeightedName>();
	const cultures: string[] = [];

	for (const note of input.notes) {
		const noteId = String(note.id);
		const baseWeight = 1 + Math.min(5, degree.get(noteId) ?? 0);
		const frontmatter = note.frontmatter ?? {};
		const noteType = safeFrontmatterValue(frontmatter, 'type').toLowerCase();

		if (note.tags.includes('faction') || noteType === 'faction') {
			upsertWeightedName(factionByName, note.title, baseWeight);
		}
		if (note.tags.includes('location') || noteType === 'location') {
			upsertWeightedName(locationByName, note.title, baseWeight);
		}
		if (
			note.tags.includes('npc') ||
			note.tags.includes('character') ||
			noteType === 'npc' ||
			noteType === 'character'
		) {
			upsertWeightedName(npcByName, note.title, baseWeight);
		}

		const culture =
			safeFrontmatterValue(frontmatter, 'culture') ||
			safeFrontmatterValue(frontmatter, 'regionCulture') ||
			safeFrontmatterValue(frontmatter, 'culturalSetting');
		if (culture) cultures.push(culture);
	}

	for (const object of input.objects) {
		const objectId = String(object.id);
		const baseWeight = 2 + Math.min(6, degree.get(objectId) ?? 0);
		if (object.type === 'faction') {
			upsertWeightedName(factionByName, object.name, baseWeight);
		}
		if (object.type === 'location') {
			upsertWeightedName(locationByName, object.name, baseWeight);
			const region =
				safeObjectValue(object.data, 'region') || safeObjectValue(object.data, 'climate');
			if (region) cultures.push(region);
		}
		if (object.type === 'npc' || object.type === 'character') {
			upsertWeightedName(npcByName, object.name, baseWeight);
		}
	}

	if (input.activeRegionCulture?.trim()) {
		cultures.unshift(input.activeRegionCulture.trim());
	}

	const cultureKey = inferCultureKey(cultures.find((entry) => entry.trim().length > 0) ?? null);
	const index = buildRandomTableIndex({
		vaultNotes: toRandomTableNotes(input.notes),
		includeSystem: input.includeSystemTables !== false,
	});

	return {
		index,
		npcRoster: weightedFromMap(npcByName).map((entry) => entry.name),
		factionCandidates: weightedFromMap(factionByName),
		locationCandidates: weightedFromMap(locationByName),
		cultureKey,
	};
}

export function generateFactionAffiliation(
	state: ContextualGeneratorState,
	options?: { random?: () => number },
): string {
	const random = options?.random ?? Math.random;
	const pickedVault = pickWeighted(state.factionCandidates, random);
	if (pickedVault) return pickedVault;
	return rollRandomTable(state.index, '5e Faction Affiliation', { random }).result;
}

export function generateLocationName(
	state: ContextualGeneratorState,
	options?: { random?: () => number },
): string {
	const random = options?.random ?? Math.random;
	const pickedVault = pickWeighted(state.locationCandidates, random);
	if (pickedVault) return pickedVault;
	const tableName = tableForLocationNames(state.cultureKey);
	return rollRandomTable(state.index, tableName, { random }).result;
}

export function generateNpcName(
	state: ContextualGeneratorState,
	options?: { random?: () => number },
): string {
	const random = options?.random ?? Math.random;
	const existing = new Set(state.npcRoster.map((entry) => normalizeKey(entry)));
	const pickedVault = pickWeighted(
		state.npcRoster.map((name, index) => ({ name, weight: Math.max(2, 8 - index) })),
		random,
	);
	if (pickedVault) {
		return uniqueNpcName(pickedVault, existing, random);
	}

	const tableName = tableForNpcNames(state.cultureKey);
	for (let attempt = 0; attempt < MAX_FALLBACK_ATTEMPTS; attempt += 1) {
		const candidate = rollRandomTable(state.index, tableName, { random }).result.trim();
		if (!candidate) continue;
		if (!existing.has(normalizeKey(candidate))) return candidate;
	}
	const fallback = rollRandomTable(state.index, tableName, { random }).result.trim() || 'Unknown';
	return uniqueNpcName(fallback, existing, random);
}

export function generateNpcQuick(
	state: ContextualGeneratorState,
	options?: { random?: () => number },
): GeneratedNpcQuick {
	const random = options?.random ?? Math.random;
	const name = generateNpcName(state, { random });
	const trait = rollRandomTable(state.index, '5e NPC Trait', { random }).result;
	const bond = rollRandomTable(state.index, '5e NPC Bond', { random }).result;
	const flaw = rollRandomTable(state.index, '5e NPC Flaw', { random }).result;
	const ideal = rollRandomTable(state.index, '5e NPC Ideal', { random }).result;
	const factionAffiliation = generateFactionAffiliation(state, { random });
	const motivation = createMotivation({ ideal, bond, flaw });
	return {
		name,
		trait,
		bond,
		flaw,
		ideal,
		motivation,
		factionAffiliation,
		culture: state.cultureKey,
	};
}
