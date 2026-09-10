import type { CoreStateSlice } from '../commands/types';
import type { ActorId } from './ids';
import { parseMarkdownNote } from './markdown';

/**
 * PLAT-013: fresh-vault onboarding, feature-tier visibility, maturity gates, help surfaces, and
 * first-run Command Center setup — modeled in the Processing Core so the GUI renders from query
 * results and acceptance tests assert against pure, fixture-driven logic (Contract 1).
 *
 * The maturity/feature-tier model is the missing piece the v2 defect register calls out
 * (`AUDIT-21.4-FEATURE-TIER-E2E`): progressive disclosure previously required manual fresh-vault
 * verification. Here the tiers are declared data and `visibleFeatures(tier)` is pure, so a
 * fixture test proves each tier shows/hides the correct capabilities without manual checks.
 *
 * Pure module: no DOM, no Node, no Svelte.
 */

/** The progressive-disclosure maturity tiers, simplest first. */
export type FeatureTier = 'core' | 'intermediate' | 'advanced';

export const FEATURE_TIERS: readonly FeatureTier[] = ['core', 'intermediate', 'advanced'];

const TIER_RANK: Readonly<Record<FeatureTier, number>> = {
	core: 0,
	intermediate: 1,
	advanced: 2,
};

/** A capability gated by a maturity tier. Shown only when the active tier reaches `minTier`. */
export interface FeatureGate {
	readonly id: string;
	readonly label: string;
	/** The lowest tier at which this capability is visible. */
	readonly minTier: FeatureTier;
	/** The route or surface the capability lives on (for help-surface deep links). */
	readonly surface: string;
}

/**
 * The declared feature-gate registry. `core` is the fresh-vault default surface (Command Center,
 * Scenes, navigation); `intermediate` and `advanced` progressively reveal authoring/admin tools.
 * This is the structured source the visibility query and the onboarding tests read.
 */
export const FEATURE_GATES: readonly FeatureGate[] = [
	{ id: 'command-center', label: 'Command Center', minTier: 'core', surface: '/' },
	{ id: 'scenes', label: 'Scenes', minTier: 'core', surface: '/scenes/' },
	{ id: 'maps', label: 'Maps', minTier: 'core', surface: '/maps/' },
	{ id: 'navigation', label: 'Navigation', minTier: 'core', surface: '/' },
	{ id: 'widget-library', label: 'Widget library', minTier: 'intermediate', surface: '/' },
	{ id: 'presets', label: 'Command Center presets', minTier: 'intermediate', surface: '/' },
	{ id: 'player-views', label: 'Player views', minTier: 'intermediate', surface: '/' },
	{ id: 'diagnostics', label: 'System diagnostics', minTier: 'advanced', surface: '/settings/' },
	{
		id: 'support-status',
		label: 'Platform support status',
		minTier: 'advanced',
		surface: '/settings/',
	},
	{ id: 'permissions', label: 'Permission grants', minTier: 'advanced', surface: '/settings/' },
];

/** True when `tier` is at or above `gate.minTier` (maturity gate, PLAT-013 AC2). */
export function tierMeets(tier: FeatureTier, minTier: FeatureTier): boolean {
	return TIER_RANK[tier] >= TIER_RANK[minTier];
}

/** The features visible at a maturity tier. Pure: each tier shows exactly its gated set (AC2). */
export function visibleFeatures(
	tier: FeatureTier,
	gates: readonly FeatureGate[] = FEATURE_GATES,
): FeatureGate[] {
	return gates.filter((gate) => tierMeets(tier, gate.minTier));
}

/** Whether a single feature is visible at a tier (the gate test the GUI calls per control). */
export function isFeatureVisible(
	featureId: string,
	tier: FeatureTier,
	gates: readonly FeatureGate[] = FEATURE_GATES,
): boolean {
	const gate = gates.find((entry) => entry.id === featureId);
	if (!gate) return false; // fail closed: an unknown feature is hidden, not shown.
	return tierMeets(tier, gate.minTier);
}

/** The default maturity tier a fresh vault starts at (PLAT-013 AC1). */
export const DEFAULT_FEATURE_TIER: FeatureTier = 'core';

/** A help surface shown during onboarding and reachable from the help affordance. */
export interface HelpSurface {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	/** The route the help item points at. */
	readonly surface: string;
}

