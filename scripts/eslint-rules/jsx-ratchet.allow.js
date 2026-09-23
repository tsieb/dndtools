/**
 * RC-UX-2.3 ratchet for `.jsx` sources entering lint coverage.
 *
 * The design system's `.jsx` files were outside ESLint entirely until the tabindex gate needed
 * them. Rather than silence the base rules for every `.jsx` file — which would hide the backlog and
 * leave new `.jsx` files linted by a single rule — the recommended sets stay ON and the 15
 * violations that already existed are listed here, per rule, per file.
 *
 * This list may only SHRINK. A new `.jsx` file gets full coverage; a fixed file comes off the list.
 * Re-measure with `pnpm exec eslint . --no-cache` after removing an entry.
 */

// RC-DSN-2.1 converted every design-system `.jsx` file to `.tsx` and fixed the listed violations,
// so the ratchet is empty. Keep it that way: a new `.jsx` file gets full coverage.
export const jsxRatchet = [];
