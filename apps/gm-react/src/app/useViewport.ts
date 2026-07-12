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
		const queries = [window.matchMedia('(max-width: 640px)'), window.matchMedia('(max-width: 1024px)')];
		const onChange = () => setVp(computeViewport());
		for (const q of queries) q.addEventListener('change', onChange);
		return () => {
			for (const q of queries) q.removeEventListener('change', onChange);
		};
	}, []);
	return vp;
}
