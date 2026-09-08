// RC-CLD-1.4 — the app shell's only analytics call sites.
//
// Kept to one hook so the answer to "what does this app record?" is a single file, not a search.
// Every call goes through `recordTelemetryEvent`, which is a no-op without recorded consent, so
// mounting this hook in a build nobody has opted into does nothing at all — no timer, no queue,
// no request.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { ProductAnalyticsProps } from '@dndtools/core';
import { readTier } from '../screens/settings/shared';
import { flushTelemetry, recordTelemetryEvent, telemetryEnabled } from './telemetry';
import { platformCapabilities } from '../platform/capabilities';

type ScreenName = ProductAnalyticsProps<'screen.viewed'>['screen'];

/** The taxonomy's screen values, matched against the FIRST path segment only. A route this does
 *  not know is `other` — the enum never grows to fit a URL, which is what keeps a campaign name in
 *  a deep link out of the payload. */
const SCREENS: readonly ScreenName[] = [
	'board',
	'session',
	'characters',
	'atlas',
	'campaign',
	'knowledge',
	'graph',
	'audio',
	'extensions',
	'community',
	'upgrade',
	'settings',
];

export function screenForPath(pathname: string): ScreenName {
	const segment = pathname.split('/').filter(Boolean)[0];
	if (!segment) return 'home';
	return SCREENS.includes(segment as ScreenName) ? (segment as ScreenName) : 'other';
}

/**
 * Record the launch cohort once, a screen view per navigation, and flush when the page is hidden
 * (the last chance a browser gives us, and the reason `flushTelemetry` uses a keepalive request).
 */
export function useProductAnalytics(): void {
	const { pathname } = useLocation();

	useEffect(() => {
		recordTelemetryEvent('app.launched', {
			platform: platformCapabilities.runtimeKind === 'electron' ? 'desktop' : 'web',
		});
		recordTelemetryEvent('experience.tier', { tier: readTier() });
		const onHide = () => {
			if (document.visibilityState === 'hidden' && telemetryEnabled()) void flushTelemetry();
		};
		document.addEventListener('visibilitychange', onHide);
		return () => {
			document.removeEventListener('visibilitychange', onHide);
		};
	}, []);

	useEffect(() => {
		recordTelemetryEvent('screen.viewed', { screen: screenForPath(pathname) });
	}, [pathname]);
}
