/**
 * Build links that another device can open in the hosted app. A packaged Electron renderer uses a
 * private app scheme, so it must use the validated public app URL compiled into the release. Browser
 * builds may safely fall back to their own HTTP(S) document URL.
 */

type PublicLocation = Pick<Location, 'href' | 'protocol'>;

function configuredPublicBase(): string | null | undefined {
	const raw = import.meta.env.VITE_PUBLIC_APP_URL?.trim() ?? '';
	if (!raw) return undefined;
	if (raw.length > 2048) return null;
	try {
		const url = new URL(raw);
		if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
			return null;
		return url.href;
	} catch {
		return null;
	}
}

export function publicAppBaseUrl(
	location: PublicLocation | undefined = globalThis.location,
): string | null {
	const configured = configuredPublicBase();
	if (configured !== undefined) return configured;
	if (!location || (location.protocol !== 'https:' && location.protocol !== 'http:')) return null;
	try {
		const url = new URL(location.href);
		url.search = '';
		url.hash = '';
		return url.href;
	} catch {
		return null;
	}
}

/** Create a HashRouter URL, or null when this build cannot make a shareable public link. */
export function publicAppHashUrl(
	route: `/${string}`,
	params?: Record<string, string>,
	location?: PublicLocation,
): string | null {
	const base = publicAppBaseUrl(location);
	if (!base) return null;
	const query = new URLSearchParams(params).toString();
	return `${base}#${route}${query ? `?${query}` : ''}`;
}
