// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Button as RawButton } from './core/Button.jsx';
import { DataTable as RawDataTable } from './data/DataTable.jsx';
import { ConditionBadge as RawConditionBadge } from './condition/ConditionBadge.jsx';
import { LayerRow as RawLayerRow } from './map/LayerRow.jsx';
import { IconButton as RawIconButton } from './core/IconButton.jsx';
import { Input as RawInput, Textarea as RawTextarea } from './forms/Input.jsx';
import { Select as RawSelect } from './forms/Select.jsx';
import { Popover as RawPopover, popoverShiftX } from './core/Popover.jsx';
import { ProgressMeter as RawProgressMeter } from './system/ProgressMeter.jsx';
import { Checkbox as RawCheckbox } from './forms/Checkbox.jsx';
import { Dialog as RawDialog } from './overlay/Dialog.jsx';
import { Toaster, ToastViewport as RawToastViewport } from './overlay/Toast.jsx';
import { Sheet as RawSheet } from './overlay/Sheet.jsx';
import { Slider as RawSlider } from './forms/Slider.jsx';
import { VisibilityChip as RawVisibilityChip } from './feedback/VisibilityChip.jsx';
import { DefinitionList as RawDefinitionList } from './data/DefinitionList.jsx';
import { MapCreationForm as RawMapCreationForm } from './map/MapCreationForm.jsx';
import { ConditionTracker as RawConditionTracker } from './condition/ConditionTracker.jsx';
import { Avatar as RawAvatar } from './core/Avatar.jsx';
import { QuestCard as RawQuestCard } from './campaign/QuestCard.jsx';
import { Tabs as RawTabs } from './core/Tabs.jsx';
import { Minimap as RawMinimap } from './map/Minimap.jsx';
import { SpellSlots as RawSpellSlots } from './spell/SpellSlots.jsx';
import { Field as RawField } from './forms/Field.jsx';
import { EmptyState as RawEmptyState } from './system/EmptyState.jsx';
import { SegmentedControl as RawSegmentedControl } from './forms/SegmentedControl.jsx';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every defaultless prop as required.
// Re-type the imports as open prop bags rather than restating each component's contract.
type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const Button = RawButton as React.ComponentType<DsProps>;
const DataTable = RawDataTable as React.ComponentType<DsProps>;
const ConditionBadge = RawConditionBadge as React.ComponentType<DsProps>;
const LayerRow = RawLayerRow as React.ComponentType<DsProps>;
const IconButton = RawIconButton as React.ComponentType<DsProps>;
const Input = RawInput as React.ComponentType<DsProps>;
const Textarea = RawTextarea as React.ComponentType<DsProps>;
const Select = RawSelect as React.ComponentType<DsProps>;
const Popover = RawPopover as React.ComponentType<DsProps>;
const Dialog = RawDialog as React.ComponentType<DsProps>;
const ToastViewport = RawToastViewport as React.ComponentType<DsProps>;
const Sheet = RawSheet as React.ComponentType<DsProps>;
const Slider = RawSlider as React.ComponentType<DsProps>;
const VisibilityChip = RawVisibilityChip as React.ComponentType<DsProps>;
const DefinitionList = RawDefinitionList as React.ComponentType<DsProps>;
const MapCreationForm = RawMapCreationForm as React.ComponentType<DsProps>;
const ConditionTracker = RawConditionTracker as React.ComponentType<DsProps>;
const Avatar = RawAvatar as React.ComponentType<DsProps>;
const QuestCard = RawQuestCard as React.ComponentType<DsProps>;
const Tabs = RawTabs as React.ComponentType<DsProps>;
const Minimap = RawMinimap as React.ComponentType<DsProps>;
const ProgressMeter = RawProgressMeter as React.ComponentType<DsProps>;
const EmptyState = RawEmptyState as React.ComponentType<DsProps>;
const SegmentedControl = RawSegmentedControl as React.ComponentType<DsProps>;
const Checkbox = RawCheckbox as React.ComponentType<DsProps>;
const SpellSlots = RawSpellSlots as React.ComponentType<DsProps>;
const Field = RawField as React.ComponentType<DsProps>;

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
			<Button
				aria-disabled
				onClick={() => {
					clicks += 1;
				}}
			>
				Go live
			</Button>,
		);
		act(() => button.click());
		expect(clicks).toBe(0);
	});

	it('still fires once the same button becomes available', () => {
		let clicks = 0;
		const onClick = () => {
			clicks += 1;
		};
		render(
			<Button aria-disabled onClick={onClick}>
				Go live
			</Button>,
		);
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
		const blocked = render(
			<IconButton icon="add" label="Raise str" aria-disabled onClick={onClick} />,
		);
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
		const button = render(
			<IconButton icon="add" label="Raise str" variant="outline" aria-disabled />,
		);
		const resting = button.style.background;
		act(() => button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
		expect(button.style.background).toBe(resting);
	});
});

