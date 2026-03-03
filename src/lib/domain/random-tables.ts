import { extractFrontmatter } from '$lib/markdown/frontmatter.js';

export const RANDOM_TABLE_FENCE_LANGUAGE = 'random-table';
const RANDOM_TABLE_TAG = 'random-table';
const MAX_RANDOM_TABLE_ROWS = 500;
const DEFAULT_MAX_ROLL_DEPTH = 6;
const MAX_REFERENCES_PER_RESULT = 32;

export type RandomTableSource = 'vault' | 'system';

export interface RandomTableRow {
	weight: number;
	result: string;
	line: number;
}

export interface RandomTableParseIssue {
	line: number;
	message: string;
	severity: 'error' | 'warning';
}

export interface RandomTableNoteSource {
	id: string;
	title: string;
	content: string;
	tags: string[];
	folder: string;
	updatedAt?: string;
}

export interface RandomTableDefinition {
	name: string;
	aliases: string[];
	source: RandomTableSource;
	sourceId: string;
	sourceTitle: string;
	sourceFolder: string;
	tags: string[];
	updatedAt?: string;
	rows: RandomTableRow[];
}

export interface RandomTableCatalogEntry extends RandomTableDefinition {
	parseIssues: RandomTableParseIssue[];
}

export interface RandomTableInvalidSource {
	source: RandomTableSource;
	sourceId: string;
	sourceTitle: string;
	parseIssues: RandomTableParseIssue[];
}

export interface RandomTableIndex {
	tables: RandomTableCatalogEntry[];
	byKey: Map<string, RandomTableCatalogEntry[]>;
	invalidSources: RandomTableInvalidSource[];
}

export interface RandomTableRollTraceEntry {
	tableName: string;
	source: RandomTableSource;
	selectedResult: string;
	resolvedResult: string;
	depth: number;
}

export interface RandomTableRollResult {
	tableName: string;
	result: string;
	trace: RandomTableRollTraceEntry[];
	referencedTables: string[];
}

export interface RollRandomTableOptions {
	random?: () => number;
	maxDepth?: number;
}

export interface ParseRandomTableNoteResult {
	table: RandomTableCatalogEntry | null;
	issues: RandomTableParseIssue[];
}

export class RandomTableError extends Error {
	readonly code:
		| 'table_not_found'
		| 'invalid_random_source'
		| 'invalid_table_definition'
		| 'max_depth_exceeded'
		| 'table_cycle_detected';

	readonly details?: Record<string, unknown>;

	constructor(
		code:
			| 'table_not_found'
			| 'invalid_random_source'
			| 'invalid_table_definition'
			| 'max_depth_exceeded'
			| 'table_cycle_detected',
		message: string,
		details?: Record<string, unknown>,
	) {
		super(message);
		this.name = 'RandomTableError';
		this.code = code;
		this.details = details;
	}
}

function normalizeTableName(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function sanitizeAliasCandidate(value: unknown): string {
	return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeAliasList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return [...new Set(value.map(sanitizeAliasCandidate).filter(Boolean))];
	}
	if (typeof value === 'string') {
		return [...new Set(value.split(',').map(sanitizeAliasCandidate).filter(Boolean))];
	}
	return [];
}

function hasRandomTableTag(tags: string[]): boolean {
	return tags.some((tag) => tag.trim().toLowerCase() === RANDOM_TABLE_TAG);
}

function toYamlList(values: string[]): string {
	return values.map((value) => `  - ${value}`).join('\n');
}

function makeSystemTableMarkdown(input: {
	title: string;
	summary: string;
	tags: string[];
	rows: string[];
}): string {
	return `---
title: ${input.title}
tags:
${toYamlList(input.tags)}
summary: ${input.summary}
---

# ${input.title}

${input.summary}

\`\`\`${RANDOM_TABLE_FENCE_LANGUAGE}
${input.rows.join('\n')}
\`\`\`
`;
}

interface SystemRandomTableSeed {
	id: string;
	title: string;
	folder: string;
	tags: string[];
	summary: string;
	rows: string[];
	aliases?: string[];
}

