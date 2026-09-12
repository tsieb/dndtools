// Cognito auth via SRP (amazon-cognito-identity-js) — passwords never leave the
// device except through the SRP proof; the browser talks directly to
// cognito-idp.<region>. Tokens are held by the custom secure tokenStore (memory +
// OS-encrypted durable mirror). This module is pure logic; React state lives in
// AuthContext. No-ops safely when identity isn't configured (local-first).
import type { CognitoUser, CognitoUserPool, CognitoUserSession } from 'amazon-cognito-identity-js';
import { cloudConfig, isAuthConfigured } from './config';
import { tokenStore } from './tokenStore';

export interface AuthUser {
	sub: string;
	email: string;
}

type CognitoSdk = typeof import('amazon-cognito-identity-js');

let sdkLoad: Promise<CognitoSdk> | null = null;
/**
 * The Cognito SDK, fetched the first time identity is actually used. It (with the `buffer` polyfill
 * it drags in) is not on the boot path of a local-first vault, and a build with no identity
 * configured never loads it at all. Fails closed, as before, when identity is unconfigured.
 */
function cognitoSdk(): Promise<CognitoSdk> {
	if (!isAuthConfigured) return Promise.reject(new Error('Cloud identity is not configured.'));
	sdkLoad ??= import('amazon-cognito-identity-js');
	return sdkLoad;
}

let pool: CognitoUserPool | null = null;
async function userPool(): Promise<CognitoUserPool> {
	const sdk = await cognitoSdk();
	pool ??= new sdk.CognitoUserPool({
		UserPoolId: cloudConfig.userPoolId,
		ClientId: cloudConfig.userPoolClientId,
		Storage: tokenStore,
	});
	return pool;
}

async function cognitoUser(email: string): Promise<CognitoUser> {
	const sdk = await cognitoSdk();
	return new sdk.CognitoUser({
		Username: email.trim().toLowerCase(),
		Pool: await userPool(),
		Storage: tokenStore,
	});
}

/** Load persisted tokens into memory. Call once at app start before reading auth state. */
export async function hydrateAuth(): Promise<void> {
	await tokenStore.hydrate();
}

export async function signUp(email: string, password: string): Promise<void> {
	const sdk = await cognitoSdk();
	const userPoolInstance = await userPool();
	return new Promise((resolve, reject) => {
		userPoolInstance.signUp(
			email.trim().toLowerCase(),
			password,
			[new sdk.CognitoUserAttribute({ Name: 'email', Value: email })],
			[],
			(err) => (err ? reject(err) : resolve()),
		);
	});
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
	const user = await cognitoUser(email);
	return new Promise((resolve, reject) => {
		user.confirmRegistration(code, true, (err) => (err ? reject(err) : resolve()));
	});
}

export async function resendCode(email: string): Promise<void> {
	const user = await cognitoUser(email);
	return new Promise((resolve, reject) => {
		user.resendConfirmationCode((err) => (err ? reject(err) : resolve()));
	});
}

type RecoveryError = Error & { code: string };

function cognitoErrorCode(error: unknown): string {
	const candidate = error as { code?: unknown; name?: unknown };
	if (typeof candidate?.code === 'string') return candidate.code;
	return typeof candidate?.name === 'string' ? candidate.name : '';
}

function recoveryError(code: string, message: string): RecoveryError {
	const error = new Error(message) as RecoveryError;
	error.code = code;
	return error;
}

const ENUMERATION_SAFE_REQUEST_CODES = new Set([
	'UserNotFoundException',
	'InvalidParameterException',
	'NotAuthorizedException',
]);
const UNUSABLE_RESET_CODE_ERRORS = new Set([
	'UserNotFoundException',
	'CodeMismatchException',
	'ExpiredCodeException',
	'NotAuthorizedException',
]);

/**
 * Start password recovery without revealing whether the address belongs to an account. Cognito can
 * signal delivery through either callback; account-state errors resolve identically to successful
 * delivery so callers always present the same next step and wording.
 */
