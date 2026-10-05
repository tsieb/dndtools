import type { CoreStateSlice } from '../commands/types';
import type { ActorId } from './ids';
import { parseMarkdownNote } from './markdown';
import { screenMetaOf } from './scene-state';

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

/** Section-level inventory; anchors are stable logical section IDs, not promised DOM fragments.
 * Label keys belong to the renderer catalog; the Core does not import translations.
 * Complexity is discoverability advice, never authorization or a crypto safety gate. */
export interface SectionFeatureGate extends FeatureGate {
	readonly labelKey: string;
	/** RC-UX-6.4: the experience cards' name for the gate, when `labelKey` alone is ambiguous there. */
	readonly summaryKey?: string;
	readonly sectionAnchor: string;
	readonly assumes: string;
	readonly misuse: string;
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

/** RC-UX-5.1: exhaustive section inventory, separate from the compact onboarding summary. */
export const SECTION_FEATURE_GATES: readonly SectionFeatureGate[] = (
	[
		{
			id: 'settings.nav.appearance',
			labelKey: 'settings.nav.appearance',
			minTier: 'core',
			surface: '/settings?tab=appearance',
			sectionAnchor: 'appearance',
			assumes: 'Personal reading and motion preferences.',
			misuse: 'Poor contrast, density or motion choices can make the interface harder to use.',
		},
		{
			id: 'settings.nav.language',
			labelKey: 'settings.nav.language',
			minTier: 'core',
			surface: '/settings?tab=language',
			sectionAnchor: 'language',
			assumes: 'Which language they can read.',
			misuse: 'An unfamiliar locale can make controls difficult to find.',
		},
		{
			id: 'settings.nav.accessibility',
			labelKey: 'settings.nav.accessibility',
			minTier: 'core',
			surface: '/settings?tab=accessibility',
			sectionAnchor: 'accessibility',
			assumes: 'Their own access needs and preferred shortcuts.',
			misuse: 'Unsuitable motion, contrast or key bindings can obstruct interaction.',
		},
		{
			id: 'settings.nav.account',
			labelKey: 'settings.nav.account',
			minTier: 'core',
			surface: '/settings?tab=account',
			sectionAnchor: 'account',
			assumes: 'Their sign-in identity and profile.',
			misuse: 'Changing the wrong profile or device can interrupt access.',
		},
		{
			id: 'settings.nav.subscription',
			labelKey: 'settings.nav.subscription',
			minTier: 'intermediate',
			surface: '/settings?tab=subscription',
			sectionAnchor: 'subscription',
			assumes: 'Plan limits and the distinction between previews and billing.',
			misuse:
				'Confusing a preview with an active plan can lead to incorrect capacity expectations.',
		},
		{
			id: 'settings.nav.players',
			labelKey: 'settings.nav.players',
			minTier: 'intermediate',
			surface: '/settings?tab=players',
			sectionAnchor: 'players',
			assumes: 'Who belongs at the table and which role each person needs.',
			misuse: 'An incorrect role or invite can expose campaign information.',
		},
		{
			id: 'settings.nav.permissions',
			labelKey: 'settings.nav.permissions',
			minTier: 'advanced',
			surface: '/settings?tab=permissions',
			sectionAnchor: 'permissions',
			assumes: 'Actors, resources, grant scopes and revocation.',
			misuse: 'An overly broad grant can reveal secrets or allow unwanted changes.',
		},
		{
			id: 'settings.nav.vault',
			labelKey: 'settings.nav.vault',
			minTier: 'intermediate',
			surface: '/settings?tab=vault',
			sectionAnchor: 'vault',
			assumes: 'Local vaults, external sources and import ownership.',
			misuse: 'Disconnecting the wrong source stops expected updates.',
		},
		{
			id: 'settings.nav.sync',
			labelKey: 'settings.nav.sync',
			minTier: 'intermediate',
			surface: '/settings?tab=sync',
			sectionAnchor: 'sync',
			assumes: 'Device state, cloud copies and pending operations.',
			misuse: 'Syncing or restoring the wrong copy can replace newer work.',
		},
		{
			id: 'settings.nav.tools',
			labelKey: 'settings.nav.tools',
			minTier: 'core',
			surface: '/settings?tab=tools',
			sectionAnchor: 'tools',
			assumes: 'Whether they want assistant features on this device.',
			misuse: 'Disabling assistance hides tools they may expect to find.',
		},
		{
			id: 'settings.nav.ai',
			labelKey: 'settings.nav.ai',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'ai',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.nav.plugins',
			labelKey: 'settings.nav.plugins',
			minTier: 'intermediate',
			surface: '/settings?tab=plugins',
			sectionAnchor: 'plugins',
			assumes: 'Installed packages and their enabled state.',
			misuse: 'Disabling a dependency can break a scene widget.',
		},
		{
			id: 'settings.nav.systems',
			labelKey: 'settings.nav.systems',
			minTier: 'intermediate',
			surface: '/settings?tab=systems',
			sectionAnchor: 'systems',
			assumes: 'The campaign rules system and existing character data.',
			misuse: 'A system switch can drop incompatible fields.',
		},
		{
			id: 'settings.nav.about',
			labelKey: 'settings.nav.about',
			minTier: 'core',
			surface: '/settings?tab=about',
			sectionAnchor: 'about',
			assumes: 'App version and where to find support information.',
			misuse: 'Misreading status can lead to an incorrect support report.',
		},
		{
			id: 'settings.about.legal',
			labelKey: 'settings.about.legal',
			minTier: 'core',
			surface: '/settings?tab=about',
			sectionAnchor: 'settings-about-legal',
			assumes: 'App version and where to find support information.',
			misuse: 'Misreading status can lead to an incorrect support report.',
		},
		{
			id: 'settings.about.title',
			labelKey: 'settings.about.title',
			minTier: 'core',
			surface: '/settings?tab=about',
			sectionAnchor: 'settings-about-title',
			assumes: 'App version and where to find support information.',
			misuse: 'Misreading status can lead to an incorrect support report.',
		},
		{
			id: 'settings.about.storage',
			labelKey: 'settings.about.storage',
			minTier: 'advanced',
			surface: '/settings?tab=about',
			sectionAnchor: 'settings-about-storage',
			assumes: 'Durable storage, quota and persistence status.',
			misuse: 'Misreading storage health can leave data without a durable copy.',
		},
		{
			id: 'settings.about.errors',
			labelKey: 'settings.about.errors',
			minTier: 'advanced',
			surface: '/settings?tab=about',
			sectionAnchor: 'settings-about-errors',
			assumes: 'Error records and the difference between symptoms and causes.',
			misuse: 'Sharing unreviewed diagnostics can expose campaign context.',
		},
		{
			id: 'settings.about.perf',
			labelKey: 'settings.about.perf',
			minTier: 'advanced',
			surface: '/settings?tab=about',
			sectionAnchor: 'settings-about-perf',
			assumes: 'Performance samples and device-specific measurements.',
			misuse: 'A sample mistaken for a universal result can lead to a false diagnosis.',
		},
		{
			id: 'settings.about.export',
			labelKey: 'settings.about.export',
			summaryKey: 'settings.about.exportSummary',
			minTier: 'advanced',
			surface: '/settings?tab=about',
			sectionAnchor: 'settings-about-export',
			assumes: 'Support bundle contents and redaction boundaries.',
			misuse: 'Sharing a bundle without review may disclose local diagnostic context.',
		},
		{
			id: 'settings.a11y.displayMotion',
			labelKey: 'settings.a11y.displayMotion',
			minTier: 'core',
			surface: '/settings?tab=accessibility',
			sectionAnchor: 'settings-a11y-displayMotion',
			assumes: 'Their own access needs and preferred shortcuts.',
			misuse: 'Unsuitable motion, contrast or key bindings can obstruct interaction.',
		},
		{
			id: 'settings.a11y.reduceMotion',
			labelKey: 'settings.a11y.reduceMotion',
			minTier: 'core',
			surface: '/settings?tab=accessibility',
			sectionAnchor: 'settings-a11y-reduceMotion',
			assumes: 'Their own access needs and preferred shortcuts.',
			misuse: 'Unsuitable motion, contrast or key bindings can obstruct interaction.',
		},
		{
			id: 'settings.a11y.highContrast',
			labelKey: 'settings.a11y.highContrast',
			minTier: 'core',
			surface: '/settings?tab=accessibility',
			sectionAnchor: 'settings-a11y-highContrast',
			assumes: 'Their own access needs and preferred shortcuts.',
			misuse: 'Unsuitable motion, contrast or key bindings can obstruct interaction.',
		},
		{
			id: 'settings.a11y.shortcuts',
			labelKey: 'settings.a11y.shortcuts',
			minTier: 'core',
			surface: '/settings?tab=accessibility',
			sectionAnchor: 'settings-a11y-shortcuts',
			assumes: 'Their own access needs and preferred shortcuts.',
			misuse: 'Unsuitable motion, contrast or key bindings can obstruct interaction.',
		},
		{
			id: 'settings.a11y.safetyChecks',
			labelKey: 'settings.a11y.safetyChecks',
			minTier: 'core',
			surface: '/settings?tab=accessibility',
			sectionAnchor: 'settings-a11y-safetyChecks',
			assumes: 'Their own access needs and preferred shortcuts.',
			misuse: 'Unsuitable motion, contrast or key bindings can obstruct interaction.',
		},
		{
			id: 'settings.account.profile',
			labelKey: 'settings.account.profile',
			minTier: 'core',
			surface: '/settings?tab=account',
			sectionAnchor: 'settings-account-profile',
			assumes: 'Their sign-in identity and profile.',
			misuse: 'Changing the wrong profile or device can interrupt access.',
		},
		{
			id: 'settings.account.dangerZone',
			labelKey: 'settings.account.dangerZone',
			minTier: 'advanced',
			surface: '/settings?tab=account',
			sectionAnchor: 'settings-account-dangerZone',
			assumes: 'Account deletion, export and recovery boundaries.',
			misuse: 'Deletion removes account data and can end access from every device.',
		},
		{
			id: 'settings.account.cloudAccount',
			labelKey: 'settings.account.cloudAccount',
			minTier: 'core',
			surface: '/settings?tab=account',
			sectionAnchor: 'settings-account-cloudAccount',
			assumes: 'Their sign-in identity and profile.',
			misuse: 'Changing the wrong profile or device can interrupt access.',
		},
		{
			id: 'settings.account.onboardingTitle',
			labelKey: 'settings.account.onboardingTitle',
			minTier: 'core',
			surface: '/settings?tab=account',
			sectionAnchor: 'settings-account-onboardingTitle',
			assumes: 'Their sign-in identity and profile.',
			misuse: 'Changing the wrong profile or device can interrupt access.',
		},
		{
			id: 'settings.devices.title',
			labelKey: 'settings.devices.title',
			minTier: 'core',
			surface: '/settings?tab=account',
			sectionAnchor: 'settings-devices-title',
			assumes: 'Their sign-in identity and profile.',
			misuse: 'Changing the wrong profile or device can interrupt access.',
		},
		{
			id: 'settings.push.title',
			labelKey: 'settings.push.title',
			minTier: 'core',
			surface: '/settings?tab=account',
			sectionAnchor: 'settings-push-title',
			assumes: 'That reminder consent applies to this device only.',
			misuse: 'Reminders on a shared device can show upcoming session details to others.',
		},
		{
			id: 'settings.push.previews',
			labelKey: 'settings.push.previews',
			minTier: 'core',
			surface: '/settings?tab=account',
			sectionAnchor: 'settings-push-previews',
			assumes: 'That reminder consent applies to this device only.',
			misuse: 'Reminders on a shared device can show upcoming session details to others.',
		},
		{
			id: 'settings.ai.title',
			labelKey: 'settings.ai.title',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-ai-title',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.ai.defaultPosture',
			labelKey: 'settings.ai.defaultPosture',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-ai-defaultPosture',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.ai.connections',
			labelKey: 'settings.ai.connections',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-ai-connections',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.ai.registryTitle',
			labelKey: 'settings.ai.registryTitle',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-ai-registryTitle',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.assistant.title',
			labelKey: 'settings.assistant.title',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-assistant-title',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.ai.auditTitle',
			labelKey: 'settings.ai.auditTitle',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-ai-auditTitle',
			assumes: 'Tool execution records and the distinction between intent and applied changes.',
			misuse:
				'Misreading audit entries can conceal an unwanted change or lead to a false diagnosis.',
		},
		{
			id: 'settings.ai.stagedTitle',
			labelKey: 'settings.ai.stagedTitle',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-ai-stagedTitle',
			assumes: 'Proposed changes, affected records and approval scope.',
			misuse: 'Approving without reviewing can apply unintended campaign edits.',
		},
		{
			id: 'settings.localModels.title',
			labelKey: 'settings.localModels.title',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-localModels-title',
			assumes: 'Local model installation, hardware capacity and runner connectivity.',
			misuse: 'An unreachable or oversized model can stall assistance or exhaust device memory.',
		},
		{
			id: 'settings.provider.title',
			labelKey: 'settings.provider.title',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-provider-title',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.provider.providerRow',
			labelKey: 'settings.provider.providerRow',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-provider-providerRow',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.provider.modelRow',
			labelKey: 'settings.provider.modelRow',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-provider-modelRow',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.provider.baseUrlRow',
			labelKey: 'settings.provider.baseUrlRow',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-provider-baseUrlRow',
			assumes: 'Trusted API endpoints and compatible request formats.',
			misuse: 'An untrusted endpoint can receive credentials and campaign context.',
		},
		{
			id: 'settings.provider.destinationRow',
			labelKey: 'settings.provider.destinationRow',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-provider-destinationRow',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.provider.keyRow',
			labelKey: 'settings.provider.keyRow',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-provider-keyRow',
			assumes: 'API credential custody and the destination receiving requests.',
			misuse: 'A leaked or misdirected key can allow unauthorized provider usage.',
		},
		{
			id: 'settings.router.title',
			labelKey: 'settings.router.title',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-router-title',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.router.modelRow',
			labelKey: 'settings.router.modelRow',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-router-modelRow',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.router.assistantRow',
			labelKey: 'settings.router.assistantRow',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-router-assistantRow',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.router.embeddingsRow',
			labelKey: 'settings.router.embeddingsRow',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-router-embeddingsRow',
			assumes: 'Provider destinations, model limitations, tool scopes and review policies.',
			misuse: 'Secrets may leave the device or an agent may make unintended campaign changes.',
		},
		{
			id: 'settings.analytics.title',
			labelKey: 'settings.analytics.title',
			minTier: 'intermediate',
			surface: '/settings?tab=about',
			sectionAnchor: 'settings-analytics-title',
			assumes: 'Optional event collection and its data boundaries.',
			misuse: 'Opting in without reviewing events can share usage they meant to keep local.',
		},
		{
			id: 'settings.analytics.row',
			labelKey: 'settings.analytics.row',
			minTier: 'core',
			surface: '/settings?tab=about',
			sectionAnchor: 'settings-analytics-row',
			assumes: 'App version and where to find support information.',
			misuse: 'Misreading status can lead to an incorrect support report.',
		},
		{
			id: 'settings.updates.title',
			labelKey: 'settings.updates.title',
			minTier: 'intermediate',
			surface: '/settings?tab=about',
			sectionAnchor: 'settings-updates-title',
			assumes: 'Release versions and restart requirements.',
			misuse: 'Installing at the wrong time can interrupt a live session.',
		},
		{
			id: 'settings.appearance.title',
			labelKey: 'settings.appearance.title',
			minTier: 'core',
			surface: '/settings?tab=appearance',
			sectionAnchor: 'settings-appearance-title',
			assumes: 'Personal reading and motion preferences.',
			misuse: 'Poor contrast, density or motion choices can make the interface harder to use.',
		},
		{
			id: 'settings.appearance.theme',
			labelKey: 'settings.appearance.theme',
			minTier: 'core',
			surface: '/settings?tab=appearance',
			sectionAnchor: 'settings-appearance-theme',
			assumes: 'Personal reading and motion preferences.',
			misuse: 'Poor contrast, density or motion choices can make the interface harder to use.',
		},
		{
			id: 'settings.appearance.density',
			labelKey: 'settings.appearance.density',
			minTier: 'core',
			surface: '/settings?tab=appearance',
			sectionAnchor: 'settings-appearance-density',
			assumes: 'Personal reading and motion preferences.',
			misuse: 'Poor contrast, density or motion choices can make the interface harder to use.',
		},
		{
			id: 'settings.appearance.proseWidth',
			labelKey: 'settings.appearance.proseWidth',
			minTier: 'core',
			surface: '/settings?tab=appearance',
			sectionAnchor: 'settings-appearance-proseWidth',
			assumes: 'Personal reading preferences for long-form text.',
			misuse: 'A full-width line can make long notes harder to read on wide screens.',
		},
		{
			id: 'settings.appearance.motion',
			labelKey: 'settings.appearance.motion',
			minTier: 'core',
			surface: '/settings?tab=appearance',
			sectionAnchor: 'settings-appearance-motion',
			assumes: 'Personal reading and motion preferences.',
			misuse: 'Poor contrast, density or motion choices can make the interface harder to use.',
		},
		{
			id: 'settings.appearance.markGmOnly',
			labelKey: 'settings.appearance.markGmOnly',
			minTier: 'core',
			surface: '/settings?tab=appearance',
			sectionAnchor: 'settings-appearance-markGmOnly',
			assumes: 'Personal reading and motion preferences.',
			misuse: 'Poor contrast, density or motion choices can make the interface harder to use.',
		},
		{
			id: 'settings.experience.title',
			labelKey: 'settings.experience.title',
			minTier: 'core',
			surface: '/settings?tab=appearance',
			sectionAnchor: 'settings-experience-title',
			assumes: 'Whether they want more controls visible.',
			misuse: 'A lower tier can hide controls without removing permissions.',
		},
		{
			id: 'settings.language.title',
			labelKey: 'settings.language.title',
			minTier: 'core',
			surface: '/settings?tab=language',
			sectionAnchor: 'settings-language-title',
			assumes: 'Which language they can read.',
			misuse: 'An unfamiliar locale can make controls difficult to find.',
		},
		{
			id: 'settings.permissions.roles',
			labelKey: 'settings.permissions.roles',
			minTier: 'advanced',
			surface: '/settings?tab=permissions',
			sectionAnchor: 'settings-permissions-roles',
			assumes: 'Actors, resources, grant scopes and revocation.',
			misuse: 'An overly broad grant can reveal secrets or allow unwanted changes.',
		},
		{
			id: 'settings.permissions.grantTitle',
			labelKey: 'settings.permissions.grantTitle',
			minTier: 'advanced',
			surface: '/settings?tab=permissions',
			sectionAnchor: 'settings-permissions-grantTitle',
			assumes: 'Actors, resources, grant scopes and revocation.',
			misuse: 'An overly broad grant can reveal secrets or allow unwanted changes.',
		},
		{
			id: 'settings.permissions.activeGrants',
			labelKey: 'settings.permissions.activeGrants',
			minTier: 'advanced',
			surface: '/settings?tab=permissions',
			sectionAnchor: 'settings-permissions-activeGrants',
			assumes: 'Actors, resources, grant scopes and revocation.',
			misuse: 'An overly broad grant can reveal secrets or allow unwanted changes.',
		},
		{
			id: 'settings.invites.title',
			labelKey: 'settings.invites.title',
			minTier: 'intermediate',
			surface: '/settings?tab=players',
			sectionAnchor: 'settings-invites-title',
			assumes: 'Who belongs at the table and which role each person needs.',
			misuse: 'An incorrect role or invite can expose campaign information.',
		},
		{
			id: 'settings.players.title',
			labelKey: 'settings.players.title',
			minTier: 'intermediate',
			surface: '/settings?tab=players',
			sectionAnchor: 'settings-players-title',
			assumes: 'Who belongs at the table and which role each person needs.',
			misuse: 'An incorrect role or invite can expose campaign information.',
		},
		{
			id: 'settings.subscription.billingTitle',
			labelKey: 'settings.subscription.billingTitle',
			minTier: 'intermediate',
			surface: '/settings?tab=subscription',
			sectionAnchor: 'settings-subscription-billingTitle',
			assumes: 'Plan limits and the distinction between previews and billing.',
			misuse:
				'Confusing a preview with an active plan can lead to incorrect capacity expectations.',
		},
		{
			id: 'settings.subscription.planPreview',
			labelKey: 'settings.subscription.planPreview',
			minTier: 'intermediate',
			surface: '/settings?tab=subscription',
			sectionAnchor: 'settings-subscription-planPreview',
			assumes: 'Plan limits and the distinction between previews and billing.',
			misuse:
				'Confusing a preview with an active plan can lead to incorrect capacity expectations.',
		},
		{
			id: 'settings.subscription.billingTitleLive',
			labelKey: 'settings.subscription.billingTitleLive',
			minTier: 'intermediate',
			surface: '/settings?tab=subscription',
			sectionAnchor: 'settings-subscription-billingTitleLive',
			assumes: 'Plan limits and the distinction between previews and billing.',
			misuse:
				'Confusing a preview with an active plan can lead to incorrect capacity expectations.',
		},
		{
			id: 'settings.subscription.availabilityTitle',
			labelKey: 'settings.subscription.availabilityTitle',
			minTier: 'intermediate',
			surface: '/settings?tab=subscription',
			sectionAnchor: 'settings-subscription-availabilityTitle',
			assumes: 'Plan limits and the distinction between previews and billing.',
			misuse:
				'Confusing a preview with an active plan can lead to incorrect capacity expectations.',
		},
		{
			id: 'settings.subscription.previewTitle',
			labelKey: 'settings.subscription.previewTitle',
			minTier: 'intermediate',
			surface: '/settings?tab=subscription',
			sectionAnchor: 'settings-subscription-previewTitle',
			assumes: 'Plan limits and the distinction between previews and billing.',
			misuse:
				'Confusing a preview with an active plan can lead to incorrect capacity expectations.',
		},
		{
			id: 'settings.sync.cloudTitle',
			labelKey: 'settings.sync.cloudTitle',
			minTier: 'intermediate',
			surface: '/settings?tab=sync',
			sectionAnchor: 'settings-sync-cloudTitle',
			assumes: 'Device state, cloud copies and pending operations.',
			misuse: 'Syncing or restoring the wrong copy can replace newer work.',
		},
		{
			id: 'settings.sync.cloudRow',
			labelKey: 'settings.sync.cloudRow',
			minTier: 'intermediate',
			surface: '/settings?tab=sync',
			sectionAnchor: 'settings-sync-cloudRow',
			assumes: 'Device state, cloud copies and pending operations.',
			misuse: 'Syncing or restoring the wrong copy can replace newer work.',
		},
		{
			id: 'settings.sync.recentChanges',
			labelKey: 'settings.sync.recentChanges',
			minTier: 'intermediate',
			surface: '/settings?tab=sync',
			sectionAnchor: 'settings-sync-recentChanges',
			assumes: 'Device state, cloud copies and pending operations.',
			misuse: 'Syncing or restoring the wrong copy can replace newer work.',
		},
		{
			id: 'settings.backup.title',
			labelKey: 'settings.backup.title',
			minTier: 'advanced',
			surface: '/settings?tab=sync',
			sectionAnchor: 'settings-backup-title',
			assumes: 'Snapshot age and replacement versus merge semantics.',
			misuse: 'Restoring a stale backup can overwrite current local work.',
		},
		{
			id: 'settings.sync.conflictsTitle',
			labelKey: 'settings.sync.conflictsTitle',
			minTier: 'advanced',
			surface: '/settings?tab=sync',
			sectionAnchor: 'settings-sync-conflictsTitle',
			assumes: 'Concurrent edits and which value should survive.',
			misuse: 'Resolving with the wrong value discards another device’s intended edit.',
		},
		{
			id: 'settings.privacy.title',
			labelKey: 'settings.privacy.title',
			minTier: 'advanced',
			surface: '/settings?tab=sync',
			sectionAnchor: 'settings-privacy-title',
			assumes: 'Service key custody versus end-to-end encryption and explicit consent.',
			misuse: 'A mistaken mode choice can change who can read cloud data.',
		},
		{
			id: 'settings.privacy.rowCloud',
			labelKey: 'settings.privacy.rowCloud',
			minTier: 'intermediate',
			surface: '/settings?tab=sync',
			sectionAnchor: 'settings-privacy-rowCloud',
			assumes: 'Device state, cloud copies and pending operations.',
			misuse: 'Syncing or restoring the wrong copy can replace newer work.',
		},
		{
			id: 'settings.recovery.title',
			labelKey: 'settings.recovery.title',
			minTier: 'advanced',
			surface: '/settings?tab=sync',
			sectionAnchor: 'settings-recovery-title',
			assumes: 'Recovery passphrases, sealed keys and offline key custody.',
			misuse: 'Losing the key or passphrase can make encrypted backups unrecoverable.',
		},
		{
			id: 'settings.recovery.custody',
			labelKey: 'settings.recovery.custody',
			minTier: 'advanced',
			surface: '/settings?tab=sync',
			sectionAnchor: 'settings-recovery-custody',
			assumes: 'Who holds the decryption key.',
			misuse: 'Confusing service custody with personal custody can defeat privacy expectations.',
		},
		{
			id: 'settings.tools.title',
			labelKey: 'settings.tools.title',
			minTier: 'core',
			surface: '/settings?tab=tools',
			sectionAnchor: 'settings-tools-title',
			assumes: 'Whether they want assistant features on this device.',
			misuse: 'Disabling assistance hides tools they may expect to find.',
		},
		{
			id: 'settings.plugins.title',
			labelKey: 'settings.plugins.title',
			minTier: 'intermediate',
			surface: '/settings?tab=plugins',
			sectionAnchor: 'settings-plugins-title',
			assumes: 'Installed packages and their enabled state.',
			misuse: 'Disabling a dependency can break a scene widget.',
		},
		{
			id: 'settings.systems.title',
			labelKey: 'settings.systems.title',
			minTier: 'intermediate',
			surface: '/settings?tab=systems',
			sectionAnchor: 'settings-systems-title',
			assumes: 'The campaign rules system and existing character data.',
			misuse: 'A system switch can drop incompatible fields.',
		},
		{
			id: 'settings.vault.title',
			labelKey: 'settings.vault.title',
			minTier: 'intermediate',
			surface: '/settings?tab=vault',
			sectionAnchor: 'settings-vault-title',
			assumes: 'Local vaults, external sources and import ownership.',
			misuse: 'Disconnecting the wrong source stops expected updates.',
		},
		{
			id: 'settings.folder.title',
			labelKey: 'settings.folder.title',
			minTier: 'intermediate',
			surface: '/settings?tab=vault',
			sectionAnchor: 'settings-folder-title',
			assumes: 'Markdown files and which notes are DM-only or shared.',
			misuse: 'Including DM-only notes in an export shared with players reveals secrets.',
		},
		{
			id: 'settings.vault.pressureTitle',
			labelKey: 'settings.vault.pressureTitle',
			minTier: 'core',
			surface: '/settings?tab=vault',
			sectionAnchor: 'settings-vault-pressureTitle',
			assumes: 'That browser storage is nearly full and cached search data can be cleared.',
			misuse: 'Ignoring the warning lets later saves fail once storage runs out.',
		},
		{
			id: 'settings.vault.quarantineTitle',
			labelKey: 'settings.vault.quarantineTitle',
			minTier: 'intermediate',
			surface: '/settings?tab=vault',
			sectionAnchor: 'settings-vault-quarantineTitle',
			assumes:
				'That unreadable documents were set aside and their originals are the only recovery copy.',
			misuse: 'Discarding an exported original before restoring it loses that content for good.',
		},
		{
			id: 'private-e2ee',
			labelKey: 'settings.privacy.rowPrivate',
			minTier: 'advanced',
			surface: '/settings?tab=sync',
			sectionAnchor: 'settings-privacy-rowPrivate',
			assumes: 'Personal key custody and E2EE recovery.',
			misuse: 'Losing recovery material can permanently prevent decryption.',
		},
		{
			id: 'status.localOnly',
			labelKey: 'status.localOnly',
			minTier: 'core',
			surface: '/settings?tab=sync',
			sectionAnchor: 'status-localOnly',
			assumes: 'That data stays on this device without cloud backup.',
			misuse: 'Device loss can lose the only copy.',
		},
		{
			id: 'extensions.compendium.title',
			labelKey: 'extensions.compendium.title',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'extensions-compendium-title',
			assumes: 'Content sources, licensing and importing selected entries.',
			misuse: 'Importing the wrong entry can add duplicate or incompatible campaign content.',
		},
		{
			id: 'extensions.customTypes.title',
			labelKey: 'extensions.customTypes.title',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'extensions-customTypes-title',
			assumes: 'Field kinds, required values, visibility and schema evolution.',
			misuse: 'Changing a schema can invalidate objects or reveal fields intended for the GM.',
		},
		{
			id: 'extensions.objects.title',
			labelKey: 'extensions.objects.title',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'extensions-objects-title',
			assumes: 'Built-in object types and which fields are GM-only.',
			misuse: 'Using the wrong object type can hide relevant fields or expose secrets.',
		},
		{
			id: 'extensions.plugins.installedTitle',
			labelKey: 'extensions.plugins.installedTitle',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'extensions-plugins-installedTitle',
			assumes: 'Package schemas, dependency compatibility and trust permissions.',
			misuse: 'Invalid definitions or excessive capabilities can break widgets or expose data.',
		},
		{
			id: 'extensions.plugins.starterTitle',
			labelKey: 'extensions.plugins.starterTitle',
			minTier: 'core',
			surface: '/extensions',
			sectionAnchor: 'extensions-plugins-starterTitle',
			assumes: 'Choosing a ready-made widget for the current scene.',
			misuse: 'The wrong preset may omit information needed during play.',
		},
		{
			id: 'extensions.plugins.buildTitle',
			labelKey: 'extensions.plugins.buildTitle',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'extensions-plugins-buildTitle',
			assumes: 'Package schemas, dependency compatibility and trust permissions.',
			misuse: 'Invalid definitions or excessive capabilities can break widgets or expose data.',
		},
		{
			id: 'extensions.plugins.jsonTitle',
			labelKey: 'extensions.plugins.jsonTitle',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'extensions-plugins-jsonTitle',
			assumes: 'Package schemas, dependency compatibility and trust permissions.',
			misuse: 'Invalid definitions or excessive capabilities can break widgets or expose data.',
		},
		{
			id: 'extensions.plugins.marketTitle',
			labelKey: 'extensions.plugins.marketTitle',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'extensions-plugins-marketTitle',
			assumes: 'Package provenance and compatibility.',
			misuse: 'Installing an unreviewed package can add unwanted dependencies.',
		},
		{
			id: 'extensions.system.pickerTitle',
			labelKey: 'extensions.system.pickerTitle',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'extensions-system-pickerTitle',
			assumes: 'Rules package compatibility, dry-run losses and character migrations.',
			misuse:
				'Switching systems without reviewing losses can discard incompatible character values.',
		},
		{
			id: 'extensions.system.library.title',
			labelKey: 'extensions.system.library.title',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'extensions-system-library-title',
			assumes: 'Rules package compatibility, dry-run losses and character migrations.',
			misuse:
				'Switching systems without reviewing losses can discard incompatible character values.',
		},
		{
			id: 'extensions.system.title',
			labelKey: 'extensions.system.title',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'extensions-system-title',
			assumes: 'Rules package compatibility, dry-run losses and character migrations.',
			misuse:
				'Switching systems without reviewing losses can discard incompatible character values.',
		},
		{
			id: 'extensions.theme.presetTitle',
			labelKey: 'extensions.theme.presetTitle',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'extensions-theme-presetTitle',
			assumes: 'Theme presets, contrast and previewing across components.',
			misuse: 'Unsuitable colors can make text or focus indicators unreadable.',
		},
		{
			id: 'extensions.theme.previewTitle',
			labelKey: 'extensions.theme.previewTitle',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'extensions-theme-previewTitle',
			assumes: 'Theme presets, contrast and previewing across components.',
			misuse: 'Unsuitable colors can make text or focus indicators unreadable.',
		},
		{
			id: 'extensions.tab.plugins',
			labelKey: 'extensions.tab.plugins',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'extensions-tab-plugins',
			assumes: 'The distinction between browsing installed content and authoring definitions.',
			misuse: 'Choosing an incompatible package or system can disrupt dependent campaign content.',
		},
		{
			id: 'extensions.tab.compendium',
			labelKey: 'extensions.tab.compendium',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'extensions-tab-compendium',
			assumes: 'The distinction between browsing installed content and authoring definitions.',
			misuse: 'Choosing an incompatible package or system can disrupt dependent campaign content.',
		},
		{
			id: 'extensions.tab.objects',
			labelKey: 'extensions.tab.objects',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'extensions-tab-objects',
			assumes: 'The distinction between browsing installed content and authoring definitions.',
			misuse: 'Choosing an incompatible package or system can disrupt dependent campaign content.',
		},
		{
			id: 'extensions.tab.system',
			labelKey: 'extensions.tab.system',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'extensions-tab-system',
			assumes: 'The distinction between browsing installed content and authoring definitions.',
			misuse: 'Choosing an incompatible package or system can disrupt dependent campaign content.',
		},
		{
			id: 'extensions.tab.theme',
			labelKey: 'extensions.tab.theme',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'extensions-tab-theme',
			assumes: 'The distinction between browsing installed content and authoring definitions.',
			misuse: 'Choosing an incompatible package or system can disrupt dependent campaign content.',
		},
		{
			id: 'community.discover.modules',
			labelKey: 'community.discover.modules',
			minTier: 'intermediate',
			surface: '/community',
			sectionAnchor: 'community-discover-modules',
			assumes: 'Package provenance and what an import adds to the vault.',
			misuse: 'Importing unreviewed content can add unwanted dependencies or spoilers.',
		},
		{
			id: 'community.export.whatTitle',
			labelKey: 'community.export.whatTitle',
			minTier: 'advanced',
			surface: '/community',
			sectionAnchor: 'community-export-whatTitle',
			assumes: 'Public audiences, module dependencies and permission to redistribute content.',
			misuse:
				'Publishing or exporting the wrong selection can disclose GM secrets or redistribute restricted content.',
		},
		{
			id: 'community.export.title',
			labelKey: 'community.export.title',
			minTier: 'advanced',
			surface: '/community',
			sectionAnchor: 'community-export-title',
			assumes: 'Public audiences, module dependencies and permission to redistribute content.',
			misuse:
				'Publishing or exporting the wrong selection can disclose GM secrets or redistribute restricted content.',
		},
		{
			id: 'community.scenePackage.title',
			labelKey: 'community.scenePackage.title',
			minTier: 'advanced',
			surface: '/community',
			sectionAnchor: 'community-scenePackage-title',
			assumes: 'Public audiences, module dependencies and permission to redistribute content.',
			misuse:
				'Publishing or exporting the wrong selection can disclose GM secrets or redistribute restricted content.',
		},
		{
			id: 'community.moduleFile.title',
			labelKey: 'community.moduleFile.title',
			minTier: 'intermediate',
			surface: '/community',
			sectionAnchor: 'community-moduleFile-title',
			assumes: 'Package provenance and what an import adds to the vault.',
			misuse: 'Importing unreviewed content can add unwanted dependencies or spoilers.',
		},
		{
			id: 'community.publish.title',
			labelKey: 'community.publish.title',
			minTier: 'advanced',
			surface: '/community',
			sectionAnchor: 'community-publish-title',
			assumes: 'Public audiences, module dependencies and permission to redistribute content.',
			misuse:
				'Publishing or exporting the wrong selection can disclose GM secrets or redistribute restricted content.',
		},
		{
			id: 'community.publish.yourListings',
			labelKey: 'community.publish.yourListings',
			minTier: 'advanced',
			surface: '/community',
			sectionAnchor: 'community-publish-yourListings',
			assumes: 'Public audiences, module dependencies and permission to redistribute content.',
			misuse:
				'Publishing or exporting the wrong selection can disclose GM secrets or redistribute restricted content.',
		},
		{
			id: 'community.wiki.settingsTitle',
			labelKey: 'community.wiki.settingsTitle',
			minTier: 'advanced',
			surface: '/community',
			sectionAnchor: 'community-wiki-settingsTitle',
			assumes: 'Public audiences, module dependencies and permission to redistribute content.',
			misuse:
				'Publishing or exporting the wrong selection can disclose GM secrets or redistribute restricted content.',
		},
		{
			id: 'community.wiki.publishedTitle',
			labelKey: 'community.wiki.publishedTitle',
			minTier: 'advanced',
			surface: '/community',
			sectionAnchor: 'community-wiki-publishedTitle',
			assumes: 'Public audiences, module dependencies and permission to redistribute content.',
			misuse:
				'Publishing or exporting the wrong selection can disclose GM secrets or redistribute restricted content.',
		},
		{
			id: 'community.wiki.previewTitle',
			labelKey: 'community.wiki.previewTitle',
			minTier: 'advanced',
			surface: '/community',
			sectionAnchor: 'community-wiki-previewTitle',
			assumes: 'Public audiences, module dependencies and permission to redistribute content.',
			misuse:
				'Publishing or exporting the wrong selection can disclose GM secrets or redistribute restricted content.',
		},
		{
			id: 'community.tab.discover',
			labelKey: 'community.tab.discover',
			minTier: 'intermediate',
			surface: '/community',
			sectionAnchor: 'community-tab-discover',
			assumes: 'Package provenance and what an import adds to the vault.',
			misuse: 'Importing unreviewed content can add unwanted dependencies or spoilers.',
		},
		{
			id: 'community.tab.export',
			labelKey: 'community.tab.export',
			minTier: 'advanced',
			surface: '/community',
			sectionAnchor: 'community-tab-export',
			assumes: 'Public audiences, module dependencies and permission to redistribute content.',
			misuse:
				'Publishing or exporting the wrong selection can disclose GM secrets or redistribute restricted content.',
		},
		{
			id: 'community.tab.publish',
			labelKey: 'community.tab.publish',
			minTier: 'advanced',
			surface: '/community',
			sectionAnchor: 'community-tab-publish',
			assumes: 'Public audiences, module dependencies and permission to redistribute content.',
			misuse:
				'Publishing or exporting the wrong selection can disclose GM secrets or redistribute restricted content.',
		},
		{
			id: 'community.tab.wiki',
			labelKey: 'community.tab.wiki',
			minTier: 'advanced',
			surface: '/community',
			sectionAnchor: 'community-tab-wiki',
			assumes: 'Public audiences, module dependencies and permission to redistribute content.',
			misuse:
				'Publishing or exporting the wrong selection can disclose GM secrets or redistribute restricted content.',
		},
		{
			id: 'community.market.title',
			labelKey: 'community.market.title',
			minTier: 'intermediate',
			surface: '/community',
			sectionAnchor: 'community-market-title',
			assumes: 'Package provenance and what an import adds to the vault.',
			misuse: 'Importing unreviewed content can add unwanted dependencies or spoilers.',
		},
		{
			id: 'builder.step.identity',
			labelKey: 'builder.step.identity',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'widget-builder-identity',
			assumes: 'Stable package identifiers, versions and vocabulary.',
			misuse: 'Changing IDs can sever existing references.',
		},
		{
			id: 'builder.step.layout',
			labelKey: 'builder.step.layout',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'widget-builder-layout',
			assumes: 'Component nesting, sizing and layout constraints.',
			misuse: 'Poor nesting can hide controls or overflow small screens.',
		},
		{
			id: 'builder.step.data',
			labelKey: 'builder.step.data',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'widget-builder-data',
			assumes: 'Query bindings, data shapes and actor-filtered reads.',
			misuse: 'Incorrect bindings can display missing or unintended records.',
		},
		{
			id: 'builder.step.config',
			labelKey: 'builder.step.config',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'widget-builder-config',
			assumes: 'Typed configuration fields and defaults.',
			misuse: 'Invalid defaults can prevent widgets from rendering.',
		},
		{
			id: 'builder.step.commands',
			labelKey: 'builder.step.commands',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'widget-builder-commands',
			assumes: 'Command schemas, write scopes and confirmation requirements.',
			misuse: 'A wrong binding can mutate the wrong campaign entity.',
		},
		{
			id: 'builder.step.style',
			labelKey: 'builder.step.style',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'widget-builder-style',
			assumes: 'Design tokens, contrast and responsive sizing.',
			misuse: 'Low contrast or rigid sizing can make a widget unusable.',
		},
		{
			id: 'builder.step.advanced',
			labelKey: 'builder.step.advanced',
			// RC-UX-6.4: on the Beginner card a bare "Advanced" would not say what is hidden.
			summaryKey: 'builder.step.advancedGate',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'widget-builder-advanced',
			assumes: 'Custom code, sandbox boundaries and host capabilities.',
			misuse: 'Unreviewed code can request excessive access or fail at runtime.',
		},
		{
			id: 'builder.step.review',
			labelKey: 'builder.step.review',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'widget-builder-review',
			assumes: 'Validation findings, upgrade effects and installation trust.',
			misuse: 'Installing without resolving findings can break dependent content.',
		},
		{
			id: 'systemBuilder.step.identity',
			labelKey: 'systemBuilder.step.identity',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'system-builder-identity',
			assumes: 'Stable package identifiers, versions and vocabulary.',
			misuse: 'Changing IDs can sever existing references.',
		},
		{
			id: 'systemBuilder.step.attributes',
			labelKey: 'systemBuilder.step.attributes',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'system-builder-attributes',
			assumes: 'Attribute IDs and how character sheets reference them.',
			misuse: 'Renaming fields can orphan character values.',
		},
		{
			id: 'systemBuilder.step.resources',
			labelKey: 'systemBuilder.step.resources',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'system-builder-resources',
			assumes: 'Resource bounds, depletion and recharge rules.',
			misuse: 'Incorrect limits or recharge rules distort play.',
		},
		{
			id: 'systemBuilder.step.conditions',
			labelKey: 'systemBuilder.step.conditions',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'system-builder-conditions',
			assumes: 'Condition IDs, stacking and durations.',
			misuse: 'Wrong semantics can leave combat effects stuck.',
		},
		{
			id: 'systemBuilder.step.dice',
			labelKey: 'systemBuilder.step.dice',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'system-builder-dice',
			assumes: 'Dice expressions, initiative and turn order rules.',
			misuse: 'Incorrect formulas produce wrong rolls or turn order.',
		},
		{
			id: 'systemBuilder.step.creature',
			labelKey: 'systemBuilder.step.creature',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'system-builder-creature',
			assumes: 'Creature field types and required schema fields.',
			misuse: 'Incompatible schemas can reject existing creatures.',
		},
		{
			id: 'systemBuilder.step.advancement',
			labelKey: 'systemBuilder.step.advancement',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'system-builder-advancement',
			assumes: 'Level progression and compatibility with existing characters.',
			misuse: 'Incorrect progression can drop or miscalculate character abilities.',
		},
		{
			id: 'systemBuilder.step.review',
			labelKey: 'systemBuilder.step.review',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'system-builder-review',
			assumes: 'Validation findings, upgrade effects and installation trust.',
			misuse: 'Installing without resolving findings can break dependent content.',
		},
		{
			id: 'extensions.customTypes.defineTitle',
			labelKey: 'extensions.customTypes.defineTitle',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'extensions-customTypes-defineTitle',
			assumes: 'Field kinds, required values, visibility and schema evolution.',
			misuse: 'Changing a schema can invalidate objects or reveal fields intended for the GM.',
		},
		{
			id: 'extensions.customTypes.dmOnlyField',
			labelKey: 'extensions.customTypes.dmOnlyField',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'extensions-customTypes-dmOnlyField',
			assumes: 'Field kinds, required values, visibility and schema evolution.',
			misuse: 'Changing a schema can invalidate objects or reveal fields intended for the GM.',
		},
		{
			id: 'extensions.trust.title',
			labelKey: 'extensions.trust.title',
			minTier: 'advanced',
			surface: '/extensions',
			sectionAnchor: 'extensions-trust-title',
			assumes: 'Read/write capabilities and network destinations.',
			misuse: 'Granting excessive trust can expose or alter campaign data.',
		},
		{
			id: 'mapEditor.aboutAdvanced',
			labelKey: 'mapEditor.aboutAdvanced',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapEditor-aboutAdvanced',
			assumes: 'Vector geometry and map layer semantics.',
			misuse: 'Advanced edits can damage geometry or obscure navigation.',
		},
		{
			id: 'mapEditor.fogBrush',
			labelKey: 'mapEditor.fogBrush',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapEditor-fogBrush',
			assumes: 'GM versus player visibility and reveal/conceal operations.',
			misuse: 'An accidental reveal can expose unexplored rooms.',
		},
		{
			id: 'mapEditor.projectToPlayers',
			labelKey: 'mapEditor.projectToPlayers',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapEditor-projectToPlayers',
			assumes: 'Which map and layers players should see.',
			misuse: 'Projecting the wrong map can reveal spoilers.',
		},
		{
			id: 'mapEditor.exportUvtt',
			labelKey: 'mapEditor.exportUvtt',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapEditor-exportUvtt',
			assumes: 'VTT interchange formats and supported geometry.',
			misuse: 'Unsupported features may be lost in export.',
		},
		{
			id: 'mapEditor.dock.inspector',
			labelKey: 'mapEditor.dock.inspector',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapEditor-dock-inspector',
			assumes: 'Map layers, geometry and the active tool’s coordinate space.',
			misuse:
				'Editing the wrong layer or selection can damage map content or reveal hidden information.',
		},
		{
			id: 'mapEditor.dock.layers',
			labelKey: 'mapEditor.dock.layers',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapEditor-dock-layers',
			assumes: 'Map layers, geometry and the active tool’s coordinate space.',
			misuse:
				'Editing the wrong layer or selection can damage map content or reveal hidden information.',
		},
		{
			id: 'mapEditor.dock.assets',
			labelKey: 'mapEditor.dock.assets',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapEditor-dock-assets',
			assumes: 'Map layers, geometry and the active tool’s coordinate space.',
			misuse:
				'Editing the wrong layer or selection can damage map content or reveal hidden information.',
		},
		{
			id: 'mapEditor.dock.history',
			labelKey: 'mapEditor.dock.history',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapEditor-dock-history',
			assumes: 'Map layers, geometry and the active tool’s coordinate space.',
			misuse:
				'Editing the wrong layer or selection can damage map content or reveal hidden information.',
		},
		{
			id: 'mapEditor.dock.graph',
			labelKey: 'mapEditor.dock.graph',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapEditor-dock-graph',
			assumes: 'Map layers, geometry and the active tool’s coordinate space.',
			misuse:
				'Editing the wrong layer or selection can damage map content or reveal hidden information.',
		},
		{
			id: 'mapTool.select.label',
			labelKey: 'mapTool.select.label',
			minTier: 'core',
			surface: '/atlas',
			sectionAnchor: 'mapTool-select-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.marquee.label',
			labelKey: 'mapTool.marquee.label',
			minTier: 'core',
			surface: '/atlas',
			sectionAnchor: 'mapTool-marquee-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.pan.label',
			labelKey: 'mapTool.pan.label',
			minTier: 'core',
			surface: '/atlas',
			sectionAnchor: 'mapTool-pan-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.brush.label',
			labelKey: 'mapTool.brush.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-brush-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.fill.label',
			labelKey: 'mapTool.fill.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-fill-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.erase.label',
			labelKey: 'mapTool.erase.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-erase-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.room.label',
			labelKey: 'mapTool.room.label',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapTool-room-label',
			assumes: 'Room bounds and connected wall geometry.',
			misuse: 'Overlapping rooms can create unintended barriers.',
		},
		{
			id: 'mapTool.wall.label',
			labelKey: 'mapTool.wall.label',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapTool-wall-label',
			assumes: 'Wall topology and line-of-sight blocking.',
			misuse: 'Gaps or extra walls can reveal rooms or block intended sight.',
		},
		{
			id: 'mapTool.door.label',
			labelKey: 'mapTool.door.label',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapTool-door-label',
			assumes: 'Door placement, open state and wall connectivity.',
			misuse: 'An incorrect door state changes movement or player visibility.',
		},
		{
			id: 'mapTool.water.label',
			labelKey: 'mapTool.water.label',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapTool-water-label',
			assumes: 'Terrain boundaries and layer stacking.',
			misuse: 'Painting over the wrong layer can obscure usable terrain.',
		},
		{
			id: 'mapTool.stamp.label',
			labelKey: 'mapTool.stamp.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-stamp-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.scatter.label',
			labelKey: 'mapTool.scatter.label',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapTool-scatter-label',
			assumes: 'Asset density, placement bounds and layer ownership.',
			misuse: 'Dense scattering can obscure the map and slow rendering.',
		},
		{
			id: 'mapTool.light.label',
			labelKey: 'mapTool.light.label',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapTool-light-label',
			assumes: 'Light radius, occlusion and player sight.',
			misuse: 'An excessive radius can reveal hidden areas.',
		},
		{
			id: 'mapTool.fog.label',
			labelKey: 'mapTool.fog.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-fog-label',
			assumes: 'Player visibility and reveal versus conceal.',
			misuse: 'A wrong brush operation can reveal unexplored locations.',
		},
		{
			id: 'mapTool.token.label',
			labelKey: 'mapTool.token.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-token-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.combatMove.label',
			labelKey: 'mapTool.combatMove.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-combatMove-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.aoeSphere.label',
			labelKey: 'mapTool.aoeSphere.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-aoeSphere-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.aoeCone.label',
			labelKey: 'mapTool.aoeCone.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-aoeCone-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.aoeLine.label',
			labelKey: 'mapTool.aoeLine.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-aoeLine-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.aoeCube.label',
			labelKey: 'mapTool.aoeCube.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-aoeCube-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.measure.label',
			labelKey: 'mapTool.measure.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-measure-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.poi.label',
			labelKey: 'mapTool.poi.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-poi-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.route.label',
			labelKey: 'mapTool.route.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-route-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.text.label',
			labelKey: 'mapTool.text.label',
			minTier: 'intermediate',
			surface: '/atlas',
			sectionAnchor: 'mapTool-text-label',
			assumes: 'The active map selection, layer and tool gesture.',
			misuse: 'Applying the tool to the wrong selection can change unintended map content.',
		},
		{
			id: 'mapTool.generate.label',
			labelKey: 'mapTool.generate.label',
			minTier: 'advanced',
			surface: '/atlas',
			sectionAnchor: 'mapTool-generate-label',
			assumes: 'Generator parameters, seeds and replacement scope.',
			misuse: 'Applying a generator can replace carefully authored terrain.',
		},
		{
			id: 'nav.commandCenter',
			labelKey: 'nav.commandCenter',
			minTier: 'core',
			surface: '/',
			sectionAnchor: 'nav-commandCenter',
			assumes: 'The current campaign and session.',
			misuse: 'Opening the wrong scene can distract from live play.',
		},
		{
			id: 'nav.scenes',
			labelKey: 'nav.scenes',
			minTier: 'core',
			surface: '/scenes',
			sectionAnchor: 'nav-scenes',
			assumes: 'Which widgets belong in a session scene.',
			misuse: 'Removing a widget can hide information needed at the table.',
		},
		{
			id: 'nav.session',
			labelKey: 'nav.session',
			minTier: 'core',
			surface: '/session',
			sectionAnchor: 'nav-session',
			assumes: 'Turn order, dice and combat state.',
			misuse: 'Advancing the wrong turn can disrupt combat tracking.',
		},
		{
			id: 'nav.characters',
			labelKey: 'nav.characters',
			minTier: 'core',
			surface: '/characters',
			sectionAnchor: 'nav-characters',
			assumes: 'Character identity and the selected rules system.',
			misuse: 'Editing the wrong character can change play statistics.',
		},
		{
			id: 'nav.atlas',
			labelKey: 'nav.atlas',
			minTier: 'core',
			surface: '/atlas',
			sectionAnchor: 'nav-atlas',
			assumes: 'Map and location navigation.',
			misuse: 'Selecting the wrong location can confuse session context.',
		},
		{
			id: 'nav.story',
			labelKey: 'nav.story',
			minTier: 'intermediate',
			surface: '/campaign',
			sectionAnchor: 'nav-story',
			assumes: 'Quest, faction and timeline relationships.',
			misuse: 'Incorrect links or visibility can reveal spoilers.',
		},
		{
			id: 'nav.knowledge',
			labelKey: 'nav.knowledge',
			minTier: 'core',
			surface: '/knowledge',
			sectionAnchor: 'nav-knowledge',
			assumes: 'Notes, links and shared handouts.',
			misuse: 'Sharing the wrong note can expose GM secrets.',
		},
		{
			id: 'nav.graph',
			labelKey: 'nav.graph',
			minTier: 'intermediate',
			surface: '/graph',
			sectionAnchor: 'nav-graph',
			assumes: 'Relationships and search filters.',
			misuse: 'A filtered view can be mistaken for missing data.',
		},
		{
			id: 'nav.audio',
			labelKey: 'nav.audio',
			minTier: 'core',
			surface: '/audio',
			sectionAnchor: 'nav-audio',
			assumes: 'Soundboard playback and output volume.',
			misuse: 'Loud playback can interrupt the table.',
		},
		{
			id: 'nav.playerView',
			labelKey: 'nav.playerView',
			minTier: 'intermediate',
			surface: '/player',
			sectionAnchor: 'nav-playerView',
			assumes: 'GM versus player projection.',
			misuse: 'Incorrect sharing can expose hidden information.',
		},
		{
			id: 'nav.hostTable',
			labelKey: 'nav.hostTable',
			minTier: 'intermediate',
			surface: '/session',
			sectionAnchor: 'nav-hostTable',
			assumes: 'Live table access and invitations.',
			misuse: 'An unintended guest can join the table.',
		},
		{
			id: 'nav.joinTable',
			labelKey: 'nav.joinTable',
			minTier: 'core',
			surface: '/join',
			sectionAnchor: 'nav-joinTable',
			assumes: 'A trusted table invitation.',
			misuse: 'Joining the wrong table can expose a chosen identity.',
		},
		{
			id: 'nav.settings',
			labelKey: 'nav.settings',
			minTier: 'core',
			surface: '/settings',
			sectionAnchor: 'nav-settings',
			assumes: 'Device versus campaign preferences.',
			misuse: 'Changing a device preference may not affect other devices.',
		},
		{
			id: 'nav.extensions',
			labelKey: 'nav.extensions',
			minTier: 'intermediate',
			surface: '/extensions',
			sectionAnchor: 'nav-extensions',
			assumes: 'Packages and campaign dependencies.',
			misuse: 'Disabling a package can break dependent content.',
		},
		{
			id: 'nav.community',
			labelKey: 'nav.community',
			minTier: 'intermediate',
			surface: '/community',
			sectionAnchor: 'nav-community',
			assumes: 'Import provenance and public audiences.',
			misuse: 'An unreviewed import or publication can expose unwanted content.',
		},
		{
			id: 'nav.pricing',
			labelKey: 'nav.pricing',
			minTier: 'core',
			surface: '/upgrade',
			sectionAnchor: 'nav-pricing',
			assumes: 'Plan comparisons and feature limits.',
			misuse: 'Confusing a comparison with an active entitlement can mislead planning.',
		},
		{
			id: 'settings.ai.conflictHeading',
			labelKey: 'settings.ai.conflictHeading',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-ai-conflictHeading',
			assumes: 'Proposal base versions and concurrent changes.',
			misuse: 'Accepting a stale proposal can overwrite newer edits.',
		},
		{
			id: 'settings.ai.previewShow',
			labelKey: 'settings.ai.previewShow',
			minTier: 'advanced',
			surface: '/settings?tab=ai',
			sectionAnchor: 'settings-ai-previewShow',
			assumes: 'Before/after differences and affected links.',
			misuse: 'Skipping the preview can approve changes to the wrong record.',
		},
		{
			id: 'nav.sub.board',
			labelKey: 'nav.sub.board',
			minTier: 'core',
			surface: '/board',
			sectionAnchor: 'nav-sub-board',
			assumes: 'Dice, initiative and tracker controls.',
			misuse: 'Editing the wrong tracker can distort the current session.',
		},
		{
			id: 'home.create.widget',
			labelKey: 'home.create.widget',
			minTier: 'intermediate',
			surface: '/',
			sectionAnchor: 'home-create-widget',
			assumes: 'Which widgets a GM screen needs and where the Add panel places them.',
			misuse: 'Unneeded widgets crowd the screen the table relies on.',
		},
		{
			id: 'nav.quests',
			labelKey: 'nav.quests',
			minTier: 'intermediate',
			surface: '/campaign',
			sectionAnchor: 'nav-quests',
			assumes: 'Quest progress and player-visible objectives.',
			misuse: 'Incorrect visibility can reveal future plot events.',
		},
	] satisfies readonly Omit<SectionFeatureGate, 'label'>[]
).map((gate) => ({ ...gate, label: gate.labelKey }));

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

/**
 * The tier a device uses until the GM picks one (PLAT-013 AC1).
 *
 * Migration note (RC-UX-6.4): this was `core` (Beginner) until 2026-10. Onboarding already
 * pre-selected and recommended Standard, so the two disagreed. A device that never stored a choice
 * now opens at `intermediate` (Standard) and sees Extensions, Community, the New widget launcher
 * and the intermediate Settings panels. A stored choice, including an explicit Beginner, is kept
 * as it is. Nothing is rewritten.
 */
export const DEFAULT_FEATURE_TIER: FeatureTier = 'intermediate';

/**
 * RC-UX-6.4: the gates an experience card names when it says what its tier hides. Every entry is
 * enforced by a reader: the Settings rail and section wrappers, the More group and phone More
 * sheet (Extensions, Community), the Command Center launchers (New widget, Permissions) and the
 * widget builder's stepper (Advanced: custom code and host access).
 * Listing a gate here that nothing hides would make the card dishonest again.
 */
export const TIER_SUMMARY_GATE_IDS: readonly string[] = [
	'nav.extensions',
	'nav.community',
	'home.create.widget',
	'builder.step.advanced',
	'settings.nav.plugins',
	'settings.nav.systems',
	'settings.nav.permissions',
	'settings.nav.ai',
	'settings.backup.title',
	'settings.about.export',
];

/** The summary gates `tier` keeps out of sight, in card order. Expert hides none. */
export function tierHiddenSections(
	tier: FeatureTier,
	gates: readonly SectionFeatureGate[] = SECTION_FEATURE_GATES,
): SectionFeatureGate[] {
	return TIER_SUMMARY_GATE_IDS.flatMap((id) => {
		const gate = gates.find((entry) => entry.id === id);
		return gate && !tierMeets(tier, gate.minTier) ? [gate] : [];
	});
}

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
	// distinct next milestone. RC-CAN-7.6: nor is a default screen (the home screen `ensure-home`
	// provisions beside the board) — the GM did not author it either.
	const hasScene = Object.values(state.scenes.scenes).some(
		(scene) => scene.id !== homeSceneId && screenMetaOf(scene).origin?.kind !== 'default',
	);
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