const SYSTEM_RANDOM_TABLE_SEEDS: readonly SystemRandomTableSeed[] = [
	{
		id: 'sys-table-5e-encounter-dungeon-cr0-4',
		title: '5e Encounter Dungeon CR 0-4',
		folder: '/system/random-tables/dnd5e/encounters',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'encounter'],
		summary: 'Dungeon encounter sparks for low-tier parties.',
		rows: [
			'3 | 2d4 Goblins scouting with crude maps',
			'2 | Skeleton patrol dragging rusted chains',
			'2 | Giant rats feasting on a collapsed pack',
			'1 | Cult acolytes preparing a forbidden rite',
			'1 | Ochre jelly sliding from a ceiling crack',
			'1 | Bugbear enforcer collecting toll from intruders',
		],
	},
	{
		id: 'sys-table-5e-encounter-wilderness-cr0-4',
		title: '5e Encounter Wilderness CR 0-4',
		folder: '/system/random-tables/dnd5e/encounters',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'encounter'],
		summary: 'Wilderness encounter sparks for low-tier parties.',
		rows: [
			'3 | Wolves stalking from downwind',
			'2 | Bandit outriders watching from a ridge',
			'2 | Giant spiders nesting near a game trail',
			'1 | Owlbear defending fresh prey',
			'1 | Dryad warning trespassers off sacred land',
			'1 | Scout troop from {{table: 5e Faction Affiliation}}',
		],
	},
	{
		id: 'sys-table-5e-encounter-urban-cr0-4',
		title: '5e Encounter Urban CR 0-4',
		folder: '/system/random-tables/dnd5e/encounters',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'encounter'],
		summary: 'Urban encounter sparks for low-tier parties.',
		rows: [
			'3 | Pickpocket ring running a distraction',
			'2 | Drunken brawl spilling out of {{table: 5e Tavern Name}}',
			'2 | City watch checkpoint searching for contraband',
			'1 | Cult courier fleeing with coded messages',
			'1 | Animated broom chasing children through market',
			'1 | Rival agents from {{table: 5e Faction Affiliation}}',
		],
	},
	{
		id: 'sys-table-5e-npc-trait',
		title: '5e NPC Trait',
		folder: '/system/random-tables/dnd5e/npc',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'npc'],
		summary: 'Personality trait seeds for improvised NPCs.',
		rows: [
			'2 | Speaks with clipped military precision',
			'2 | Laughs too loudly at weak jokes',
			'2 | Never breaks eye contact while speaking',
			'1 | Collects obscure sayings from travelers',
			'1 | Constantly cleans imaginary dust from gear',
			'1 | Whispers prayers before every decision',
		],
	},
	{
		id: 'sys-table-5e-npc-bond',
		title: '5e NPC Bond',
		folder: '/system/random-tables/dnd5e/npc',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'npc'],
		summary: 'Bond prompts for NPC motivations.',
		rows: [
			'2 | Owes a life-debt to {{table: 5e Faction Affiliation}}',
			'2 | Protects their younger sibling at all costs',
			'2 | Keeps a promise to a fallen mentor',
			'1 | Maintains a hidden shrine in {{table: 5e Location Name Common}}',
			'1 | Funds an orphanage no one else knows about',
			'1 | Preserves a family relic stolen by bandits',
		],
	},
	{
		id: 'sys-table-5e-npc-flaw',
		title: '5e NPC Flaw',
		folder: '/system/random-tables/dnd5e/npc',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'npc'],
		summary: 'Flaw prompts for dynamic NPC behavior.',
		rows: [
			'2 | Cannot resist profitable blackmail opportunities',
			'2 | Panics when plans change suddenly',
			'2 | Holds grudges for years over minor insults',
			'1 | Lies to appear more heroic than they are',
			'1 | Gambles away coin meant for urgent needs',
			'1 | Freezes when confronted by undead',
		],
	},
	{
		id: 'sys-table-5e-npc-ideal',
		title: '5e NPC Ideal',
		folder: '/system/random-tables/dnd5e/npc',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'npc'],
		summary: 'Ideal prompts for principled NPCs.',
		rows: [
			'2 | Justice: no one is above the law',
			'2 | Freedom: chains must always be broken',
			'2 | Tradition: old pacts keep civilization standing',
			'1 | Compassion: mercy first, violence last',
			'1 | Knowledge: truth outweighs comfort',
			'1 | Glory: deeds should be remembered for ages',
		],
	},
	{
		id: 'sys-table-5e-faction-affiliation',
		title: '5e Faction Affiliation',
		folder: '/system/random-tables/dnd5e/npc',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'faction'],
		summary: 'Default faction affiliations for random generation.',
		rows: [
			'2 | Harpers',
			'2 | Order of the Gauntlet',
			'2 | Lords Alliance',
			'1 | Zhentarim',
			'1 | Emerald Enclave',
			'1 | Independent local guild',
		],
	},
	{
		id: 'sys-table-5e-treasure-tier-1',
		title: '5e Treasure Hoard Tier 1',
		folder: '/system/random-tables/dnd5e/treasure',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'treasure'],
		summary: 'Treasure hoard sparks for low-tier challenges.',
		rows: [
			'3 | 2d6 x 10 gp in mixed coinage',
			'2 | Gem pouch worth 50 gp and a silver ring',
			'2 | Potion of healing in a stamped brass vial',
			'1 | Spell scroll (1st-level) and wax-sealed map fragment',
			'1 | Minor art object worth 100 gp',
			'1 | Hidden stash from {{table: 5e Faction Affiliation}}',
		],
	},
	{
		id: 'sys-table-5e-treasure-tier-2',
		title: '5e Treasure Hoard Tier 2',
		folder: '/system/random-tables/dnd5e/treasure',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'treasure'],
		summary: 'Treasure hoard sparks for mid-tier challenges.',
		rows: [
			'3 | 4d6 x 100 gp plus carved ivory figurine',
			'2 | 2d4 gemstones worth 100 gp each',
			'2 | Two uncommon magic consumables',
			'1 | Spell scroll (3rd-level) and coded ledger',
			'1 | Finely crafted weapon with noble crest',
			'1 | Ancient coin chest tied to {{table: 5e Location Name Common}}',
		],
	},
	{
		id: 'sys-table-5e-treasure-tier-3',
		title: '5e Treasure Hoard Tier 3',
		folder: '/system/random-tables/dnd5e/treasure',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'treasure'],
		summary: 'Treasure hoard sparks for high-tier challenges.',
		rows: [
			'3 | 6d6 x 500 gp with platinum ingots',
			'2 | Rare magic item secured in rune-locked case',
			'2 | 3d4 gemstones worth 500 gp each',
			'1 | Spell scroll (6th-level) with planar annotations',
			'1 | Noble regalia worth 2,500 gp',
			'1 | Relic requested by {{table: 5e Faction Affiliation}}',
		],
	},
	{
		id: 'sys-table-5e-weather-temperate',
		title: '5e Weather Temperate',
		folder: '/system/random-tables/dnd5e/weather',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'weather'],
		summary: 'Temperate-weather prompts for travel scenes.',
		rows: [
			'3 | Clear sky with a mild breeze',
			'2 | Overcast with intermittent drizzle',
			'2 | Dense morning fog reducing visibility',
			'1 | Thunderstorm by late afternoon',
			'1 | Sudden cold snap with sleet',
			'1 | Gusting winds carrying distant smoke',
		],
	},
	{
		id: 'sys-table-5e-weather-cold',
		title: '5e Weather Cold',
		folder: '/system/random-tables/dnd5e/weather',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'weather'],
		summary: 'Cold-climate weather prompts.',
		rows: [
			'3 | Light snowfall and low visibility',
			'2 | Ice-crusted wind from the north',
			'2 | Clear but bitterly cold skies',
			'1 | Blinding snow squall for 1d4 hours',
			'1 | Thin ice cracking underfoot',
			'1 | Freezing rain coating roads in glass',
		],
	},
	{
		id: 'sys-table-5e-weather-arid',
		title: '5e Weather Arid',
		folder: '/system/random-tables/dnd5e/weather',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'weather'],
		summary: 'Arid-climate weather prompts.',
		rows: [
			'3 | Dry heat with clear horizons',
			'2 | Dust-laden wind obscuring tracks',
			'2 | Rapid temperature drop after sunset',
			'1 | Sandstorm forcing shelter',
			'1 | Rare brief rainfall and flash runoff',
			'1 | Mirage distortions along the road',
		],
	},
	{
		id: 'sys-table-5e-dungeon-room',
		title: '5e Dungeon Room Content',
		folder: '/system/random-tables/dnd5e/dungeon',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'dungeon'],
		summary: 'Dungeon room content prompts.',
		rows: [
			'3 | Collapsed chamber with unstable rubble',
			'2 | Shrine defaced by rival cult symbols',
			'2 | Barracks with signs of recent departure',
			'1 | Alchemical workshop with volatile residue',
			'1 | Flooded crypt guarded by undead remains',
			'1 | Hidden vault entrance behind false wall',
		],
	},
	{
		id: 'sys-table-5e-tavern-adjective',
		title: '5e Tavern Adjective',
		folder: '/system/random-tables/dnd5e/taverns',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'tavern'],
		summary: 'Adjectives for tavern names.',
		rows: ['2 | Copper', '2 | Laughing', '2 | Sleepy', '1 | Broken', '1 | Roaring', '1 | Moonlit'],
	},
	{
		id: 'sys-table-5e-tavern-noun',
		title: '5e Tavern Noun',
		folder: '/system/random-tables/dnd5e/taverns',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'tavern'],
		summary: 'Nouns for tavern names.',
		rows: ['2 | Griffin', '2 | Lantern', '2 | Anvil', '1 | Sailor', '1 | Piper', '1 | Hearth'],
	},
	{
		id: 'sys-table-5e-tavern-name',
		title: '5e Tavern Name',
		folder: '/system/random-tables/dnd5e/taverns',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'tavern'],
		summary: 'Nested tavern-name generator.',
		rows: [
			'3 | The {{table: 5e Tavern Adjective}} {{table: 5e Tavern Noun}}',
			'2 | {{table: 5e Tavern Noun}} and Crown',
			'1 | {{table: 5e Tavern Adjective}} Cup',
			'1 | The Last {{table: 5e Tavern Noun}}',
		],
	},
	{
		id: 'sys-table-5e-npc-name-common',
		title: '5e NPC Name Common',
		folder: '/system/random-tables/dnd5e/names',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'npc', 'name'],
		summary: 'Baseline NPC names for mixed settings.',
		rows: ['2 | Arlen', '2 | Mira', '2 | Tovin', '1 | Ketha', '1 | Bram', '1 | Elira'],
	},
	{
		id: 'sys-table-5e-npc-name-northern',
		title: '5e NPC Name Northern',
		folder: '/system/random-tables/dnd5e/names',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'npc', 'name'],
		summary: 'Northern-flavored NPC names.',
		rows: ['2 | Astrid', '2 | Halvar', '2 | Ylva', '1 | Sten', '1 | Freydis', '1 | Toren'],
	},
	{
		id: 'sys-table-5e-npc-name-desert',
		title: '5e NPC Name Desert',
		folder: '/system/random-tables/dnd5e/names',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'npc', 'name'],
		summary: 'Desert-flavored NPC names.',
		rows: ['2 | Jalil', '2 | Samira', '2 | Rashad', '1 | Nadiya', '1 | Faris', '1 | Zahra'],
	},
	{
		id: 'sys-table-5e-location-name-common',
		title: '5e Location Name Common',
		folder: '/system/random-tables/dnd5e/names',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'location', 'name'],
		summary: 'Baseline location names for mixed settings.',
		rows: [
			'2 | Ashford',
			'2 | Red Hollow',
			'2 | Kingsfall',
			'1 | Lantern Reach',
			'1 | Stonewake',
			'1 | Emberfield',
		],
	},
	{
		id: 'sys-table-5e-location-name-northern',
		title: '5e Location Name Northern',
		folder: '/system/random-tables/dnd5e/names',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'location', 'name'],
		summary: 'Northern-flavored location names.',
		rows: [
			'2 | Frostwatch',
			'2 | Wolfscar',
			'2 | Hailfjord',
			'1 | Irondrift',
			'1 | Rimegate',
			'1 | Snowmire',
		],
	},
	{
		id: 'sys-table-5e-location-name-desert',
		title: '5e Location Name Desert',
		folder: '/system/random-tables/dnd5e/names',
		tags: ['random-table', 'system', 'dnd5e', 'srd', 'location', 'name'],
		summary: 'Desert-flavored location names.',
		rows: [
			'2 | Sunspire',
			'2 | Saffron Dunes',
			'2 | Qadim Oasis',
			'1 | Sandglass Gate',
			'1 | Brass Mirage',
			'1 | Ember Wadi',
		],
	},
];

