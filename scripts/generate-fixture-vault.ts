import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { FileSystemAdapter } from '../mcp/storage.js';
import { DEFAULT_CONTENT_VISIBILITY } from '../src/lib/types/visibility.js';
import { nowISO } from '../src/lib/utils/date.js';
import { createFolderId, createNoteId, type Note } from '../src/lib/types/note.js';
import {
	createVaultObjectId,
	type VaultObject,
	type VaultObjectType,
} from '../src/lib/types/object.js';

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'tmp', 'fixture-vault');
const DEFAULT_NOTE_COUNT = 1000;
const DEFAULT_OBJECT_COUNT = 250;
const DEFAULT_DEPTH = 3;
const DEFAULT_LINK_DENSITY = 0.15;
const DEFAULT_TAG_DISTRIBUTION = 'lore:4,npc:3,quest:2,location:2,faction:1,encounter:1';
const MAX_LINKS_PER_NOTE = 12;

type WeightedTag = { name: string; weight: number };

export type FixtureVaultOptions = {
	outputDir: string;
	noteCount: number;
	objectCount: number;
	depth: number;
	linkDensity: number;
	tagDistribution: string;
	force: boolean;
	seed: number;
};

export type FixtureVaultSummary = {
	outputDir: string;
	seed: number;
	noteCount: number;
	objectCount: number;
	effectiveNoteCount: number;
	linkCount: number;
	depth: number;
	linkDensity: number;
	tagDistribution: WeightedTag[];
};

function createRng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function toNumber(value: string | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Expected a numeric value but received "${value}"`);
	}
	return parsed;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function parseTagDistribution(input: string): WeightedTag[] {
	const entries = input
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	if (entries.length === 0) {
		throw new Error('Tag distribution must not be empty');
	}

	const parsed = entries.map((entry) => {
		const [nameRaw, weightRaw] = entry.split(':');
		const name = (nameRaw ?? '').trim();
		const weight = Number((weightRaw ?? '').trim());
		if (!name) {
			throw new Error(`Invalid tag entry "${entry}" (missing tag name)`);
		}
		if (!Number.isFinite(weight) || weight <= 0) {
			throw new Error(`Invalid tag entry "${entry}" (weight must be > 0)`);
		}
		return { name, weight };
	});

	const totalWeight = parsed.reduce((sum, entry) => sum + entry.weight, 0);
	return parsed.map((entry) => ({ name: entry.name, weight: entry.weight / totalWeight }));
}

function sampleWeightedTag(distribution: WeightedTag[], rng: () => number): string {
	let cursor = 0;
	const threshold = rng();
	for (const entry of distribution) {
		cursor += entry.weight;
		if (threshold <= cursor) return entry.name;
	}
	return distribution[distribution.length - 1]!.name;
}

function sampleTags(distribution: WeightedTag[], rng: () => number): string[] {
	const desired = 1 + Math.floor(rng() * 3);
	const tags = new Set<string>();
	while (tags.size < desired) {
		tags.add(sampleWeightedTag(distribution, rng));
		if (tags.size >= distribution.length) break;
	}
	return [...tags];
}

function buildFolderPath(index: number, depth: number, rng: () => number): string {
	if (depth <= 1) return '/';
	const maxDepth = clamp(Math.floor(depth), 1, 8);
	const actualDepth = 1 + Math.floor(rng() * maxDepth);
	const segments: string[] = [];
	for (let level = 0; level < actualDepth; level += 1) {
		const lane = (index + level) % 7;
		segments.push(`tier-${level + 1}-lane-${lane + 1}`);
	}
	return `/${segments.join('/')}`;
}

function createFixtureNote(
	index: number,
	noteCount: number,
	depth: number,
	distribution: WeightedTag[],
	rng: () => number,
): Note {
	const now = nowISO();
	const id = createNoteId(`fixture-note-${String(index + 1).padStart(5, '0')}-${nanoid(6)}`);
	const title = `Fixture Note ${String(index + 1).padStart(5, '0')}`;
	const content = [
		`# ${title}`,
		'',
		'Generated fixture note for benchmark and migration scenarios.',
		`Population baseline: ${noteCount} notes.`,
	].join('\n');
	return {
		id,
		title,
		content,
		folder: createFolderId(buildFolderPath(index, depth, rng)),
		tags: sampleTags(distribution, rng),
		frontmatter: { fixture: true },
		visibility: DEFAULT_CONTENT_VISIBILITY,
		createdAt: now,
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
	};
}

function pickLinkTargets(
	sourceIndex: number,
	noteCount: number,
	linkDensity: number,
	rng: () => number,
): number[] {
	const maxCandidates = Math.max(0, Math.min(noteCount - 1, MAX_LINKS_PER_NOTE));
	if (maxCandidates === 0 || linkDensity <= 0) return [];
	const targetCount = Math.floor(maxCandidates * clamp(linkDensity, 0, 1));
	if (targetCount <= 0) return [];

	const targetIndexes = new Set<number>();
	while (targetIndexes.size < targetCount) {
		const candidate = Math.floor(rng() * noteCount);
		if (candidate === sourceIndex) continue;
		targetIndexes.add(candidate);
	}
	return [...targetIndexes];
}

