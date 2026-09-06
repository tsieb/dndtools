/**
 * RC-MAP-3.1 — the prop catalogue: the stamp/prop library as DATA.
 *
 * Every object a DM can stamp onto a map lives here, in the core, for three reasons:
 *
 *   - The scatter generators and the Stamp tool must agree on what `prop:tree` means. Before this
 *     file the generator invented its own asset tokens (`tree.oak`) while the editor's Assets panel
 *     kept a separate hard-coded list in the GUI, and nothing checked the two against each other.
 *   - A prop needs a picture. A `prop` feature used to render as an anonymous dot, so a stamped
 *     chest, a stamped statue and a stamped bush were literally indistinguishable on the canvas.
 *     Each entry therefore carries a VECTOR GLYPH — path data, not an image asset — so a map draws
 *     at any zoom, prints, and needs no binary in the vault.
 *   - Categories, tags and default scale are catalogue facts, not GUI preferences. Keeping them
 *     framework-free means the player view, an export and the editor all render the same object.
 *
 * Glyph geometry: path data in a `-1 -1 2 2` box centred on the feature's anchor point, y pointing
 * down (SVG's own convention). Paths are FILLED with the even-odd rule, so a shape drawn as an outer
 * ring plus an inner subpath reads as an outline rather than a blob — that is how the crate, chest
 * and doorway glyphs stay legible at map scale without a stroke that would need its own colour.
 */

/** The shelves of the library. Ordered as the Assets panel lists them. */
export type PropCategoryId =
	| 'furniture'
	| 'foliage'
	| 'rubble'
	| 'treasure'
	| 'doors'
	| 'stairs'
	| 'light'
	| 'structure';

export const PROP_CATEGORIES: readonly PropCategoryId[] = Object.freeze([
	'furniture',
	'foliage',
	'rubble',
	'treasure',
	'doors',
	'stairs',
	'light',
	'structure',
]);

export interface PropCatalogEntry {
	/** Stable id, and the `style` string of the emitted `prop` feature. Never renamed. */
	id: string;
	category: PropCategoryId;
	/** English noun. The GUI localizes by id; this is the honest fallback, never a placeholder. */
	name: string;
	/** Free-text search terms in addition to the name and the category. */
	tags: readonly string[];
	/** Filled path data in the `-1 -1 2 2` glyph box (even-odd fill). */
	glyph: string;
	/** Baseline size multiplier before the DM's own scale option. Small objects read small. */
	defaultScale: number;
}

/** A filled circle of radius `r` centred on (cx, cy), as two arcs. */
const circle = (cx: number, cy: number, r: number): string =>
	`M${cx} ${cy - r}A${r} ${r} 0 1 0 ${cx} ${cy + r}A${r} ${r} 0 1 0 ${cx} ${cy - r}Z`;

/** A filled axis-aligned rectangle. */
const rect = (x: number, y: number, w: number, h: number): string => `M${x} ${y}h${w}v${h}h${-w}Z`;

/** A rectangular ring: outer rect, inner rect wound the same way — even-odd knocks the middle out. */
const frame = (x: number, y: number, w: number, h: number, t: number): string =>
	`${rect(x, y, w, h)}${rect(x + t, y + t, w - 2 * t, h - 2 * t)}`;