export interface SystemRandomTableNote {
	id: string;
	title: string;
	content: string;
	folder: string;
	tags: string[];
	aliases: string[];
}

const SYSTEM_RANDOM_TABLE_NOTES: readonly SystemRandomTableNote[] = SYSTEM_RANDOM_TABLE_SEEDS.map(
	(seed) => ({
		id: seed.id,
		title: seed.title,
		content: makeSystemTableMarkdown({
			title: seed.title,
			tags: seed.tags,
			summary: seed.summary,
			rows: seed.rows,
		}),
		folder: seed.folder,
		tags: [...seed.tags],
		aliases: seed.aliases ? [...seed.aliases] : [],
	}),
);

const TABLE_REFERENCE_TOKEN_REGEX =
	/\{\{\s*table\s*:\s*([^}]+?)\s*\}\}|\[\[\s*table\s*:\s*([^\]]+?)\s*\]\]/gi;
const ROLL_BLOCK_TOKEN_REGEX = /\{\{\s*roll\s*:\s*([^}]+?)\s*\}\}/gi;

function extractRandomTableFence(body: string): { body: string; fenceStartLine: number } | null {
	const lines = body.split(/\r?\n/);
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex]?.trim() ?? '';
		const opening = line.match(/^```([a-z0-9_-]+)\s*$/i);
		if (!opening) continue;
		if ((opening[1] ?? '').toLowerCase() !== RANDOM_TABLE_FENCE_LANGUAGE) continue;

		for (let cursor = lineIndex + 1; cursor < lines.length; cursor += 1) {
			if ((lines[cursor]?.trim() ?? '').startsWith('```')) {
				return {
					body: lines.slice(lineIndex + 1, cursor).join('\n'),
					fenceStartLine: lineIndex + 2,
				};
			}
		}
		return {
			body: lines.slice(lineIndex + 1).join('\n'),
			fenceStartLine: lineIndex + 2,
		};
	}
	return null;
}

