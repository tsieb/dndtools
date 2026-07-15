// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hydrateAuth: vi.fn<() => Promise<void>>(),
	currentUser: vi.fn(),
}));

vi.mock('./config', () => ({ isAuthConfigured: true }));
vi.mock('./auth', () => ({
	hydrateAuth: mocks.hydrateAuth,
	currentUser: mocks.currentUser,
	signIn: vi.fn(),
	signUp: vi.fn(),
	confirmSignUp: vi.fn(),
	resendCode: vi.fn(),
	requestPasswordReset: vi.fn(),
	confirmPasswordReset: vi.fn(),
	signOut: vi.fn(),
	getIdToken: vi.fn(),
}));
vi.mock('./AuthModal', () => ({ AuthModal: () => null }));

import { AuthProvider, useAuth } from './AuthContext';

let root: Root;
let container: HTMLDivElement;

function Probe() {
	const auth = useAuth();
	return (
		<div data-status={auth.status} data-error={auth.storageError ?? ''}>
			{auth.status}
		</div>
	);
}

beforeEach(() => {
	(
		globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	mocks.hydrateAuth.mockReset().mockResolvedValue(undefined);
	mocks.currentUser.mockReset().mockResolvedValue(null);
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('AuthProvider secure-store hydration', () => {
	it('finishes in signed-out state when no saved Cognito session exists', async () => {
		await act(async () =>
			root.render(
				<AuthProvider>
					<Probe />
				</AuthProvider>,
			),
		);

		await vi.waitFor(() =>
			expect(container.querySelector('[data-status]')?.textContent).toBe('signed-out'),
		);
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	it('leaves loading fail-closed and exposes an alert when credential hydration fails', async () => {
		mocks.hydrateAuth.mockRejectedValue(new Error('private ciphertext detail'));

		await act(async () =>
			root.render(
				<AuthProvider>
					<Probe />
				</AuthProvider>,
			),
		);

		await vi.waitFor(() =>
			expect(container.querySelector('[data-status]')?.textContent).toBe('storage-error'),
		);
		expect(mocks.currentUser).not.toHaveBeenCalled();
		expect(container.querySelector('[data-status]')?.getAttribute('data-error')).toMatch(
			/could not be read securely/i,
		);
		const alert = container.querySelector('[role="alert"]')?.textContent ?? '';
		expect(alert).toMatch(/online account paused/i);
		expect(alert).not.toContain('private ciphertext detail');
	});
});
