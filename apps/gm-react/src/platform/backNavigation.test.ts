import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	handlePlatformBack,
	registerBackHandler,
	resetBackHandlersForTest,
} from './backNavigation';

afterEach(resetBackHandlersForTest);

function context(overrides: Partial<Parameters<typeof handlePlatformBack>[0]> = {}) {
	return {
		atRootDestination: false,
		canGoBack: true,
		navigateBack: vi.fn(),
		navigateToRoot: vi.fn(),
		minimize: vi.fn(),
		...overrides,
	};
}

describe('Android Back ordering', () => {
	it('closes only the newest overlay before fullscreen and history', async () => {
		const calls: string[] = [];
		registerBackHandler('fullscreen', () => {
			calls.push('fullscreen');
		});
		registerBackHandler('overlay', () => {
			calls.push('older');
		});
		registerBackHandler('overlay', () => {
			calls.push('topmost');
		});
		const ctx = context();

		await expect(handlePlatformBack(ctx)).resolves.toBe('overlay');
		expect(calls).toEqual(['topmost']);
		expect(ctx.navigateBack).not.toHaveBeenCalled();
	});

	it('leaves fullscreen before navigating router history', async () => {
		const leave = vi.fn();
		const unregister = registerBackHandler('fullscreen', leave);
		const ctx = context();
		await expect(handlePlatformBack(ctx)).resolves.toBe('fullscreen');
		expect(leave).toHaveBeenCalledTimes(1);
		unregister();
		await expect(handlePlatformBack(ctx)).resolves.toBe('history');
		expect(ctx.navigateBack).toHaveBeenCalledTimes(1);
	});

	it('minimizes from the root destination even when native history says it can go back', async () => {
		const ctx = context({ atRootDestination: true, canGoBack: true });
		await expect(handlePlatformBack(ctx)).resolves.toBe('minimized');
		expect(ctx.navigateBack).not.toHaveBeenCalled();
		expect(ctx.minimize).toHaveBeenCalledTimes(1);
	});

	it('returns a cold-launched deep link to the root when no router history exists', async () => {
		const ctx = context({ atRootDestination: false, canGoBack: false });
		await expect(handlePlatformBack(ctx)).resolves.toBe('history');
		expect(ctx.navigateBack).not.toHaveBeenCalled();
		expect(ctx.navigateToRoot).toHaveBeenCalledTimes(1);
		expect(ctx.minimize).not.toHaveBeenCalled();
	});
});
