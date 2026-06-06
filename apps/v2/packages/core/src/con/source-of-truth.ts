import {
	classifyStorageCategory,
	eligibleCloudCategories,
} from '../sync/storage-classification';

/**
 * CON-005 — THE SOURCE-OF-TRUTH CONSTRAINT GATE. The single, declared source of truth for the invariant
 * that the LOCAL vault / owning durable state document is the AUTHORITATIVE copy of core vault content, and
 * that no derived/remote/cache/widget-local store may ever be treated as the SOLE source of truth
 * (Architecture Contract 2 Cloud Storage Model: "Local storage is the primary copy. Cloud services assist
 * sync, backup, and collaboration; they do not become the source of truth for core use"; Contract 4 Widget
 * State Ownership: a widget "must not hide authoritative entity state in private storage"; Cross-Contract
 * Non-Negotiable 5: "entities and session documents own canonical data").
 *
 * CON-005's statement: "The system must never treat cloud storage, external sources, generated snapshots,
 * player-device caches, or widget-local state as the sole source of truth for core vault content." Its two
 * acceptance criteria:
 *
 *   AC1 — Given cloud storage is UNAVAILABLE, when LOCAL authoritative content exists, then the vault
 *         REMAINS USABLE and CAN QUEUE OPERATIONS (local is the primary copy; cloud is assistive).
 *   AC2 — Given a widget persists LOCAL STATE, when inspected, then CANONICAL ENTITY DATA still resides in
 *         the owning ENTITY / SESSION / MAP state document (widget-local state is never the canonical home).
 *
 * This module delivers both as fail-closed predicates/audits that COMPOSE the established storage-
 * classification + state-ownership machinery (it does NOT re-implement either):
 *
 *   - AC1 — {@link vaultUsableWithoutCloud} proves the vault stays usable and CAN QUEUE operations when
 *     cloud sync is disabled (over {@link classifyStorageCategory} / {@link eligibleCloudCategories}: with
 *     cloud off, NOTHING is cloud-eligible, yet the durable operation log is still written LOCALLY).
 *   - AC2 — {@link findWidgetLocalSourceOfTruthViolation} proves a widget's persisted local state does not
 *     carry CANONICAL entity fields — those must live in the owning entity/session/map state document.
 *   - {@link auditSourceOfTruthOwnership} is the codebase-drift audit: it cross-checks that every core vault
 *     content class declares its CANONICAL owner as a durable LOCAL state document — never a derived/remote/
 *     cache/widget store — so the project can never silently make a non-authoritative store the sole home of
 *     canonical content.
 *
 * It mirrors the established mechanical-gate pattern in this codebase (the SEC-008 regression-gate registry,
 * the PLAT-010 quality-gate registry, the CON-003/004/006 constraint gates): a declared invariant + a pure,
 * fail-closed validator cross-checked against reality.
 *
 * Pure data + pure predicates. No GUI, no storage, no clock, no entropy, no network.
 */

/** CON-005 constraint-registry version, bumped on a breaking constraint-shape change. */
export const SOURCE_OF_TRUTH_VERSION = 1 as const;

/**
 * THE NON-AUTHORITATIVE STORE CLASSES CON-005 governs. Each is a store that may HOLD a copy of core content
 * but must NEVER be the SOLE source of truth for it. The audit proves none of them is the declared canonical
 * owner of any core content class.
 */
export type NonAuthoritativeStoreClass =
	| 'cloud-storage' // cloud sync storage
	| 'external-source' // an external sync source (Obsidian / Google Docs / future)
	| 'generated-snapshot' // a compacted / generated entity snapshot
	| 'player-device-cache' // a player-device cache of delivered content
	| 'widget-local-state'; // a widget's persisted local state

/** The canonical, declared list of non-authoritative store classes, in governed order. */
export const NON_AUTHORITATIVE_STORE_CLASSES: readonly NonAuthoritativeStoreClass[] = Object.freeze([
	'cloud-storage',
	'external-source',
	'generated-snapshot',
	'player-device-cache',
	'widget-local-state',
]);

const NON_AUTHORITATIVE_STORE_SET: ReadonlySet<string> = new Set(NON_AUTHORITATIVE_STORE_CLASSES);

/**
 * THE AUTHORITATIVE OWNER CLASSES. The durable LOCAL state documents that MAY be the canonical home of core
 * vault content (Contract 1 state-shape table; the six DURABLE state documents). A core content class whose
 * canonical owner is NOT one of these is exactly the CON-005 violation: a derived/remote/cache store has
 * become the sole source of truth.
 */
