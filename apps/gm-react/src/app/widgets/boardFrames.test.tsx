// @vitest-environment jsdom
import { act, useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
	sameFrameProps,
	useFrameHandlers,
	usePaneWidth,
	type BoardFrameHandlers,
} from './boardFrames';
import type { BoardWidget } from '../board-helpers';
import type { WidgetFrameProps } from '../canvas/WidgetFrame';

function mount() {
	const container = document.createElement('div');
	const root = createRoot(container);
	return { root, unmount: () => act(() => root.unmount()) };
}

const widget = (id: string, title = id) => ({ id, title }) as BoardWidget;

it('keeps each frame handler for the life of its widget and calls the latest host handler', () => {
	const { root, unmount } = mount();
	const refs = { current: new Map<string, HTMLDivElement>() };
	let handlersFor: (id: string) => ReturnType<ReturnType<typeof useFrameHandlers>> = () => {
		throw new Error('not rendered');
	};
	function Probe({ widgets, host }: { widgets: BoardWidget[]; host: BoardFrameHandlers }) {
		const get = useFrameHandlers(widgets, refs, host);
		handlersFor = get;
		return null;
	}
	const host = (): BoardFrameHandlers => ({
		onKeyDown: vi.fn(),
		onFocusIn: vi.fn(),
		onStartMove: vi.fn(),
		onStartResize: vi.fn(),
		onCycleSize: vi.fn(),
		onResizeStep: vi.fn(),
	});
	const first = host();
	const next = host();
	try {
		act(() => root.render(<Probe widgets={[widget('a'), widget('b')]} host={first} />));
		const a = handlersFor('a');
		act(() => root.render(<Probe widgets={[widget('a', 'Renamed'), widget('b')]} host={next} />));
		expect(handlersFor('a')).toBe(a);
		a.onResizeStep(1, -1);
		expect(first.onResizeStep).not.toHaveBeenCalled();
		expect(next.onResizeStep).toHaveBeenCalledWith(
			expect.objectContaining({ title: 'Renamed' }),
			1,
			-1,
		);
		a.onFocusIn();
		expect(next.onFocusIn).toHaveBeenCalledTimes(1);

		const el = document.createElement('div');
		a.registerRef(el);
		expect(refs.current.get('a')).toBe(el);

		act(() => root.render(<Probe widgets={[widget('b')]} host={next} />));
		// A removed widget's frame is detached after the render that dropped it, and its handlers go inert.
		a.registerRef(null);
		expect(refs.current.has('a')).toBe(false);
		a.onCycleSize();
		expect(next.onCycleSize).not.toHaveBeenCalled();
		act(() => root.render(<Probe widgets={[widget('a'), widget('b')]} host={next} />));
		expect(handlersFor('a')).not.toBe(a);
	} finally {
		unmount();
	}
});

it('lets a view-mode frame skip scale and undo-stack changes, never an edit-mode one', () => {
	const base = {
		w: widget('a'),
		x: 0,
		y: 0,
		width: 240,
		height: 180,
		editing: false,
		selected: false,
		scale: 1,
		resizable: false,
		tabbable: true,
		ariaLabel: 'a',
		history: undefined,
	} as unknown as WidgetFrameProps;
	const history = {} as WidgetFrameProps['history'];
	expect(sameFrameProps(base, { ...base, scale: 0.8, history })).toBe(true);
	expect(sameFrameProps(base, { ...base, x: 12 })).toBe(false);
	expect(sameFrameProps(base, { ...base, onCommand: vi.fn() })).toBe(false);
	const editing = { ...base, editing: true };
	expect(sameFrameProps(editing, { ...editing, scale: 0.8 })).toBe(false);
	expect(sameFrameProps(editing, { ...editing, history })).toBe(false);
	expect(sameFrameProps(base, { ...base, editing: true })).toBe(false);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it('reads the pane width before the first paint, then follows resizes', () => {
	let observed: ResizeObserverCallback = () => {};
	vi.stubGlobal(
		'ResizeObserver',
		class {
			constructor(callback: ResizeObserverCallback) {
				observed = callback;
			}
			observe() {}
			disconnect() {}
		},
	);
	vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(958);
	const { root, unmount } = mount();
	const widths: (number | null)[] = [];
	function Pane() {
		const ref = useRef<HTMLDivElement | null>(null);
		widths.push(usePaneWidth(ref));
		return <div ref={ref} />;
	}
	try {
		// `flushSync` commits and runs layout effects, but leaves passive effects queued: the width must
		// already be in the render the browser paints.
		flushSync(() => root.render(<Pane />));
		expect(widths).toEqual([null, 958]);
		act(() =>
			observed([{ contentRect: { width: 700.4 } } as ResizeObserverEntry], {} as ResizeObserver),
		);
		expect(widths.at(-1)).toBe(700);
	} finally {
		unmount();
	}
});
