// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DND5E_SYSTEM_PACKAGE, GENERIC_SYSTEM_PACKAGE } from '@dndtools/core';
import { ConditionTracker, SystemProvider } from '../ds';

/**
 * RC-SYS-2.3 — the design system's condition surfaces read the ACTIVE system package. A package's
 * badges keep a DISTINCT icon shape each (the non-colour cue, A11Y-011), and a package that declares
 * no conditions hides the add affordance behind an honest note instead of a dead control.
 */

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const text = () => container.textContent ?? '';
const addButton = () => container.querySelector('button[aria-label="Add condition"]');

describe('RC-SYS-2.3 conditions come from the active package', () => {
	it('labels a badge from the ACTIVE package, not from the built-in 5e table', () => {
		act(() => {
			root.render(
				<SystemProvider conditions={GENERIC_SYSTEM_PACKAGE.conditions}>
					<ConditionTracker entries={['hindered']} />
				</SystemProvider>,
			);
		});
		expect(text()).toContain('Hindered');
	});

	it('keeps a distinct icon shape per condition in each package', () => {
		for (const pkg of [DND5E_SYSTEM_PACKAGE, GENERIC_SYSTEM_PACKAGE]) {
			act(() => {
				root.render(
					<SystemProvider conditions={pkg.conditions}>
						<ConditionTracker entries={pkg.conditions.map((c) => c.key)} addable={false} />
					</SystemProvider>,
				);
			});
			// Lucide stamps the glyph name into the svg class, so identical shapes collide here — which
			// is also how an icon name missing from the registry (it falls back to a square) is caught.
			const icons = Array.from(container.querySelectorAll('svg')).map((svg) =>
				svg.getAttribute('class'),
			);
			expect(icons).toHaveLength(pkg.conditions.length);
			expect(new Set(icons).size).toBe(icons.length);
		}
	});

	it('hides the add affordance with an honest note when the package has no conditions', () => {
		act(() => {
			root.render(
				<SystemProvider conditions={[]}>
					<ConditionTracker entries={[]} />
				</SystemProvider>,
			);
		});
		expect(addButton()).toBeNull();
		expect(text()).toContain('This system has no conditions.');
	});

	it('still renders a leftover key from another package, so it can be seen and removed', () => {
		act(() => {
			root.render(
				<SystemProvider conditions={GENERIC_SYSTEM_PACKAGE.conditions}>
					<ConditionTracker entries={['poisoned']} onRemove={() => {}} />
				</SystemProvider>,
			);
		});
		// The default table still names it, and the clear affordance is present.
		expect(text()).toContain('Poisoned');
		expect(container.querySelector('button[aria-label="Clear Poisoned"]')).not.toBeNull();
	});
});
