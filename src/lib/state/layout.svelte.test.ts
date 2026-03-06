import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ResizeObserverCallback = ConstructorParameters<typeof ResizeObserver>[0];

class MockResizeObserver {
	static instances: MockResizeObserver[] = [];
	private readonly callback: ResizeObserverCallback;

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		MockResizeObserver.instances.push(this);
	}

	observe(): void {}
	disconnect(): void {}

	emit(width: number): void {
		this.callback(
			[
				{
					contentRect: { width },
				} as ResizeObserverEntry,
			],
			this as unknown as ResizeObserver,
		);
	}
}

describe('layoutState', () => {
	const originalResizeObserver = globalThis.ResizeObserver;

	beforeEach(() => {
		vi.resetModules();
		vi.useFakeTimers();
		MockResizeObserver.instances = [];
		globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
		Object.defineProperty(window, 'innerWidth', {
			configurable: true,
			writable: true,
			value: 1280,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		globalThis.ResizeObserver = originalResizeObserver;
	});

	it('maps widths to compact, medium, and expanded tiers at contract boundaries', async () => {
		const { layoutTierFromWidth } = await import('./layout.svelte.js');

		expect(layoutTierFromWidth(639)).toBe('compact');
		expect(layoutTierFromWidth(640)).toBe('medium');
		expect(layoutTierFromWidth(1099)).toBe('medium');
		expect(layoutTierFromWidth(1100)).toBe('expanded');
	});

	it('defaults to expanded during module initialization (SSR-safe fallback)', async () => {
		const { layoutState } = await import('./layout.svelte.js');

		expect(layoutState.tier).toBe('expanded');
	});

	it('updates tier from ResizeObserver notifications with 100ms debounce', async () => {
		const { layoutState } = await import('./layout.svelte.js');

		Object.defineProperty(document.documentElement, 'clientWidth', {
			configurable: true,
			get: () => window.innerWidth,
		});
		window.innerWidth = 639;
		layoutState.initialize();
		expect(layoutState.tier).toBe('compact');

		const observer = MockResizeObserver.instances[0];
		expect(observer).toBeDefined();
		observer?.emit(650);
		observer?.emit(1110);

		expect(layoutState.tier).toBe('compact');
		vi.advanceTimersByTime(99);
		expect(layoutState.tier).toBe('compact');
		vi.advanceTimersByTime(1);
		expect(layoutState.tier).toBe('expanded');

		layoutState.dispose();
	});
});
