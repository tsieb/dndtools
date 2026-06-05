import type { PageLoad } from './$types';
import { redirectLegacyAlias } from '$lib/state/alias-redirect';

// Legacy alias redirect stub (NAV-002): `/pcs` → the Characters root `/characters/`, preserving
// search params and hash. A redirect stub, not a duplicate implementation (NAV-002 AC2).
export const prerender = false;

export const load: PageLoad = ({ url }) => redirectLegacyAlias(url);
