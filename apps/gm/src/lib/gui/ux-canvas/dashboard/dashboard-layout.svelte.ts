import { SvelteMap } from 'svelte/reactivity';
import {
	clearBoardLayout,
	readBoardLayout,
	writeBoardLayout,
} from '$lib/platform/board-layout-storage';

/**
 * Spatial-dashboard layout store (Command Center redesign §2/§7/§8.7).
 *
 * Owns the widget-block geometry (position / size / z) and the per-widget display options the
 * Properties Panel edits (title override, visible columns, tab order). This is GUI display state —
 * device-local, persisted via the platform board-layout storage helper — NOT durable vault state: the Processing Core keeps
 * owning the home Scene's tool widgets (moved via `scene.move-widget`, captured by presets and the
 * auto-save safe point); this store only arranges the dashboard BLOCKS around them.
 *
 * Lockability (§4): the Command Center instantiates the store with `locked: true`, so the widget
 * set is fixed (move / resize / configure only — `add`/`remove` fail closed). Any other spatial
 * scene instantiates it unlocked and gets full add/remove with the same API, so enabling full edit
 * elsewhere needs no refactoring (deliverable §8.8).
 */

export type DashboardWidgetType =
	| 'session'
	| 'data-hub'
	| 'player-views'
	| 'tools'
	| 'atlas'
	| 'combat'
	| 'notes'
	| 'characters'
	| 'search'
	| 'getting-started';

export interface DashboardRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface DashboardBlock {
	id: string;
	type: DashboardWidgetType;
	rect: DashboardRect;
	z: number;
	/** Per-widget display options, edited through the Properties Panel (schema below). */
	config: Record<string, unknown>;
}

/** Smallest useful block: enough for a title bar + one row of content. */
export const MIN_BLOCK_W = 160;
export const MIN_BLOCK_H = 96;

/** Human title per widget type (the default when no title override is configured). */
export const DASHBOARD_BLOCK_TITLES: Record<DashboardWidgetType, string> = {
	session: 'Active Session',
	'data-hub': 'Data Hub',
	'player-views': 'Player Views',
	tools: 'Tools & Layouts',
	atlas: 'Atlas',
	combat: 'Combat',
	notes: 'Notes',
	characters: 'Characters',
	search: 'Search',
	'getting-started': 'Getting Started',
};

/** Resolve a block's display title: the configured override, else the catalog default. */
export function blockTitle(block: DashboardBlock): string {
	const override = block.config.title;
	return typeof override === 'string' && override.trim() !== ''
		? override.trim()
		: DASHBOARD_BLOCK_TITLES[block.type];
}

// --- Properties Panel schema (§5) ----------------------------------------------------------------

export type BlockPropertyKind = 'text' | 'select' | 'toggle';

export interface BlockPropertyOption {
	value: string;
	label: string;
}

export interface BlockPropertyField {
	key: string;
	label: string;
	kind: BlockPropertyKind;
	/** Which fixed panel tab the field renders in (Layout is built-in; these add to it). */
	group: 'content' | 'display';
	options?: BlockPropertyOption[];
	placeholder?: string;
}

/** Title override is available on every widget (display group). */
const TITLE_FIELD: BlockPropertyField = {
	key: 'title',
	label: 'Title override',
	kind: 'text',
	group: 'display',
	placeholder: 'Default title',
};

/**
 * Per-widget editable fields (§8.5: the panel renders from this schema). Keep each list short —
 * the panel is fixed-height and never scrolls (§6), so fields must fit their tab group.
 */
