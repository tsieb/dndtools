// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Button as RawButton } from './core/Button.jsx';
import { DataTable as RawDataTable } from './data/DataTable.jsx';
import { ConditionBadge as RawConditionBadge } from './condition/ConditionBadge.jsx';
import { LayerRow as RawLayerRow } from './map/LayerRow.jsx';
import { IconButton as RawIconButton } from './core/IconButton.jsx';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every defaultless prop as required.
// Re-type the imports as open prop bags rather than restating each component's contract.
type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const Button = RawButton as React.ComponentType<DsProps>;
const DataTable = RawDataTable as React.ComponentType<DsProps>;
const ConditionBadge = RawConditionBadge as React.ComponentType<DsProps>;
const LayerRow = RawLayerRow as React.ComponentType<DsProps>;
const IconButton = RawIconButton as React.ComponentType<DsProps>;

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

describe('DataTable gets its own horizontal scroll port', () => {
	// Cells default to `white-space: nowrap`, so a wide table (Settings → "Active grants" is six
	// columns including a Revoke button) pushed past a 393px phone and widened the whole page. In this
	// repo a page-level overflow also shifts `.app-main` and breaks unrelated e2e specs' hit-testing,
	// so the scroll port belongs on the primitive rather than on each call site.
	it('wraps the table in an overflow-x:auto element that cannot widen its parent', () => {
		act(() => {
			root.render(
				<DataTable
					columns={[
						{ key: 'a', header: 'A' },
						{ key: 'b', header: 'B' },
					]}
					rows={[{ a: '1', b: '2' }]}
				/>,
			);
		});
		const table = container.querySelector('table');
		expect(table).not.toBeNull();
		const port = table!.parentElement!;
		expect(port.tagName).toBe('DIV');
		expect(port.style.overflowX).toBe('auto');
		expect(port.style.maxWidth).toBe('100%');
	});

	it('still renders the empty row inside the port', () => {
		act(() => {
			root.render(
				<DataTable columns={[{ key: 'a', header: 'A' }]} rows={[]} empty="Nothing here yet." />,
			);
		});
		expect(container.textContent).toContain('Nothing here yet.');
		expect(container.querySelector('table')!.parentElement!.style.overflowX).toBe('auto');
	});
});

describe('ConditionBadge remove target meets WCAG 2.5.8', () => {
	// 14x14 px, and in the Session combat tracker these sit in a WRAPPING row of other tiny targets,
	// so clearing "Poisoned" from a combatant mid-fight was a 14px tap next to other 14px taps.
	it('gives the clear button a >=24px hit box', () => {
		act(() => {
			root.render(<ConditionBadge condition="poisoned" compact onRemove={() => {}} />);
		});
		const btn = container.querySelector('button');
		expect(btn).not.toBeNull();
		expect(parseFloat(btn!.style.minWidth)).toBeGreaterThanOrEqual(24);
		expect(parseFloat(btn!.style.minHeight)).toBeGreaterThanOrEqual(24);
	});

	it('keeps naming what it clears', () => {
		act(() => {
			root.render(<ConditionBadge condition="poisoned" onRemove={() => {}} />);
		});
		expect(container.querySelector('button')!.getAttribute('aria-label')).toMatch(/^Clear /);
	});
});

describe('LayerRow is reachable and visible to the keyboard', () => {
	// The row is `role="listitem" tabIndex={0}`, but an inline `outline:'none'` beat the global
	// `:focus-visible` ring in base.css — so a keyboard user arrowing the layer list, which decides
	// where every drawing tool paints, could not see which layer they were on.
	it('does not pin outline:none inline, so the global focus ring can apply', () => {
		act(() => {
			root.render(
				<LayerRow
					layer={{
						name: 'Fog',
						type: 'dm',
						opacity: 100,
						dmDisplay: true,
						visibility: 'dm-only',
						locked: false,
					}}
				/>,
			);
		});
		const row = container.querySelector('[role="listitem"]') as HTMLElement;
		expect(row).not.toBeNull();
		expect(row.tabIndex).toBe(0);
		expect(row.style.outline).toBe('');
	});
});

