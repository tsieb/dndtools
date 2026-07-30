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
import { Input as RawInput, Textarea as RawTextarea } from './forms/Input.jsx';
import { Select as RawSelect } from './forms/Select.jsx';
import { Popover as RawPopover } from './core/Popover.jsx';
import { Dialog as RawDialog } from './overlay/Dialog.jsx';
import { Toaster, ToastViewport as RawToastViewport } from './overlay/Toast.jsx';
import { Sheet as RawSheet } from './overlay/Sheet.jsx';
import { Slider as RawSlider } from './forms/Slider.jsx';
import { VisibilityChip as RawVisibilityChip } from './feedback/VisibilityChip.jsx';
import { DefinitionList as RawDefinitionList } from './data/DefinitionList.jsx';

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
		const field = mount(<Textarea value="" onChange={() => {}} onBlur={() => (commits += 1)} />, 'textarea');
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
		const close = Array.from(container.querySelectorAll('button')).find(
			(b) => (b.getAttribute('aria-label') ?? '').toLowerCase().includes('close'),
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
