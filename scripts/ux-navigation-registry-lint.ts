import { validateUxNavigationRegistry, UX_NAV_REGISTRY_PATH } from './lib/ux-navigation-registry.ts';

/**
 * CLI gate for the UX navigation/route registry contract.
 *
 * Fails closed when docs/planning/v2/ux/navigation-registry.yaml drifts from its structural
 * invariants or from the functional v2 canonical registry. Run with:
 *   pnpm lint:nav-registry
 *   pnpm exec tsx scripts/ux-navigation-registry-lint.ts
 */
function main(): void {
	const problems = validateUxNavigationRegistry();
	if (problems.length === 0) {
		console.log(`UX navigation registry lint passed (${UX_NAV_REGISTRY_PATH}).`);
		return;
	}
	console.error(
		`UX navigation registry lint failed (${problems.length} issue${problems.length === 1 ? '' : 's'}):`,
	);
	for (const problem of problems) {
		console.error(`- ${problem}`);
	}
	process.exit(1);
}

main();
