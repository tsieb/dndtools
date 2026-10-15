import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { BETA_FEEDBACK_URL } from '../../apps/gm-react/src/platform/desktopFeedback';

const root = new URL('../../apps/gm-react/electron/', import.meta.url);
const require = createRequire(new URL('main.cjs', root));

function harness() {
	const handlers = new Map<string, (...args: unknown[]) => Promise<boolean>>();
	const frame = { url: 'dndtools://app/index.html#/help' };
	let windowOpen!: (details: { url: string }) => { action: string };
	const sender = {
		mainFrame: frame,
		getURL: () => frame.url,
		on: vi.fn(),
		setWindowOpenHandler: (handler: typeof windowOpen) => {
			windowOpen = handler;
		},
	};
	const event = { sender, senderFrame: frame };
	const win = {
		webContents: sender,
		isDestroyed: vi.fn(() => false),
		on: vi.fn(),
		once: vi.fn(),
		setMenuBarVisibility: vi.fn(),
		loadURL: vi.fn(),
	};
	const dialog = { showMessageBox: vi.fn(async () => ({ response: 1 })) };
	const shell = { openExternal: vi.fn(async () => {}) };
	const electron = {
		BrowserWindow: function () {
			return win;
		},
		screen: { getAllDisplays: () => [] },
		app: {
			isPackaged: true,
			setName: vi.fn(),
			getPath: () => '/virtual/feedback-test',
			requestSingleInstanceLock: () => true,
			on: vi.fn(),
			whenReady: () => new Promise(() => {}),
		},
		protocol: { registerSchemesAsPrivileged: vi.fn() },
		Menu: { buildFromTemplate: () => ({}), setApplicationMenu: vi.fn() },
		ipcMain: {
			handle: (name: string, handler: (...args: unknown[]) => Promise<boolean>) =>
				handlers.set(name, handler),
			on: vi.fn(),
		},
		dialog,
		shell,
	};
	const context = vm.createContext({
		require: (id: string) => {
			if (id === 'electron') return electron;
			if (id === 'node:fs') return { existsSync: () => false };
			if (/discovery|updater/.test(id)) throw new Error('optional module absent');
			return require(id);
		},
		__dirname: fileURLToPath(root),
		process,
		URL,
		console,
		module: { exports: {} },
		testWindow: win,
	});
	// Evaluate the entire production main module and register its real handlers. Only OS services
	// and the window are substituted; caller validation is never mocked or copied into the test.
	vm.runInContext(
		readFileSync(new URL('main.cjs', root), 'utf8') + '\ncreateWindow(); setupWindowIpc();',
		context,
	);
	const exposed: Record<string, { open: () => Promise<boolean> }> = {};
	const invoke = vi.fn((name: string, ...args: unknown[]) => handlers.get(name)!(event, ...args));
	vm.runInNewContext(readFileSync(new URL('preload.cjs', root), 'utf8'), {
		require: () => ({
			contextBridge: {
				exposeInMainWorld: (name: string, value: (typeof exposed)[string]) => {
					exposed[name] = value;
				},
			},
			ipcRenderer: { invoke, on: vi.fn() },
		}),
		window: { addEventListener: vi.fn() },
	});
	return {
		event,
		frame,
		sender,
		win,
		dialog,
		shell,
		invoke,
		open: exposed.dndtoolsFeedback.open,
		windowOpen,
		handler: handlers.get('feedback:open')!,
	};
}

describe('fixed desktop beta feedback bridge', () => {
	it('opens only the matching form through the actual preload and main handlers after confirmation', async () => {
		const h = harness();
		expect(await h.open()).toBe(true);
		expect(h.invoke).toHaveBeenCalledWith('feedback:open');
		expect(h.dialog.showMessageBox).toHaveBeenCalledWith(
			h.win,
			expect.objectContaining({ defaultId: 0, cancelId: 0 }),
		);
		expect(h.shell.openExternal).toHaveBeenCalledExactlyOnceWith(BETA_FEEDBACK_URL);
		const form = parse(
			readFileSync(
				new URL('../../.github/DISCUSSION_TEMPLATE/beta-feedback.yml', import.meta.url),
				'utf8',
			),
		);
		expect(new URL(BETA_FEEDBACK_URL).searchParams.get('category')).toBe('beta-feedback');
		expect(form.body.map((field: { id?: string }) => field.id)).toEqual(
			expect.arrayContaining([
				'version',
				'platform',
				'severity',
				'steps',
				'expected',
				'actual',
				'evidence',
			]),
		);
	});

	it.each([
		'foreign-window',
		'subframe',
		'remote-document',
		'wrong-app-path',
		'destroyed-window',
		'missing-frame',
		'destination-argument',
	])('rejects %s using the real primary sender check', async (kind) => {
		const h = harness();
		let event: unknown = h.event;
		if (kind === 'foreign-window') event = { ...h.event, sender: { ...h.sender } };
		if (kind === 'subframe') event = { ...h.event, senderFrame: { ...h.frame } };
		if (kind === 'remote-document') h.frame.url = 'https://github.com/';
		if (kind === 'wrong-app-path') h.frame.url = 'dndtools://app/widget-host.html';
		if (kind === 'destroyed-window') h.win.isDestroyed.mockReturnValue(true);
		if (kind === 'missing-frame') event = { ...h.event, senderFrame: null };
		expect(
			await h.handler(event, ...(kind === 'destination-argument' ? ['https://evil.example/'] : [])),
		).toBe(false);
		expect(h.dialog.showMessageBox).not.toHaveBeenCalled();
		expect(h.shell.openExternal).not.toHaveBeenCalled();
	});

	it('retains arbitrary popup denial while allowing the local display', () => {
		const h = harness();
		for (const url of [BETA_FEEDBACK_URL, 'https://evil.example/', 'file:///tmp/test']) {
			expect(h.windowOpen({ url }).action).toBe('deny');
		}
		expect(h.windowOpen({ url: 'dndtools://app/index.html#/display' }).action).toBe('allow');
		expect(h.shell.openExternal).not.toHaveBeenCalled();
	});

	it('honors cancellation and handles OS browser failure', async () => {
		const h = harness();
		h.dialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
		expect(await h.open()).toBe(false);
		expect(h.shell.openExternal).not.toHaveBeenCalled();
		h.shell.openExternal.mockRejectedValueOnce(new Error('no browser'));
		expect(await h.open()).toBe(false);
		expect(await h.open()).toBe(true);
	});

	it('rejects concurrent prompts and revalidates the document after confirmation', async () => {
		const h = harness();
		let confirm!: (result: { response: number }) => void;
		h.dialog.showMessageBox.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					confirm = resolve;
				}),
		);
		const opening = h.open();
		expect(await h.open()).toBe(false);
		h.frame.url = 'https://evil.example/';
		confirm({ response: 1 });
		expect(await opening).toBe(false);
		expect(h.shell.openExternal).not.toHaveBeenCalled();
	});
});