export async function requestPasswordReset(email: string): Promise<void> {
	const user = await cognitoUser(email);
	return new Promise((resolve, reject) => {
		const complete = () => resolve();
		user.forgotPassword({
			onSuccess: complete,
			inputVerificationCode: complete,
			onFailure: (error) => {
				if (ENUMERATION_SAFE_REQUEST_CODES.has(cognitoErrorCode(error))) return complete();
				reject(
					recoveryError(
						'PasswordResetRequestFailed',
						'Couldn’t send a reset code. Check your connection and try again.',
					),
				);
			},
		});
	});
}

/** Confirm a reset code, exposing only recovery-safe errors rather than raw Cognito details. */
export async function confirmPasswordReset(
	email: string,
	code: string,
	newPassword: string,
): Promise<void> {
	const user = await cognitoUser(email);
	return new Promise((resolve, reject) => {
		user.confirmPassword(code, newPassword, {
			onSuccess: () => resolve(),
			onFailure: (error) => {
				const errorCode = cognitoErrorCode(error);
				if (UNUSABLE_RESET_CODE_ERRORS.has(errorCode)) {
					return reject(
						recoveryError(
							'PasswordResetCodeInvalid',
							'That code can’t be used. Request a new code and try again.',
						),
					);
				}
				if (errorCode === 'InvalidPasswordException') {
					return reject(
						recoveryError(
							'PasswordResetPasswordInvalid',
							'That password doesn’t meet the account password rules.',
						),
					);
				}
				if (
					errorCode === 'LimitExceededException' ||
					errorCode === 'TooManyFailedAttemptsException'
				) {
					return reject(
						recoveryError(
							'PasswordResetLimited',
							'Too many attempts. Wait a little, then request a new code.',
						),
					);
				}
				reject(
					recoveryError(
						'PasswordResetFailed',
						'Couldn’t update the password. Request a new code and try again.',
					),
				);
			},
		});
	});
}

function userFromSession(session: CognitoUserSession): AuthUser {
	const payload = session.getIdToken().decodePayload() as Record<string, unknown>;
	return {
		sub: String(payload.sub ?? ''),
		email: String(payload.email ?? ''),
	};
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
	const username = email.trim().toLowerCase();
	const sdk = await cognitoSdk();
	const user = await cognitoUser(username);
	return new Promise((resolve, reject) => {
		user.authenticateUser(
			new sdk.AuthenticationDetails({ Username: username, Password: password }),
			{
				onSuccess: (session) => resolve(userFromSession(session)),
				onFailure: (err) => reject(err),
				// A NEW_PASSWORD_REQUIRED challenge is not expected for self-signup users;
				// surface it as an error rather than silently stalling.
				newPasswordRequired: () =>
					reject(new Error('A new password is required for this account.')),
			},
		);
	});
}

/** Current signed-in user (from a valid/refreshable session), or null. */
export async function currentUser(): Promise<AuthUser | null> {
	const user = (await userPool()).getCurrentUser();
	if (!user) return null;
	return new Promise((resolve) => {
		user.getSession((err: Error | null, session: CognitoUserSession | null) => {
			if (err || !session || !session.isValid()) return resolve(null);
			resolve(userFromSession(session));
		});
	});
}

/** A valid Cognito ID token (auto-refreshed), or null if signed out. */
export async function getIdToken(): Promise<string | null> {
	const user = (await userPool()).getCurrentUser();
	if (!user) return null;
	return new Promise((resolve) => {
		user.getSession((err: Error | null, session: CognitoUserSession | null) => {
			if (err || !session || !session.isValid()) return resolve(null);
			resolve(session.getIdToken().getJwtToken());
		});
	});
}

export async function signOut(): Promise<void> {
	const user = (await userPool()).getCurrentUser();
	if (user) {
		await new Promise<void>((resolve) => {
			user.signOut(() => resolve());
		});
	}
	// Cognito's ICognitoStorage removals are synchronous at the interface but asynchronously mirrored
	// to Electron safeStorage. Sweep the complete namespace even when Cognito had no current user (or
	// its token-revocation callback could not identify a valid session), then wait before account/UI
	// teardown reports success. Otherwise a fast app exit can leave a refresh token to resurrect.
	tokenStore.clear();
	await tokenStore.flush();
}