describe('form fields keep their focus ring when the call site also listens for blur', () => {
	// Input/Textarea/Select paint their focus ring with inline styles set by onFocus/onBlur, and they
	// spread `{...rest}` AFTER those handlers. Commit-on-blur is the house pattern here (SceneEditor's
	// metadata fields, Characters' name field, EncounterBuilder's CR drafts, the map Inspector), and
	// every one of those call sites was therefore REPLACING the ring reset: the field kept its focus
	// border and 3px glow after focus moved away, so several fields looked focused at once.
	function mount(node: React.ReactNode, selector: string): HTMLElement {
		act(() => root.render(node));
		return container.querySelector(selector) as HTMLElement;
	}

	function ringCycle(field: HTMLElement) {
		const resting = field.style.boxShadow;
		act(() => field.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
		const focused = field.style.boxShadow;
		act(() => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
		return { resting, focused, blurred: field.style.boxShadow };
	}

	it('resets the ring on blur and still calls the caller onBlur — Input', () => {
		let commits = 0;
		const field = mount(
			<Input value="Sunless Citadel" onChange={() => {}} onBlur={() => (commits += 1)} />,
			'input',
		);
		const { resting, focused, blurred } = ringCycle(field);
		expect(focused).not.toBe(resting);
		expect(blurred).toBe('none');
		expect(commits).toBe(1);
	});

	it('resets the ring on blur and still calls the caller onBlur — Textarea', () => {
		let commits = 0;
		const field = mount(
			<Textarea value="" onChange={() => {}} onBlur={() => (commits += 1)} />,
			'textarea',
		);
		const { focused, blurred } = ringCycle(field);
		expect(focused).not.toBe('none');
		expect(blurred).toBe('none');
		expect(commits).toBe(1);
	});

	it('resets the ring on blur and still calls the caller onBlur — Select', () => {
		let commits = 0;
		const field = mount(
			<Select options={['a', 'b']} value="a" onChange={() => {}} onBlur={() => (commits += 1)} />,
			'select',
		);
		const { focused, blurred } = ringCycle(field);
		expect(focused).not.toBe('none');
		expect(blurred).toBe('none');
		expect(commits).toBe(1);
	});

	it('still runs a caller onFocus alongside the ring', () => {
		let focuses = 0;
		const field = mount(
			<Input value="" onChange={() => {}} onFocus={() => (focuses += 1)} />,
			'input',
		);
		act(() => field.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
		expect(focuses).toBe(1);
		expect(field.style.boxShadow).not.toBe('none');
	});
});

describe('Toast announces through a permanent live region', () => {
	// A live region only announces when it is ALREADY in the DOM and its CONTENTS change. Each stacked
	// row used to carry its own `role="status"`, so the host and its text were inserted in a single
	// mutation — which screen readers routinely drop. The app's only confirmation channel was silent.
	afterEach(() => act(() => Toaster.clear()));

	it('hosts an empty polite region before any toast exists', () => {
		act(() => root.render(<ToastViewport />));
		const polite = container.querySelector('[role="status"]');
		expect(polite, 'the polite host must pre-exist for a change to be announced').not.toBeNull();
		expect(polite!.getAttribute('aria-live')).toBe('polite');
		expect(polite!.textContent).toBe('');
		// And NO empty assertive region: `role="alert"` announces on insertion, and a permanent empty
		// one would make every bare `getByRole('alert')` in the app ambiguous.
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	it('routes a success message INTO the pre-existing polite region, not a fresh row role', () => {
		act(() => root.render(<ToastViewport />));
		act(() => {
			Toaster.success('Layout saved.');
		});
		const polite = container.querySelector('[role="status"]')!;
		expect(polite.textContent).toContain('Layout saved.');
		// One live region, and the message text appears exactly once — the region WRAPS the row rather
		// than mirroring its copy, so `getByText` on a toast message stays unambiguous.
		expect(container.querySelectorAll('[role="status"]').length).toBe(1);
		expect(container.querySelectorAll('[role="alert"]').length).toBe(0);
		expect(container.textContent!.match(/Layout saved\./g)!.length).toBe(1);
	});

	it('routes an error into an assertive region and leaves the polite one empty', () => {
		act(() => root.render(<ToastViewport />));
		act(() => {
			Toaster.error('Export failed.');
		});
		expect(container.querySelector('[role="alert"]')!.textContent).toContain('Export failed.');
		expect(container.querySelector('[role="status"]')!.textContent).toBe('');
		expect(container.textContent!.match(/Export failed\./g)!.length).toBe(1);
	});
});

describe('Toast auto-dismiss can be held open (WCAG 2.2.1)', () => {
	afterEach(() => {
		act(() => Toaster.clear());
		Toaster.setPaused('hover', false);
		Toaster.setPaused('focus', false);
	});

	const bodyText = () => container.textContent ?? '';

	it('keeps a toast that carries an action until it is taken or dismissed', async () => {
		act(() => root.render(<ToastViewport />));
		act(() => {
			Toaster.success('Note deleted.', { action: 'Undo', onAction: () => {} });
		});
		expect(bodyText()).toContain('Undo');
		// The default 4500ms would have taken the Undo away from under the user's focus. Eight screens
		// put this project's destructive-op undo inside a toast.
		await act(async () => {
			await new Promise((r) => setTimeout(r, 60));
		});
		expect(bodyText()).toContain('Undo');
	});

	it('holds a plain toast open while the stack has keyboard focus even after the mouse leaves', async () => {
		act(() => root.render(<ToastViewport />));
		act(() => {
			Toaster.success('Saved.', { duration: 30 });
		});
		// Hover AND focus need separate flags: with one shared boolean, moving the mouse away while the
		// control still held focus cleared the hold and the toast vanished anyway.
		Toaster.setPaused('hover', true);
		Toaster.setPaused('focus', true);
		Toaster.setPaused('hover', false);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 120));
		});
		expect(bodyText(), 'focus alone must still hold the toast open').toContain('Saved.');

		// Releasing the last hold re-arms the timer. A resumed timer is floored at 600ms so a toast
		// never vanishes the instant the pointer leaves it.
		Toaster.setPaused('focus', false);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 900));
		});
		expect(bodyText()).not.toContain('Saved.');
	});
});

describe('Popover keeps the keyboard user oriented', () => {
	// Focus was pushed into the panel on open and NEVER restored, so Escape / an outside pointerdown /
	// a plain unmount all dropped it to <body>. And the focus query ran in DOM order while the header
	// (which holds Close) renders before `children`, so every popover with `onClose` opened focused on
	// Close — one Tab from leaving, never on the control the popover exists to offer.
	it('focuses the first control in the BODY, not the header Close button', async () => {
		act(() =>
			root.render(
				<Popover open title="Opacity" onClose={() => {}}>
					<button type="button">Reset</button>
				</Popover>,
			),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 10));
		});
		expect((document.activeElement as HTMLElement)?.textContent).toBe('Reset');
	});

	it('returns focus to the opener when it closes', async () => {
		const opener = document.createElement('button');
		opener.textContent = 'Open';
		document.body.appendChild(opener);
		opener.focus();
		expect(document.activeElement).toBe(opener);

		act(() =>
			root.render(
				<Popover open title="Opacity" onClose={() => {}}>
					<button type="button">Reset</button>
				</Popover>,
			),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 10));
		});
		expect(document.activeElement).not.toBe(opener);

		act(() => root.render(<Popover open={false} title="Opacity" onClose={() => {}} />));
		expect(document.activeElement).toBe(opener);
		opener.remove();
	});
});

describe('Dialog can refuse the stray backdrop click without becoming inescapable', () => {
	/** The scrim is the Dialog's outermost element; a click on the panel targets a descendant. */
	function backdrop(): HTMLElement {
		return container.firstElementChild as HTMLElement;
	}
	function mouseDownOn(el: HTMLElement) {
		act(() => {
			el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		});
	}

	it('still closes on a backdrop click by default', () => {
		let closed = 0;
		act(() =>
			root.render(
				<Dialog open title="Build encounter" onClose={() => (closed += 1)}>
					<p>body</p>
				</Dialog>,
			),
		);
		mouseDownOn(backdrop());
		expect(closed, 'every existing call site must keep its current behaviour').toBe(1);
	});

	// A composed roster is real work with no draft persistence and no undo, and the dialog is big
	// enough that the scrim is an easy miss-click target. `dismissible={false}` was not the answer:
	// it also removes Escape AND the header Close, which would make the dialog worse, not better.
	it('backdropDismissible={false} blocks the outside click but keeps Escape and Close', () => {
		let closed = 0;
		act(() =>
			root.render(
				<Dialog
					open
					title="Build encounter"
					backdropDismissible={false}
					onClose={() => (closed += 1)}
				>
					<p>body</p>
				</Dialog>,
			),
		);

		mouseDownOn(backdrop());
		expect(closed, 'a mis-aimed scrim click must not discard the composed work').toBe(0);

		// Escape is a deliberate act and must still work.
		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(closed).toBe(1);

		// So must the header Close button — `dismissible={false}` would have removed it entirely.
		const close = Array.from(container.querySelectorAll('button')).find((b) =>
			(b.getAttribute('aria-label') ?? '').toLowerCase().includes('close'),
		);
		expect(close, 'the header Close button must still be rendered').toBeTruthy();
		act(() => close!.click());
		expect(closed).toBe(2);
	});
});