export const HELP_SURFACES: readonly HelpSurface[] = [
	{
		id: 'welcome',
		title: 'Welcome to your vault',
		body: 'Your Command Center is the home surface for running a session. Start here.',
		surface: '/',
	},
	{
		id: 'scenes',
		title: 'Build a Scene',
		body: 'Scenes are spatial workspaces of widgets. Create one from the Scenes section.',
		surface: '/scenes/',
	},
	{
		id: 'feature-tiers',
		title: 'Reveal more as you go',
		body: 'Switch your feature tier to reveal authoring and admin tools as you grow comfortable.',
		surface: '/settings/',
	},
];

/**
 * Whether a vault is FRESH — no Command Center home, no Scenes, no presets. A fresh vault drives
 * first-run onboarding (PLAT-013 AC1). Derived purely from durable state so a fixture vault is
 * either fresh or not, with no GUI involvement.
 */
export function isFreshVault(state: CoreStateSlice): boolean {
	const noHome = state.commandCenter.homeSceneId === null;
	const noScenes = Object.keys(state.scenes.scenes).length === 0;
	const noPresets = Object.keys(state.commandCenter.presets).length === 0;
	return noHome && noScenes && noPresets;
}

/** A first-run setup step and whether the current state already satisfies it. */
export interface FirstRunStep {
	readonly id: string;
	readonly label: string;
	readonly done: boolean;
}

export type OnboardingStatus = 'first-run' | 'in-progress' | 'complete';

export interface OnboardingView {
	readonly status: OnboardingStatus;
	readonly tier: FeatureTier;
	readonly isFresh: boolean;
	readonly steps: readonly FirstRunStep[];
	readonly visibleFeatures: readonly FeatureGate[];
	readonly helpSurfaces: readonly HelpSurface[];
	/** True only when the active actor is the DM (onboarding/setup is DM-only — PLAT-013 compat). */
	readonly canSetup: boolean;
	/** RC-UX-3.5 — usage-driven disclosure, independent of the manually-chosen tier above. */
	readonly maturitySignals: readonly MaturitySignalStatus[];
}

/* ---- RC-UX-3.5 — maturity-signal disclosure -----------------------------------------------------
 * A second, usage-driven disclosure track alongside the manually-chosen `FeatureTier` above: a
 * capability can also reveal itself once the DM has demonstrably grown into it (three linked notes
 * imply the relationship graph is worth surfacing), with no tier switch required. Thresholds are
 * declared DATA (`MATURITY_SIGNALS`) so the table is one place to read and one place a test can
 * assert against, never a magic number buried in a screen.
 */

/** The vault-usage metrics a maturity signal can key off. Every metric is a DM-authored total over
 * the DM's own vault (not actor-filtered — this drives the DM's own nav/settings disclosure, never
 * a player-facing read). */
export type MaturitySignalMetric = 'notes' | 'links' | 'tags' | 'sessions' | 'maps' | 'objects';

/** A capability gated by vault usage rather than the manually-chosen tier. */
export interface MaturitySignal {
	readonly id: string;
	readonly label: string;
	readonly metric: MaturitySignalMetric;
	readonly threshold: number;
	/** The route this signal reveals (nav badge target / help deep link). */
	readonly surface: string;
}

/** The declared maturity-signal registry. Extend this table, not the resolver, to add a signal. */
export const MATURITY_SIGNALS: readonly MaturitySignal[] = [
	{ id: 'graph', label: 'Relationship graph', metric: 'links', threshold: 3, surface: '/graph' },
];

/** A signal's live usage count against its declared threshold. */
export interface MaturitySignalStatus {
	readonly signal: MaturitySignal;
	readonly count: number;
	readonly reached: boolean;
}

/** Count one usage metric directly over durable state. Pure, deterministic, no query-layer
 * dependency (onboarding stays Core-only): counts skip soft-deleted content items (CONTENT-001). */