function parseWeightedRows(
	fenceBody: string,
	fenceStartLine: number,
): { rows: RandomTableRow[]; issues: RandomTableParseIssue[] } {
	const rows: RandomTableRow[] = [];
	const issues: RandomTableParseIssue[] = [];
	const lines = fenceBody.split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const rawLine = lines[i] ?? '';
		const lineNumber = fenceStartLine + i;
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;

		const match = line.match(/^(\d+)(?:\s*-\s*(\d+))?\s*\|\s*(.+)$/);
		if (!match) {
			issues.push({
				line: lineNumber,
				message:
					'Invalid row format. Use "weight | result" or "start-end | result" in random-table fences.',
				severity: 'error',
			});
			continue;
		}

		const start = Number.parseInt(match[1] ?? '0', 10);
		const endRaw = match[2];
		const end = endRaw ? Number.parseInt(endRaw, 10) : start;
		const result = (match[3] ?? '').trim();

		if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) {
			issues.push({
				line: lineNumber,
				message: 'Row weights must be positive integers.',
				severity: 'error',
			});
			continue;
		}
		if (end < start) {
			issues.push({
				line: lineNumber,
				message: 'Range rows must use ascending values (start-end).',
				severity: 'error',
			});
			continue;
		}
		if (!result) {
			issues.push({
				line: lineNumber,
				message: 'Row result text cannot be empty.',
				severity: 'error',
			});
			continue;
		}

		const weight = endRaw ? end - start + 1 : start;
		rows.push({
			weight,
			result,
			line: lineNumber,
		});
	}

	if (rows.length === 0) {
		issues.push({
			line: fenceStartLine,
			message: 'No weighted rows were found in this random table.',
			severity: 'error',
		});
	}
	if (rows.length > MAX_RANDOM_TABLE_ROWS) {
		issues.push({
			line: fenceStartLine,
			message: `Random table exceeds ${MAX_RANDOM_TABLE_ROWS} rows.`,
			severity: 'error',
		});
	}
	return { rows, issues };
}

