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
}));

vi.mock('./tokenStore', () => ({ tokenStore: {} }));
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

function configured() {
	vi.stubEnv('VITE_CLOUD_REGION', 'ca-central-1');
	vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'ca-central-1_pool');
	vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-id');
	vi.stubEnv('VITE_SIGNALING_WS_URL', 'wss://sig/dev');
}

async function loadAuth() {
	vi.resetModules();
	return import('./auth');
}

beforeEach(() => {
	vi.unstubAllEnvs();
	Object.values(sdk).forEach((fn) => fn.mockReset());
});

describe('signIn', () => {
	it('resolves the {sub,email} decoded from the id token on success', async () => {
		configured();
		sdk.authenticateUser.mockImplementation((_d, cbs) => cbs.onSuccess(session('user-1', 'dm@example.com')));
		const { signIn } = await loadAuth();

		await expect(signIn('dm@example.com', 'pw')).resolves.toEqual({ sub: 'user-1', email: 'dm@example.com' });
	});

	it('rejects on authentication failure', async () => {
		configured();
		sdk.authenticateUser.mockImplementation((_d, cbs) => cbs.onFailure(new Error('Incorrect username or password.')));
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
		const user = { getSession: (cb: (e: null, s: unknown) => void) => cb(null, session('user-9', 'p@example.com')) };
		sdk.getCurrentUser.mockReturnValue(user);
		const { currentUser, getIdToken } = await loadAuth();

		await expect(currentUser()).resolves.toEqual({ sub: 'user-9', email: 'p@example.com' });
		await expect(getIdToken()).resolves.toBe('JWT-TOKEN');
	});

	it('returns null when the session cannot be refreshed', async () => {
		configured();
		const user = { getSession: (cb: (e: Error, s: unknown) => void) => cb(new Error('expired'), null) };
		sdk.getCurrentUser.mockReturnValue(user);
		const { currentUser, getIdToken } = await loadAuth();

		await expect(currentUser()).resolves.toBeNull();
		await expect(getIdToken()).resolves.toBeNull();
	});
});

describe('local-first guard (identity not configured)', () => {
	it('rejects auth calls with a clear error rather than making a bogus request', async () => {
		// no env stubbed → isAuthConfigured is false
		const { signUp } = await loadAuth();
		await expect(signUp('a@b.com', 'pw')).rejects.toThrow(/not configured/i);
	});
});
