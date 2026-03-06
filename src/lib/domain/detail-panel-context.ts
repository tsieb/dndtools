export type DetailPanelContext = 'note' | 'map' | 'session' | null;

const NOTE_DETAIL_PATH_PATTERN = /^\/knowledge\/notes\/[^/]+$/;

export function detailPanelContextFromPath(
	pathname: string,
	searchParams: URLSearchParams,
): DetailPanelContext {
	if (NOTE_DETAIL_PATH_PATTERN.test(pathname)) {
		return 'note';
	}
	if (pathname === '/atlas/maps' && searchParams.get('map')?.trim()) {
		return 'map';
	}
	if (pathname.startsWith('/session')) {
		return 'session';
	}
	return null;
}

export function detailPanelContextFromUrl(url: URL): DetailPanelContext {
	return detailPanelContextFromPath(url.pathname, url.searchParams);
}

export function isDetailPanelAvailable(url: URL): boolean {
	return detailPanelContextFromUrl(url) !== null;
}
