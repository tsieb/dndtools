/**
 * SEC-010 — STREAM-PRIVACY PROOF + COVERAGE HARNESS. The shared, fail-closed proof that a player/observer
 * replication stream (or any actor-filtered view that crosses a trust boundary) carries NO hidden value,
 * title, id, edge, snippet, or revealing count (Architecture Contract 3 Visibility; Contract 2 "Cloud
 * storage must not contain hidden player content in a player-readable replication stream"; Defects
 * `CODEX-PR5-DM-NOTES-LEAK`, `CODEX-PR17-POI-VISIBILITY-LEAK`).
 *
 * This module does NOT re-implement filtering. Every replication surface already filters at the source —
 * the COLLAB-009 {@link filterReplicationStream}, the combat stream filter, and the `*ForActor` query
 * reads each omit (never redact-in-place) hidden content. SEC-010 is the ADVERSARIAL PROOF on top of that
 * filtering: given a fixture salted with a known DM-only secret in EVERY major domain, it serializes a
 * surface's player/observer projection and proves the secret's value, its hidden title/id, its hidden
 * graph edge, its snippet, and any revealing hidden COUNT are absent.
 *
 * THE NEEDLE MODEL. A test plants a set of `StreamPrivacyNeedle`s — the exact secret strings/ids/counts a
 * leak would expose. {@link findStreamPrivacyLeaks} deep-scans the JSON-serialized projection for any
 * needle and returns the structured findings; {@link assertViewCarriesNoHiddenContent} throws on the first
 * leak (the fail-closed boundary guard a transport/serializer runs before sending). Because the scan is
 * over the SERIALIZED wire form, it catches a leak hidden anywhere — a nested field, an array element, an
 * object KEY, a length that reveals a hidden count — not merely a top-level property.
 *
 * Fail closed: a needle with an empty/whitespace value is rejected (an empty needle would match
 * everything and give a false sense of safety); the scan treats a count needle as leaked when the exact
 * revealing number appears as a serialized value. Pure + deterministic over plain data — no DOM/storage/
 * clock/entropy/network.
 */

/** What kind of secret a needle represents — used only to explain a finding; the scan is uniform. */
export type StreamPrivacyNeedleKind =
	| 'value' // a hidden field value / body / snippet (e.g. dm-only note text)
	| 'title' // a hidden entity's title/name
	| 'id' // a hidden entity's id (its mere presence reveals existence)
	| 'edge' // a hidden relationship edge target (graph leak)
	| 'count'; // a revealing count of hidden items (a number that discloses how many are hidden)

/** One thing a player/observer projection must NOT contain. The `domain` labels which surface family it guards. */
export interface StreamPrivacyNeedle {
	/** The major domain this needle belongs to (notes/maps/characters/scenes/search/graph/widgets/mcp/sync). */
	domain: string;
	kind: StreamPrivacyNeedleKind;
	/** The exact secret token (a string value/title/id/edge) or the exact revealing count (a number). */
	secret: string | number;
}

/** A leak the scan found: which needle leaked + the serialized path it was found at (for diagnostics). */
export interface StreamPrivacyLeak {
	domain: string;
	kind: StreamPrivacyNeedleKind;
	secret: string | number;
	/** A human-readable JSON path to where the secret surfaced (e.g. `$.hits[2].snippet`). */
	path: string;
}

/** A needle is usable only if its secret is a non-empty string or a finite number; else it is rejected. */
function isUsableNeedle(needle: StreamPrivacyNeedle): boolean {
	if (typeof needle.secret === 'number') return Number.isFinite(needle.secret);
	return needle.secret.trim().length > 0;
}

/**
 * Deep-scan an arbitrary projection for any of the planted needles. A STRING needle leaks when its exact
 * token appears anywhere in the serialized projection — in a value, an array element, or an object KEY
 * (so a `{ "secret-id": ... }` map keyed by a hidden id is caught). A NUMBER (count) needle leaks when the
 * exact revealing number appears as a serialized numeric value. Returns every leak found, in domain order.
 *
 * The scan walks the live object graph (not just `JSON.stringify`) so it can report the precise path AND
 * so it inspects object keys, which a value-only string search would miss. Fail closed: an unusable needle
 * (empty/whitespace/NaN) is treated as a configuration error and reported as a leak so the caller fixes it.
 */