function uniqueAliases(input: string[]): string[] {
	const seen = new Set<string>();
	const aliases: string[] = [];
	for (const raw of input) {
		const next = sanitizeAliasCandidate(raw);
		if (!next) continue;
		const key = normalizeTableName(next);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		aliases.push(next);
	}
	return aliases;
}

export function parseRandomTableNote(
	note: RandomTableNoteSource,
	source: RandomTableSource,
	extraAliases: string[] = [],
): ParseRandomTableNoteResult {
	const issues: RandomTableParseIssue[] = [];
	const parsed = extractFrontmatter(note.content);
	const tableFence = extractRandomTableFence(parsed.body);
	if (!tableFence) {
		return {
			table: null,
			issues: [
				{
					line: 1,
					message: `Missing \`\`\`${RANDOM_TABLE_FENCE_LANGUAGE}\`\`\` code fence.`,
					severity: 'error',
				},
			],
		};
	}

	const frontmatter = parsed.frontmatter;
	const frontmatterName =
		(typeof frontmatter['tableName'] === 'string' && frontmatter['tableName'].trim()) ||
		(typeof frontmatter['randomTableName'] === 'string' && frontmatter['randomTableName'].trim()) ||
		'';
	const name = frontmatterName || note.title.trim();
	if (!name) {
		issues.push({
			line: 1,
			message: 'Random table must have a title or frontmatter tableName.',
			severity: 'error',
		});
	}

	const aliases = uniqueAliases([
		...normalizeAliasList(frontmatter['aliases']),
		...extraAliases,
		note.title,
	]);
	const weighted = parseWeightedRows(tableFence.body, tableFence.fenceStartLine);
	issues.push(...weighted.issues);

	const hasErrors = issues.some((issue) => issue.severity === 'error');
	if (hasErrors) {
		return { table: null, issues };
	}

	const table: RandomTableCatalogEntry = {
		name,
		aliases,
		source,
		sourceId: note.id,
		sourceTitle: note.title,
		sourceFolder: note.folder,
		tags: [...note.tags],
		updatedAt: note.updatedAt,
		rows: weighted.rows,
		parseIssues: issues,
	};
	return { table, issues };
}

