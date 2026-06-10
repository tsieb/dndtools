import { PLATFORM_PROFILES, type PlatformProfile } from '../platform/platform-profile';
import { REGISTERED_SOURCE_KINDS } from '../sync/source-adapter-registry';
import {
	ALL_HOST_PERMISSIONS,
	SYSTEM_WIDGET_PACKAGE_STATE,
	type WidgetDefinition,
	type WidgetHostPermission,
	type WidgetPackageState,
	type PlatformProfileId,
} from '../state/widget-package-state';

/**
 * CON-003 + CON-006 — THE SCOPE-BOUNDARY CONSTRAINT GATE. The single, declared source of truth for the
 * invariant that keeps DND Tools 0.2.0 inside its declared scope boundaries over time (Vision brief
 * "Explicitly Out of Scope"; Architecture Cross-Contract; Defects `AUDIT-21.4-EXTENSIBILITY`,
 * `REVIEW-PLAN conflict handling`).
 *
 * Two governance constraints share one boundary surface here:
 *
 *   CON-003 — "The system must never introduce community marketplace, public campaign directory, plugin
 *   ecosystem, third-party compendium integration, i18n, or public wiki features into the v2 core
 *   requirements without an explicit scope revision." Its three acceptance criteria:
 *     AC1 — a proposal that adds marketplace/public-directory behavior is REJECTED or moved to future scope.
 *     AC2 — extension seams support INTERNAL system/user widgets only and do not imply public plugin APIs.
 *     AC3 — a user-authored widget package stays VAULT-LOCAL or WORKSPACE-LOCAL and does not imply a public
 *           marketplace, SDK compatibility guarantee, or third-party distribution channel.
 *
 *   CON-006 — "The system must never add a new top-level platform, source, AI provider, public extension
 *   surface, or cloud backend assumption without an explicit architecture-contract and requirements
 *   revision." Its two acceptance criteria:
 *     AC1 — a proposal introducing a new cloud backend or AI provider assumption is BLOCKED until contracts
 *           and requirements are updated.
 *     AC2 — a proposal expanding user-authored widgets into a public plugin ecosystem is REJECTED or moved
 *           to future scope through explicit revision.
 *
 * This module delivers the scope-review detector ({@link findScopeViolation}, the fail-closed predicate a
 * scope review turns into "reject / defer to future scope") AND the codebase-drift audit
 * ({@link auditScopeBoundary}, that proves the LIVE declared registries — platform profiles, content
 * sources, widget distribution scopes, widget host permissions — never grow a new top-level axis or an
 * out-of-scope distribution channel without first widening this declared allowlist, which is itself the
 * reviewable "explicit revision").
 *
 * It mirrors the established mechanical-gate pattern in this codebase (the SEC-008
 * `security/regression-gates.ts` boundary registry, the PLAT-010 `platform/quality-gates.ts` gate
 * registry, and the CON-004 `con/capability-set-sustainability.ts` sustainability gate): a declared
 * invariant + a pure, fail-closed validator cross-checked against reality so the project can never
 * silently drift past its declared scope. It does NOT re-implement any platform/source/widget machinery;
 * it COMPOSES the existing declared registries ({@link PLATFORM_PROFILES}, {@link REGISTERED_SOURCE_KINDS},
 * {@link SYSTEM_WIDGET_PACKAGE_STATE}, {@link ALL_HOST_PERMISSIONS}) and proves they stay within the
 * declared scope axes. This module is the INDEX + the proof that scope can only widen by widening the
 * declared allowlist here — the explicit scope revision CON-003/CON-006 require.
 *
 * Pure data + pure predicates. No GUI, no storage, no clock, no entropy, no network.
 */

/** CON-003/CON-006 scope-constraint registry version, bumped on a breaking constraint-shape change. */
export const SCOPE_CONSTRAINTS_VERSION = 1 as const;

