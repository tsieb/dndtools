import type { ScreenListEntry } from '@dndtools/core';
import type { useI18n } from '../../i18n';
import {
	BOARD_RIGHT_BOUND,
	flowKeyBetween,
	flowOrder,
	type BoardLayoutRect,
} from '../../app/board-helpers';
import { screenPath, SCREENS_PATH } from './screenModel';

type Translate = ReturnType<typeof useI18n>['t'];

/** The shape of a palette destination row (`CommandPalette`'s own row type is structural). */
export interface ScreenPaletteRow {
	id: string;
	kind: 'destination';
	label: string;
	icon: string;
	group: string;
	keywords: string;
	description?: string;
	meta?: string;
	run: () => void;
}

/**
 * RC-CAN-7.3 — the command palette's screen actions: "All screens" in Go to, then one row per screen
 * that jumps to it. Each row is ONE navigation, so it pushes one history entry. The home screen is
 * already the Go to "GM screen" row, so it is not listed twice.
 */
export function screenPaletteRows(
	entries: readonly ScreenListEntry[],
	nameOf: (entry: ScreenListEntry) => string,
	t: Translate,
	goTo: (id: string, path: string) => () => void,
): { library: ScreenPaletteRow; screens: ScreenPaletteRow[] } {
	return {
		library: {
			id: 'nav:screens',
			kind: 'destination',
			label: t('palette.screens.all'),
			icon: 'layout-list',
			group: t('palette.group.goTo'),
			keywords: t('palette.screens.allKeywords'),
			run: goTo('nav:screens', SCREENS_PATH),
		},
		screens: entries
			.filter((entry) => !entry.isHome)
			.map((entry) => ({
				id: `screen:${entry.id}`,
				kind: 'destination',
				label: nameOf(entry),
				icon: entry.pinned ? 'pin' : 'scene',
				group: t('palette.group.screens'),
				keywords: entry.tags.join(' '),
				description: t(
					entry.visibility === 'dm-only' ? 'common.visibility.dmOnly' : 'palette.shared',
				),
				meta: entry.isLive ? t('screens.live') : undefined,
				run: goTo(`screen:${entry.id}`, screenPath(entry.id)),
			})),
	};
}

// ── RC-CAN-8.5: where a new tile lands ─────────────────────────────────────────────────────────
// One placement path for every add: a gallery pick, a palette "Add tile" row (through
// `nextFreeSlot`, which `palettePresentation.slotFor` calls) and, after a build, RC-WID-6.2.

type SlotRect = Pick<BoardLayoutRect, 'x' | 'y' | 'w' | 'h'>;
type PlacedRect = SlotRect & { id?: string };

// The board's column geometry (board-helpers.ts: 24px margin and gutter, 240px widgets on a 264px
// step, mirroring the core's Command Center `defaultLayout`), so a placed tile lines up with the
// seeded ones instead of starting a ragged fourth column.
const SLOT_MARGIN = 24;
const SLOT_GUTTER = 24;
const SLOT_COLUMN_STEP = 264;

/**
 * The part of the board the GM can see right now, in board coordinates, read off the frames of
 * `tiles` where a canvas has drawn them (`widget-<id>` inside a `scene-board-*` surface). A frame's
 * box against its layout gives the surface's scale and origin, whatever the zoom or scroll. Null
 * when none of them is on screen (no DOM, the phone's stacked list, an empty board).
 */
export function visibleBoardRect(tiles: readonly PlacedRect[]): SlotRect | null {
	if (typeof document === 'undefined') return null;
	for (const tile of tiles) {
		if (!tile.id || tile.w <= 0) continue;
		const frame = document.querySelector<HTMLElement>(`[data-testid="widget-${tile.id}"]`);
		const surface = frame?.closest<HTMLElement>('[data-testid^="scene-board-"]');
		if (!frame || !surface) continue;
		const box = frame.getBoundingClientRect();
		const scale = box.width / tile.w;
		if (!(scale > 0)) continue;
		const pane = surface.getBoundingClientRect();
		const left = Math.max(pane.left, 0);
		const top = Math.max(pane.top, 0);
		const right = Math.min(pane.right, document.documentElement.clientWidth);
		const bottom = Math.min(pane.bottom, document.documentElement.clientHeight);
		if (right <= left || bottom <= top) return null;
		const originX = box.left - tile.x * scale;
		const originY = box.top - tile.y * scale;
		return {
			x: (left - originX) / scale,
			y: (top - originY) / scale,
			w: (right - left) / scale,
			h: (bottom - top) / scale,
		};
	}
	return null;
}

