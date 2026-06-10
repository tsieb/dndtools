import type { CoreStateSlice } from '../commands/types';
import type { ActorId } from './ids';

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
	};
}
