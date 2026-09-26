import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SCREENS_PATH } from './screenModel';

/**
 * RC-CAN-7.3 — ADR-041's `/scenes` alias: the Screens library, with the history entry REPLACED so
 * Back never lands on the alias.
 *
 * This is mounted OUTSIDE the routes' `<Suspense>` rather than as a `<Navigate>` route element. A
 * `<Navigate>` inside the boundary is committed but its effect never fires when the hash changes
 * while another route's lazy chunk is still loading (a reload on `/screens` followed at once by
 * `#/scenes` left an empty pane on `/scenes`). Out here the effect runs on every location change,
 * whatever the boundary is doing; the `/scenes` route itself renders the library meanwhile.
 */
export function ScreenRouteAliases() {
	const location = useLocation();
	const navigate = useNavigate();
	useEffect(() => {
		if (location.pathname !== '/scenes') return;
		navigate(
			{ pathname: SCREENS_PATH, search: location.search },
			{ replace: true, state: location.state },
		);
	}, [location, navigate]);
	return null;
}
