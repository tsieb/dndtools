// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { Stepper as RawStepper } from './Stepper.jsx';
const Stepper = RawStepper as React.ComponentType<Record<string, unknown>>;

describe('Stepper', () => {
	it.each([
		['horizontal', 1, 'Two', 'row'],
		['vertical', 99, 'Three', 'column'],
		['horizontal', -1, 'One', 'row'],
	])('renders %s progress at %s', (orientation, current, label, direction) => {
		const el = document.createElement('div');
		const root = createRoot(el);
		act(() =>
			root.render(
				<Stepper steps={['One', 'Two', 'Three']} current={current} orientation={orientation} />,
			),
		);
		expect(el.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
		expect(el.querySelector('[aria-current="step"]')?.textContent).toContain(label);
		expect(el.querySelector('ol')?.style.flexDirection).toBe(direction);
		act(() => root.unmount());
	});
});