export const BLOCK_PROPERTY_SCHEMAS: Record<DashboardWidgetType, BlockPropertyField[]> = {
	session: [TITLE_FIELD],
	'data-hub': [
		TITLE_FIELD,
		{
			key: 'tabOrder',
			label: 'Tab order',
			kind: 'select',
			group: 'content',
			options: [
				{ value: 'scenes-first', label: 'Scenes · Parties · Campaign' },
				{ value: 'parties-first', label: 'Parties · Campaign · Scenes' },
				{ value: 'campaign-first', label: 'Campaign · Scenes · Parties' },
			],
		},
		{ key: 'showUpdated', label: 'Updated column', kind: 'toggle', group: 'display' },
		{ key: 'showVisibility', label: 'Visibility column', kind: 'toggle', group: 'display' },
	],
	'player-views': [TITLE_FIELD],
	tools: [TITLE_FIELD],
	atlas: [
		TITLE_FIELD,
		{
			key: 'thumbnails',
			label: 'Map thumbnails',
			kind: 'select',
			group: 'content',
			options: [
				{ value: '3', label: '3 most recent' },
				{ value: '6', label: '6 most recent' },
			],
		},
	],
	combat: [
		TITLE_FIELD,
		{ key: 'showChallenge', label: 'Challenge rating', kind: 'toggle', group: 'display' },
	],
	notes: [
		TITLE_FIELD,
		{
			key: 'count',
			label: 'Recent notes shown',
			kind: 'select',
			group: 'content',
			options: [
				{ value: '3', label: '3 notes' },
				{ value: '5', label: '5 notes' },
				{ value: '8', label: '8 notes' },
			],
		},
	],
	characters: [
		TITLE_FIELD,
		{ key: 'showVitals', label: 'HP / AC vitals', kind: 'toggle', group: 'display' },
	],
	search: [TITLE_FIELD],
	'getting-started': [TITLE_FIELD],
};

// --- The authored Command Center default board (§8.7 — curated, not random) ----------------------
//
// World units at 100% zoom; three columns with density communicating hierarchy: the primary
// surfaces (Data Hub, Active Session, Player Views, Tools) hold full-height columns, the utility
// tiles (Combat / Search / Notes) sit as a compact strip. The whole board spans 1240×656 so
// zoom-to-fit lands near 85–100% on a desktop viewport — controls keep their tap-target size.

export const COMMAND_CENTER_LAYOUT_KEY = 'dndtools:v2:cc-dashboard-layout:v1';

export function commandCenterDefaultBlocks(): DashboardBlock[] {
	const block = (
		id: DashboardWidgetType,
		x: number,
		y: number,
		w: number,
		h: number,
		z: number,
	): DashboardBlock => ({ id, type: id, rect: { x, y, w, h }, z, config: {} });

	return [
		// Column A — the live session column.
		block('session', 0, 0, 400, 250, 1),
		block('getting-started', 0, 262, 400, 170, 2),
		block('tools', 0, 444, 400, 212, 3),
		// Column B — the data column (Data Hub is the primary surface).
		block('data-hub', 420, 0, 400, 280, 4),
		block('atlas', 420, 292, 400, 200, 5),
		block('characters', 420, 504, 400, 152, 6),
		// Column C — projection + quick-launch tiles.
		block('player-views', 840, 0, 400, 300, 7),
		block('combat', 840, 312, 194, 150, 8),
		block('search', 1046, 312, 194, 150, 9),
		block('notes', 840, 474, 400, 182, 10),
	];
}

// --- Store ----------------------------------------------------------------------------------------

interface PersistedLayout {
	version: 1;
	blocks: DashboardBlock[];
}

export interface DashboardLayoutOptions {
	storageKey: string;
	defaults: DashboardBlock[];
	/** When true the widget set is fixed: add/remove fail closed (the Command Center contract §4). */
	locked: boolean;
}

export class DashboardLayoutStore {
	readonly locked: boolean;
	readonly #storageKey: string;
	readonly #defaults: DashboardBlock[];
	readonly #blocks = new SvelteMap<string, DashboardBlock>();
	/** Authored order — drives DOM order and therefore the view-mode tab order. */
	#order = $state<string[]>([]);