/**
 * THE OUT-OF-SCOPE FEATURE CLASSES. The closed catalogue of capability classes the Vision brief declares
 * "Explicitly Out of Scope" (CON-003) plus the public-plugin-ecosystem expansion CON-006 AC2 forbids.
 * A proposed requirement/feature whose declared class is one of these is rejected (or moved to future
 * scope) by {@link findScopeViolation} unless the proposal itself carries an explicit scope revision.
 * This is the single source of truth for "what is explicitly out of v2 scope".
 */
export type OutOfScopeFeatureClass =
	| 'community-marketplace' // Vision: "Community content marketplace"
	| 'public-campaign-directory' // Vision: "Public wiki or shared campaign directory"
	| 'plugin-ecosystem' // Vision: "Plugin/extension ecosystem" + CON-006 public plugin ecosystem
	| 'third-party-compendium-integration' // Vision: "Third-party compendium integration"
	| 'i18n-localization' // Vision: "i18n / localization"
	| 'public-wiki'; // Vision: "Public wiki or shared campaign directory"

/** The catalogue, frozen, in declared order — the reviewable list the scope gate checks against. */
export const OUT_OF_SCOPE_FEATURE_CLASSES: readonly OutOfScopeFeatureClass[] = Object.freeze([
	'community-marketplace',
	'public-campaign-directory',
	'plugin-ecosystem',
	'third-party-compendium-integration',
	'i18n-localization',
	'public-wiki',
]);

const OUT_OF_SCOPE_FEATURE_SET: ReadonlySet<string> = new Set(OUT_OF_SCOPE_FEATURE_CLASSES);

/**
 * THE TOP-LEVEL SCOPE AXES (CON-006). The architecture dimensions that may only widen through "an explicit
 * architecture-contract and requirements revision". A proposal that introduces a NEW top-level entry on one
 * of these axes — a new platform, a new content source, a new AI provider, a new public extension surface,
 * or a new cloud-backend assumption — is blocked by {@link findScopeViolation} until the contracts and
 * requirements (and this declared allowlist) are revised.
 */
export type TopLevelScopeAxis =
	| 'platform' // a new top-level platform target
	| 'source' // a new content/sync source
	| 'ai-provider' // a new AI provider assumption
	| 'cloud-backend' // a new cloud backend assumption
	| 'public-extension-surface'; // a new public extension/distribution surface

export const TOP_LEVEL_SCOPE_AXES: readonly TopLevelScopeAxis[] = Object.freeze([
	'platform',
	'source',
	'ai-provider',
	'cloud-backend',
	'public-extension-surface',
]);

/**
 * THE DECLARED IN-SCOPE PLATFORM TARGETS. The closed set of top-level platforms v2 declares (Vision
 * "Decoupled processing, per-platform GUI"; ADR-014 platform profiles). The audit cross-checks the LIVE
 * {@link PLATFORM_PROFILES} registry against this allowlist; a profile not listed here is an unrevised new
 * top-level platform (CON-006). Adding a platform means adding it BOTH to the profile registry AND here,
 * which is exactly the reviewable scope revision.
 */
export const DECLARED_PLATFORM_TARGETS: readonly PlatformProfileId[] = Object.freeze([
	'web',
	'desktop',
	'tablet',
	'mobile',
]);

/**
 * THE DECLARED IN-SCOPE CONTENT SOURCES. The closed set of top-level content/sync sources v2 declares
 * (Vision "Local + Obsidian + Google Docs"; ADR-014 source seams). The audit cross-checks the LIVE
 * {@link REGISTERED_SOURCE_KINDS} registry against this allowlist; a registered source not listed here is
 * an unrevised new top-level source (CON-006).
 */
export const DECLARED_CONTENT_SOURCES: readonly string[] = Object.freeze([
	'local-vault',
	'obsidian-vault',
	'google-docs',
]);

