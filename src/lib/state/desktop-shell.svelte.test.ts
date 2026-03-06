import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('desktopShellState', () => {
	beforeEach(() => {
		vi.resetModules();
		window.localStorage.clear();
	});

	it('hydrates collapsed state and per-section widths from localStorage', async () => {
		window.localStorage.setItem('dndtools:desktop-shell:local-panel-collapsed', '1');
		window.localStorage.setItem('dndtools:desktop-shell:local-panel-width:atlas', '999');

		const { desktopShellState } = await import('./desktop-shell.svelte.js');
		desktopShellState.ensureHydrated();

		expect(desktopShellState.localPanelCollapsed).toBe(true);
		expect(desktopShellState.getLocalPanelWidth('atlas')).toBe(320);
		expect(desktopShellState.getLocalPanelWidth('knowledge')).toBe(240);
	});

	it('clamps and persists local panel width updates', async () => {
		const { desktopShellState } = await import('./desktop-shell.svelte.js');

		desktopShellState.setLocalPanelWidth('knowledge', 180);
		expect(desktopShellState.getLocalPanelWidth('knowledge')).toBe(200);
		expect(window.localStorage.getItem('dndtools:desktop-shell:local-panel-width:knowledge')).toBe(
			'200',
		);

		desktopShellState.setLocalPanelWidth('knowledge', 311);
		expect(desktopShellState.getLocalPanelWidth('knowledge')).toBe(311);
		expect(window.localStorage.getItem('dndtools:desktop-shell:local-panel-width:knowledge')).toBe(
			'311',
		);
	});

	it('enters and exits zen mode by restoring prior panel visibility state', async () => {
		const { desktopShellState } = await import('./desktop-shell.svelte.js');

		desktopShellState.setLocalPanelCollapsed(false);
		desktopShellState.setDetailPanelOpen(true);

		desktopShellState.setZenMode(true);
		expect(desktopShellState.zenMode).toBe(true);
		expect(desktopShellState.localPanelCollapsed).toBe(true);
		expect(desktopShellState.detailPanelOpen).toBe(false);
		expect(window.localStorage.getItem('dndtools:desktop-shell:local-panel-collapsed')).toBe('0');

		desktopShellState.setZenMode(false);
		expect(desktopShellState.zenMode).toBe(false);
		expect(desktopShellState.localPanelCollapsed).toBe(false);
		expect(desktopShellState.detailPanelOpen).toBe(true);
	});

	it('tracks local panel scroll positions per section across navigation', async () => {
		const { desktopShellState } = await import('./desktop-shell.svelte.js');

		desktopShellState.rememberLocalPanelScroll('knowledge', 180);
		desktopShellState.rememberLocalPanelScroll('session', 44.7);

		expect(desktopShellState.getLocalPanelScroll('knowledge')).toBe(180);
		expect(desktopShellState.getLocalPanelScroll('session')).toBe(45);
		expect(desktopShellState.getLocalPanelScroll('atlas')).toBe(0);
	});
});
