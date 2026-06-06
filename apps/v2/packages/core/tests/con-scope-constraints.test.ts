import { describe, expect, it } from 'vitest';
import {
	ALL_HOST_PERMISSIONS,
	DECLARED_CONTENT_SOURCES,
	DECLARED_PLATFORM_TARGETS,
	DECLARED_WIDGET_DISTRIBUTION_SCOPES,
	DECLARED_WIDGET_HOST_PERMISSIONS,
	OUT_OF_SCOPE_FEATURE_CLASSES,
	PLATFORM_PROFILES,
	REGISTERED_SOURCE_KINDS,
	SCOPE_CONSTRAINTS_VERSION,
	SYSTEM_WIDGET_PACKAGE_STATE,
	TOP_LEVEL_SCOPE_AXES,
	auditScopeBoundary,
	findScopeViolation,
	isDeclaredInScopeForAxis,
	isInScopeWidgetDistribution,
	summarizeScopeBoundary,
	type PlatformProfile,
	type ScopeBoundaryProblem,
	type WidgetPackageState,
} from '../src';

/**
 * CON-003 + CON-006 — THE SCOPE-BOUNDARY CONSTRAINT GATE. The constraints' statements:
 *
 *   CON-003 — "The system must never introduce community marketplace, public campaign directory, plugin
 *   ecosystem, third-party compendium integration, i18n, or public wiki features into the v2 core
 *   requirements without an explicit scope revision."
 *     AC1 — a proposal adding marketplace/public-directory behavior is rejected or moved to future scope.
 *     AC2 — extension seams support internal system/user widgets only; no public plugin APIs.
 *     AC3 — a user-authored widget package stays vault-/workspace-local; no public marketplace / SDK
 *           guarantee / third-party distribution channel.
 *
 *   CON-006 — "The system must never add a new top-level platform, source, AI provider, public extension
 *   surface, or cloud backend assumption without an explicit architecture-contract and requirements
 *   revision."
 *     AC1 — a new cloud backend / AI provider assumption is blocked until contracts and requirements update.
 *     AC2 — expanding user-authored widgets into a public plugin ecosystem is rejected or moved to future
 *           scope through explicit revision.
 *
 * This file IS the gate. It mirrors the established mechanical-gate meta-tests (CON-004 sustainability gate,
 * SEC-008 regression-gate coverage, PLAT-010 quality-gate registry): the constraint is the single source of
 * truth, and the live declared registries are cross-checked against it so v2 can never silently drift past
 * its declared scope. The adversarial blocks at the bottom prove the gate goes RED on a deliberate scope
 * violation and GREEN on the real codebase.
 */

function kinds(problems: ScopeBoundaryProblem[]): string[] {
	return problems.map((p) => p.kind).sort();
}

describe('CON-003 AC1 — a proposal adding marketplace / public-directory behavior is rejected', () => {
	it('rejects every declared out-of-scope feature class (no revision)', () => {
		for (const featureClass of OUT_OF_SCOPE_FEATURE_CLASSES) {
			const finding = findScopeViolation({ label: `proposal-${featureClass}`, featureClass });
			expect(finding, `"${featureClass}" should be a scope violation`).not.toBeNull();
			expect(finding?.kind).toBe('out-of-scope-feature');
			expect(finding?.message).toMatch(/CON-003 AC1|CON-006 AC2/);
		}
	});

	it('flags a community marketplace with a CON-003 reason', () => {
		const finding = findScopeViolation({ featureClass: 'community-marketplace' });
		expect(finding?.kind).toBe('out-of-scope-feature');
		expect(finding?.requirementId).toBe('CON-003');
	});

	it('flags a public campaign directory / public wiki', () => {
		expect(findScopeViolation({ featureClass: 'public-campaign-directory' })?.kind).toBe(
			'out-of-scope-feature',
		);
		expect(findScopeViolation({ featureClass: 'public-wiki' })?.kind).toBe('out-of-scope-feature');
	});

	it('flags third-party compendium integration and i18n', () => {
		expect(findScopeViolation({ featureClass: 'third-party-compendium-integration' })?.kind).toBe(
			'out-of-scope-feature',
		);
		expect(findScopeViolation({ featureClass: 'i18n-localization' })?.kind).toBe(
			'out-of-scope-feature',
		);
	});

	it('moves an out-of-scope feature to future scope through an EXPLICIT revision (escape hatch)', () => {
		const finding = findScopeViolation({
			featureClass: 'community-marketplace',
			scopeRevision: 'ADR-099 + REQ revision: marketplace approved for a future release',
		});
		expect(finding).toBeNull();
	});

	it('treats a blank revision as NO revision (fail closed)', () => {
		expect(findScopeViolation({ featureClass: 'public-wiki', scopeRevision: '   ' })).not.toBeNull();
	});

	it('passes a proposal that touches no out-of-scope dimension', () => {
		expect(findScopeViolation({ label: 'add a new system widget' })).toBeNull();
	});
});