/**
 * THE DECLARED IN-SCOPE WIDGET-AUTHOR DISTRIBUTION SCOPES (CON-003 AC3). A widget's `author` declares WHO
 * authored it and therefore HOW it is distributed. The only in-scope distribution scopes are:
 *   - `system`    — built-in system widgets shipped with the app;
 *   - `user`      — VAULT-LOCAL user-authored widgets;
 *   - `workspace` — WORKSPACE-LOCAL workspace-authored widgets.
 * Any other author scope (a `third-party`, `marketplace`, `published`, `community` author, …) implies a
 * public marketplace / third-party distribution channel and is OUT OF SCOPE. The audit cross-checks every
 * installed widget's author against this allowlist; the predicate {@link isInScopeWidgetDistribution} is the
 * scope-review check the widget-install/review flow calls.
 */
export type InScopeWidgetDistributionScope = 'system' | 'user' | 'workspace';

export const DECLARED_WIDGET_DISTRIBUTION_SCOPES: readonly InScopeWidgetDistributionScope[] =
	Object.freeze(['system', 'user', 'workspace']);

const DECLARED_WIDGET_DISTRIBUTION_SET: ReadonlySet<string> = new Set(
	DECLARED_WIDGET_DISTRIBUTION_SCOPES,
);

/**
 * Author/distribution scope tokens that, if they appear as a widget `author`, signal an OUT-OF-SCOPE public
 * distribution channel (a marketplace / third-party / SDK-compatibility / public-plugin distribution) the
 * scope constraint forbids (CON-003 AC3, CON-006 AC2). The list is intentionally broad (the common ways a
 * widget might claim public distribution) and the match is case-insensitive and ignores `-`/`_`/space, so
 * `thirdParty`, `third-party`, and `Third Party` are all caught. Used by {@link findScopeViolation} to give
 * a precise reason when a proposal/widget claims public distribution.
 */
export const PUBLIC_DISTRIBUTION_SIGNAL_TOKENS: readonly string[] = Object.freeze([
	'marketplace',
	'thirdparty',
	'public',
	'published',
	'community',
	'plugin',
	'pluginstore',
	'store',
	'sdk',
	'extensionstore',
	'distribution',
	'registry',
]);

const PUBLIC_DISTRIBUTION_SIGNAL_SET: ReadonlySet<string> = new Set(PUBLIC_DISTRIBUTION_SIGNAL_TOKENS);

/** Normalize a token for distribution/scope comparison: lower-cased with `-`/`_`/space removed. */
function normalizeToken(token: string): string {
	return token.toLowerCase().replace(/[-_\s]/g, '');
}

/**
 * A scope-review PROPOSAL — the structured description of a requirement/feature/seam under scope review.
 * Every field is optional; a real proposal supplies whichever dimensions it touches. The detector judges
 * the proposal against the declared scope boundaries and returns a fail-closed reason when any dimension is
 * out of scope, UNLESS the proposal carries an explicit scope revision (`scopeRevision`).
 */
export interface ScopeProposal {
	/** A human label for the proposal (requirement id, feature name) — echoed back in the reason. */
	readonly label?: string;
	/** The out-of-scope feature class the proposal would add, if any (CON-003 AC1 / CON-006 AC2). */
	readonly featureClass?: OutOfScopeFeatureClass | string;
	/**
	 * A new top-level axis entry the proposal introduces, e.g. `{ axis: 'platform', value: 'watchos' }`
	 * or `{ axis: 'ai-provider', value: 'acme-llm' }` or `{ axis: 'cloud-backend', value: 'acme-cloud' }`
	 * (CON-006 AC1). The detector blocks it unless the value is already declared in-scope for the axis.
	 */
	readonly newTopLevel?: { readonly axis: TopLevelScopeAxis; readonly value: string };
	/**
	 * The distribution/author scope the proposal claims for a user-authored widget (CON-003 AC3). A scope
	 * outside {@link DECLARED_WIDGET_DISTRIBUTION_SCOPES} — or one carrying a public-distribution signal
	 * token — is out of scope.
	 */
	readonly widgetDistributionScope?: string;
	/**
	 * Whether the extension seam the proposal implements is a PUBLIC plugin API (CON-003 AC2). An extension
	 * seam must support internal system/user widgets only; declaring a public plugin API is out of scope.
	 */
	readonly publicPluginApi?: boolean;
	/**
	 * The explicit scope revision that authorizes an otherwise-out-of-scope proposal. When present and
	 * non-blank, the proposal is treated as a revised (in-scope) change — the "moved to future scope through
	 * explicit revision" / "contracts and requirements updated" escape hatch CON-003/CON-006 require. A
	 * blank/absent revision means NO revision: the proposal is rejected fail closed.
	 */
	readonly scopeRevision?: string;
}