describe('Button separates hard-disabled from explained-unavailable', () => {
	// `disabled` removes the button from the tab order, so a call site that had written a careful
	// "why is this unavailable" into `title`/`aria-label` (ProjectionControl's Go live) had that
	// explanation silently swallowed — the control read as a dead button. `aria-disabled` is the
	// soft form: still focusable and still announced, but inactive and visibly unavailable.
	function render(node: React.ReactNode): HTMLButtonElement {
		act(() => root.render(node));
		return container.querySelector('button') as HTMLButtonElement;
	}

	it('keeps an aria-disabled button focusable and announced', () => {
		const button = render(
			<Button aria-disabled aria-label="Go live (unavailable — exit player preview first)">
				Go live
			</Button>,
		);
		expect(button.disabled).toBe(false);
		expect(button.getAttribute('aria-disabled')).toBe('true');
		expect(button.getAttribute('aria-label')).toContain('unavailable');
		button.focus();
		expect(document.activeElement).toBe(button);
	});

	it('swallows activation of an aria-disabled button', () => {
		let clicks = 0;
		const button = render(
			<Button aria-disabled onClick={() => { clicks += 1; }}>
				Go live
			</Button>,
		);
		act(() => button.click());
		expect(clicks).toBe(0);
	});

	it('still fires once the same button becomes available', () => {
		let clicks = 0;
		const onClick = () => { clicks += 1; };
		render(<Button aria-disabled onClick={onClick}>Go live</Button>);
		const button = render(<Button onClick={onClick}>Go live</Button>);
		act(() => button.click());
		expect(clicks).toBe(1);
	});

	it('renders an aria-disabled button as unavailable, not as ordinary', () => {
		const button = render(<Button aria-disabled>Go live</Button>);
		expect(button.style.opacity).toBe('0.5');
		expect(button.style.cursor).toBe('not-allowed');
	});
});

describe('IconButton separates hard-disabled from explained-unavailable', () => {
	// An icon-only control has nowhere to put its explanation except `label` — which `disabled` then
	// makes unreachable. So the call sites that needed to say "you can't do this yet" instead guarded
	// inside `onClick` and rendered a button that looked, hovered and focused exactly like a live one
	// and silently did nothing. CharBuilder's point-buy +/- was the worst instance: at 0 points left
	// the + button was indistinguishable from a working one.
	function render(node: React.ReactNode): HTMLButtonElement {
		act(() => root.render(node));
		return container.querySelector('button') as HTMLButtonElement;
	}

	it('keeps an aria-disabled icon button focusable, named and visibly unavailable', () => {
		const button = render(
			<IconButton icon="add" label="Raise str — not enough points left" aria-disabled />,
		);
		expect(button.disabled).toBe(false);
		expect(button.getAttribute('aria-disabled')).toBe('true');
		expect(button.getAttribute('aria-label')).toContain('not enough points left');
		expect(button.style.opacity).toBe('0.5');
		expect(button.style.cursor).toBe('not-allowed');
		button.focus();
		expect(document.activeElement).toBe(button);
	});

	it('swallows activation while aria-disabled and resumes once available', () => {
		let clicks = 0;
		const onClick = () => {
			clicks += 1;
		};
		const blocked = render(<IconButton icon="add" label="Raise str" aria-disabled onClick={onClick} />);
		act(() => blocked.click());
		expect(clicks).toBe(0);

		const live = render(<IconButton icon="add" label="Raise str" onClick={onClick} />);
		act(() => live.click());
		expect(clicks).toBe(1);
	});

	it('gives the outline variant pointer feedback, not just ghost', () => {
		// No global `button:hover` rule exists in this app and inline styles cannot express `:hover`,
		// so the JS handlers are the only feedback there is. `outline` is the dense-stepper variant
		// (ability scores, the NumSteppers) and the guard used to let only `ghost` through.
		const button = render(<IconButton icon="add" label="Raise str" variant="outline" />);
		const resting = button.style.background;
		act(() => button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
		expect(button.style.background).not.toBe(resting);
		act(() => button.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
		expect(button.style.background).toBe(resting);
	});

	it('does not light up on hover while unavailable', () => {
		const button = render(<IconButton icon="add" label="Raise str" variant="outline" aria-disabled />);
		const resting = button.style.background;
		act(() => button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
		expect(button.style.background).toBe(resting);
	});
});
