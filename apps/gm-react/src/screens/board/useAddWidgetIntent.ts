import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * RC-POL-1.2 — the create-intent handoff from "New widget" launchers (home hub), out of `Board.tsx`:
 * a navigation carrying `{ addWidget: true }` lands in edit mode and calls `onIntent` to open the
 * Add panel. Consumed once, then cleared from the history entry. Returns the location it read.
 */
export function useAddWidgetIntent(onIntent: () => void) {
	const navigate = useNavigate();
	const location = useLocation();
	const onIntentRef = useRef(onIntent);
	onIntentRef.current = onIntent;
	useEffect(() => {
		const intent = (location.state ?? null) as { addWidget?: boolean } | null;
		if (intent?.addWidget) {
			onIntentRef.current();
			const search = new URLSearchParams(location.search);
			search.set('edit', '1');
			navigate(
				{ pathname: location.pathname, search: `?${search}` },
				{ replace: true, state: null },
			);
		}
	}, [location.state, location.pathname, location.search, navigate]);
	return location;
}