export type AuthoritativeOwner =
	| 'vault-state' // notes, objects, schemas, settings, sync-source registrations
	| 'scene-state' // scene definitions, widget layout/config, sharing targets
	| 'session-state' // session live state: combat, dice history, handout log, player-view assignments
	| 'map-state' // map entities, layers, POIs, routes, fog
	| 'permission-state'; // roles, grants, capability schema, visibility metadata

export const AUTHORITATIVE_OWNERS: readonly AuthoritativeOwner[] = Object.freeze([
	'vault-state',
	'scene-state',
	'session-state',
	'map-state',
	'permission-state',
]);

const AUTHORITATIVE_OWNER_SET: ReadonlySet<string> = new Set(AUTHORITATIVE_OWNERS);

/**
 * One core vault content class and the durable LOCAL state document that authoritatively OWNS it. The audit
 * proves every owner is an {@link AuthoritativeOwner} (a durable local document) and never a non-
 * authoritative store. This is the single source of truth for "where canonical content lives".
 */
export interface CoreContentOwnership {
	/** The core vault content class (e.g. `note`, `character`, `combat`, `widget-config`). */
	readonly contentClass: string;
	/** The durable LOCAL state document that owns the canonical copy. */
	readonly canonicalOwner: AuthoritativeOwner;
}

/**
 * THE CORE-CONTENT OWNERSHIP REGISTRY. Every class of core vault content has a row naming its canonical
 * durable-local owner. Adding content whose canonical home is a cloud/cache/snapshot/widget store would fail
 * {@link auditSourceOfTruthOwnership}. Mirrors Contract 1's state-shape table + Contract 4's widget state-
 * ownership table.
 */
export const CORE_CONTENT_OWNERSHIP: readonly CoreContentOwnership[] = Object.freeze([
	{ contentClass: 'note', canonicalOwner: 'vault-state' },
	{ contentClass: 'object-record', canonicalOwner: 'vault-state' },
	{ contentClass: 'vault-settings', canonicalOwner: 'vault-state' },
	{ contentClass: 'sync-source-registration', canonicalOwner: 'vault-state' },
	{ contentClass: 'scene-definition', canonicalOwner: 'scene-state' },
	{ contentClass: 'widget-layout', canonicalOwner: 'scene-state' },
	{ contentClass: 'widget-configuration', canonicalOwner: 'scene-state' },
	{ contentClass: 'character', canonicalOwner: 'vault-state' },
	{ contentClass: 'combat-state', canonicalOwner: 'session-state' },
	{ contentClass: 'dice-history', canonicalOwner: 'session-state' },
	{ contentClass: 'handout-delivery-log', canonicalOwner: 'session-state' },
	{ contentClass: 'player-view-assignment', canonicalOwner: 'session-state' },
	{ contentClass: 'map-entity', canonicalOwner: 'map-state' },
	{ contentClass: 'map-fog-operation', canonicalOwner: 'map-state' },
	{ contentClass: 'permission-grant', canonicalOwner: 'permission-state' },
	{ contentClass: 'visibility-metadata', canonicalOwner: 'permission-state' },
]);

/**
 * CON-005 AC1 — the vault stays usable WITHOUT cloud. Proves that when cloud sync is DISABLED (or
 * unavailable), local authoritative content is still operable: NOTHING is cloud-eligible (so no write waits
 * on the cloud), yet the durable operation log is a LOCAL category that is still written locally — so local
 * work continues and operations are QUEUED locally until cloud sync resumes. True when local-first ownership
 * holds with cloud off. Composes {@link classifyStorageCategory} / {@link eligibleCloudCategories}.
 */
export function vaultUsableWithoutCloud(): boolean {
	const cloudDisabled = false;
	// With cloud off, NOTHING is eligible to leave the device — no write depends on the cloud.
	const nothingCloudEligible = eligibleCloudCategories(cloudDisabled).length === 0;
	// The durable operation log is still classified+written LOCALLY (device-local when cloud is off), so
	// accepted local mutations are QUEUED in the local log awaiting a future sync — the vault remains usable.
	const operationLogStaysLocal =
		classifyStorageCategory('durable-operation-log', cloudDisabled) === 'device-local';
	return nothingCloudEligible && operationLogStaysLocal;
}