export const PROP_CATALOG: readonly PropCatalogEntry[] = Object.freeze([
	// ── foliage ────────────────────────────────────────────────────────────────────────────────────
	{
		id: 'prop:tree',
		category: 'foliage',
		name: 'Tree',
		tags: ['nature', 'outdoor'],
		glyph: `${rect(-0.12, 0.1, 0.24, 0.9)}${circle(0, -0.3, 0.62)}`,
		defaultScale: 1,
	},
	{
		id: 'prop:pine',
		category: 'foliage',
		name: 'Pine',
		tags: ['nature', 'outdoor'],
		glyph: `${rect(-0.1, 0.5, 0.2, 0.5)}M0 -1L0.5 -0.15L-0.5 -0.15ZM0 -0.5L0.68 0.55L-0.68 0.55Z`,
		defaultScale: 1,
	},
	{
		id: 'prop:bush',
		category: 'foliage',
		name: 'Bush',
		tags: ['nature', 'outdoor'],
		glyph: `${circle(-0.4, 0.2, 0.42)}${circle(0.38, 0.24, 0.38)}${circle(0, -0.15, 0.5)}`,
		defaultScale: 0.7,
	},
	{
		id: 'prop:dead-tree',
		category: 'foliage',
		name: 'Dead tree',
		tags: ['nature', 'outdoor', 'decor'],
		glyph: `${rect(-0.09, -0.5, 0.18, 1.5)}M-0.08 -0.2L-0.75 -0.72L-0.62 -0.86L0 -0.42ZM0.08 -0.35L0.72 -0.85L0.84 -0.7L0.16 -0.16Z`,
		defaultScale: 0.9,
	},
	{
		id: 'prop:mushroom',
		category: 'foliage',
		name: 'Mushrooms',
		tags: ['nature', 'dungeon', 'decor'],
		glyph: `${rect(-0.5, -0.1, 0.16, 0.7)}M-0.42 -0.12A0.42 0.42 0 0 1 0.02 -0.12ZM0.34 0.28h0.16v0.5h-0.16ZM0.14 0.26A0.3 0.3 0 0 1 0.7 0.26Z`,
		defaultScale: 0.55,
	},
	{
		id: 'prop:grass',
		category: 'foliage',
		name: 'Grass tuft',
		tags: ['nature', 'outdoor', 'decor'],
		glyph: `M-0.6 0.7L-0.5 -0.2L-0.32 0.7ZM-0.12 0.7L0 -0.6L0.14 0.7ZM0.36 0.7L0.52 -0.1L0.66 0.7Z`,
		defaultScale: 0.5,
	},

	// ── rubble ─────────────────────────────────────────────────────────────────────────────────────
	{
		id: 'prop:rock',
		category: 'rubble',
		name: 'Rock',
		tags: ['nature', 'outdoor'],
		glyph: 'M-0.75 0.5L-0.5 -0.35L0.1 -0.7L0.68 -0.25L0.75 0.45Z',
		defaultScale: 0.8,
	},
	{
		id: 'prop:rubble',
		category: 'rubble',
		name: 'Rubble',
		tags: ['dungeon', 'decor'],
		glyph:
			'M-0.8 0.55L-0.62 0.05L-0.15 0.2L-0.3 0.6ZM0.05 0.65L0.2 0.05L0.75 0.15L0.7 0.6ZM-0.35 -0.25L0.05 -0.6L0.42 -0.3L0.2 -0.05Z',
		defaultScale: 0.7,
	},
	{
		id: 'prop:bone',
		category: 'rubble',
		name: 'Bones',
		tags: ['dungeon', 'decor'],
		glyph: `${circle(-0.35, -0.15, 0.4)}M0.05 0.25L0.85 -0.45L0.95 -0.25L0.15 0.45ZM0.05 -0.45L0.85 0.25L0.95 0.45L0.15 0.55Z`,
		defaultScale: 0.6,
	},
	{
		id: 'prop:stalagmite',
		category: 'rubble',
		name: 'Stalagmite',
		tags: ['nature', 'dungeon'],
		glyph: 'M-0.15 0.85L0.05 -0.9L0.3 0.85ZM0.35 0.85L0.6 -0.1L0.85 0.85Z',
		defaultScale: 0.8,
	},

	{
		id: 'prop:grave',
		category: 'rubble',
		name: 'Grave',
		tags: ['outdoor', 'decor'],
		glyph: `${rect(-0.45, -0.45, 0.9, 1.25)}M-0.45 -0.45A0.45 0.45 0 0 1 0.45 -0.45Z${rect(-0.7, 0.8, 1.4, 0.16)}`,
		defaultScale: 0.9,
	},
	// ── furniture ──────────────────────────────────────────────────────────────────────────────────
	{
		id: 'prop:table',
		category: 'furniture',
		name: 'Table',
		tags: ['furniture', 'indoor'],
		glyph: `${rect(-0.85, -0.5, 1.7, 0.32)}${rect(-0.72, -0.18, 0.2, 0.75)}${rect(0.52, -0.18, 0.2, 0.75)}`,
		defaultScale: 1,
	},
	{
		id: 'prop:chair',
		category: 'furniture',
		name: 'Chair',
		tags: ['furniture', 'indoor'],
		glyph: `${rect(-0.55, -0.85, 0.22, 1.1)}${rect(-0.55, 0.05, 1.15, 0.24)}${rect(0.38, 0.29, 0.2, 0.55)}`,
		defaultScale: 0.7,
	},
	{
		id: 'prop:bed',
		category: 'furniture',
		name: 'Bed',
		tags: ['furniture', 'indoor'],
		glyph: `${frame(-0.65, -0.95, 1.3, 1.9, 0.14)}${rect(-0.45, -0.75, 0.9, 0.4)}`,
		defaultScale: 1.1,
	},
	{
		id: 'prop:bookshelf',
		category: 'furniture',
		name: 'Bookshelf',
		tags: ['furniture', 'indoor', 'decor'],
		glyph: `${frame(-0.75, -0.9, 1.5, 1.8, 0.13)}${rect(-0.62, -0.32, 1.24, 0.12)}${rect(-0.62, 0.2, 1.24, 0.12)}`,
		defaultScale: 1,
	},
	{
		id: 'prop:crate',
		category: 'furniture',
		name: 'Crate',
		tags: ['dungeon', 'indoor'],
		glyph: `${frame(-0.7, -0.7, 1.4, 1.4, 0.14)}M-0.55 -0.42L-0.42 -0.55L0.55 0.42L0.42 0.55Z`,
		defaultScale: 0.8,
	},
	{
		id: 'prop:barrel',
		category: 'furniture',
		name: 'Barrel',
		tags: ['dungeon', 'indoor'],
		glyph: `${frame(-0.55, -0.8, 1.1, 1.6, 0.13)}${rect(-0.55, -0.3, 1.1, 0.12)}${rect(-0.55, 0.18, 1.1, 0.12)}`,
		defaultScale: 0.8,
	},
	{
		id: 'prop:altar',
		category: 'furniture',
		name: 'Altar',
		tags: ['dungeon', 'decor', 'structure'],
		glyph: `${rect(-0.9, -0.35, 1.8, 0.25)}${rect(-0.6, -0.1, 1.2, 0.75)}${rect(-0.9, 0.65, 1.8, 0.25)}`,
		defaultScale: 1,
	},

	// ── treasure ───────────────────────────────────────────────────────────────────────────────────
	{
		id: 'prop:chest',
		category: 'treasure',
		name: 'Chest',
		tags: ['dungeon', 'treasure'],
		glyph: `${frame(-0.8, -0.55, 1.6, 1.2, 0.14)}${rect(-0.8, -0.12, 1.6, 0.13)}${rect(-0.12, -0.2, 0.24, 0.3)}`,
		defaultScale: 0.85,
	},
	{
		id: 'prop:coins',
		category: 'treasure',
		name: 'Coins',
		tags: ['treasure', 'decor'],
		glyph: `${circle(-0.35, 0.25, 0.38)}${circle(0.38, 0.3, 0.34)}${circle(0.02, -0.35, 0.36)}`,
		defaultScale: 0.55,
	},
	{
		id: 'prop:gem',
		category: 'treasure',
		name: 'Gem',
		tags: ['treasure', 'decor'],
		glyph: 'M0 -0.8L0.75 -0.1L0 0.8L-0.75 -0.1Z',
		defaultScale: 0.5,
	},
	{
		id: 'prop:urn',
		category: 'treasure',
		name: 'Urn',
		tags: ['treasure', 'decor', 'indoor'],
		glyph: `${frame(-0.5, -0.45, 1, 1.35, 0.13)}${rect(-0.62, -0.75, 1.24, 0.3)}`,
		defaultScale: 0.7,
	},

	// ── doors (decorative dressing; the Door tool authors doors that open) ──────────────────────────
	{
		id: 'prop:door-frame',
		category: 'doors',
		name: 'Doorway',
		tags: ['dungeon', 'structure'],
		glyph: `${frame(-0.55, -0.9, 1.1, 1.8, 0.15)}${circle(0.28, 0.1, 0.11)}`,
		defaultScale: 1,
	},
	{
		id: 'prop:double-doors',
		category: 'doors',
		name: 'Double doors',
		tags: ['dungeon', 'structure'],
		glyph: `${frame(-0.9, -0.75, 1.8, 1.5, 0.14)}${rect(-0.06, -0.75, 0.12, 1.5)}`,
		defaultScale: 1.1,
	},
	{
		id: 'prop:secret-panel',
		category: 'doors',
		name: 'Secret panel',
		tags: ['dungeon', 'structure', 'decor'],
		glyph: `${frame(-0.75, -0.75, 1.5, 1.5, 0.14)}M-0.3 -0.35h0.6v0.16h-0.22v0.54h-0.16v-0.54h-0.22Z`,
		defaultScale: 1,
	},
	{
		id: 'prop:portcullis',
		category: 'doors',
		name: 'Portcullis',
		tags: ['dungeon', 'structure'],
		glyph: `${rect(-0.9, -0.8, 1.8, 0.18)}${rect(-0.62, -0.62, 0.16, 1.5)}${rect(-0.08, -0.62, 0.16, 1.5)}${rect(0.46, -0.62, 0.16, 1.5)}${rect(-0.9, -0.05, 1.8, 0.14)}`,
		defaultScale: 1.1,
	},

	// ── stairs ─────────────────────────────────────────────────────────────────────────────────────
	{
		id: 'prop:stairs-up',
		category: 'stairs',
		name: 'Stairs up',
		tags: ['dungeon', 'structure'],
		glyph: `${rect(-0.9, 0.5, 1.8, 0.28)}${rect(-0.6, 0.1, 1.5, 0.28)}${rect(-0.3, -0.3, 1.2, 0.28)}${rect(0, -0.7, 0.9, 0.28)}`,
		defaultScale: 1.2,
	},
	{
		id: 'prop:stairs-down',
		category: 'stairs',
		name: 'Stairs down',
		tags: ['dungeon', 'structure'],
		glyph: `${rect(-0.9, -0.78, 1.8, 0.28)}${rect(-0.9, -0.38, 1.5, 0.28)}${rect(-0.9, 0.02, 1.2, 0.28)}${rect(-0.9, 0.42, 0.9, 0.28)}`,
		defaultScale: 1.2,
	},
	{
		id: 'prop:spiral-stairs',
		category: 'stairs',
		name: 'Spiral stairs',
		tags: ['dungeon', 'structure'],
		glyph: `${circle(0, 0, 0.9)}${circle(0, 0, 0.72)}${rect(-0.06, -0.85, 0.12, 0.8)}${rect(-0.06, -0.06, 0.85, 0.12)}${rect(-0.06, 0.05, 0.12, 0.8)}${rect(-0.85, -0.06, 0.8, 0.12)}`,
		defaultScale: 1,
	},
	{
		id: 'prop:ladder',
		category: 'stairs',
		name: 'Ladder',
		tags: ['dungeon', 'structure'],
		glyph: `${rect(-0.55, -0.9, 0.16, 1.8)}${rect(0.39, -0.9, 0.16, 1.8)}${rect(-0.39, -0.55, 0.78, 0.14)}${rect(-0.39, -0.07, 0.78, 0.14)}${rect(-0.39, 0.41, 0.78, 0.14)}`,
		defaultScale: 0.9,
	},

	// ── light ──────────────────────────────────────────────────────────────────────────────────────
	{
		id: 'prop:brazier',
		category: 'light',
		name: 'Brazier',
		tags: ['dungeon', 'light'],
		glyph: `M-0.62 -0.1L0.62 -0.1L0.4 0.55L-0.4 0.55Z${rect(-0.55, 0.55, 1.1, 0.16)}M0 -0.95L0.34 -0.4L-0.34 -0.4Z`,
		defaultScale: 0.8,
	},
	{
		id: 'prop:campfire',
		category: 'light',
		name: 'Campfire',
		tags: ['outdoor', 'light'],
		glyph: `M0 -0.85L0.42 -0.05L-0.42 -0.05ZM-0.85 0.35L0.85 0.62L0.8 0.8L-0.9 0.53ZM-0.85 0.8L-0.8 0.62L0.9 0.35L0.85 0.53Z`,
		defaultScale: 0.8,
	},
	{
		id: 'prop:torch',
		category: 'light',
		name: 'Torch',
		tags: ['dungeon', 'light'],
		glyph: `${rect(-0.11, -0.2, 0.22, 1.15)}M0 -0.95L0.32 -0.35L-0.32 -0.35Z`,
		defaultScale: 0.6,
	},
	{
		id: 'prop:chandelier',
		category: 'light',
		name: 'Chandelier',
		tags: ['indoor', 'light', 'decor'],
		glyph: `${rect(-0.06, -0.9, 0.12, 0.6)}M-0.8 -0.3L0.8 -0.3L0.55 0.25L-0.55 0.25Z${circle(-0.6, 0.5, 0.2)}${circle(0, 0.6, 0.2)}${circle(0.6, 0.5, 0.2)}`,
		defaultScale: 0.9,
	},

	// ── structure ──────────────────────────────────────────────────────────────────────────────────
	{
		id: 'prop:pillar',
		category: 'structure',
		name: 'Pillar',
		tags: ['dungeon', 'structure'],
		glyph: `${rect(-0.7, -0.9, 1.4, 0.24)}${rect(-0.42, -0.66, 0.84, 1.3)}${rect(-0.7, 0.64, 1.4, 0.26)}`,
		defaultScale: 0.9,
	},
	{
		id: 'prop:statue',
		category: 'structure',
		name: 'Statue',
		tags: ['dungeon', 'decor', 'structure'],
		glyph: `${circle(0, -0.55, 0.28)}M-0.35 -0.25L0.35 -0.25L0.28 0.5L-0.28 0.5Z${rect(-0.62, 0.5, 1.24, 0.32)}`,
		defaultScale: 0.85,
	},
	{
		id: 'prop:well',
		category: 'structure',
		name: 'Well',
		tags: ['outdoor', 'structure'],
		glyph: `${circle(0, 0.05, 0.8)}${circle(0, 0.05, 0.45)}${rect(-0.85, -0.12, 1.7, 0.16)}`,
		defaultScale: 1,
	},
	{
		id: 'prop:fountain',
		category: 'structure',
		name: 'Fountain',
		tags: ['outdoor', 'decor', 'structure'],
		glyph: `${circle(0, 0.1, 0.85)}${circle(0, 0.1, 0.6)}${circle(0, 0.1, 0.28)}${rect(-0.07, -0.85, 0.14, 0.8)}`,
		defaultScale: 1,
	},
]);