function sortTableEntries(entries: RandomTableCatalogEntry[]): RandomTableCatalogEntry[] {
	return [...entries].sort((a, b) => {
		if (a.source !== b.source) return a.source === 'vault' ? -1 : 1;
		const updated = (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
		if (updated !== 0) return updated;
		const byName = a.name.localeCompare(b.name);
		if (byName !== 0) return byName;
		return a.sourceId.localeCompare(b.sourceId);
	});
}

export function getSystemRandomTableNotes(): readonly SystemRandomTableNote[] {
	return SYSTEM_RANDOM_TABLE_NOTES;
}

export function findSystemRandomTableNote(name: string): SystemRandomTableNote | null {
	const key = normalizeTableName(name);
	if (!key) return null;
	return SYSTEM_RANDOM_TABLE_NOTES.find((entry) => normalizeTableName(entry.title) === key) ?? null;
}

export function buildRandomTableIndex(options: {
	vaultNotes?: RandomTableNoteSource[];
	includeSystem?: boolean;
}): RandomTableIndex {
	const includeSystem = options.includeSystem !== false;
	const tables: RandomTableCatalogEntry[] = [];
	const invalidSources: RandomTableInvalidSource[] = [];

	for (const note of options.vaultNotes ?? []) {
		if (!hasRandomTableTag(note.tags)) continue;
		const parsed = parseRandomTableNote(note, 'vault');
		if (parsed.table) {
			tables.push(parsed.table);
			continue;
		}
		invalidSources.push({
			source: 'vault',
			sourceId: note.id,
			sourceTitle: note.title,
			parseIssues: parsed.issues,
		});
	}

	if (includeSystem) {
		for (const systemNote of SYSTEM_RANDOM_TABLE_NOTES) {
			const parsed = parseRandomTableNote(
				{
					id: systemNote.id,
					title: systemNote.title,
					content: systemNote.content,
					tags: [...systemNote.tags],
					folder: systemNote.folder,
				},
				'system',
				systemNote.aliases,
			);
			if (parsed.table) {
				tables.push(parsed.table);
				continue;
			}
			invalidSources.push({
				source: 'system',
				sourceId: systemNote.id,
				sourceTitle: systemNote.title,
				parseIssues: parsed.issues,
			});
		}
	}

	const sorted = sortTableEntries(tables);
	const byKey = new Map<string, RandomTableCatalogEntry[]>();
	for (const table of sorted) {
		const names = uniqueAliases([table.name, ...table.aliases]);
		for (const alias of names) {
			const key = normalizeTableName(alias);
			if (!key) continue;
			const existing = byKey.get(key);
			if (existing) {
				existing.push(table);
			} else {
				byKey.set(key, [table]);
			}
		}
	}
	for (const [key, entries] of byKey.entries()) {
		byKey.set(key, sortTableEntries(entries));
	}

	return {
		tables: sorted,
		byKey,
		invalidSources,
	};
}

function pickWeightedRow(
	rows: RandomTableRow[],
	random: () => number,
): { row: RandomTableRow; randomValue: number } {
	const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
	if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
		throw new RandomTableError(
			'invalid_table_definition',
			'Random table has no valid weighted rows.',
		);
	}
	const sample = random();
	if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
		throw new RandomTableError(
			'invalid_random_source',
			'Random source produced an out-of-range sample.',
		);
	}
	const randomValue = Math.floor(sample * totalWeight);
	let cursor = 0;
	for (const row of rows) {
		cursor += row.weight;
		if (randomValue < cursor) {
			return { row, randomValue };
		}
	}
	return { row: rows[rows.length - 1]!, randomValue };
}

