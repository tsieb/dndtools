import { describe, it, expect, beforeEach, vi } from 'vitest';

// auth.ts wraps amazon-cognito-identity-js in promises and maps a Cognito session to
// our {sub,email} AuthUser. We mock the SDK (no network / no SRP crypto) and drive
// config from real env, so we exercise OUR logic: identity mapping, the
// newPasswordRequired guard, null-session handling, and the local-first
// "not configured" guard — not Cognito internals.

const sdk = vi.hoisted(() => ({
	authenticateUser: vi.fn(),
	getCurrentUser: vi.fn(),
	signUp: vi.fn(),
	confirmRegistration: vi.fn(),
	resendConfirmationCode: vi.fn(),
	forgotPassword: vi.fn(),
	confirmPassword: vi.fn(),
}));
const tokenStore = vi.hoisted(() => ({
	hydrate: vi.fn(async (): Promise<void> => undefined),
	clear: vi.fn(),
	flush: vi.fn(async (): Promise<void> => undefined),
}));

vi.mock('./tokenStore', () => ({ tokenStore }));
vi.mock('amazon-cognito-identity-js', () => ({
	CognitoUserPool: class {
		getCurrentUser() {
			return sdk.getCurrentUser();
		}
		signUp(...args: unknown[]) {
			return sdk.signUp(...args);
		}
	},
	CognitoUser: class {
		authenticateUser(...args: unknown[]) {
			return sdk.authenticateUser(...args);
		}
		confirmRegistration(...args: unknown[]) {
			return sdk.confirmRegistration(...args);
		}
		resendConfirmationCode(...args: unknown[]) {
			return sdk.resendConfirmationCode(...args);
		}
		forgotPassword(...args: unknown[]) {
			return sdk.forgotPassword(...args);
		}
		confirmPassword(...args: unknown[]) {
			return sdk.confirmPassword(...args);
		}
	},
	AuthenticationDetails: class {
		constructor(public opts: unknown) {}
	},
	CognitoUserAttribute: class {
		constructor(public opts: unknown) {}
	},
}));

const session = (sub: string, email: string) => ({
	isValid: () => true,
	getIdToken: () => ({
		decodePayload: () => ({ sub, email }),
		getJwtToken: () => 'JWT-TOKEN',
	}),
});

function cognitoError(code: string, detail = `private provider detail for ${code}`) {
	return Object.assign(new Error(detail), { code });
}

function configured() {
	vi.stubEnv('VITE_CLOUD_REGION', 'ca-central-1');
	vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'ca-central-1_pool');
	vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'clientid123');
	vi.stubEnv('VITE_SIGNALING_WS_URL', 'wss://sig/dev');
}

async function loadAuth() {
	vi.resetModules();
	return import('./auth');
}

beforeEach(() => {
	vi.unstubAllEnvs();
	Object.values(sdk).forEach((fn) => fn.mockReset());
	tokenStore.hydrate.mockReset().mockResolvedValue(undefined);
	tokenStore.clear.mockReset();
	tokenStore.flush.mockReset().mockResolvedValue(undefined);
});

describe('signIn', () => {
	it('resolves the {sub,email} decoded from the id token on success', async () => {
		configured();
		sdk.authenticateUser.mockImplementation((_d, cbs) =>
			cbs.onSuccess(session('user-1', 'dm@example.com')),
		);
		const { signIn } = await loadAuth();

		await expect(signIn('  DM@Example.COM ', 'pw')).resolves.toEqual({
			sub: 'user-1',
			email: 'dm@example.com',
		});
		expect(
			(sdk.authenticateUser.mock.calls[0]?.[0] as { opts?: { Username?: string } }).opts,
		).toMatchObject({
			Username: 'dm@example.com',
		});
	});

	it('rejects on authentication failure', async () => {
		configured();
		sdk.authenticateUser.mockImplementation((_d, cbs) =>
			cbs.onFailure(new Error('Incorrect username or password.')),
		);
		const { signIn } = await loadAuth();

		await expect(signIn('dm@example.com', 'wrong')).rejects.toThrow(/incorrect/i);
	});

	it('rejects (rather than stalling) when Cognito demands a new password', async () => {
		configured();
		sdk.authenticateUser.mockImplementation((_d, cbs) => cbs.newPasswordRequired({}, {}));
		const { signIn } = await loadAuth();

		await expect(signIn('dm@example.com', 'temp')).rejects.toThrow(/new password/i);
	});
});