export function findStreamPrivacyLeaks(
	projection: unknown,
	needles: readonly StreamPrivacyNeedle[],
): StreamPrivacyLeak[] {
	const leaks: StreamPrivacyLeak[] = [];

	for (const needle of needles) {
		if (!isUsableNeedle(needle)) {
			leaks.push({
				domain: needle.domain,
				kind: needle.kind,
				secret: needle.secret,
				path: '<unusable-needle>',
			});
			continue;
		}
		const found = locateNeedle(projection, needle);
		if (found !== null) {
			leaks.push({ domain: needle.domain, kind: needle.kind, secret: needle.secret, path: found });
		}
	}

	return leaks;
}

/** Walk the object graph for ONE needle; return the first JSON path it surfaces at, or null if absent. */
function locateNeedle(value: unknown, needle: StreamPrivacyNeedle, path = '$'): string | null {
	if (value === null || value === undefined) return null;

	if (typeof value === 'string') {
		if (typeof needle.secret === 'string' && value.includes(needle.secret)) return path;
		return null;
	}

	if (typeof value === 'number') {
		// A count needle leaks when the exact revealing number surfaces as a value.
		if (needle.kind === 'count' && typeof needle.secret === 'number' && value === needle.secret) return path;
		// A numeric secret could also be an id; compare by exact value.
		if (typeof needle.secret === 'number' && value === needle.secret) return path;
		return null;
	}

	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i += 1) {
			const hit = locateNeedle(value[i], needle, `${path}[${i}]`);
			if (hit !== null) return hit;
		}
		return null;
	}

	if (typeof value === 'object') {
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			// A hidden id/title can leak as an OBJECT KEY (a map keyed by entity id), so check keys too.
			if (typeof needle.secret === 'string' && key.includes(needle.secret)) {
				return `${path}.<key:${key}>`;
			}
			const hit = locateNeedle(entry, needle, `${path}.${key}`);
			if (hit !== null) return hit;
		}
	}

	return null;
}

/**
 * Fail-closed boundary guard: prove a player/observer projection carries NONE of the planted needles, and
 * THROW with the leaking domain/kind/path on the first leak. A transport/serializer runs this immediately
 * before sending a non-DM projection so a regression in any surface's filter is caught at the wire rather
 * than leaking. Pure (apart from throwing).
 */
export function assertViewCarriesNoHiddenContent(
	projection: unknown,
	needles: readonly StreamPrivacyNeedle[],
): void {
	const leaks = findStreamPrivacyLeaks(projection, needles);
	if (leaks.length > 0) {
		const first = leaks[0]!;
		throw new Error(
			`Stream-privacy leak: hidden ${first.kind} (domain "${first.domain}", secret ${JSON.stringify(
				first.secret,
			)}) surfaced in a non-DM projection at ${first.path}. The surface must omit hidden content before delivery.`,
		);
	}
}

// --- The replication-surface coverage registry (SEC-010 AC2) ---------------------------------------

/**
 * The major domains SEC-010 enumerates as player/observer replication surfaces. EVERY actor-filtered read
 * that can cross the trust boundary to a non-DM belongs to exactly one of these families. The coverage
 * gate cross-checks this list against the surfaces actually proven by tests: a new surface added without a
 * proof row turns the gate red (SEC-010 AC2 — "a new query surface ... is included in replication
 * filtering tests before release").
 */
export const REPLICATION_SURFACE_DOMAINS = Object.freeze([
	'notes',
	'maps',
	'characters',
	'scenes',
	'search',
	'graph',
	'widgets',
	'mcp',
	'sync-status',
] as const);

export type ReplicationSurfaceDomain = (typeof REPLICATION_SURFACE_DOMAINS)[number];

/** Whether a domain is a declared replication-surface family (fail closed: an unknown domain is not). */
export function isReplicationSurfaceDomain(domain: string): domain is ReplicationSurfaceDomain {
	return (REPLICATION_SURFACE_DOMAINS as readonly string[]).includes(domain);
}

/**
 * Cross-check a set of COVERED surface domains against the declared enumeration. Returns the domains that
 * are declared but NOT covered (a release-blocking gap) — the SEC-010 AC2 fail-closed check the coverage
 * meta-test asserts is empty. Deterministic, in enumeration order.
 */
export function uncoveredReplicationSurfaceDomains(
	coveredDomains: Iterable<string>,
): ReplicationSurfaceDomain[] {
	const covered = new Set(coveredDomains);
	return REPLICATION_SURFACE_DOMAINS.filter((domain) => !covered.has(domain));
}