/** Why a widget's persisted local state was rejected as claiming to be a source of truth (CON-005 AC2). */
export type WidgetSourceOfTruthReason =
	| 'canonical-field-in-local-state' // a canonical entity field was persisted in widget-local state
	| 'authoritative-flag'; // the widget-local state declared itself authoritative/canonical

/** A detected attempt to make widget-local state a source of truth for canonical entity data (CON-005 AC2). */
export interface WidgetSourceOfTruthFinding {
	kind: WidgetSourceOfTruthReason;
	/** The offending key in the widget-local-state payload. */
	key: string;
	message: string;
}

/**
 * The field keys that, if present in a widget's PERSISTED LOCAL STATE, signal an attempt to hold CANONICAL
 * entity data there instead of in the owning entity/session/map state document — the precise drift CON-005
 * AC2 forbids. Widget-local state is for transient/declared presentation state, never the canonical home of
 * an entity's HP, name, body, grants, etc. The list is broad (the common ways canonical data leaks into a
 * widget) and closed. Matching is case-insensitive and ignores `-`/`_`/space.
 */
export const CANONICAL_FIELD_SIGNAL_KEYS: readonly string[] = Object.freeze([
	'hp',
	'currenthp',
	'maxhp',
	'characterdata',
	'characterfields',
	'notebody',
	'notecontent',
	'entitydata',
	'canonicalvalue',
	'canonicaldata',
	'authoritativevalue',
	'grants',
	'permissiongrants',
	'visibilitymetadata',
	'combatstate',
	'initiativeorder',
	'fogoperations',
	'mappois',
]);

const CANONICAL_FIELD_SIGNAL_SET: ReadonlySet<string> = new Set(CANONICAL_FIELD_SIGNAL_KEYS);

/**
 * The keys that declare a widget-local-state payload as AUTHORITATIVE/CANONICAL — a structural claim that it
 * is the source of truth, which CON-005 forbids regardless of contents.
 */
const AUTHORITATIVE_FLAG_KEYS: ReadonlySet<string> = new Set([
	'authoritative',
	'iscanonical',
	'sourceoftruth',
	'isauthoritative',
]);

/** Normalize a payload key for canonical-field comparison: lower-cased with `-`/`_`/space removed. */
function normalizeKey(key: string): string {
	return key.toLowerCase().replace(/[-_\s]/g, '');
}

/**
 * CON-005 AC2 — detect a widget-local-state payload that claims to be the source of truth for canonical
 * entity data, fail closed. Returns the first finding (a structured reason) or `null` when the widget-local
 * state holds only transient/declared presentation state, as the model requires. A `null` is the green
 * signal a widget-state inspection turns into "canonical data is elsewhere (in the owning entity/session/map
 * document)"; a finding is turned into a rejection.
 *
 * Two drift shapes are caught:
 *   1. A CANONICAL FIELD KEY ({@link CANONICAL_FIELD_SIGNAL_KEYS}) — e.g. `hp`, `characterData`, `grants` —
 *      persisted in widget-local state. Canonical entity data must live in the owning state document.
 *   2. An AUTHORITATIVE/CANONICAL FLAG — the widget-local state declaring itself the source of truth.
 *
 * Pure: a function of the widget-local-state payload alone. A non-object payload returns `null` (there is no
 * canonical claim to make).
 */
export function findWidgetLocalSourceOfTruthViolation(
	widgetLocalState: unknown,
): WidgetSourceOfTruthFinding | null {
	if (widgetLocalState === null || typeof widgetLocalState !== 'object') return null;
	const record = widgetLocalState as Record<string, unknown>;

	for (const key of Object.keys(record)) {
		const normalized = normalizeKey(key);
		if (AUTHORITATIVE_FLAG_KEYS.has(normalized) && record[key] === true) {
			return {
				kind: 'authoritative-flag',
				key,
				message: `Widget-local state declares "${key}" — it claims to be a source of truth. A widget must not hide authoritative entity state in private storage; canonical data lives in the owning entity/session/map state document (CON-005 AC2).`,
			};
		}
		if (CANONICAL_FIELD_SIGNAL_SET.has(normalized)) {
			return {
				kind: 'canonical-field-in-local-state',
				key,
				message: `Widget-local state persists canonical field "${key}". Canonical entity data must reside in the owning entity/session/map state document, not in widget-local state (CON-005 AC2).`,
			};
		}
	}

	return null;
}