	constructor(options: DashboardLayoutOptions) {
		this.locked = options.locked;
		this.#storageKey = options.storageKey;
		this.#defaults = options.defaults.map((b) => ({
			...b,
			rect: { ...b.rect },
			config: { ...b.config },
		}));
		for (const block of this.#defaults) this.#blocks.set(block.id, block);
		this.#order = this.#defaults.map((b) => b.id);
	}

	/** Blocks in authored (tab) order. */
	get blocks(): DashboardBlock[] {
		const out: DashboardBlock[] = [];
		for (const id of this.#order) {
			const block = this.#blocks.get(id);
			if (block) out.push(block);
		}
		return out;
	}

	get(id: string): DashboardBlock | undefined {
		return this.#blocks.get(id);
	}

	/**
	 * Restore the persisted layout (browser only). Persisted geometry/config is merged over the
	 * authored defaults BY ID, so a widget added to the catalog later still appears, and — on a
	 * locked surface — a stale persisted entry for a removed type is dropped (fail closed).
	 */
	load(): void {
		const parsed = readBoardLayout(this.#storageKey) as PersistedLayout | null;
		if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.blocks)) return;
		for (const saved of parsed.blocks) {
			const current = this.#blocks.get(saved.id);
			if (current) {
				this.#blocks.set(saved.id, {
					...current,
					rect: this.#sanitizeRect(saved.rect, current.rect),
					z: typeof saved.z === 'number' ? saved.z : current.z,
					config: { ...current.config, ...(saved.config ?? {}) },
				});
			} else if (!this.locked && saved.type && saved.rect) {
				this.#blocks.set(saved.id, {
					id: saved.id,
					type: saved.type,
					rect: this.#sanitizeRect(saved.rect, { x: 0, y: 0, w: MIN_BLOCK_W, h: MIN_BLOCK_H }),
					z: typeof saved.z === 'number' ? saved.z : this.#nextZ(),
					config: { ...(saved.config ?? {}) },
				});
				this.#order = [...this.#order, saved.id];
			}
		}
	}

	move(id: string, x: number, y: number): void {
		const block = this.#blocks.get(id);
		if (!block) return;
		this.#blocks.set(id, {
			...block,
			rect: { ...block.rect, x: Math.round(Math.max(0, x)), y: Math.round(Math.max(0, y)) },
		});
		this.#persist();
	}

	resize(id: string, w: number, h: number): void {
		const block = this.#blocks.get(id);
		if (!block) return;
		this.#blocks.set(id, {
			...block,
			rect: {
				...block.rect,
				w: Math.round(Math.max(MIN_BLOCK_W, w)),
				h: Math.round(Math.max(MIN_BLOCK_H, h)),
			},
		});
		this.#persist();
	}

	/** Properties Panel numeric layout fields write through here (validated, clamped). */
	setRect(id: string, rect: Partial<DashboardRect>): void {
		const block = this.#blocks.get(id);
		if (!block) return;
		const next = this.#sanitizeRect({ ...block.rect, ...rect }, block.rect);
		this.#blocks.set(id, { ...block, rect: next });
		this.#persist();
	}

	configure(id: string, key: string, value: unknown): void {
		const block = this.#blocks.get(id);
		if (!block) return;
		this.#blocks.set(id, { ...block, config: { ...block.config, [key]: value } });
		this.#persist();
	}

	bringToFront(id: string): void {
		const block = this.#blocks.get(id);
		if (!block) return;
		const top = this.#nextZ();
		if (block.z === top - 1) return;
		this.#blocks.set(id, { ...block, z: top });
		this.#persist();
	}

	/** Add a widget block. Fails closed (returns false) on a locked surface (§4). */
	add(block: DashboardBlock): boolean {
		if (this.locked || this.#blocks.has(block.id)) return false;
		this.#blocks.set(block.id, {
			...block,
			rect: this.#sanitizeRect(block.rect, { x: 0, y: 0, w: MIN_BLOCK_W, h: MIN_BLOCK_H }),
			z: this.#nextZ(),
		});
		this.#order = [...this.#order, block.id];
		this.#persist();
		return true;
	}

	/** Remove a widget block. Fails closed (returns false) on a locked surface (§4). */
	remove(id: string): boolean {
		if (this.locked || !this.#blocks.has(id)) return false;
		this.#blocks.delete(id);
		this.#order = this.#order.filter((entry) => entry !== id);
		this.#persist();
		return true;
	}

	/** Restore the authored default board and clear the persisted layout. */
	reset(): void {
		this.#blocks.clear();
		for (const block of this.#defaults) {
			this.#blocks.set(block.id, { ...block, rect: { ...block.rect }, config: { ...block.config } });
		}
		this.#order = this.#defaults.map((b) => b.id);
		clearBoardLayout(this.#storageKey);
	}

	#nextZ(): number {
		let top = 0;
		for (const block of this.#blocks.values()) top = Math.max(top, block.z);
		return top + 1;
	}

	#sanitizeRect(candidate: Partial<DashboardRect> | undefined, fallback: DashboardRect): DashboardRect {
		const num = (value: unknown, fb: number): number =>
			typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fb;
		return {
			x: Math.max(0, num(candidate?.x, fallback.x)),
			y: Math.max(0, num(candidate?.y, fallback.y)),
			w: Math.max(MIN_BLOCK_W, num(candidate?.w, fallback.w)),
			h: Math.max(MIN_BLOCK_H, num(candidate?.h, fallback.h)),
		};
	}

	#persist(): void {
		const payload: PersistedLayout = { version: 1, blocks: this.blocks };
		writeBoardLayout(this.#storageKey, payload);
	}
}
