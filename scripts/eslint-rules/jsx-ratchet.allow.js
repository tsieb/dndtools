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

export const jsxRatchet = [
	{
		rule: '@typescript-eslint/no-unused-expressions',
		// All of these are the legacy `fn && fn()` / `cond && setState(x)` expression-statement idiom.
		// The fix is `fn?.()` / an `if`, done file by file (Dialog.jsx and Sheet.jsx already were).
		files: [
			'apps/gm-react/src/ds/components/command/CommandPalette.jsx',
			'apps/gm-react/src/ds/components/core/Tabs.jsx',
			'apps/gm-react/src/ds/components/forms/Checkbox.jsx',
			'apps/gm-react/src/ds/components/forms/SegmentedControl.jsx',
			'apps/gm-react/src/ds/components/map/GenerationPanel.jsx',
			'apps/gm-react/src/ds/components/map/ImportWizard.jsx',
			'apps/gm-react/src/ds/components/map/LayerPanel.jsx',
			'apps/gm-react/src/ds/components/map/LayerRow.jsx',
			'apps/gm-react/src/ds/components/map/MapCreationForm.jsx',
			'apps/gm-react/src/ds/components/map/Minimap.jsx',
		],
	},
	{
		rule: '@typescript-eslint/no-unused-vars',
		files: ['apps/gm-react/src/ds/components/core/Breadcrumb.jsx'],
	},
	{
		// A local named `Infinity` shadows the global; RC-DSN-3.2 owns Icon.jsx.
		rule: 'no-shadow-restricted-names',
		files: ['apps/gm-react/src/ds/components/core/Icon.jsx'],
	},
];