function resolveTableFromIndex(index: RandomTableIndex, name: string): RandomTableCatalogEntry {
	const key = normalizeTableName(name);
	const matches = key ? (index.byKey.get(key) ?? []) : [];
	if (matches.length === 0) {
		throw new RandomTableError('table_not_found', `Random table "${name}" was not found.`, {
			requestedName: name,
		});
	}
	return matches[0]!;
}

interface RecursiveRollState {
	trace: RandomTableRollTraceEntry[];
	referencedTableKeys: Set<string>;
	maxDepth: number;
	random: () => number;
}

function rollTableRecursive(
	index: RandomTableIndex,
	tableName: string,
	state: RecursiveRollState,
	depth: number,
	stack: string[],
): string {
	const table = resolveTableFromIndex(index, tableName);
	const key = normalizeTableName(table.name);
	if (stack.includes(key)) {
		throw new RandomTableError(
			'table_cycle_detected',
			`Cycle detected while rolling "${table.name}".`,
			{ stack: [...stack, key] },
		);
	}
	if (depth > state.maxDepth) {
		throw new RandomTableError(
			'max_depth_exceeded',
			`Nested random-table resolution exceeded max depth (${state.maxDepth}).`,
			{ tableName: table.name, depth, maxDepth: state.maxDepth },
		);
	}

	const { row } = pickWeightedRow(table.rows, state.random);
	const references = [...row.result.matchAll(TABLE_REFERENCE_TOKEN_REGEX)];
	if (references.length > MAX_REFERENCES_PER_RESULT) {
		throw new RandomTableError(
			'invalid_table_definition',
			`Table "${table.name}" row references too many nested tables (${references.length}).`,
			{ tableName: table.name },
		);
	}

	const nextStack = [...stack, key];
	const resolved = row.result.replace(
		TABLE_REFERENCE_TOKEN_REGEX,
		(_match, explicitA, explicitB) => {
			const reference = String(explicitA ?? explicitB ?? '').trim();
			if (!reference) return '';
			const refTable = resolveTableFromIndex(index, reference);
			const refKey = normalizeTableName(refTable.name);
			state.referencedTableKeys.add(refKey);
			return rollTableRecursive(index, refTable.name, state, depth + 1, nextStack);
		},
	);

	state.trace.push({
		tableName: table.name,
		source: table.source,
		selectedResult: row.result,
		resolvedResult: resolved,
		depth,
	});
	return resolved.trim();
}

