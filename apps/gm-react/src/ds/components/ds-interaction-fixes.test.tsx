// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataTable as RawDataTable } from './data/DataTable.jsx';
import { ConditionBadge as RawConditionBadge } from './condition/ConditionBadge.jsx';
import { LayerRow as RawLayerRow } from './map/LayerRow.jsx';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every defaultless prop as required.
// Re-type the imports as open prop bags rather than restating each component's contract.
type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const DataTable = RawDataTable as React.ComponentType<DsProps>;
const ConditionBadge = RawConditionBadge as React.ComponentType<DsProps>;
const LayerRow = RawLayerRow as React.ComponentType<DsProps>;

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