/** A detected scope-boundary violation (CON-003 / CON-006). */
export interface ScopeViolationFinding {
	/** Which constraint + acceptance criterion the violation trips. */
	kind:
		| 'out-of-scope-feature' // CON-003 AC1 / CON-006 AC2 — an explicitly out-of-scope feature class
		| 'public-plugin-api' // CON-003 AC2 — an extension seam exposing a public plugin API
		| 'out-of-scope-widget-distribution' // CON-003 AC3 — a non-local widget distribution channel
		| 'new-top-level-axis'; // CON-006 AC1 — a new platform/source/AI/cloud/extension axis entry
	/** The constraint id this violation descends from. */
	requirementId: 'CON-003' | 'CON-006';
	/** A human-readable, fail-closed rejection reason that names the constraint. */
	message: string;
}

function hasExplicitRevision(proposal: ScopeProposal): boolean {
	return typeof proposal.scopeRevision === 'string' && proposal.scopeRevision.trim() !== '';
}

/**
 * CON-003 + CON-006 — the SCOPE-REVIEW detector, fail closed. Given a proposal, return the FIRST scope
 * violation (a structured rejection reason) or `null` when the proposal stays inside the declared scope
 * boundaries (or carries an explicit scope revision). A `null` is the green signal a scope review turns into
 * "in scope"; a finding is turned into "reject or move to future scope".
 *
 * The escape hatch is `proposal.scopeRevision`: a non-blank revision is the explicit scope/contract
 * revision CON-003/CON-006 require, so a revised proposal is in scope. WITHOUT it, every out-of-scope
 * dimension is blocked:
 *
 *   - an out-of-scope FEATURE CLASS (marketplace, public directory, plugin ecosystem, third-party
 *     compendium, i18n, public wiki) ⇒ `out-of-scope-feature` (CON-003 AC1 / CON-006 AC2);
 *   - a PUBLIC PLUGIN API extension seam ⇒ `public-plugin-api` (CON-003 AC2);
 *   - a WIDGET DISTRIBUTION SCOPE outside vault-local/workspace-local/system, or one carrying a public
 *     distribution signal token ⇒ `out-of-scope-widget-distribution` (CON-003 AC3);
 *   - a NEW TOP-LEVEL AXIS entry (platform/source/AI provider/cloud backend/public extension surface) not
 *     already declared in scope ⇒ `new-top-level-axis` (CON-006 AC1).
 *
 * Pure: a function of the proposal alone.
 */