describe('CON-003 AC2 — extension seams imply no public plugin API', () => {
	it('rejects an extension seam that declares a public plugin API', () => {
		const finding = findScopeViolation({ label: 'widget host seam', publicPluginApi: true });
		expect(finding?.kind).toBe('public-plugin-api');
		expect(finding?.requirementId).toBe('CON-003');
		expect(finding?.message).toMatch(/CON-003 AC2/);
	});

	it('accepts an internal-only extension seam (publicPluginApi false / absent)', () => {
		expect(findScopeViolation({ label: 'internal widget seam', publicPluginApi: false })).toBeNull();
		expect(findScopeViolation({ label: 'internal widget seam' })).toBeNull();
	});

	it('a public plugin API is in scope only through an explicit revision', () => {
		expect(
			findScopeViolation({ publicPluginApi: true, scopeRevision: 'contract + requirements revised' }),
		).toBeNull();
	});
});

describe('CON-003 AC3 — a user-authored widget stays vault-/workspace-local', () => {
	it('accepts the declared in-scope distribution scopes (system / user / workspace)', () => {
		for (const scope of DECLARED_WIDGET_DISTRIBUTION_SCOPES) {
			expect(isInScopeWidgetDistribution(scope), `"${scope}" should be in scope`).toBe(true);
			expect(findScopeViolation({ widgetDistributionScope: scope })).toBeNull();
		}
	});

	it('rejects a public marketplace / third-party / community / published distribution scope', () => {
		for (const scope of ['marketplace', 'third-party', 'community', 'published', 'public-plugin']) {
			const finding = findScopeViolation({ widgetDistributionScope: scope });
			expect(finding?.kind, `"${scope}" should be flagged`).toBe('out-of-scope-widget-distribution');
			expect(finding?.requirementId).toBe('CON-003');
			expect(isInScopeWidgetDistribution(scope)).toBe(false);
		}
	});

	it('is case / separator insensitive on the distribution scope', () => {
		expect(isInScopeWidgetDistribution('WORKSPACE')).toBe(true);
		expect(isInScopeWidgetDistribution('Third_Party')).toBe(false);
		expect(isInScopeWidgetDistribution('Market Place')).toBe(false);
	});

	it('rejects an undeclared (non-public-keyword) distribution scope, fail closed', () => {
		const finding = findScopeViolation({ widgetDistributionScope: 'some-vendor' });
		expect(finding?.kind).toBe('out-of-scope-widget-distribution');
	});

	it('a non-local distribution scope is in scope only through an explicit revision', () => {
		expect(
			findScopeViolation({ widgetDistributionScope: 'marketplace', scopeRevision: 'approved' }),
		).toBeNull();
	});
});

