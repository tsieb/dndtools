// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CoreStateSlice } from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState } from '@dndtools/core/testing';

import { I18nProvider } from '../../i18n';
import { PREFERENCE_KEYS, removePreference } from '../../platform/preferences';
import { SYSTEM_DEFINITIONS, CAMPAIGN, boardWidget, noop } from './widgetFrameFixtures';

/** RC-CAN-8.3 — the edit-mode direct-manipulation cues on a tile frame (RC-POL-1.2 split this out
 *  of `WidgetFrame.test.tsx`). */

const runtimeRef: {
	state: CoreStateSlice;
	defaultActorId: string;
	dispatch: ReturnType<typeof vi.fn>;
} = {
	state: buildInitialState(DM_ACTOR, PLAYER_ACTOR),
	defaultActorId: DM_ACTOR.id,
	dispatch: vi.fn(async () => ({ status: 'accepted' as const })),
};

vi.mock('../../runtime/RuntimeContext', () => ({
	useRuntime: () => runtimeRef,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
}));

// The map body resolves its raster through the asset store; a test vault has no bytes.
vi.mock('../../platform/assetUrl', () => ({
	useAssetObjectUrl: () => null,
	createAssetObjectUrl: async () => null,
}));

const { WidgetFrame } = await import('./WidgetFrame');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	removePreference(PREFERENCE_KEYS.markGmOnly);
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe('direct manipulation cues (RC-CAN-8.3)', () => {
	const dice = SYSTEM_DEFINITIONS.find((d) => d.type === 'dice')!;
	// jsdom lays nothing out, so its viewport is 0×0 and the menu would clamp to the 8px margin.
	beforeEach(() => {
		for (const [key, value] of [
			['clientWidth', 1024],
			['clientHeight', 768],
		] as const)
			Object.defineProperty(document.documentElement, key, { configurable: true, value });
	});
	afterEach(() => {
		delete (document.documentElement as { clientWidth?: number }).clientWidth;
		delete (document.documentElement as { clientHeight?: number }).clientHeight;
	});

	function renderEditing(onStartMove: (e: React.PointerEvent) => void = noop, selected = false) {
		runtimeRef.state = CAMPAIGN.state;
		runtimeRef.defaultActorId = DM_ACTOR.id;
		const widget = boardWidget(dice);
		act(() =>
			root.render(
				<I18nProvider>
					<WidgetFrame
						w={widget}
						x={0}
						y={0}
						width={320}
						height={240}
						editing
						selected={selected}
						scale={0.5}
						resizable={false}
						tabbable
						ariaLabel="Dice, Dice widget"
						onKeyDown={noop}
						onFocusIn={noop}
						registerRef={noop}
						onStartMove={onStartMove}
						onStartResize={noop}
					/>
				</I18nProvider>,
			),
		);
		const frame = container.querySelector<HTMLElement>(`[data-testid="widget-${widget.id}"]`)!;
		const surface = frame.querySelector<HTMLElement>('[data-testid="tile-drag-surface"]')!;
		return { frame, surface };
	}

	/** A pointer event of the given type; jsdom has no PointerEvent, so `pointerType` is grafted on. */
	function pointer(
		target: EventTarget,
		type: string,
		{ pointerType = 'mouse', button = 0, x = 0, y = 0 } = {},
	) {
		const event = new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			button,
			clientX: x,
			clientY: y,
		});
		Object.defineProperty(event, 'pointerType', { value: pointerType });
		act(() => {
			target.dispatchEvent(event);
		});
		return event;
	}

	const menu = () => document.querySelector<HTMLElement>('[data-testid="tile-actions-menu"]');

	it('puts a grip in the title bar, on the drag surface, that a finger can drag by', () => {
		const { surface } = renderEditing();
		const grip = surface.querySelector<HTMLElement>('[data-testid="tile-grip"]')!;
		expect(grip.getAttribute('aria-hidden')).toBe('true');
		expect(grip.style.touchAction).toBe('none');
	});

	it('lifts under a mouse, not under a finger, and drops back on leave', () => {
		const { frame, surface } = renderEditing();
		expect(frame.style.boxShadow).toBe('');
		pointer(surface, 'pointerover', { pointerType: 'touch' });
		expect(frame.style.boxShadow).toBe('');
		pointer(surface, 'pointerover');
		expect(frame.style.boxShadow).toBe('var(--shadow-md)');
		expect(frame.style.outline).toBe('2px solid var(--color-accent-border)');
		// Eased on the motion tokens, and never moved: a transform scrolled the canvas under the menu.
		expect(frame.style.transition).toContain('var(--duration-fast)');
		expect(frame.style.transform).toBe('');
		pointer(frame, 'pointerout');
		expect(frame.style.boxShadow).toBe('');
	});

	it('opens the tile menu at the pointer on a right-click, without starting a move', () => {
		const onStartMove = vi.fn();
		const { surface } = renderEditing(onStartMove);
		pointer(surface, 'pointerdown', { button: 2, x: 140, y: 90 });
		expect(onStartMove).not.toHaveBeenCalled();
		const event = pointer(surface, 'contextmenu', { button: 2, x: 140, y: 90 });
		expect(event.defaultPrevented).toBe(true);
		expect(menu()).not.toBeNull();
		expect(menu()!.style.left).toBe('140px');
		expect(menu()!.style.top).toBe('94px');
	});

	it('opens the tile menu at the finger after a long-press, and abandons the drag', () => {
		vi.useFakeTimers();
		try {
			const onStartMove = vi.fn();
			const cancelled = vi.fn();
			window.addEventListener('pointercancel', cancelled);
			const { surface } = renderEditing(onStartMove);
			pointer(surface, 'pointerdown', { pointerType: 'touch', x: 60, y: 70 });
			expect(onStartMove).toHaveBeenCalledTimes(1);
			act(() => vi.advanceTimersByTime(499));
			expect(menu()).toBeNull();
			act(() => vi.advanceTimersByTime(1));
			expect(cancelled).toHaveBeenCalledTimes(1);
			expect(menu()!.style.left).toBe('60px');
			window.removeEventListener('pointercancel', cancelled);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not open the menu when the finger moves off before the press fires', () => {
		vi.useFakeTimers();
		try {
			const { surface } = renderEditing();
			pointer(surface, 'pointerdown', { pointerType: 'touch', x: 60, y: 70 });
			pointer(surface, 'pointermove', { pointerType: 'touch', x: 60, y: 90 });
			act(() => vi.advanceTimersByTime(800));
			expect(menu()).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('draws the selection chip inside the frame, capped to its width at screen size', () => {
		const { frame } = renderEditing(noop, true);
		const chip = frame.querySelector<HTMLElement>('[data-testid="tile-selection-chip"]')!;
		expect(chip.style.top).toBe('');
		expect(chip.style.bottom).toBe('var(--space-2)');
		// (320 - 16) board px at scale 0.5 is 152 screen px.
		expect(chip.style.maxWidth).toBe('152px');
	});
});