const BY_ID: ReadonlyMap<string, PropCatalogEntry> = new Map(
	PROP_CATALOG.map((entry) => [entry.id, entry] as const),
);

/** The catalogue entry for a `prop` feature's `style`, or `undefined` for an id we do not stock. */
export function getProp(id: string | undefined): PropCatalogEntry | undefined {
	return id === undefined ? undefined : BY_ID.get(id);
}

/** Every entry on one shelf, in catalogue order. */
export function propsInCategory(category: PropCategoryId): readonly PropCatalogEntry[] {
	return PROP_CATALOG.filter((entry) => entry.category === category);
}

/**
 * Free-text search over name, id suffix, category and tags. Case-insensitive, substring, and
 * deliberately NOT fuzzy: a DM typing "cha" wants Chair and Chandelier, not a ranked guess.
 * The GUI additionally searches the LOCALIZED name, which only it can see.
 */
export function searchProps(query: string): readonly PropCatalogEntry[] {
	const q = query.trim().toLowerCase();
	if (!q) return PROP_CATALOG;
	return PROP_CATALOG.filter(
		(entry) =>
			entry.name.toLowerCase().includes(q) ||
			entry.id.slice('prop:'.length).includes(q) ||
			entry.category.includes(q) ||
			entry.tags.some((tag) => tag.includes(q)),
	);
}
