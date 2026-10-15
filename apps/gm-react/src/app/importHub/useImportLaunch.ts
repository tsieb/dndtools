import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ImporterId } from './registry';

/** Consume before launching, including StrictMode replay; Back must never reopen a picker. */
export function useImportLaunch(id: ImporterId, launch: () => void, ready = true) {
	const location = useLocation();
	const navigate = useNavigate();
	const consumed = useRef<string | null>(null);
	useEffect(() => {
		const intent = location.state as { importer?: string } | null;
		if (!ready || intent?.importer !== id || consumed.current === location.key) return;
		consumed.current = location.key;
		navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
		launch();
	}, [id, launch, ready, location, navigate]);
}