describe('Slider keeps a visible focus ring and a reachable thumb', () => {
	// `.dnds-range { outline: none }` and `:focus-visible { outline: … }` in base.css have EQUAL
	// specificity (0,1,0), and `ensureStyles()` appends its <style> to document.head at first render —
	// so the later source order won, killing the app-wide focus ring on every range input. The
	// replacement was `box-shadow: 0 0 0 3px var(--color-interactive-selected)`, a 16%-alpha selection
	// wash that is ~1.4:1 against the surface: WCAG 2.4.11 wants 3:1. Nine live sliders, including the
	// audio mixer and every map generation parameter.
	const sliderCss = () => {
		act(() => {
			root.render(<Slider value={50} aria-label="Volume" />);
		});
		const style = document.head.querySelector('style[data-dnds="slider"]');
		expect(style, 'Slider must inject its stylesheet').toBeTruthy();
		return style!.textContent ?? '';
	};

	it('does not suppress the global :focus-visible outline', () => {
		const css = sliderCss();
		const base = css.slice(css.indexOf('.dnds-range{'), css.indexOf('.dnds-range:focus-visible'));
		expect(base).not.toContain('outline:none');
	});

	it('paints its focus state with the focus-ring tokens, not the selection wash', () => {
		const css = sliderCss();
		const focus = css.slice(css.indexOf('.dnds-range:focus-visible'));
		const rule = focus.slice(0, focus.indexOf('}'));
		expect(rule).toContain('--focus-ring-color');
		expect(rule).not.toContain('--color-interactive-selected');
	});

	it('gives the drag thumb a 24px target in both engines (WCAG 2.5.8)', () => {
		const css = sliderCss();
		for (const engine of ['::-webkit-slider-thumb', '::-moz-range-thumb']) {
			const at = css.indexOf(engine);
			expect(at, `${engine} rule must exist`).toBeGreaterThan(-1);
			const rule = css.slice(at, css.indexOf('}', at));
			expect(rule, `${engine} must be at least 24px wide`).toContain('width:24px');
			expect(rule, `${engine} must be at least 24px tall`).toContain('height:24px');
		}
	});
});

describe('Sheet opens on its content, not on the way out', () => {
	// The header (which owns Close) renders BEFORE `children`, so a DOM-order
	// `panel.querySelector(FOCUSABLE)` focused the Close button on every open — including the phone
	// "All sections" nav sheet, where the first thing a keyboard/screen-reader user met was "Close".
	// Same defect, and the same bodyRef fix, as ds/components/core/Popover.jsx.
	it('focuses the first control inside the body rather than the header Close', async () => {
		act(() => {
			root.render(
				<Sheet open title="All sections" onClose={() => {}}>
					<button type="button">Graph</button>
					<button type="button">Audio</button>
				</Sheet>,
			);
		});
		// The focus is scheduled in a setTimeout(0), matching Dialog.
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});
		expect((document.activeElement as HTMLElement)?.textContent).toBe('Graph');
	});

	it('still falls back to the header when the body has nothing focusable', async () => {
		act(() => {
			root.render(
				<Sheet open title="All sections" onClose={() => {}}>
					<p>Nothing to do here.</p>
				</Sheet>,
			);
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});
		const active = document.activeElement as HTMLElement;
		expect(active.getAttribute('aria-label') ?? active.tagName).toBeTruthy();
		expect(document.body.contains(active)).toBe(true);
		expect(active).not.toBe(document.body);
	});
});

describe('VisibilityChip announces its level exactly once', () => {
	// The chip is the app's safety-critical DM-only vs player-visible cue and appears ~33 times.
	// It named the icon AND rendered the same string as text AND repeated it in `title`, so a
	// screen reader read "DM only DM only" and a mouse user got a tooltip over text already on screen.
	it('names the icon only when the text is hidden', () => {
		act(() => {
			root.render(<VisibilityChip level="dm-only" />);
		});
		const chip = container.firstElementChild as HTMLElement;
		expect(chip.textContent).toBe('DM only');
		expect(chip.getAttribute('title'), 'no tooltip duplicating visible text').toBeNull();
		expect(
			container.querySelectorAll('[role="img"][aria-label="DM only"]').length,
			'the icon must not repeat the visible label',
		).toBe(0);
	});

	it('keeps the icon labelled in compact mode, where there is no text', () => {
		act(() => {
			root.render(<VisibilityChip level="dm-only" compact />);
		});
		const chip = container.firstElementChild as HTMLElement;
		expect(chip.textContent).toBe('');
		expect(chip.getAttribute('title')).toBe('DM only');
		expect(container.querySelectorAll('[role="img"][aria-label="DM only"]').length).toBe(1);
	});
});

describe('DefinitionList can shrink inside a narrow panel', () => {
	// `auto 1fr` plus a `white-space: nowrap` label meant a long term ("Condition Immunities") forced
	// the first track to its full intrinsic width and pushed the whole list past its container —
	// live on the character sheet and the player view's stat panel.
	it('declares shrinkable tracks and lets a long label wrap', () => {
		act(() => {
			root.render(
				<DefinitionList
					items={[{ label: 'Condition Immunities', value: 'charmed, frightened' }]}
				/>,
			);
		});
		const dl = container.querySelector('dl') as HTMLElement;
		expect(dl.style.gridTemplateColumns).toBe('minmax(0, auto) minmax(0, 1fr)');
		const dt = container.querySelector('dt') as HTMLElement;
		expect(dt.style.whiteSpace, 'a nowrap label defeats the minmax()').not.toBe('nowrap');
	});
});