function countMaturityMetric(state: CoreStateSlice, metric: MaturitySignalMetric): number {
	const liveItems = Object.values(state.content.items).filter((item) => item.deletedAt === null);
	switch (metric) {
		case 'notes':
			return liveItems.filter((item) => item.kind === 'note').length;
		case 'objects':
			return liveItems.filter((item) => item.kind !== 'note').length;
		case 'links':
			return liveItems.reduce(
				(total, item) => total + parseMarkdownNote(item.body).wikilinks.length,
				0,
			);
		case 'tags': {
			const seen = new Set<string>();
			for (const item of liveItems) {
				for (const tag of parseMarkdownNote(item.body).tags) seen.add(tag);
			}
			return seen.size;
		}
		case 'sessions':
			return Object.keys(state.session.archives).length;
		case 'maps':
			return Object.keys(state.maps.maps).length;
	}
}

/** Resolve every declared maturity signal's live count against `state` (PLAT-013/RC-UX-3.5). */
export function resolveMaturitySignals(
	state: CoreStateSlice,
	signals: readonly MaturitySignal[] = MATURITY_SIGNALS,
): MaturitySignalStatus[] {
	return signals.map((signal) => {
		const count = countMaturityMetric(state, signal.metric);
		return { signal, count, reached: count >= signal.threshold };
	});
}

/** Whether the surface a specific maturity signal reveals has been earned (nav/route gate). Fails
 * closed: an unknown signal id is never reported as reached. */
export function isMaturitySignalReached(
	signalId: string,
	state: CoreStateSlice,
	signals: readonly MaturitySignal[] = MATURITY_SIGNALS,
): boolean {
	const signal = signals.find((entry) => entry.id === signalId);
	if (!signal) return false;
	return countMaturityMetric(state, signal.metric) >= signal.threshold;
}

/* ---- RC-UX-3.2 — feature spotlights -------------------------------------------------------------
 * A spotlight is a one-time, non-blocking pointer at a capability the DM may not have found yet.
 * Which spotlights exist and when each becomes due is declared DATA here; the app decides WHEN one
 * appears (an idle moment) and records which have been shown in its device-preferences slice. The
 * seen record is keyed by vault, so each spotlight shows once per vault, and marking is idempotent
 * so a shown spotlight never comes back.
 */

/** What makes a spotlight due. `always` is due from the first idle moment; `maturity-signal` waits
 * until the DM's own usage earns the surface it points at (the RC-UX-3.5 thresholds above). */
export type SpotlightTrigger =
	| { readonly kind: 'always' }
	| { readonly kind: 'maturity-signal'; readonly signalId: string };

/** A declared feature spotlight. Copy lives in the app's message catalog, keyed by `id`. */
export interface SpotlightDefinition {
	readonly id: string;
	readonly trigger: SpotlightTrigger;
	/** The route the spotlight's action opens, or null when it only points at a shortcut. */
	readonly surface: string | null;
	/** True when the spotlight teaches a keyboard shortcut, so a touch-only device never sees it. */
	readonly needsKeyboard: boolean;
}

/** The declared spotlight queue, in the order due spotlights are shown. A surface the DM has just
 * earned comes first; the evergreen keyboard tips wait behind it. Extend this table to add one. */
export const FEATURE_SPOTLIGHTS: readonly SpotlightDefinition[] = [
	{
		id: 'graph',
		trigger: { kind: 'maturity-signal', signalId: 'graph' },
		surface: '/graph',
		needsKeyboard: false,
	},
	{ id: 'command-palette', trigger: { kind: 'always' }, surface: null, needsKeyboard: true },
	{ id: 'shortcuts', trigger: { kind: 'always' }, surface: null, needsKeyboard: true },
];

/** Spotlight ids already shown, per vault id. Device-local, never vault or sync state. */
export type SeenSpotlights = Readonly<Record<string, readonly string[]>>;

/** Reject malformed identifiers without discarding valid vault history. */
const MAX_ID_LENGTH = 128;

function isSpotlightId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/**
 * Parse the stored seen record. Anything unreadable parses as "nothing seen": the cost of a corrupt
 * preference is one more showing of each spotlight, which beats throwing into the app shell.
 */
export function parseSeenSpotlights(raw: string | null): SeenSpotlights {
	if (!raw) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
	const entries: [string, string[]][] = [];
	for (const [vaultId, ids] of Object.entries(parsed)) {
		if (!isSpotlightId(vaultId) || !Array.isArray(ids)) continue;
		entries.push([vaultId, [...new Set(ids.filter(isSpotlightId))]]);
	}
	// `fromEntries` defines own properties, so a stored `__proto__` key stays an inert string key.
	return Object.fromEntries(entries);
}

