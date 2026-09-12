import { useEffect, useState } from 'react';
import {
	matchesMedia,
	readViewportHeight,
	subscribeMedia,
	subscribeViewportSize,
} from '../platform/preferences';

/* Responsive breakpoints (UX nav-profiles), shared across the shell and any screen that needs to
 * collapse a fixed main+sidebar layout: ≥1025px `desktop`, 641–1024px `rail`, ≤640px `phone`.
 * One media-query-driven hook — no resize listeners, no layout thrash. The raw `matchMedia` probe
 * lives in the platform layer (`platform/preferences.ts`, RC-UX-4.1); this is where the app resolves
 * it into a profile, and every screen branches on the profile rather than on pixels. */
const PHONE_QUERY = '(max-width: 640px)';
const RAIL_QUERY = '(max-width: 1024px)';
const COMPACT_TOP_BAR_QUERY = '(max-width: 1279px)';
export type Viewport = 'desktop' | 'rail' | 'phone';

export function computeViewport(): Viewport {
	if (matchesMedia(PHONE_QUERY)) return 'phone';
	if (matchesMedia(RAIL_QUERY)) return 'rail';
	return 'desktop';
}

export function useViewport(): Viewport {
	const [vp, setVp] = useState<Viewport>(() => computeViewport());
	useEffect(() => subscribeMedia([PHONE_QUERY, RAIL_QUERY], () => setVp(computeViewport())), []);
	return vp;
}

/* RC-UX-4.3 — list/detail screens (Characters, Knowledge, Campaign, Atlas) put the list and the open
 * detail SIDE BY SIDE on the rail tier (`ListDetail` in screen-kit). Desktop keeps its full-width
 * detail pages, whose own two-column layouts already use the room, and a phone stacks. A rail window
 * under 768px cannot fit a readable detail pane beside the 280px list, so it stacks as well. */
const SPLIT_QUERY = '(min-width: 768px)';

export function computeListDetailSplit(): boolean {
	return computeViewport() === 'rail' && matchesMedia(SPLIT_QUERY);
}

export function useListDetailSplit(): boolean {
	const [split, setSplit] = useState(() => computeListDetailSplit());
	useEffect(
		() =>
			subscribeMedia([PHONE_QUERY, RAIL_QUERY, SPLIT_QUERY], () =>
				setSplit(computeListDetailSplit()),
			),
		[],
	);
	return split;
}

/** Full sidebar + full-label table actions need more room than the navigation breakpoint alone.
 * Keep the toolbar compact in ordinary split-screen desktop windows, then expand it at 1280px. */
export function useCompactTopBar(): boolean {
	const [compact, setCompact] = useState(() => matchesMedia(COMPACT_TOP_BAR_QUERY));
	useEffect(
		() =>
			subscribeMedia([COMPACT_TOP_BAR_QUERY], () =>
				setCompact(matchesMedia(COMPACT_TOP_BAR_QUERY)),
			),
		[],
	);
	return compact;
}

/* RC-UX-1.3 — RTL readiness. `document.documentElement.dir` is the single source of truth for text
 * direction (RC-UX-1.1 sets it once an RTL locale ships); this hook just reads it reactively, the
 * same MutationObserver shape `windowChrome.ts` already uses for `data-theme`, so a runtime locale
 * switch re-renders direction-sensitive layout without a reload. */
export type Direction = 'ltr' | 'rtl';

export function computeDirection(): Direction {
	if (typeof document === 'undefined') return 'ltr';
	return document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
}

export function useDirection(): Direction {
	const [dir, setDir] = useState<Direction>(() => computeDirection());
	useEffect(() => {
		const target = document.documentElement;
		const observer = new MutationObserver(() => setDir(computeDirection()));
		observer.observe(target, { attributes: true, attributeFilter: ['dir'] });
		return () => observer.disconnect();
	}, []);
	return dir;
}

/**
 * The usable viewport height (VisualViewport when the Android keyboard is open). Components consume
 * this centralized responsive signal instead of adding their own global resize/keyboard probes.
 */
export function useViewportHeight(): number {
	const [height, setHeight] = useState(readViewportHeight);
	useEffect(() => subscribeViewportSize(() => setHeight(readViewportHeight())), []);
	return height;
}