describe('text fields keep a real focus indicator', () => {
	// `baseField` set inline `outline: 'none'`, and an inline style beats any stylesheet — so every
	// Input/Textarea/Select in the app suppressed the global `:focus-visible` ring in
	// `styles/tokens/base.css`. What replaced it was a 16%-alpha `--color-interactive-selected` wash
	// at ~1.4:1, i.e. the exact value this file already rejects for Slider (WCAG 2.4.11 wants 3:1),
	// and box-shadow is not painted at all under forced colors. Same defect, three more components.
	const focusRing = (el: HTMLElement) => {
		// React 17+ delegates focus at the root container and listens for `focusin`, so a bare
		// `focus` event never reaches the synthetic onFocus handler.
		act(() => {
			el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		});
		return el.style.boxShadow;
	};

	it('Input does not suppress the global outline and rings with focus-ring tokens', () => {
		act(() => {
			root.render(<Input aria-label="Name" />);
		});
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.style.outline, 'inline outline:none would kill the global ring').not.toBe('none');
		const ring = focusRing(input);
		expect(ring).toContain('--focus-ring-color');
		expect(ring, 'the ~1.4:1 selected wash is not a focus indicator').not.toContain(
			'--color-interactive-selected',
		);
	});

	it('Textarea does the same', () => {
		act(() => {
			root.render(<Textarea aria-label="Notes" />);
		});
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta.style.outline).not.toBe('none');
		expect(focusRing(ta)).toContain('--focus-ring-color');
	});

	it('Select does the same', () => {
		act(() => {
			root.render(<Select aria-label="Visibility" options={['a', 'b']} />);
		});
		const sel = container.querySelector('select') as HTMLSelectElement;
		expect(sel.style.outline).not.toBe('none');
		const ring = focusRing(sel);
		expect(ring).toContain('--focus-ring-color');
		expect(ring).not.toContain('--color-interactive-selected');
	});
});

describe('the toast stack survives an open modal and does not re-announce itself', () => {
	it('marks the polite region non-atomic', () => {
		act(() => root.render(<ToastViewport />));
		const polite = container.querySelector('[role="status"]') as HTMLElement;
		// `role="status"` defaults `aria-atomic` to TRUE, and this region wraps the whole stack —
		// so a second toast re-announced every toast still on screen.
		expect(polite.getAttribute('aria-atomic')).toBe('false');
	});

	it('opts the viewport out of modal isolation and gives the stack a scroll range', () => {
		act(() => root.render(<ToastViewport />));
		const viewport = container.firstElementChild as HTMLElement;
		expect(viewport.hasAttribute('data-modal-exempt')).toBe(true);
		expect(viewport.style.overflow, 'clipped rows hid their own Undo button').not.toBe('hidden');
		expect(viewport.style.overflowY).toBe('auto');
	});
});

describe('a map layer can be renamed from the keyboard', () => {
	// The name was a real <button> whose only handler was `onDoubleClick`, so a keyboard user could
	// focus it and press Enter forever with nothing happening (WCAG 2.1.1) — and the panel's own
	// Enter/Space handler bails when the target is not the row, so it did not even fall through to
	// "select layer". Renaming a layer was mouse-only.
	it('opens the rename editor on Enter and on F2', () => {
		for (const key of ['Enter', 'F2']) {
			act(() => {
				// A fresh `key` per iteration — otherwise React reuses the instance and the row is
				// still in edit mode from the previous key's assertion.
				root.render(<LayerRow key={key} layer={{ name: 'Base' }} onRename={() => {}} />);
			});
			const nameButton = Array.from(container.querySelectorAll('button')).find(
				(b) => b.textContent === 'Base',
			) as HTMLButtonElement;
			expect(nameButton, `a name button for ${key}`).toBeTruthy();
			// The accessible name must stay exactly "Base" — map-editor.spec matches it with
			// `exact: true` before double-clicking it.
			expect(nameButton.textContent).toBe('Base');
			act(() => {
				nameButton.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
			});
			expect(container.querySelector('input'), `${key} should open the editor`).toBeTruthy();
		}
	});
});

describe('an empty map name explains itself instead of greying the button out', () => {
	// `submit()` already handled the empty case — set `touched`, which renders the Field's
	// "A map name is required." alert — but `disabled={!name.trim()}` meant that branch could never
	// run. The DM saw a permanently greyed "Create map" and the reason was reachable only by
	// focusing and blurring the Name field.
	it('keeps Create map enabled and surfaces the requirement on submit', () => {
		let created = 0;
		act(() => root.render(<MapCreationForm onCreate={() => (created += 1)} />));
		const submit = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'Create map',
		) as HTMLButtonElement;
		expect(submit.disabled, 'a natively disabled button can never run its own guard').toBe(false);

		const form = container.querySelector('form') as HTMLFormElement;
		act(() => {
			form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		});
		expect(created, 'an empty name must still not create a map').toBe(0);
		expect(container.textContent).toContain('A map name is required.');
	});
});

describe('the condition tracker states emptiness and names its own control', () => {
	it('prints "No conditions" for the DM too, not only for read-only viewers', () => {
		// The line was gated on `!addable`, so the tracker the DM actually uses rendered a bare dashed
		// button with nothing saying the combatant is unafflicted.
		act(() => root.render(<ConditionTracker entries={[]} addable onAdd={() => {}} />));
		expect(container.textContent).toContain('No conditions');
	});

	it('gives the add button a verb and a 24px-floor target', () => {
		act(() => root.render(<ConditionTracker entries={[]} addable onAdd={() => {}} />));
		const add = container.querySelector('button') as HTMLButtonElement;
		// The whole accessible name used to be the noun "Condition" — the icon carries no label.
		expect(add.getAttribute('aria-label')).toBe('Add condition');
		expect(add.style.minHeight).toBe('var(--density-touch-target, 24px)');
	});
});

describe('an avatar is decorative and its status ring survives forced colours', () => {
	it('hides the duplicated initials from assistive tech', () => {
		// Every live call site renders the name as visible text right beside the avatar, so AT read
		// "G O" and then "Goblin" on each combat row and NPC card.
		act(() => root.render(<Avatar name="Goblin Overseer" />));
		const avatar = container.firstElementChild as HTMLElement;
		expect(avatar.textContent).toBe('GO');
		expect(avatar.getAttribute('aria-hidden')).toBe('true');
	});

	it('draws the turn ring with an outline, which forced-colors repaints', () => {
		act(() => root.render(<Avatar name="Goblin" ring="turn" />));
		const avatar = container.firstElementChild as HTMLElement;
		// `box-shadow` is not painted at all under `forced-colors: active`, so whose-turn vanished.
		expect(avatar.style.boxShadow).toBe('');
		expect(avatar.style.outline).toContain('2px solid');
	});
});