describe('signUp', () => {
	it('normalizes the email username before creating an account', async () => {
		configured();
		sdk.signUp.mockImplementation((_email, _password, _attributes, _validation, callback) =>
			callback(null, {}),
		);
		const { signUp } = await loadAuth();

		await expect(signUp('  New.DM@Example.COM ', 'LongEnoughPassword7')).resolves.toBeUndefined();
		expect(sdk.signUp.mock.calls[0]?.[0]).toBe('new.dm@example.com');
	});
});

describe('password recovery', () => {
	it('resolves a reset-code request through Cognito’s verification-code callback', async () => {
		configured();
		sdk.forgotPassword.mockImplementation((callbacks) =>
			callbacks.inputVerificationCode({ delivery: 'email' }),
		);
		const { requestPasswordReset } = await loadAuth();

		await expect(requestPasswordReset('dm@example.com')).resolves.toBeUndefined();
		expect(sdk.forgotPassword).toHaveBeenCalledOnce();
	});

	it('makes missing and account-state reset requests indistinguishable from delivery', async () => {
		configured();
		const { requestPasswordReset } = await loadAuth();

		for (const code of [
			'UserNotFoundException',
			'InvalidParameterException',
			'NotAuthorizedException',
		]) {
			sdk.forgotPassword.mockImplementationOnce((callbacks) =>
				callbacks.onFailure(cognitoError(code)),
			);
			await expect(requestPasswordReset('unknown@example.com')).resolves.toBeUndefined();
		}
	});

	it('sanitizes operational reset-request failures', async () => {
		configured();
		sdk.forgotPassword.mockImplementation((callbacks) =>
			callbacks.onFailure(
				cognitoError('CodeDeliveryFailureException', 'SMTP account alice@example.com failed'),
			),
		);
		const { requestPasswordReset } = await loadAuth();

		const failure = requestPasswordReset('alice@example.com');
		await expect(failure).rejects.toMatchObject({
			code: 'PasswordResetRequestFailed',
			message: 'Couldn’t send a reset code. Check your connection and try again.',
		});
		await expect(failure).rejects.not.toThrow(/alice|smtp/i);
	});

	it('confirms a code and new password through Cognito', async () => {
		configured();
		sdk.confirmPassword.mockImplementation((_code, _password, callbacks) =>
			callbacks.onSuccess('SUCCESS'),
		);
		const { confirmPasswordReset } = await loadAuth();

		await expect(
			confirmPasswordReset('dm@example.com', '123456', 'LongEnoughPassword7'),
		).resolves.toBeUndefined();
		expect(sdk.confirmPassword).toHaveBeenCalledWith(
			'123456',
			'LongEnoughPassword7',
			expect.objectContaining({ onSuccess: expect.any(Function), onFailure: expect.any(Function) }),
		);
	});

	it('uses one safe error for missing, mismatched, and expired reset codes', async () => {
		configured();
		const { confirmPasswordReset } = await loadAuth();

		for (const code of ['UserNotFoundException', 'CodeMismatchException', 'ExpiredCodeException']) {
			sdk.confirmPassword.mockImplementationOnce((_resetCode, _password, callbacks) =>
				callbacks.onFailure(cognitoError(code)),
			);
			await expect(
				confirmPasswordReset('unknown@example.com', '000000', 'LongEnoughPassword7'),
			).rejects.toMatchObject({
				code: 'PasswordResetCodeInvalid',
				message: 'That code can’t be used. Request a new code and try again.',
			});
		}
	});
});