export function findScopeViolation(proposal: ScopeProposal): ScopeViolationFinding | null {
	const revised = hasExplicitRevision(proposal);
	const label = proposal.label ? `"${proposal.label}" ` : '';

	// CON-003 AC1 / CON-006 AC2 — an explicitly out-of-scope feature class.
	if (proposal.featureClass !== undefined && OUT_OF_SCOPE_FEATURE_SET.has(proposal.featureClass)) {
		if (!revised) {
			const isPluginEcosystem = proposal.featureClass === 'plugin-ecosystem';
			return {
				kind: 'out-of-scope-feature',
				requirementId: isPluginEcosystem ? 'CON-006' : 'CON-003',
				message: `Proposal ${label}adds out-of-scope feature class "${proposal.featureClass}", which is explicitly out of v2 scope. Reject it or move it to future scope through an explicit scope revision (${isPluginEcosystem ? 'CON-006 AC2' : 'CON-003 AC1'}).`,
			};
		}
	}

	// CON-003 AC2 — an extension seam that exposes a public plugin API.
	if (proposal.publicPluginApi === true && !revised) {
		return {
			kind: 'public-plugin-api',
			requirementId: 'CON-003',
			message: `Proposal ${label}declares a PUBLIC plugin API. Extension seams must support internal system/user widgets only and must not imply public plugin APIs (CON-003 AC2).`,
		};
	}

	// CON-003 AC3 — a user-authored widget distribution scope that is not vault-/workspace-local.
	if (proposal.widgetDistributionScope !== undefined && !revised) {
		const finding = judgeWidgetDistribution(proposal.widgetDistributionScope, label);
		if (finding) return finding;
	}

	// CON-006 AC1 — a new top-level platform/source/AI-provider/cloud-backend/extension axis entry.
	if (proposal.newTopLevel !== undefined && !revised) {
		const { axis, value } = proposal.newTopLevel;
		if (!isDeclaredInScopeForAxis(axis, value)) {
			return {
				kind: 'new-top-level-axis',
				requirementId: 'CON-006',
				message: `Proposal ${label}introduces a new top-level ${axis} "${value}" that is not declared in scope. A new platform, source, AI provider, public extension surface, or cloud backend assumption is blocked until the architecture contract and requirements are revised (CON-006 AC1).`,
			};
		}
	}

	return null;
}

/** Judge a widget distribution/author scope (CON-003 AC3); returns a finding when out of scope. */
function judgeWidgetDistribution(
	scope: string,
	label: string,
): ScopeViolationFinding | null {
	const normalized = normalizeToken(scope);
	// A declared in-scope author scope (system/user/workspace) is fine.
	if (DECLARED_WIDGET_DISTRIBUTION_SET.has(normalized)) return null;
	// Otherwise: any public-distribution signal token, or simply an undeclared scope, is out of scope.
	const reason = PUBLIC_DISTRIBUTION_SIGNAL_SET.has(normalized)
		? `claims a public distribution channel ("${scope}")`
		: `uses an undeclared distribution scope ("${scope}")`;
	return {
		kind: 'out-of-scope-widget-distribution',
		requirementId: 'CON-003',
		message: `Proposal ${label}${reason}. A user-authored widget package must stay vault-local or workspace-local and must not imply a public marketplace, SDK compatibility guarantee, or third-party distribution channel (CON-003 AC3).`,
	};
}

/** Whether a candidate value is already declared in scope for a top-level axis (CON-006 AC1). */
export function isDeclaredInScopeForAxis(axis: TopLevelScopeAxis, value: string): boolean {
	const normalized = normalizeToken(value);
	switch (axis) {
		case 'platform':
			return DECLARED_PLATFORM_TARGETS.some((p) => normalizeToken(p) === normalized);
		case 'source':
			return DECLARED_CONTENT_SOURCES.some((s) => normalizeToken(s) === normalized);
		// ADR-014 declares NO concrete AI provider, cloud backend, or public extension surface for v2.
		// Every candidate on these axes is therefore a NEW top-level assumption that needs a revision —
		// fail closed: nothing is in scope until the declared allowlist is widened (an explicit revision).
		case 'ai-provider':
		case 'cloud-backend':
		case 'public-extension-surface':
			return false;
	}
}

/**
 * CON-003 AC3 — the scope-review predicate the widget-install/review flow calls: true only when a widget's
 * author/distribution scope is a DECLARED in-scope scope (system / vault-local user / workspace-local).
 * Fail closed: any undeclared or public-distribution scope is NOT in scope.
 */
export function isInScopeWidgetDistribution(authorScope: string): boolean {
	return findScopeViolation({ widgetDistributionScope: authorScope }) === null;
}