describe('quest objectives carry their state and stay readable when read-only', () => {
	const objectives = [
		{ label: 'Find who is buying the shipments', done: false },
		{ label: 'Question the harbourmaster', done: true },
	];

	it('exposes done/not-done as aria-pressed rather than a line-through alone', () => {
		act(() =>
			root.render(
				<QuestCard title="Smuggled cargo" objectives={objectives} onToggleObjective={() => {}} />,
			),
		);
		const rows = Array.from(container.querySelectorAll('li button')) as HTMLButtonElement[];
		expect(rows).toHaveLength(2);
		// The role must stay `button` — campaign.spec.ts matches these by role+name.
		expect(rows[0]!.getAttribute('aria-pressed')).toBe('false');
		expect(rows[1]!.getAttribute('aria-pressed')).toBe('true');
	});

	it('renders a read-only checklist as plain rows, not disabled buttons', () => {
		// `disabled={!onToggleObjective}` took a player's whole quest checklist out of the tab order
		// and UA-dimmed it, for something that was never an action for them.
		act(() => root.render(<QuestCard title="Smuggled cargo" objectives={objectives} />));
		expect(container.querySelectorAll('li button')).toHaveLength(0);
		expect(container.textContent).toContain('Question the harbourmaster');
	});
});

describe('shared primitives stop announcing themselves identically', () => {
	it('lets a tablist take the caller’s own name', () => {
		// Seven live tablists (map dock, Audio, Player, Characters, Campaign, Community, Extensions)
		// all announced as the hard-coded "Sections".
		act(() =>
			root.render(
				<Tabs
					aria-label="Audio sections"
					value="a"
					tabs={[{ id: 'a', label: 'A' }]}
					onChange={() => {}}
				/>,
			),
		);
		expect(container.querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe(
			'Audio sections',
		);
	});

	it('sizes Collapse minimap like its own Expand twin', () => {
		act(() => root.render(<Minimap collapsed={false} onToggle={() => {}} />));
		const collapse = Array.from(container.querySelectorAll('button')).find(
			(b) => b.getAttribute('aria-label') === 'Collapse minimap',
		) as HTMLButtonElement;
		// `padding: 2` around a 14px glyph made this ~18px next to a correct 36px Expand button.
		expect(collapse.style.width).toBe('24px');
		expect(collapse.style.height).toBe('24px');
	});
});

describe('the DM-only cue survives grayscale', () => {
	it('does not reuse the player-visible glyph for DM only', () => {
		// VisibilityChip renders icon-ONLY in compact mode, so while `dm-only` and
		// `visibility-players` were both Lucide `Eye` the app's most safety-critical distinction —
		// can the table see this? — was carried by colour alone at ~33 sites (WCAG 1.4.1).
		const nameOf = (level: string) => {
			act(() => root.render(<VisibilityChip level={level} compact />));
			const svg = container.querySelector('svg');
			return svg ? svg.getAttribute('class') || svg.outerHTML : '';
		};
		const dmOnly = nameOf('dm-only');
		const players = nameOf('players');
		const hidden = nameOf('hidden');
		expect(dmOnly).not.toBe('');
		expect(dmOnly).not.toBe(players);
		expect(dmOnly).not.toBe(hidden);
	});
});

describe('Dialog opens on the work, not on the way out', () => {
	it('focuses the first control in the body rather than the header Close', async () => {
		// The header renders before `children`, so a DOM-order query put ~33 of the app's 37 dialogs
		// one Enter away from dismissing themselves. Same defect Sheet and Popover were fixed for.
		act(() =>
			root.render(
				<Dialog open title="Name this map" onClose={() => {}}>
					<input aria-label="Map name" />
					<button type="button">Create map</button>
				</Dialog>,
			),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 5));
		});
		expect((document.activeElement as HTMLElement)?.getAttribute('aria-label')).toBe('Map name');
	});

	it('still falls back to the header when the body has nothing focusable', async () => {
		act(() =>
			root.render(
				<Dialog open title="Nothing to do" onClose={() => {}}>
					<p>All done.</p>
				</Dialog>,
			),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 5));
		});
		const active = document.activeElement as HTMLElement;
		expect(active.getAttribute('aria-label') || active.getAttribute('title')).toMatch(/close/i);
	});

	it('keeps honouring an explicit initialFocus over the body order', async () => {
		act(() =>
			root.render(
				<Dialog open title="Confirm" onClose={() => {}} initialFocus="[data-keep]">
					<button type="button">Delete</button>
					<button type="button" data-keep>
						Keep
					</button>
				</Dialog>,
			),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 5));
		});
		expect((document.activeElement as HTMLElement)?.textContent).toBe('Keep');
	});
});

describe('Popover stays inside the viewport', () => {
	// The panel is anchored with `left: anchor.x` + translateX(-50%) at 320px wide, so a POI in the
	// outer ~40% of a 393px handset canvas rendered half off-screen, taking the POIPopover footer
	// (Focus on map / Edit / Copy link / Delete) out of reach with no way to bring it back.
	// jsdom reports every rect as zero, so the geometry is proved against the exported pure helper.
	const rect = (left: number, width: number) => ({ left, right: left + width, width });

	it('leaves a panel that already fits exactly where the caller put it', () => {
		expect(popoverShiftX(rect(40, 320), 393)).toBe(0);
	});

	it('pulls a panel overflowing the right edge back inside', () => {
		// A POI at x=0.7 of a 393px well: natural left 275-160 = 115, right 435 — 42px off-screen.
		expect(popoverShiftX(rect(115, 320), 393)).toBe(-50);
		expect(115 + 320 + popoverShiftX(rect(115, 320), 393)).toBe(393 - 8);
	});

	it('pushes a panel overflowing the left edge back inside', () => {
		expect(popoverShiftX(rect(-30, 320), 393)).toBe(38);
		expect(-30 + popoverShiftX(rect(-30, 320), 393)).toBe(8);
	});

	it('pins the left edge rather than oscillating when the panel is wider than the viewport', () => {
		expect(popoverShiftX(rect(20, 400), 380)).toBe(-12);
	});

	it('is a no-op before anything has been measured', () => {
		expect(popoverShiftX(rect(0, 0), 393)).toBe(0);
		expect(popoverShiftX(rect(0, 320), 0)).toBe(0);
		expect(popoverShiftX(null, 393)).toBe(0);
	});
});

describe('the minimap cannot be teleported by the keyboard', () => {
	it('ignores the synthesized click Enter produces on the jump surface', () => {
		// A keyboard Enter/Space synthesizes a click with clientX/clientY = 0, which used to compute a
		// target above and left of the map and throw the DM's viewport to the top-left corner.
		const jumps: unknown[] = [];
		act(() =>
			root.render(
				<Minimap
					collapsed={false}
					onToggle={() => {}}
					viewport={{ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }}
					onJump={(v: unknown) => jumps.push(v)}
				/>,
			),
		);
		const surface = Array.from(container.querySelectorAll('button')).find((b) =>
			(b.getAttribute('aria-label') || '').startsWith('Jump viewport'),
		) as HTMLButtonElement;
		act(() => {
			surface.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
		});
		expect(jumps).toHaveLength(0);
		// A real pointer click still jumps, and the arrow keys still pan.
		act(() => {
			surface.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		});
		expect(jumps).toHaveLength(1);
	});
});