/**
 * The first free grid slot for a `size` tile near what the GM is looking at. Candidates are the
 * margin, the board's column starts, the gutter past every existing tile's right and bottom edge
 * and every tile's top (so a tile can land beside a neighbour), kept where the tile clears every
 * other one by a gutter and stays inside `bound`. Of those, the first in reading order whose corner is in `view` wins, so
 * a board in full view still fills its top row first; with nothing free in view, the one closest to
 * the view's centre, so a GM scrolled down a long board doesn't add a tile somewhere off screen.
 * `view` defaults to the on-screen part of the surface drawing `existing`; pass null for a pure
 * reading-order search.
 */
export function nextFreeSlot(
	existing: readonly PlacedRect[],
	size: { w: number; h: number },
	bound: number = BOARD_RIGHT_BOUND,
	view: SlotRect | null = visibleBoardRect(existing),
): { x: number; y: number } {
	// A tile wider than the board still gets the margin column rather than no slot at all.
	const right = Math.max(bound, SLOT_MARGIN + size.w);
	const xs = new Set<number>();
	for (let x = SLOT_MARGIN; x + size.w <= right; x += SLOT_COLUMN_STEP) xs.add(x);
	const ys = new Set<number>([SLOT_MARGIN]);
	for (const r of existing) {
		xs.add(r.x + r.w + SLOT_GUTTER);
		ys.add(r.y);
		ys.add(r.y + r.h + SLOT_GUTTER);
	}
	const columns = [...xs].filter((x) => x >= 0 && x + size.w <= right).sort((a, b) => a - b);
	const rows = [...ys].sort((a, b) => a - b);
	const clear = (x: number, y: number) =>
		existing.every(
			(r) =>
				x >= r.x + r.w + SLOT_GUTTER ||
				x + size.w + SLOT_GUTTER <= r.x ||
				y >= r.y + r.h + SLOT_GUTTER ||
				y + size.h + SLOT_GUTTER <= r.y,
		);
	const free = rows.flatMap((y) => columns.filter((x) => clear(x, y)).map((x) => ({ x, y })));
	// Unreachable while the row below every tile is a candidate; kept so the type needs no assertion.
	const bottom = existing.reduce((max, r) => Math.max(max, r.y + r.h), 0);
	const fallback = { x: SLOT_MARGIN, y: bottom + SLOT_GUTTER };
	if (!view) return free[0] ?? fallback;
	const seen = (p: { x: number; y: number }) =>
		p.x >= view.x && p.x < view.x + view.w && p.y >= view.y && p.y < view.y + view.h;
	const inView = free.find(seen);
	if (inView) return inView;
	const cx = view.x + view.w / 2;
	const cy = view.y + view.h / 2;
	const distance = (p: { x: number; y: number }) =>
		Math.hypot(p.x + size.w / 2 - cx, p.y + size.h / 2 - cy);
	// `reduce` keeps the earlier slot on a tie, so the choice stays deterministic.
	return (
		free.reduce<{ x: number; y: number } | null>(
			(best, p) => (!best || distance(p) < distance(best) ? p : best),
			null,
		) ?? fallback
	);
}

/**
 * Where a new tile goes under each layout policy: the end of the reading order on a flow screen,
 * else {@link nextFreeSlot} inside the board's columns (bounded) or the canvas's current extent.
 */
export function placeNewTile(
	tiles: readonly BoardLayoutRect[],
	size: { w: number; h: number },
	policy: 'bounded' | 'canvas' | 'flow',
): { x: number; y: number } {
	if (policy === 'flow') {
		const ordered = flowOrder(tiles);
		return flowKeyBetween(ordered[ordered.length - 1] ?? null, null) ?? { x: 0, y: 0 };
	}
	const bound =
		policy === 'bounded'
			? BOARD_RIGHT_BOUND
			: tiles.reduce((max, w) => Math.max(max, w.x + w.w), BOARD_RIGHT_BOUND);
	return nextFreeSlot(tiles, size, bound);
}
