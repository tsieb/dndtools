import { lazy, Suspense, useState, type ComponentType } from 'react';

/**
 * RC-ENG-3.2 — a builtin body loaded on first use. The Session screen's `session` and `combat` bodies
 * pull in its panels and the map canvas; drawn eagerly, they sat on the boot path of every screen.
 *
 * A body whose module has already loaded renders synchronously. One drawn before that suspends inside
 * its own boundary and keeps the lazy element for the rest of its life, so it is never remounted (and
 * never loses its state) when the module arrives. `preload()` loads the module ahead of time.
 */
export function lazyBody<P extends object>(load: () => Promise<ComponentType<P>>) {
	let loaded: ComponentType<P> | null = null;
	let pending: Promise<ComponentType<P>> | null = null;
	const preload = () =>
		(pending ??= load().then((component) => {
			loaded = component;
			return component;
		}));
	const Lazy = lazy(() =>
		preload().then((component) => ({ default: component })),
	) as unknown as ComponentType<P>;
	function LazyBody(props: P) {
		const [Ready] = useState(() => loaded);
		return Ready ? (
			<Ready {...props} />
		) : (
			<Suspense fallback={null}>
				<Lazy {...props} />
			</Suspense>
		);
	}
	return Object.assign(LazyBody, { preload });
}