describe('Slider steppers do not vanish under the user’s own finger', () => {
	it('soft-disables at the bounds instead of leaving the tab order', () => {
		// Stepping a volume fader down to 0 — the common case — used to natively disable the focused
		// button, dropping focus to <body> so the next Tab restarted at the top of the document.
		act(() =>
			root.render(
				<Slider label="Music" min={0} max={100} value={0} steppers onChange={() => {}} />,
			),
		);
		const dec = Array.from(container.querySelectorAll('button')).find(
			(b) => b.getAttribute('aria-label') === 'Decrease Music',
		) as HTMLButtonElement;
		expect(dec.disabled).toBe(false);
		expect(dec.getAttribute('aria-disabled')).toBe('true');
		expect(dec.getAttribute('title')).toMatch(/minimum/i);
		act(() => dec.focus());
		expect(document.activeElement).toBe(dec);
	});

	it('swallows the press at the bound and still fires away from it', () => {
		const seen: number[] = [];
		act(() =>
			root.render(
				<Slider
					label="Music"
					min={0}
					max={100}
					value={0}
					steppers
					onChange={(v: number) => seen.push(v)}
				/>,
			),
		);
		const btn = (name: string) =>
			Array.from(container.querySelectorAll('button')).find(
				(b) => b.getAttribute('aria-label') === name,
			) as HTMLButtonElement;
		act(() => btn('Decrease Music').click());
		expect(seen).toEqual([]);
		act(() => btn('Increase Music').click());
		expect(seen).toEqual([1]);
	});

	it('keeps the hard native disable for the whole-control case', () => {
		act(() =>
			root.render(
				<Slider label="Music" min={0} max={100} value={50} steppers disabled onChange={() => {}} />,
			),
		);
		const dec = Array.from(container.querySelectorAll('button')).find(
			(b) => b.getAttribute('aria-label') === 'Decrease Music',
		) as HTMLButtonElement;
		expect(dec.disabled).toBe(true);
	});
});

describe('a progress bar announces what it shows', () => {
	it('carries the visible readout as aria-valuetext', () => {
		// Without this the encounter builder's difficulty meter showed "12 / 40 pts" and announced a
		// bare percentage.
		act(() =>
			root.render(
				<ProgressMeter label="Difficulty" value={12} max={40} valueLabel="12 / 40 pts" />,
			),
		);
		const bar = container.querySelector('[role="progressbar"]')!;
		expect(bar.getAttribute('aria-valuetext')).toBe('12 / 40 pts');
		expect(bar.getAttribute('aria-valuenow')).toBe('12');
	});

	it('omits it when the caller shows the default percentage', () => {
		act(() => root.render(<ProgressMeter label="Difficulty" value={12} max={40} />));
		expect(container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuetext')).toBe(
			null,
		);
	});
});

describe('a disabled checkbox says so', () => {
	it('announces aria-disabled rather than silently leaving the tab order', () => {
		act(() => root.render(<Checkbox label="Show grid" disabled onChange={() => {}} />));
		const box = container.querySelector('[role="checkbox"]')!;
		expect(box.getAttribute('aria-disabled')).toBe('true');
		expect(box.getAttribute('tabindex')).toBe('-1');
	});

	it('says nothing when it is operable', () => {
		act(() => root.render(<Checkbox label="Show grid" onChange={() => {}} />));
		const box = container.querySelector('[role="checkbox"]')!;
		expect(box.getAttribute('aria-disabled')).toBe(null);
		expect(box.getAttribute('tabindex')).toBe('0');
	});
});

describe('a read-only spell-slot economy is readable, not dead', () => {
	const levels = [{ level: 1, total: 3, used: 1 }];

	it('renders read-only pips as images rather than natively disabled buttons', () => {
		// `Characters.tsx` passes `readOnly={!isDm}`, so a non-DM viewer of a shared sheet got the
		// whole slot grid as `disabled` <button>s: out of the tab order, UA-dimmed, and announced as
		// unavailable ACTIONS when they were only ever a STATE readout. Same defect QuestCard had.
		act(() => root.render(<SpellSlots levels={levels} readOnly />));
		expect(container.querySelectorAll('button')).toHaveLength(0);
		const pips = container.querySelectorAll('[role="img"]');
		expect(pips).toHaveLength(3);
		expect(pips[0].getAttribute('aria-label')).toBe('Level 1 slot 1 available');
		expect(pips[2].getAttribute('aria-label')).toBe('Level 1 slot 3 expended');
	});

	it('still spends a slot when it is the DM’s own sheet', () => {
		const seen: number[] = [];
		act(() =>
			root.render(
				<SpellSlots levels={levels} onToggle={(_l: number, i: number) => seen.push(i)} />,
			),
		);
		const pips = Array.from(container.querySelectorAll('button'));
		expect(pips).toHaveLength(3);
		expect(pips[0].getAttribute('aria-pressed')).toBe('true');
		expect(pips[2].getAttribute('aria-pressed')).toBe('false');
		act(() => pips[1].click());
		expect(seen).toEqual([1]);
	});

	it('gives each interactive pip a 24px square hit box and keeps the rotation off it', () => {
		// The diamond used to be made by rotating the 16px BUTTON 45deg, so its corners overhung the
		// neighbouring slots and a mis-tap spent someone else's spell. The rotate belongs on the paint.
		act(() => root.render(<SpellSlots levels={levels} onToggle={() => {}} />));
		const pip = container.querySelector('button') as HTMLButtonElement;
		expect(pip.style.width).toBe('24px');
		expect(pip.style.height).toBe('24px');
		expect(pip.style.transform).toBe('');
		expect((pip.firstElementChild as HTMLElement).style.transform).toBe('rotate(45deg)');
	});
});

describe('Toast does not re-read the whole error stack', () => {
	// `role="alert"` implies `aria-atomic="true"`, and this region WRAPS the stack — so a second
	// failure re-announced every error still on screen. The polite region one line above had already
	// been fixed for exactly this; the alert twin had not.
	afterEach(() => act(() => Toaster.clear()));

	it('marks the assertive region non-atomic', () => {
		act(() => root.render(<ToastViewport />));
		act(() => {
			Toaster.error('Export failed.');
		});
		expect(container.querySelector('[role="alert"]')!.getAttribute('aria-atomic')).toBe('false');
	});
});