/** A problem the scope-boundary drift audit found (CON-003 / CON-006). */
export interface ScopeBoundaryProblem {
	kind:
		| 'undeclared-platform' // a live platform profile not in DECLARED_PLATFORM_TARGETS (CON-006)
		| 'undeclared-source' // a registered source not in DECLARED_CONTENT_SOURCES (CON-006)
		| 'undeclared-host-permission' // a live host permission outside the declared extension surface (CON-006)
		| 'out-of-scope-widget-author'; // an installed widget claiming public distribution (CON-003 AC3)
	axis: TopLevelScopeAxis | 'widget-distribution';
	/** The offending live value (the profile id / source kind / host permission / widget author). */
	value: string;
	requirementId: 'CON-003' | 'CON-006';
	message: string;
}

/**
 * THE DECLARED IN-SCOPE WIDGET HOST PERMISSIONS (CON-006 public-extension-surface axis). The closed set of
 * host capabilities a widget may ever be granted (Contract 4 widget host permissions; SEC-007). A live host
 * permission outside this set would be a NEW public extension surface and is flagged. Mirrors
 * {@link ALL_HOST_PERMISSIONS} exactly — the audit proves the two never diverge without a revision here.
 */
export const DECLARED_WIDGET_HOST_PERMISSIONS: readonly WidgetHostPermission[] = Object.freeze([
	'filesystem',
	'clipboard',
	'network',
	'source-adapter',
	'asset',
	'external-link',
]);

const DECLARED_HOST_PERMISSION_SET: ReadonlySet<string> = new Set(DECLARED_WIDGET_HOST_PERMISSIONS);

/** Collect the distinct author scopes declared by every installed widget definition. */
function widgetAuthorScopes(state: WidgetPackageState): string[] {
	const scopes = new Set<string>();
	for (const record of Object.values(state.packages)) {
		for (const widget of record.package.widgets as readonly WidgetDefinition[]) {
			scopes.add(widget.author);
		}
	}
	return [...scopes];
}

/**
 * CON-003 + CON-006 — audit the LIVE declared registries against the declared scope allowlists, fail
 * closed. Every top-level scope axis that the codebase actually exposes is cross-checked against this
 * module's declared in-scope allowlist, so the project can NEVER silently grow a new platform, source,
 * host-permission surface, or out-of-scope widget distribution channel without first widening the declared
 * allowlist here (the explicit scope revision CON-003/CON-006 require). For each live registry it proves:
 *
 *   - every {@link PLATFORM_PROFILES} profile id is in {@link DECLARED_PLATFORM_TARGETS} (CON-006);
 *   - every {@link REGISTERED_SOURCE_KINDS} source is in {@link DECLARED_CONTENT_SOURCES} (CON-006);
 *   - every {@link ALL_HOST_PERMISSIONS} entry is in {@link DECLARED_WIDGET_HOST_PERMISSIONS} (the declared
 *     public-extension surface — CON-006);
 *   - every installed widget's `author` is a declared in-scope distribution scope (CON-003 AC3).
 *
 * Returns every problem so a caller can report all at once. Pure: a function of the passed registries
 * (defaulting to the real ones). The meta-test drives this against the real registries (expecting zero
 * problems) and against deliberately violating fixtures (expecting a problem), proving the gate goes GREEN
 * on the real codebase and RED on a scope violation.
 */