export function rollRandomTable(
	index: RandomTableIndex,
	tableName: string,
	options: RollRandomTableOptions = {},
): RandomTableRollResult {
	const random = options.random ?? Math.random;
	const maxDepth = Math.max(1, Math.trunc(options.maxDepth ?? DEFAULT_MAX_ROLL_DEPTH));
	const state: RecursiveRollState = {
		trace: [],
		referencedTableKeys: new Set<string>(),
		maxDepth,
		random,
	};
	const root = resolveTableFromIndex(index, tableName);
	const result = rollTableRecursive(index, root.name, state, 0, []);
	const referencedTables = [...state.referencedTableKeys]
		.map((key) => index.byKey.get(key)?.[0]?.name ?? key)
		.sort((a, b) => a.localeCompare(b));
	return {
		tableName: root.name,
		result,
		trace: state.trace,
		referencedTables,
	};
}

export function formatRollBlock(tableName: string): string {
	const cleaned = tableName.trim().replace(/\s+/g, ' ');
	return `{{roll: ${cleaned || 'Table Name'}}}`;
}

export function parseInlineTableCommand(line: string): string | null {
	const match = line.match(/^\s*\/table\s+(.+?)\s*$/i);
	const raw = match?.[1]?.trim() ?? '';
	if (!raw) return null;
	const bracketed = raw.match(/^\[(.+)\]$/);
	const tableName = (bracketed?.[1] ?? raw).trim();
	return tableName.length > 0 ? tableName : null;
}

export function replaceRollBlockAtIndex(
	content: string,
	targetIndex: number,
	replacementText: string,
): string {
	if (targetIndex < 0) return content;
	let seen = 0;
	let replaced = false;
	const output = content.replace(ROLL_BLOCK_TOKEN_REGEX, (fullMatch) => {
		if (replaced) return fullMatch;
		if (seen !== targetIndex) {
			seen += 1;
			return fullMatch;
		}
		replaced = true;
		return replacementText;
	});
	return output;
}

export interface RollBlockToken {
	tableName: string;
	matchIndex: number;
	start: number;
	end: number;
	raw: string;
}

export function findRollBlockTokens(content: string): RollBlockToken[] {
	const tokens: RollBlockToken[] = [];
	const regex = new RegExp(ROLL_BLOCK_TOKEN_REGEX.source, 'gi');
	let matchIndex = 0;
	for (const match of content.matchAll(regex)) {
		const raw = match[0] ?? '';
		const tableName = (match[1] ?? '').trim();
		const index = match.index ?? -1;
		if (index < 0 || !tableName) continue;
		tokens.push({
			tableName,
			matchIndex,
			start: index,
			end: index + raw.length,
			raw,
		});
		matchIndex += 1;
	}
	return tokens;
}
