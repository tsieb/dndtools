import type { PageLoad } from './$types';
import { redirectLegacyAlias } from '$lib/state/alias-redirect';

// Legacy alias redirect stub (NAV-002): `/maps` → the Atlas root `/atlas/`, preserving
// search params (e.g. `?poi=abc&x=1&y=2`) and hash so a legacy map deep link survives
// the redirect (NAV-002 AC1). A redirect stub, not a duplicate implementation (AC2).
export const prerender = false;

export const load: PageLoad = ({ url }) => redirectLegacyAlias(url);