describe('currentUser / getIdToken', () => {
	it('returns null when nobody is signed in', async () => {
		configured();
		sdk.getCurrentUser.mockReturnValue(null);
		const { currentUser, getIdToken } = await loadAuth();

		await expect(currentUser()).resolves.toBeNull();
		await expect(getIdToken()).resolves.toBeNull();
	});

	it('returns the user and a fresh JWT from a valid session', async () => {
		configured();
		const user = {
			getSession: (cb: (e: null, s: unknown) => void) =>
				cb(null, session('user-9', 'p@example.com')),
		};
		sdk.getCurrentUser.mockReturnValue(user);
		const { currentUser, getIdToken } = await loadAuth();

		await expect(currentUser()).resolves.toEqual({ sub: 'user-9', email: 'p@example.com' });
		await expect(getIdToken()).resolves.toBe('JWT-TOKEN');
	});

	it('returns null when the session cannot be refreshed', async () => {
		configured();
		const user = {
			getSession: (cb: (e: Error, s: unknown) => void) => cb(new Error('expired'), null),
		};
		sdk.getCurrentUser.mockReturnValue(user);
		const { currentUser, getIdToken } = await loadAuth();

		await expect(currentUser()).resolves.toBeNull();
		await expect(getIdToken()).resolves.toBeNull();
	});
});

describe('signOut', () => {
	it('waits for the durable token purge before resolving', async () => {
		configured();
		let releaseFlush!: () => void;
		const flushGate = new Promise<void>((resolve) => {
			releaseFlush = resolve;
		});
		tokenStore.flush.mockReturnValue(flushGate);
		const sdkSignOut = vi.fn((callback: () => void) => callback());
		sdk.getCurrentUser.mockReturnValue({ signOut: sdkSignOut });
		const { signOut } = await loadAuth();

		let resolved = false;
		const pending = signOut().then(() => {
			resolved = true;
		});
		await vi.waitFor(() => expect(tokenStore.clear).toHaveBeenCalledOnce());
		expect(sdkSignOut).toHaveBeenCalledOnce();
		expect(tokenStore.flush).toHaveBeenCalledOnce();
		expect(resolved).toBe(false);

		releaseFlush();
		await pending;
		expect(resolved).toBe(true);
	});

	it('sweeps and flushes stale durable tokens even when Cognito has no current user', async () => {
		configured();
		sdk.getCurrentUser.mockReturnValue(null);
		const { signOut } = await loadAuth();

		await signOut();

		expect(tokenStore.clear).toHaveBeenCalledOnce();
		expect(tokenStore.flush).toHaveBeenCalledOnce();
	});

	it('rejects instead of claiming teardown succeeded when durable removal fails', async () => {
		configured();
		sdk.getCurrentUser.mockReturnValue(null);
		tokenStore.flush.mockRejectedValue(new Error('durable remove failed'));
		const { signOut } = await loadAuth();

		await expect(signOut()).rejects.toThrow(/durable remove failed/i);
		expect(tokenStore.clear).toHaveBeenCalledOnce();
	});
});

describe('local-first guard (identity not configured)', () => {
	it('rejects auth calls with a clear error rather than making a bogus request', async () => {
		// Fail closed regardless of a developer's real `.env.local`; tests must never inherit live
		// Cognito coordinates from the working copy.
		vi.stubEnv('VITE_CLOUD_REGION', '');
		vi.stubEnv('VITE_COGNITO_USER_POOL_ID', '');
		vi.stubEnv('VITE_COGNITO_CLIENT_ID', '');
		const { signUp } = await loadAuth();
		await expect(signUp('a@b.com', 'pw')).rejects.toThrow(/not configured/i);
	});
});