const OBJECT_TYPES: readonly VaultObjectType[] = [
	'stat_block',
	'character',
	'image',
	'map',
	'npc',
	'location',
	'faction',
	'quest',
	'item',
	'handout',
	'encounter',
	'timeline_event',
] as const;

function buildObjectData(type: VaultObjectType, index: number): VaultObject['data'] {
	switch (type) {
		case 'stat_block':
			return {
				abilities: { str: 10, dex: 11, con: 12, int: 9, wis: 10, cha: 8 },
				traits: [],
				actions: [],
				reactions: [],
				legendaryActions: [],
				challengeRating: String(1 + (index % 5)),
			};
		case 'character':
			return {
				goals: [`Goal ${index + 1}`],
				bonds: [],
				flaws: [],
				level: 1 + (index % 10),
			};
		case 'image':
			return {
				url: `https://example.invalid/fixtures/image-${index + 1}.png`,
				alt: `Fixture image ${index + 1}`,
			};
		case 'map':
			return {
				filePath: `.vault/assets/maps/fixture-map-${index + 1}.png`,
				width: 4096,
				height: 4096,
				areaNoteId: `fixture-note-${String((index % 20) + 1).padStart(5, '0')}`,
				scale: {
					unitsPerGridSquare: 5,
					unitLabel: 'ft',
				},
				grid: {
					type: index % 2 === 0 ? 'square' : 'hex',
					visible: true,
					originX: 0,
					originY: 0,
					cellSize: 70,
				},
				initialViewport: {
					zoom: 1,
					panX: 0,
					panY: 0,
				},
			};
		case 'npc':
			return {
				goals: [`Protect district ${1 + (index % 6)}`],
				secrets: [`Secret ${index + 1}`],
			};
		case 'location':
			return {
				features: [`Feature ${index + 1}`],
				notableNpcIds: [],
			};
		case 'faction':
			return {
				goals: [`Influence goal ${index + 1}`],
				resources: ['safehouse'],
			};
		case 'quest':
			return {
				steps: [`Step ${index + 1}`],
				relatedLocationIds: [],
				status: 'active',
			};
		case 'item':
			return {
				properties: ['versatile'],
				rarity: 'uncommon',
			};
		case 'handout':
			return {
				title: `Fixture Handout ${index + 1}`,
				content: `This is fixture handout content #${index + 1}.`,
				handoutType: index % 3 === 0 ? 'cipher' : 'document',
				campaignSession: `Session ${1 + (index % 12)}`,
				delivered: index % 2 === 0,
				cipher:
					index % 3 === 0
						? {
								encryptedContent: `Qeb nrfzh yoltk clu grjmp lsbo qeb ixwv ald #${index + 1}.`,
								decodedContent: `The quick brown fox jumps over the lazy dog #${index + 1}.`,
								substitutionKey: 'ZYXWVUTSRQPONMLKJIHGFEDCBA',
								decodedRevealed: false,
							}
						: undefined,
			};
		case 'encounter':
			return {
				participants: [`participant-${index + 1}`],
				rewards: ['xp'],
			};
		case 'timeline_event':
			return {
				involvedObjectIds: [],
				consequences: [`Consequence ${index + 1}`],
			};
	}
}

function createFixtureObject(index: number, tags: string[]): VaultObject {
	const type = OBJECT_TYPES[index % OBJECT_TYPES.length]!;
	const now = nowISO();
	const id = createVaultObjectId(
		`fixture-object-${String(index + 1).padStart(5, '0')}-${nanoid(6)}`,
	);

	return {
		id,
		type,
		name: `Fixture ${type.replace('_', ' ')} ${index + 1}`,
		summary: `Generated ${type} fixture`,
		tags,
		visibility: DEFAULT_CONTENT_VISIBILITY,
		relationships: [],
		data: buildObjectData(type, index),
		createdAt: now,
		updatedAt: now,
	} as VaultObject;
}