export function serializeSeenSpotlights(seen: SeenSpotlights): string {
	return JSON.stringify(seen);
}

/** The spotlight ids already shown in one vault. Own keys only, so `constructor` is just a name. */
export function spotlightsSeenIn(seen: SeenSpotlights, vaultId: string): readonly string[] {
	return Object.prototype.hasOwnProperty.call(seen, vaultId) ? (seen[vaultId] ?? []) : [];
}

/** Record a spotlight as shown in a vault. Pure and idempotent: marking twice changes nothing. */
export function markSpotlightSeen(
	seen: SeenSpotlights,
	vaultId: string,
	spotlightId: string,
): SeenSpotlights {
	const current = spotlightsSeenIn(seen, vaultId);
	if (current.includes(spotlightId)) return seen;
	return Object.fromEntries([...Object.entries(seen), [vaultId, [...current, spotlightId]]]);
}

/**
 * The vault a state belongs to, as stamped on its durable operations (`CoreEnvironment.vaultId`).
 * A vault with no operations yet reports `fallback`, which the host passes as its environment's id
 * so the key does not change once the first operation lands.
 */
export function spotlightVaultId(state: CoreStateSlice, fallback: string): string {
	return state.sync.operations[0]?.vaultId ?? fallback;
}

function spotlightDue(trigger: SpotlightTrigger, state: CoreStateSlice): boolean {
	switch (trigger.kind) {
		case 'always':
			return true;
		case 'maturity-signal':
			return isMaturitySignalReached(trigger.signalId, state);
	}
}

/**
 * The spotlights due for an actor in a vault, in declaration order: the head of this list is the
 * one the host shows at its next idle moment. DM-only, like first-run setup, so a player (or the
 * DM previewing as one) is never interrupted. Already-seen spotlights never reappear.
 */
export function pendingSpotlights(
	state: CoreStateSlice,
	actorId: ActorId,
	vaultId: string,
	seen: SeenSpotlights,
	options: { readonly keyboard: boolean },
	spotlights: readonly SpotlightDefinition[] = FEATURE_SPOTLIGHTS,
): SpotlightDefinition[] {
	if (state.permissions.actors[actorId]?.role !== 'dm') return [];
	const shown = new Set(spotlightsSeenIn(seen, vaultId));
	return spotlights.filter(
		(spotlight) =>
			!shown.has(spotlight.id) &&
			(options.keyboard || !spotlight.needsKeyboard) &&
			spotlightDue(spotlight.trigger, state),
	);
}

/**
 * Assemble the onboarding view for an actor. First-run when the vault is fresh; complete once the
 * Command Center exists and the welcome steps are satisfied. The default tier is `core` so a
 * fresh vault shows exactly the core capabilities (AC1). DM-only: onboarding setup is gated to the
 * DM role; a player/observer view reports `canSetup: false` and never triggers setup commands.
 */
export function resolveOnboarding(
	state: CoreStateSlice,
	actorId: ActorId,
	tier: FeatureTier = DEFAULT_FEATURE_TIER,
): OnboardingView {
	const isFresh = isFreshVault(state);
	const homeSceneId = state.commandCenter.homeSceneId;
	const hasHome = homeSceneId !== null;
	// "Create your first Scene" means a Scene OTHER than the Command Center home Scene: the home
	// surface is set up by the Command Center step, so authoring a real workspace Scene is the
	// distinct next milestone.
	const hasScene = Object.keys(state.scenes.scenes).some((id) => id !== homeSceneId);
	const role = state.permissions.actors[actorId]?.role ?? null;
	const canSetup = role === 'dm';

	const steps: FirstRunStep[] = [
		{ id: 'command-center', label: 'Set up your Command Center', done: hasHome },
		{ id: 'first-scene', label: 'Create your first Scene', done: hasScene },
	];

	const status: OnboardingStatus = isFresh
		? 'first-run'
		: steps.every((step) => step.done)
			? 'complete'
			: 'in-progress';

	return {
		status,
		tier,
		isFresh,
		steps,
		visibleFeatures: visibleFeatures(tier),
		helpSurfaces: HELP_SURFACES,
		canSetup,
		maturitySignals: resolveMaturitySignals(state),
	};
}