export function auditScopeBoundary(
	registries: {
		platformProfiles?: readonly PlatformProfile[];
		sourceKinds?: readonly string[];
		hostPermissions?: readonly string[];
		widgetState?: WidgetPackageState;
	} = {},
): ScopeBoundaryProblem[] {
	const platformProfiles = registries.platformProfiles ?? PLATFORM_PROFILES;
	const sourceKinds = registries.sourceKinds ?? REGISTERED_SOURCE_KINDS;
	const hostPermissions = registries.hostPermissions ?? ALL_HOST_PERMISSIONS;
	const widgetState = registries.widgetState ?? SYSTEM_WIDGET_PACKAGE_STATE;
	const problems: ScopeBoundaryProblem[] = [];

	const declaredPlatforms = new Set(DECLARED_PLATFORM_TARGETS.map(normalizeToken));
	for (const profile of platformProfiles) {
		if (!declaredPlatforms.has(normalizeToken(profile.id))) {
			problems.push({
				kind: 'undeclared-platform',
				axis: 'platform',
				value: profile.id,
				requirementId: 'CON-006',
				message: `Platform profile "${profile.id}" is registered but is not a declared in-scope platform target. A new top-level platform requires an architecture-contract and requirements revision (CON-006).`,
			});
		}
	}

	const declaredSources = new Set(DECLARED_CONTENT_SOURCES.map(normalizeToken));
	for (const kind of sourceKinds) {
		if (!declaredSources.has(normalizeToken(kind))) {
			problems.push({
				kind: 'undeclared-source',
				axis: 'source',
				value: kind,
				requirementId: 'CON-006',
				message: `Content source "${kind}" is registered but is not a declared in-scope source. A new top-level source requires an architecture-contract and requirements revision (CON-006).`,
			});
		}
	}

	for (const permission of hostPermissions) {
		if (!DECLARED_HOST_PERMISSION_SET.has(permission)) {
			problems.push({
				kind: 'undeclared-host-permission',
				axis: 'public-extension-surface',
				value: permission,
				requirementId: 'CON-006',
				message: `Widget host permission "${permission}" is exposed but is not a declared in-scope extension surface. A new public extension surface requires an architecture-contract and requirements revision (CON-006).`,
			});
		}
	}

	for (const author of widgetAuthorScopes(widgetState)) {
		if (!DECLARED_WIDGET_DISTRIBUTION_SET.has(normalizeToken(author))) {
			problems.push({
				kind: 'out-of-scope-widget-author',
				axis: 'widget-distribution',
				value: author,
				requirementId: 'CON-003',
				message: `Installed widget declares author/distribution scope "${author}", which is not vault-local, workspace-local, or system. A user-authored widget must not imply a public marketplace or third-party distribution channel (CON-003 AC3).`,
			});
		}
	}

	return problems;
}

/** A summary of the declared scope boundary, for the CON-003/CON-006 audit/diagnostics surface. */
export interface ScopeBoundarySummary {
	/** The scope-constraint registry version the boundary is pinned to. */
	version: number;
	/** The number of out-of-scope feature classes the catalogue declares. */
	outOfScopeFeatureClassCount: number;
	/** The number of top-level scope axes governed. */
	topLevelAxisCount: number;
	/** The number of declared in-scope platform targets. */
	declaredPlatformCount: number;
	/** The number of declared in-scope content sources. */
	declaredSourceCount: number;
	/** The number of declared in-scope widget distribution scopes. */
	declaredWidgetDistributionCount: number;
	/** True when the live registries pass the full scope-boundary audit (within declared scope). */
	withinScope: boolean;
}

/**
 * Summarize the declared scope boundary: the constraint version, how many out-of-scope classes / axes /
 * declared in-scope entries exist, and whether the live registries pass the full audit. Pure; used by the
 * CON-003/CON-006 meta-test and any governance diagnostic to report the project stays within declared scope.
 */
export function summarizeScopeBoundary(): ScopeBoundarySummary {
	return {
		version: SCOPE_CONSTRAINTS_VERSION,
		outOfScopeFeatureClassCount: OUT_OF_SCOPE_FEATURE_CLASSES.length,
		topLevelAxisCount: TOP_LEVEL_SCOPE_AXES.length,
		declaredPlatformCount: DECLARED_PLATFORM_TARGETS.length,
		declaredSourceCount: DECLARED_CONTENT_SOURCES.length,
		declaredWidgetDistributionCount: DECLARED_WIDGET_DISTRIBUTION_SCOPES.length,
		withinScope: auditScopeBoundary().length === 0,
	};
}
