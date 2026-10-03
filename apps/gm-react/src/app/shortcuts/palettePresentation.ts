import type { CommandActionGroup, SearchHit } from '@dndtools/core';
import type { MessageKey } from '../../i18n';
import type { CanvasSurfaceHandle } from './registry';
import { nextFreeSlot } from '../canvas/AddWidgetGallery';
import { BOARD_RIGHT_BOUND, flowKeyBetween, flowOrder } from '../board-helpers';

/**
 * One palette row. `kind` is the v2 addition: an ACTION does something (a Create launcher, a core
 * command action), a DESTINATION goes somewhere (a section, an entity, a search hit). The `>`
 * prefix lists actions only, so the distinction has to be carried per row.
 */
export interface PaletteCommand {
	id: string;
	kind: 'action' | 'destination';
	label: string;
	icon?: string;
	group?: string;
	keywords?: string;
	description?: string;
	meta?: string;
	/** Key legend printed on the row, straight from `shortcuts/registry.ts` — never hand-typed. */
	shortcut?: string;
	disabled?: boolean;
	run: () => void;
}

/** Light debounce so the full-text search read runs per pause, not per keystroke (no new deps). */
export const SEARCH_DEBOUNCE_MS = 150;
/** Cap on full-text hits fed to the palette — the core read already ranked them (SRCH-005). */
export const SEARCH_HIT_LIMIT = 15;
/** Cap on core action rows, so a big widget library never buries the rest of the palette. */
export const ACTION_LIMIT = 12;
/** How many just-run rows the empty palette offers back. */
export const RECENT_LIMIT = 5;
/** Cap on saved-search rows, so a long shelf of named searches never buries the actions. */
export const SAVED_SEARCH_LIMIT = 8;

/**
 * How each core search-hit kind is presented: which palette group it lands in, the route the app
 * navigates to (the section that owns the domain — same mapping as the core quick-switcher's
 * `routeForHit`), and its icon. Notes/objects live in Knowledge, POIs in the Atlas, handouts and
 * rolls in the Session section. RC-KNW-2.3 gives objects, handouts and rolls their own groups:
 * "Session" lumped a shared handout together with a die roll, which read as one kind of thing.
 */
export const HIT_PRESENTATION: Record<
	SearchHit['type'],
	{ group: MessageKey; route: string; icon: string; kind: MessageKey }
> = {
	note: {
		group: 'palette.group.notes',
		route: '/knowledge',
		icon: 'knowledge-book',
		kind: 'palette.kind.note',
	},
	object: {
		group: 'palette.group.objects',
		route: '/campaign',
		icon: 'campaign-scroll',
		kind: 'palette.kind.storyEntry',
	},
	poi: {
		group: 'palette.group.mapLocations',
		route: '/atlas',
		icon: 'poi',
		kind: 'palette.kind.poi',
	},
	handout: {
		group: 'palette.group.handouts',
		route: '/session',
		icon: 'scroll',
		kind: 'palette.kind.handout',
	},
	'session-artifact': {
		group: 'palette.group.rolls',
		route: '/session',
		icon: 'dice',
		kind: 'palette.kind.roll',
	},
};

/** The icon each core action group wears, so an action row reads as its own kind at a glance. */
export const ACTION_GROUP_ICON: Record<CommandActionGroup, string> = {
	home: 'home',
	preset: 'layers',
	widget: 'widget',
	session: 'session-bolt',
	map: 'atlas-map',
	tile: 'widget',
	template: 'layers',
};

/**
 * RC-KNW-2.3 — CONTEXTUAL actions: which core action groups belong to the screen the DM is looking
 * at right now. Those are promoted into an "On this screen" group at the top of the palette and
 * offered even with an empty query; everything else in the catalog waits behind a query or the `>`
 * prefix. Route → relevance is GUI navigation metadata (the same kind of mapping `routeForHit`
 * already owns); eligibility itself stays the core's decision. The two canvas routes are not listed
 * here: RC-CAN-4.3 gives them their own core provider (`listCanvasCommandActions`).
 */
export function contextualGroupsFor(pathname: string): readonly CommandActionGroup[] {
	if (pathname.startsWith('/session')) return ['session', 'map'];
	if (pathname.startsWith('/atlas')) return ['map'];
	if (pathname.startsWith('/player')) return ['session', 'map'];
	return [];
}

/**
 * Where a palette-added tile lands: the same slot the tile gallery's pick would choose on this
 * canvas — the end of the reading order under flow, else the first open spot inside the board's
 * columns (bounded) or the canvas's current extent (canvas).
 */
export function slotFor(
	surface: CanvasSurfaceHandle,
	size: { w: number; h: number },
): { x: number; y: number } {
	if (surface.policy === 'flow') {
		const ordered = flowOrder(surface.widgets);
		return flowKeyBetween(ordered[ordered.length - 1] ?? null, null) ?? { x: 0, y: 0 };
	}
	const bound =
		surface.policy === 'bounded'
			? BOARD_RIGHT_BOUND
			: surface.widgets.reduce((max, w) => Math.max(max, w.x + w.w), BOARD_RIGHT_BOUND);
	return nextFreeSlot(surface.widgets, size, bound);
}

/** Focus a just-added tile once its frame has rendered, as the gallery does after a pick. */
export function focusTileWhenRendered(widgetInstanceId: string, attempts = 20): void {
	const frame = document.querySelector<HTMLElement>(`[data-testid="widget-${widgetInstanceId}"]`);
	if (frame) frame.focus();
	else if (attempts > 0)
		requestAnimationFrame(() => focusTileWhenRendered(widgetInstanceId, attempts - 1));
}

/** A note hit deep-links the exact note; a POI hit deep-links its map and highlights the marker
 *  (`/atlas?map=…&poi=…`, the same URL contract as MapBuilder's copy-link); everything else lands
 *  on its owning section. */
export function routeForHit(hit: SearchHit): string {
	if (hit.type === 'note') return `/knowledge/${hit.id}`;
	if (hit.type === 'poi' && hit.mapId) {
		return `/atlas?map=${encodeURIComponent(hit.mapId)}&poi=${encodeURIComponent(hit.id)}`;
	}
	return HIT_PRESENTATION[hit.type].route;
}