describe('Field keeps its format hint while it is showing an error', () => {
	// `const message = error ?? help` collapsed the two onto one node, so the hint that explains the
	// expected format disappeared at exactly the moment the user was told the format was wrong
	// (WCAG 3.3.3). 115 live <Field> sites.
	it('renders BOTH the error and the help, and describes the control with both', () => {
		act(() =>
			root.render(
				<Field label="Armour class" help="A whole number, 0 or more." error="That isn’t a number.">
					<input />
				</Field>,
			),
		);
		const input = container.querySelector('input') as HTMLInputElement;
		expect(container.textContent).toContain('A whole number, 0 or more.');
		expect(container.textContent).toContain('That isn’t a number.');

		// `useId()` emits colons, which are legal in an IDREF but NOT in a CSS id selector — resolve
		// each described-by target through getElementById.
		const ids = input.getAttribute('aria-describedby')!.split(' ');
		expect(ids).toHaveLength(2);
		const described = ids.map((id) => document.getElementById(id)!.textContent);
		// Error first: it is the more urgent of the two.
		expect(described).toEqual(['That isn’t a number.', 'A whole number, 0 or more.']);
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(container.querySelector('[role="alert"]')!.textContent).toBe('That isn’t a number.');
	});

	it('still describes a hint-only field with exactly one node', () => {
		act(() =>
			root.render(
				<Field label="Armour class" help="A whole number, 0 or more.">
					<input />
				</Field>,
			),
		);
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.getAttribute('aria-describedby')!.split(' ')).toHaveLength(1);
		expect(input.hasAttribute('aria-invalid')).toBe(false);
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});
});

describe('Popover focus entry skips controls that cannot take it', () => {
	// The permissive `'button, [href], input, select, textarea, [tabindex]'` matched a natively
	// disabled control, and `.focus()` on one silently no-ops — so opening the layer ⋯ menu on the
	// TOP layer (where "Move up" is disabled) left focus outside the flyout and the next Tab walked
	// into the page behind it. Dialog and Sheet had always used the stricter selector.
	it('focuses the first ENABLED body control when the first one is disabled', async () => {
		act(() =>
			root.render(
				<Popover open title="Layer actions" onClose={() => {}}>
					<button type="button" disabled>
						Move up
					</button>
					<button type="button">Move down</button>
				</Popover>,
			),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 10));
		});
		expect((document.activeElement as HTMLElement)?.textContent).toBe('Move down');
	});
});

describe('Escape belongs to the topmost overlay only', () => {
	// Dialog, Sheet and Popover all listen on `document` in CAPTURE and call stopPropagation — which
	// does nothing between listeners on the SAME node, and capture order there is registration order,
	// i.e. OUTERMOST first. So Escape inside a Popover mounted within a Sheet dismissed both, and the
	// sheet's dismissal ran first. The live path is the phone map editor's "Map panels" sheet.
	it('closes only the popover when one is open inside a sheet', async () => {
		const closed: string[] = [];
		act(() =>
			root.render(
				<Sheet open title="Map panels" onClose={() => closed.push('sheet')}>
					<button type="button">Layers</button>
					<Popover open title="Opacity" onClose={() => closed.push('popover')}>
						<button type="button">Reset</button>
					</Popover>
				</Sheet>,
			),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 10));
		});
		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(closed).toEqual(['popover']);
	});

	it('gives Escape back to the sheet once the popover has gone', async () => {
		const closed: string[] = [];
		function Harness({ popoverOpen }: { popoverOpen: boolean }) {
			return (
				<Sheet open title="Map panels" onClose={() => closed.push('sheet')}>
					<button type="button">Layers</button>
					{popoverOpen && (
						<Popover open title="Opacity" onClose={() => closed.push('popover')}>
							<button type="button">Reset</button>
						</Popover>
					)}
				</Sheet>
			);
		}
		act(() => root.render(<Harness popoverOpen />));
		await act(async () => {
			await new Promise((r) => setTimeout(r, 10));
		});
		act(() => root.render(<Harness popoverOpen={false} />));
		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(closed).toEqual(['sheet']);
	});
});

describe('Minimap keeps the keyboard cursor when it collapses', () => {
	// The collapsed and expanded branches return DIFFERENT element types at the same position, so
	// React destroys the toggle the user just activated instead of reconciling it: focus fell to
	// <body> and the next Tab restarted at the top of the document (WCAG 3.2.2).
	it('moves focus onto the surviving toggle', () => {
		act(() => root.render(<Minimap />));
		const collapse = container.querySelector(
			'[aria-label="Collapse minimap"]',
		) as HTMLButtonElement;
		collapse.focus();
		act(() => collapse.click());

		const expand = container.querySelector('[aria-label="Expand minimap"]') as HTMLButtonElement;
		expect(expand).not.toBeNull();
		expect(document.activeElement).toBe(expand);
	});

	it('does not steal focus from a pointer user who never had it on the toggle', () => {
		const elsewhere = document.createElement('button');
		document.body.appendChild(elsewhere);
		act(() => root.render(<Minimap />));
		const collapse = container.querySelector(
			'[aria-label="Collapse minimap"]',
		) as HTMLButtonElement;
		elsewhere.focus();
		act(() => collapse.click());

		expect(document.activeElement).toBe(elsewhere);
		elsewhere.remove();
	});
});

describe('a Popover leaves its own trigger alone', () => {
	// The outside-pointerdown dismissal fired for the TRIGGER too, and every caller toggles its own
	// open state (`setOpen(v => !v)`), so the close raced the button's own `click`: pressing Snapping /
	// Export / the layer ⋯ menu / a layer's opacity readout a second time closed and immediately
	// re-opened the flyout. Four map surfaces could only be dismissed by Escape.
	function mountWithTrigger(useTriggerRef: boolean, onClose: () => void) {
		function Harness() {
			const triggerRef = React.useRef<HTMLButtonElement>(null);
			return (
				<div>
					<button type="button" ref={triggerRef} data-testid="trigger">
						Snap
					</button>
					<Popover
						open
						onClose={onClose}
						title="Snapping"
						triggerRef={useTriggerRef ? triggerRef : undefined}
					>
						<button type="button">Snap to grid</button>
					</Popover>
				</div>
			);
		}
		act(() => root.render(<Harness />));
	}

	it('does not close when the pointer goes down on the trigger', () => {
		let closes = 0;
		mountWithTrigger(true, () => {
			closes += 1;
		});
		const trigger = container.querySelector('[data-testid="trigger"]') as HTMLButtonElement;
		act(() => {
			trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
		});
		expect(closes).toBe(0);
	});

	it('still closes on a pointerdown anywhere else', () => {
		let closes = 0;
		mountWithTrigger(true, () => {
			closes += 1;
		});
		act(() => {
			document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
		});
		expect(closes).toBe(1);
	});

	// The negative probe: without the exemption the same press dismisses, which is what let the
	// trigger's click flip it straight back open.
	it('closes on the trigger when no triggerRef is supplied', () => {
		let closes = 0;
		mountWithTrigger(false, () => {
			closes += 1;
		});
		const trigger = container.querySelector('[data-testid="trigger"]') as HTMLButtonElement;
		act(() => {
			trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
		});
		expect(closes).toBe(1);
	});
});