/** True when a widget-local-state payload tries to be a source of truth for canonical data (CON-005 AC2). */
export function isWidgetLocalSourceOfTruth(widgetLocalState: unknown): boolean {
	return findWidgetLocalSourceOfTruthViolation(widgetLocalState) !== null;
}

/** A problem the source-of-truth ownership audit found (CON-005). */
export interface SourceOfTruthProblem {
	kind:
		| 'non-authoritative-owner' // a content class owned by a derived/remote/cache/widget store
		| 'unknown-owner' // a content class whose owner is neither authoritative nor a known store class
		| 'duplicate-content-class'; // a content class declared more than once
	contentClass: string;
	owner: string;
	message: string;
}

/**
 * CON-005 — audit the core-content ownership registry against the invariant, fail closed. EVERY core vault
 * content class MUST name a durable LOCAL state document ({@link AuthoritativeOwner}) as its canonical owner
 * — never a cloud/external/snapshot/cache/widget store. A content class owned by a non-authoritative store,
 * or by an unknown owner, is exactly the "the sole source of truth is a derived/remote store" anti-pattern
 * CON-005 forbids, and is flagged.
 *
 * Returns every problem so a caller reports all at once. Pure: a function of the passed registry (defaulting
 * to the real one). The CON-005 meta-test drives this against the real registry (expecting zero problems)
 * and against a deliberately cloud-owned fixture (expecting a problem), proving the gate goes GREEN on the
 * real codebase and RED on a source-of-truth violation.
 */
export function auditSourceOfTruthOwnership(
	ownership: readonly CoreContentOwnership[] = CORE_CONTENT_OWNERSHIP,
): SourceOfTruthProblem[] {
	const problems: SourceOfTruthProblem[] = [];
	const seen = new Set<string>();

	for (const entry of ownership) {
		if (seen.has(entry.contentClass)) {
			problems.push({
				kind: 'duplicate-content-class',
				contentClass: entry.contentClass,
				owner: entry.canonicalOwner,
				message: `Core content class "${entry.contentClass}" is declared more than once.`,
			});
		}
		seen.add(entry.contentClass);

		if (AUTHORITATIVE_OWNER_SET.has(entry.canonicalOwner)) continue;

		if (NON_AUTHORITATIVE_STORE_SET.has(entry.canonicalOwner)) {
			problems.push({
				kind: 'non-authoritative-owner',
				contentClass: entry.contentClass,
				owner: entry.canonicalOwner,
				message: `Core content class "${entry.contentClass}" names "${entry.canonicalOwner}" as its sole source of truth. Cloud storage, external sources, generated snapshots, player-device caches, and widget-local state must never be the sole source of truth for core vault content (CON-005).`,
			});
		} else {
			problems.push({
				kind: 'unknown-owner',
				contentClass: entry.contentClass,
				owner: entry.canonicalOwner,
				message: `Core content class "${entry.contentClass}" names unknown canonical owner "${entry.canonicalOwner}". The canonical owner must be a durable local state document (CON-005).`,
			});
		}
	}

	return problems;
}

/** A summary of the CON-005 constraint, for the audit/diagnostics surface. */
export interface SourceOfTruthSummary {
	/** The constraint-registry version the invariant is pinned to. */
	version: number;
	/** The number of core content classes governed. */
	coreContentClassCount: number;
	/** The number of non-authoritative store classes that may never be the sole source of truth. */
	nonAuthoritativeStoreCount: number;
	/** True when the vault is usable without cloud AND every content class has a durable-local owner. */
	localIsAuthoritative: boolean;
}

/**
 * Summarize the CON-005 constraint: the version, how many core content classes and non-authoritative store
 * classes are governed, and whether local-first ownership holds (vault usable without cloud + every content
 * class durable-local-owned). Pure; used by the CON-005 meta-test and any governance diagnostic to report
 * that no derived/remote store is the sole source of truth.
 */
export function summarizeSourceOfTruth(): SourceOfTruthSummary {
	return {
		version: SOURCE_OF_TRUTH_VERSION,
		coreContentClassCount: CORE_CONTENT_OWNERSHIP.length,
		nonAuthoritativeStoreCount: NON_AUTHORITATIVE_STORE_CLASSES.length,
		localIsAuthoritative:
			vaultUsableWithoutCloud() && auditSourceOfTruthOwnership().length === 0,
	};
}