describe('CON-006 AC1 — a new top-level platform/source/AI/cloud axis is blocked until revised', () => {
	it('accepts a value already declared in scope for the platform axis', () => {
		for (const platform of DECLARED_PLATFORM_TARGETS) {
			expect(isDeclaredInScopeForAxis('platform', platform)).toBe(true);
			expect(findScopeViolation({ newTopLevel: { axis: 'platform', value: platform } })).toBeNull();
		}
	});

	it('accepts a value already declared in scope for the source axis', () => {
		for (const source of DECLARED_CONTENT_SOURCES) {
			expect(isDeclaredInScopeForAxis('source', source)).toBe(true);
			expect(findScopeViolation({ newTopLevel: { axis: 'source', value: source } })).toBeNull();
		}
	});

	it('blocks a NEW top-level platform not declared in scope', () => {
		const finding = findScopeViolation({
			label: 'add watchOS',
			newTopLevel: { axis: 'platform', value: 'watchos' },
		});
		expect(finding?.kind).toBe('new-top-level-axis');
		expect(finding?.requirementId).toBe('CON-006');
		expect(finding?.message).toMatch(/CON-006 AC1/);
	});

	it('blocks a NEW top-level content source not declared in scope', () => {
		expect(
			findScopeViolation({ newTopLevel: { axis: 'source', value: 'notion' } })?.kind,
		).toBe('new-top-level-axis');
	});

	it('blocks ANY AI provider assumption (ADR-014 declares none in scope — fail closed)', () => {
		expect(isDeclaredInScopeForAxis('ai-provider', 'acme-llm')).toBe(false);
		const finding = findScopeViolation({
			label: 'assume Acme LLM',
			newTopLevel: { axis: 'ai-provider', value: 'acme-llm' },
		});
		expect(finding?.kind).toBe('new-top-level-axis');
	});

	it('blocks ANY cloud backend assumption (ADR-014 declares none in scope — fail closed)', () => {
		expect(isDeclaredInScopeForAxis('cloud-backend', 'acme-cloud')).toBe(false);
		const finding = findScopeViolation({
			label: 'assume Acme Cloud backend',
			newTopLevel: { axis: 'cloud-backend', value: 'acme-cloud' },
		});
		expect(finding?.kind).toBe('new-top-level-axis');
		expect(finding?.requirementId).toBe('CON-006');
	});

	it('blocks ANY new public extension surface (ADR-014 declares none in scope — fail closed)', () => {
		expect(isDeclaredInScopeForAxis('public-extension-surface', 'plugin-store')).toBe(false);
		expect(
			findScopeViolation({ newTopLevel: { axis: 'public-extension-surface', value: 'plugin-store' } })
				?.kind,
		).toBe('new-top-level-axis');
	});

	it('a new top-level axis is in scope only through an explicit revision', () => {
		expect(
			findScopeViolation({
				newTopLevel: { axis: 'cloud-backend', value: 'acme-cloud' },
				scopeRevision: 'ADR-099 selects Acme Cloud; requirements revised',
			}),
		).toBeNull();
	});
});

describe('CON-006 AC2 — expanding widgets into a public plugin ecosystem is rejected', () => {
	it('rejects a plugin-ecosystem feature class with a CON-006 reason', () => {
		const finding = findScopeViolation({
			label: 'open a public widget plugin ecosystem',
			featureClass: 'plugin-ecosystem',
		});
		expect(finding?.kind).toBe('out-of-scope-feature');
		expect(finding?.requirementId).toBe('CON-006');
		expect(finding?.message).toMatch(/CON-006 AC2/);
	});

	it('a public plugin ecosystem is in scope only through an explicit revision', () => {
		expect(
			findScopeViolation({ featureClass: 'plugin-ecosystem', scopeRevision: 'revised' }),
		).toBeNull();
	});
});

