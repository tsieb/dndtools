import { useEffect, useState } from 'react';
import { parsePath, useLocation, useNavigate } from 'react-router-dom';
import { isLiveScene } from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import { SCREENS_PATH, screenPath } from './screenModel';

/**
 * RC-CAN-7.3 — ADR-041's route aliases, each resolved with the history entry REPLACED so Back never
 * lands on the alias: `/scenes` is the Screens library, and `/board` is the home board's
 * `/screen/:id` once it exists (`BoardAlias` provisions it and renders the non-GM and failed-write
 * fallbacks).
 *
 * This is mounted OUTSIDE the routes' `<Suspense>` rather than as a `<Navigate>` route element. A
 * `<Navigate>` inside the boundary is committed but its effect never fires when the hash changes
 * while another route's lazy chunk is still loading (a reload on `/screens` followed at once by
 * `#/scenes` left an empty pane on `/scenes`). Out here the effect runs whatever the boundary is
 * doing; the alias routes render meanwhile.
 *
 * The effect runs after EVERY commit, not on a location dependency. Router updates are transitions:
 * when `/board` is re-entered before its redirect to `/screen/:id` has committed, the redirect's render
 * is dropped and the router settles on a `/board` location equal field-for-field to the one already
 * committed (same key, same state), so `useLocation()` hands back the same object, a location-keyed
 * effect is skipped, and the pane stayed empty. Redirecting on every commit while the path is an
 * alias costs two comparisons and cannot miss one.
 *
 * Every commit is not enough on its own: that settled `/board` hands the router the SAME memoized
 * location context, so nothing re-renders this component and no commit happens for the effect to
 * follow (a promotion run of screens.spec.ts sat on the empty pane for 10s once no runtime update came
 * along to re-render it). A `popstate` (a typed or bookmarked hash, Back, Forward) therefore re-renders
 * it urgently. That render still sees the last COMMITTED location, which can trail the browser while a
 * route transition is pending, so an alias only redirects while the browser's URL is on it too; a
 * redirect never replaces an entry the browser has already moved on to.
 */
export function ScreenRouteAliases() {
	const location = useLocation();
	const navigate = useNavigate();
	const [, setPopCount] = useState(0);
	useEffect(() => {
		const onPop = () => setPopCount((count) => count + 1);
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	}, []);
	const runtime = useRuntime();
	const homeSceneId = runtime.state.commandCenter.homeSceneId;
	const home = homeSceneId ? runtime.state.scenes.scenes[homeSceneId] : undefined;
	const isDm = runtime.state.permissions.actors[runtime.defaultActorId]?.role === 'dm';
	// A failed provisioning write is rolled back, so the home is only live here once it is durable.
	const boardTarget =
		runtime.loaded && isDm && homeSceneId && home && isLiveScene(home)
			? screenPath(homeSceneId)
			: null;
	useEffect(() => {
		if (location.pathname !== browserPathname()) return;
		if (location.pathname === '/scenes') {
			navigate(
				{ pathname: SCREENS_PATH, search: location.search },
				{ replace: true, state: location.state },
			);
		} else if (location.pathname === '/board' && boardTarget) {
			// Any create intent (the Command Center's "New widget") travels with it.
			navigate(boardTarget, { replace: true, state: location.state });
		}
	});
	return null;
}

/** The route path the browser's URL is on right now (the app runs under `HashRouter`). */
function browserPathname(): string {
	return parsePath(window.location.hash.slice(1)).pathname || '/';
}