describe('a progress bar never announces a value outside its own range', () => {
	// The painted fill was already clamped; `aria-valuenow` was not. An over-budget encounter
	// announced "150" against aria-valuemax=100, which reads as broken rather than as "over budget".
	it('clamps aria-valuenow to max', () => {
		act(() => root.render(<ProgressMeter label="Difficulty" value={150} max={100} />));
		expect(container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe(
			'100',
		);
	});

	it('clamps a negative value to zero', () => {
		act(() => root.render(<ProgressMeter label="Difficulty" value={-8} max={100} />));
		expect(container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe(
			'0',
		);
	});
});

describe('an empty state is content, not a live region', () => {
	// `role="status"` on the root made all ~34 live empty states permanent polite regions with the
	// implicit aria-atomic=true, so any change inside one re-announced the heading, the description
	// AND the action label — and it made a bare `getByRole('status')` ambiguous against the screens'
	// real status channels (combat.spec pins the initiative list as containing none).
	it('does not claim role=status', () => {
		act(() =>
			root.render(<EmptyState title="No combat running." description="Start one to begin." />),
		);
		expect(container.querySelector('[role="status"]')).toBeNull();
		expect(container.querySelector('h3')!.textContent).toBe('No combat running.');
	});
});

describe('the slider track survives the Android touch-target rule', () => {
	// styles/index.css's `html[data-android] :is(… input …) { min-height: 48px }` outranks
	// `.dnds-range { height: 6px }`, so the 6px track inflated into a full-height two-tone slab with
	// a 24px thumb floating in it. Paint the track as a sized background band instead, which keeps
	// the 48dp touch target that rule exists to guarantee.
	it('sizes the track background rather than the element box', () => {
		act(() => root.render(<Slider min={0} max={100} value={40} aria-label="Volume" />));
		const css = document.querySelector('style[data-dnds="slider"]')!.textContent!;
		expect(css).toMatch(/background-size:\s*100% 6px/);
		expect(css).toMatch(/background-color:\s*transparent/);
		// The class must not re-set the `background` SHORTHAND either, or it would reset the size.
		expect(css).not.toMatch(/\.dnds-range\{[^}]*[^-]background:/);
	});

	it('applies the fill with the backgroundImage LONGHAND', () => {
		// The `background` shorthand resets background-size/position/repeat to their initial values,
		// so writing the gradient through it would silently undo the band above.
		act(() => root.render(<Slider min={0} max={100} value={40} aria-label="Volume" />));
		const range = container.querySelector('input[type="range"]') as HTMLInputElement;
		expect(range.style.backgroundImage).toMatch(/linear-gradient/);
		expect(range.style.backgroundSize).toBe('');
	});
});

describe('the slider is a 24px pointer target, not a 6px hit strip', () => {
	// `steppers` — the documented WCAG-2.5.7 non-drag alternative — defaults false and is passed at
	// ZERO of the live call sites, so dragging and click-to-position on this element are the only
	// pointer routes to brush size, fog radius, layer opacity, master volume and every generation
	// parameter. Click-to-position targets the ELEMENT box, which was 6px: below 2.5.8's 24px
	// minimum everywhere except the Android runtime, where `html[data-android] input{min-height:48px}`
	// happened to mask it — which is exactly why responsive.spec's Android-only 48dp gate never
	// caught it. The 24px thumb was already overflowing a 6px box.
	it('gives the element box a 24px floor while keeping the 6px painted band', () => {
		act(() => root.render(<Slider min={0} max={100} value={40} aria-label="Volume" />));
		const css = document.querySelector('style[data-dnds="slider"]')!.textContent!;
		// Strip the CSS comments first: this rule's own explanation quotes `height:6px`, which is
		// exactly the string the negative assertion below hunts for.
		const rule = /\.dnds-range\{([^}]*)\}/.exec(css)![1].replace(/\/\*[\s\S]*?\*\//g, '');
		expect(rule).toMatch(/min-height:\s*24px/);
		// A fixed `height` would beat the floor and re-open the defect.
		expect(rule).not.toMatch(/[^-]height:\s*6px/);
		// The track itself must still be the 6px band, not a 24px slab.
		expect(rule).toMatch(/background-size:\s*100% 6px/);
	});
});

describe('Button knows every variant its callers ask for', () => {
	// `variants[variant] || variants.secondary` downgrades an unknown variant SILENTLY, and
	// IconButton had an `accent` that Button did not — so the live-session dice roller's primary
	// action (`screens/Session.tsx`, `variant="accent"`) rendered as a plain raised secondary
	// button. `ds/index.d.ts` types every export as Record<string, unknown>, so nothing caught it.
	it('renders accent as the gold tint rather than falling through to secondary', () => {
		act(() => root.render(<Button variant="accent">Roll</Button>));
		const accent = container.querySelector('button')!.style.background;
		act(() => root.render(<Button variant="secondary">Roll</Button>));
		const secondary = container.querySelector('button')!.style.background;
		expect(accent).toBe('var(--color-accent-subtle)');
		expect(accent).not.toBe(secondary);
	});

	it('still falls back to secondary for a genuinely unknown variant', () => {
		act(() => root.render(<Button variant="not-a-variant">Roll</Button>));
		expect(container.querySelector('button')!.style.background).toBe('var(--color-surface-raised)');
	});
});

describe('a segmented option truncates instead of growing the whole track', () => {
	// `text-overflow: ellipsis` is INERT while the text can still wrap, so the intended truncation
	// never happened: a long option ("Equirectangular", "Mountainous") wrapped at lineHeight:1 and
	// the control jumped in height. 22 live sites, including the DM only / Players / Shared safety
	// control in the map POI popover.
	it('pins the label to one line so its ellipsis can apply', () => {
		act(() =>
			root.render(
				<SegmentedControl
					ariaLabel="Projection"
					value="equi"
					onChange={() => {}}
					options={[
						{ value: 'equi', label: 'Equirectangular' },
						{ value: 'mtn', label: 'Mountainous' },
					]}
				/>,
			),
		);
		for (const option of Array.from(container.querySelectorAll('[role="radio"]'))) {
			const style = (option as HTMLElement).style;
			expect(style.whiteSpace).toBe('nowrap');
			expect(style.textOverflow).toBe('ellipsis');
			expect(style.overflow).toBe('hidden');
		}
	});
});
