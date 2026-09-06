import { useEffect, useState } from 'react';

/* Responsive breakpoints (UX nav-profiles), shared across the shell and any screen that needs to
 * collapse a fixed main+sidebar layout: ≥1025px `desktop`, 641–1024px `rail`, ≤640px `phone`.
 * One matchMedia-driven hook — no resize listeners, no layout thrash. */
export type Viewport = 'desktop' | 'rail' | 'phone';

export function computeViewport(): Viewport {
	if (typeof window === 'undefined') return 'desktop';
	if (window.matchMedia('(max-width: 640px)').matches) return 'phone';
	if (window.matchMedia('(max-width: 1024px)').matches) return 'rail';
	return 'desktop';
}

export function useViewport(): Viewport {
	const [vp, setVp] = useState<Viewport>(() => computeViewport());
	useEffect(() => {
		const queries = [
			window.matchMedia('(max-width: 640px)'),
			window.matchMedia('(max-width: 1024px)'),
		];
		const onChange = () => setVp(computeViewport());
		for (const q of queries) q.addEventListener('change', onChange);
		return () => {
			for (const q of queries) q.removeEventListener('change', onChange);
		};
	}, []);
	return vp;
}

/** Full sidebar + full-label table actions need more room than the navigation breakpoint alone.
 * Keep the toolbar compact in ordinary split-screen desktop windows, then expand it at 1280px. */
export function useCompactTopBar(): boolean {
	const [compact, setCompact] = useState(() =>
		typeof window === 'undefined' ? false : window.matchMedia('(max-width: 1279px)').matches,
	);
	useEffect(() => {
		const query = window.matchMedia('(max-width: 1279px)');
		const onChange = () => setCompact(query.matches);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	}, []);
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
	const readHeight = () => {
		if (typeof window === 'undefined') return 640;
		return Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight));
	};
	const [height, setHeight] = useState(readHeight);
	useEffect(() => {
		const update = () => setHeight(readHeight());
		window.addEventListener('resize', update);
		window.visualViewport?.addEventListener('resize', update);
		return () => {
			window.removeEventListener('resize', update);
			window.visualViewport?.removeEventListener('resize', update);
		};
	}, []);
	return height;
}