describe('CON-003 + CON-006 — the LIVE registries stay within declared scope (GREEN)', () => {
	it('the real codebase passes the scope-boundary audit with no problems', () => {
		const problems = auditScopeBoundary();
		expect(problems, `scope problems: ${problems.map((p) => p.message).join('; ')}`).toEqual([]);
	});

	it('every registered platform profile is a declared in-scope target', () => {
		for (const profile of PLATFORM_PROFILES) {
			expect(isDeclaredInScopeForAxis('platform', profile.id), `"${profile.id}"`).toBe(true);
		}
	});

	it('every registered content source is a declared in-scope source', () => {
		for (const kind of REGISTERED_SOURCE_KINDS) {
			expect(isDeclaredInScopeForAxis('source', kind), `"${kind}"`).toBe(true);
		}
	});

	it('the declared host-permission allowlist matches the live host-permission surface exactly', () => {
		expect([...DECLARED_WIDGET_HOST_PERMISSIONS].sort()).toEqual([...ALL_HOST_PERMISSIONS].sort());
	});

	it('every installed system widget declares an in-scope (system) author/distribution scope', () => {
		for (const record of Object.values(SYSTEM_WIDGET_PACKAGE_STATE.packages)) {
			for (const widget of record.package.widgets) {
				expect(isInScopeWidgetDistribution(widget.author), `"${widget.author}"`).toBe(true);
			}
		}
	});

	it('summarizes the boundary as within scope', () => {
		const summary = summarizeScopeBoundary();
		expect(summary.withinScope).toBe(true);
		expect(summary.version).toBe(SCOPE_CONSTRAINTS_VERSION);
		expect(summary.outOfScopeFeatureClassCount).toBe(OUT_OF_SCOPE_FEATURE_CLASSES.length);
		expect(summary.topLevelAxisCount).toBe(TOP_LEVEL_SCOPE_AXES.length);
		expect(summary.declaredPlatformCount).toBeGreaterThan(0);
		expect(summary.declaredSourceCount).toBeGreaterThan(0);
	});

	it('exposes a constraint-registry version', () => {
		expect(SCOPE_CONSTRAINTS_VERSION).toBe(1);
	});
});

describe('CON-003 + CON-006 — the gate goes RED on a deliberate scope violation (adversarial)', () => {
	it('RED: an undeclared platform profile is flagged as undeclared-platform (CON-006)', () => {
		const rogueProfile = { ...PLATFORM_PROFILES[0]!, id: 'watchos' } as unknown as PlatformProfile;
		const problems = auditScopeBoundary({ platformProfiles: [rogueProfile] });
		expect(kinds(problems)).toContain('undeclared-platform');
		expect(problems[0]?.requirementId).toBe('CON-006');
	});

	it('RED: an undeclared content source is flagged as undeclared-source (CON-006)', () => {
		const problems = auditScopeBoundary({ sourceKinds: ['local-vault', 'notion'] });
		expect(kinds(problems)).toContain('undeclared-source');
	});

	it('RED: a new widget host permission is flagged as undeclared-host-permission (CON-006)', () => {
		const problems = auditScopeBoundary({
			hostPermissions: [...ALL_HOST_PERMISSIONS, 'raw-vault-file'],
		});
		expect(kinds(problems)).toContain('undeclared-host-permission');
		expect(problems.find((p) => p.kind === 'undeclared-host-permission')?.requirementId).toBe(
			'CON-006',
		);
	});

	it('RED: an installed widget with a public-marketplace author is flagged (CON-003 AC3)', () => {
		const base = Object.values(SYSTEM_WIDGET_PACKAGE_STATE.packages)[0]!;
		const rogueState: WidgetPackageState = {
			schemaVersion: SYSTEM_WIDGET_PACKAGE_STATE.schemaVersion,
			packages: {
				rogue: {
					...base,
					package: {
						...base.package,
						id: 'rogue.marketplace',
						widgets: [{ ...base.package.widgets[0]!, author: 'marketplace' }],
					},
				},
			},
		};
		const problems = auditScopeBoundary({ widgetState: rogueState });
		expect(kinds(problems)).toContain('out-of-scope-widget-author');
		expect(problems.find((p) => p.kind === 'out-of-scope-widget-author')?.requirementId).toBe(
			'CON-003',
		);
	});

	it('GREEN again: a clean fixture (declared values only) passes the audit', () => {
		const problems = auditScopeBoundary({
			platformProfiles: [PLATFORM_PROFILES[0]!],
			sourceKinds: ['local-vault'],
			hostPermissions: ['network'],
			widgetState: SYSTEM_WIDGET_PACKAGE_STATE,
		});
		expect(problems).toEqual([]);
	});

	it('is deterministic — identical violating input yields identical problems', () => {
		const input = { sourceKinds: ['local-vault', 'notion', 'roll20'] };
		expect(auditScopeBoundary(input)).toEqual(auditScopeBoundary(input));
	});
});
