/**
 * RC-SYS-3.5 — the STARTER LIBRARY: sample system packages that ship with the build as DATA but are
 * NOT built in.
 *
 * A built-in package (`../dnd5e`, `../generic`) is re-seeded from code on every hydrate and can
 * never be edited. A starter-library sample is the opposite: it is offered for INSTALL, it enters
 * the vault through the ordinary `system.define` command, and from that moment it is an ordinary
 * DM-authored package — forkable, editable, deletable. That is the point of it. Pathfinder 2e is
 * written entirely in the declarative `SystemPackage` vocabulary, with no privileged code path
 * anywhere, so it proves the contract holds for a system nobody hard-coded: a three-action turn
 * economy instead of initiative, PF2e's condition list with its stacking values, and twenty levels
 * of flat 1,000-XP advancement.
 *
 * Because a sample is installed rather than built in, its id lives in the `custom:` namespace that
 * `system.define` confines authoring to (`commands/system-package.ts`'s
 * `CUSTOM_SYSTEM_PACKAGE_ID_PATTERN`). Nothing here is loaded into `SystemsState` automatically.
 */
import type { SystemPackage } from '../../state/system-package';
import pf2eJson from './pf2e.json';

/**
 * The Pathfinder 2e sample, read straight from its JSON so the shipped file IS the package — there
 * is no second, code-shaped copy that could drift from it.
 *
 * The cast is what a JSON import always needs: TypeScript widens `"pool"` to `string`, which no
 * union type can accept. It is not a claim that the file is well-formed — `tests/rc-sys-3-5-pf2e-
 * sample.test.ts` parses it through the same `.strict()` `systemPackageSchema` the vault enforces,
 * so a malformed edit fails the build's tests rather than reaching a DM.
 */
export const PF2E_SAMPLE_SYSTEM_PACKAGE = pf2eJson as unknown as SystemPackage;

/** The id the Pathfinder 2e sample installs under. */
export const PF2E_SAMPLE_SYSTEM_PACKAGE_ID: string = PF2E_SAMPLE_SYSTEM_PACKAGE.id;

/** Every sample offered for install, in the order a picker should list them. */
export const STARTER_SYSTEM_LIBRARY: readonly SystemPackage[] = Object.freeze([
	PF2E_SAMPLE_SYSTEM_PACKAGE,
]);

/** The starter-library sample with this id, or `undefined`. Pure. */
export function starterSystemPackage(packageId: string): SystemPackage | undefined {
	return STARTER_SYSTEM_LIBRARY.find((pkg) => pkg.id === packageId);
}