async function writeLegacyObjects(vaultDir: string, objects: VaultObject[]): Promise<void> {
	const objectsPath = path.join(vaultDir, '.vault', 'objects.json');
	const raw = await fs.readFile(objectsPath, 'utf-8');
	const parsed = JSON.parse(raw) as { version: number; objects: Record<string, VaultObject> };
	for (const object of objects) {
		parsed.objects[object.id] = object;
	}
	await fs.writeFile(objectsPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
}

export async function generateFixtureVault(
	options: FixtureVaultOptions,
): Promise<FixtureVaultSummary> {
	const outputDir = path.resolve(options.outputDir);
	const noteCount = Math.max(0, Math.floor(options.noteCount));
	const objectCount = Math.max(0, Math.floor(options.objectCount));
	const depth = clamp(Math.floor(options.depth), 1, 8);
	const linkDensity = clamp(options.linkDensity, 0, 1);
	const distribution = parseTagDistribution(options.tagDistribution);
	const rng = createRng(options.seed);

	const outputDirExists = await fs
		.access(outputDir)
		.then(() => true)
		.catch(() => false);

	if (outputDirExists) {
		const entries = await fs.readdir(outputDir);
		if (entries.length > 0 && !options.force) {
			throw new Error(`Output directory is not empty: ${outputDir}. Use --force to overwrite.`);
		}
	}

	if (options.force) {
		await fs.rm(outputDir, { recursive: true, force: true });
	}
	await fs.mkdir(outputDir, { recursive: true });

	const storage = new FileSystemAdapter(outputDir);
	await storage.initialize();
	const objects: VaultObject[] = [];
	for (let index = 0; index < objectCount; index += 1) {
		objects.push(createFixtureObject(index, sampleTags(distribution, rng)));
	}

	let linkCount = 0;
	try {
		const notes: Note[] = [];
		for (let index = 0; index < noteCount; index += 1) {
			const note = createFixtureNote(index, noteCount, depth, distribution, rng);
			notes.push(note);
			await storage.saveNote(note);
		}

		for (let index = 0; index < notes.length; index += 1) {
			const note = notes[index]!;
			const targetIndexes = pickLinkTargets(index, notes.length, linkDensity, rng);
			if (targetIndexes.length === 0) continue;
			const linkLines = targetIndexes.map((targetIndex) => {
				const targetTitle = notes[targetIndex]!.title;
				return `- Related: [[${targetTitle}]]`;
			});
			const linkedContent = `${note.content}\n\n## Related Notes\n${linkLines.join('\n')}\n`;
			const linkedNote: Note = {
				...note,
				content: linkedContent,
				updatedAt: nowISO(),
			};
			notes[index] = linkedNote;
			await storage.saveNote(linkedNote);
			await storage.resolveAndIndexLinks(linkedNote.id, linkedContent);
			linkCount += targetIndexes.length;
		}
	} finally {
		await storage.close();
	}
	await writeLegacyObjects(outputDir, objects);

	return {
		outputDir,
		seed: options.seed,
		noteCount,
		objectCount,
		effectiveNoteCount: noteCount + objectCount,
		linkCount,
		depth,
		linkDensity,
		tagDistribution: distribution,
	};
}

export function parseFixtureVaultOptions(argv: string[]): FixtureVaultOptions {
	const { values } = parseArgs({
		args: argv,
		options: {
			out: { type: 'string' },
			notes: { type: 'string' },
			objects: { type: 'string' },
			depth: { type: 'string' },
			'link-density': { type: 'string' },
			linkDensity: { type: 'string' },
			tags: { type: 'string' },
			'tag-distribution': { type: 'string' },
			force: { type: 'boolean' },
			seed: { type: 'string' },
			help: { type: 'boolean', short: 'h' },
		},
		strict: true,
		allowPositionals: false,
	});

	if (values.help) {
		console.log(
			[
				'Usage: pnpm fixture:vault -- [options]',
				'',
				'Options:',
				`  --out <path>            Output fixture vault directory (default: ${DEFAULT_OUTPUT_DIR})`,
				`  --notes <count>         Number of notes to generate (default: ${DEFAULT_NOTE_COUNT})`,
				`  --objects <count>       Number of vault objects to generate (default: ${DEFAULT_OBJECT_COUNT})`,
				`  --depth <count>         Maximum folder depth (default: ${DEFAULT_DEPTH})`,
				`  --link-density <0..1>   Approximate note link density (default: ${DEFAULT_LINK_DENSITY})`,
				`  --tag-distribution <d>  Tag distribution, ex: ${DEFAULT_TAG_DISTRIBUTION}`,
				'  --seed <number>        Deterministic RNG seed (default: current epoch ms)',
				'  --force                Remove existing output directory before generation',
			].join('\n'),
		);
		process.exit(0);
	}

	return {
		outputDir: values.out ?? DEFAULT_OUTPUT_DIR,
		noteCount: toNumber(values.notes, DEFAULT_NOTE_COUNT),
		objectCount: toNumber(values.objects, DEFAULT_OBJECT_COUNT),
		depth: toNumber(values.depth, DEFAULT_DEPTH),
		linkDensity: toNumber(
			(values['link-density'] as string | undefined) ?? values.linkDensity,
			DEFAULT_LINK_DENSITY,
		),
		tagDistribution:
			(values['tag-distribution'] as string | undefined) ?? values.tags ?? DEFAULT_TAG_DISTRIBUTION,
		force: values.force ?? false,
		seed: Math.floor(toNumber(values.seed, Date.now())),
	};
}

const isDirectRun = process.argv[1]
	? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
	: false;

if (isDirectRun) {
	const options = parseFixtureVaultOptions(process.argv.slice(2));
	generateFixtureVault(options)
		.then((summary) => {
			console.log('Fixture vault generated successfully.');
			console.log(JSON.stringify(summary, null, 2));
		})
		.catch((error) => {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		});
}
