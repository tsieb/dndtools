// Cognito auth via SRP (amazon-cognito-identity-js) — passwords never leave the
// device except through the SRP proof; the browser talks directly to
// cognito-idp.<region>. Tokens are held by the custom secure tokenStore (memory +
// OS-encrypted durable mirror). This module is pure logic; React state lives in
// AuthContext. No-ops safely when identity isn't configured (local-first).
import {
	CognitoUserPool,
	CognitoUser,
	AuthenticationDetails,
	CognitoUserAttribute,
	type CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { cloudConfig, isAuthConfigured } from './config';
import { tokenStore } from './tokenStore';

export interface AuthUser {
	sub: string;
	email: string;
}

let pool: CognitoUserPool | null = null;
function userPool(): CognitoUserPool {
	if (!isAuthConfigured) throw new Error('Cloud identity is not configured.');
	if (!pool) {
		pool = new CognitoUserPool({
			UserPoolId: cloudConfig.userPoolId,
			ClientId: cloudConfig.userPoolClientId,
			Storage: tokenStore,
		});
	}
	return pool;
}

function cognitoUser(email: string): CognitoUser {
	return new CognitoUser({
		Username: email.trim().toLowerCase(),
		Pool: userPool(),
		Storage: tokenStore,
	});
}

/** Load persisted tokens into memory. Call once at app start before reading auth state. */
export async function hydrateAuth(): Promise<void> {
	await tokenStore.hydrate();
}

export function signUp(email: string, password: string): Promise<void> {
	return new Promise((resolve, reject) => {
		userPool().signUp(
			email.trim().toLowerCase(),
			password,
			[new CognitoUserAttribute({ Name: 'email', Value: email })],
			[],
			(err) => (err ? reject(err) : resolve()),
		);
	});
}

export function confirmSignUp(email: string, code: string): Promise<void> {
	return new Promise((resolve, reject) => {
		cognitoUser(email).confirmRegistration(code, true, (err) => (err ? reject(err) : resolve()));
	});
}

export function resendCode(email: string): Promise<void> {
	return new Promise((resolve, reject) => {
		cognitoUser(email).resendConfirmationCode((err) => (err ? reject(err) : resolve()));
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
export function requestPasswordReset(email: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const complete = () => resolve();
		cognitoUser(email).forgotPassword({
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
export function confirmPasswordReset(
	email: string,
	code: string,
	newPassword: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		cognitoUser(email).confirmPassword(code, newPassword, {
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

export function signIn(email: string, password: string): Promise<AuthUser> {
	const username = email.trim().toLowerCase();
	return new Promise((resolve, reject) => {
		cognitoUser(username).authenticateUser(
			new AuthenticationDetails({ Username: username, Password: password }),
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
export function currentUser(): Promise<AuthUser | null> {
	const user = userPool().getCurrentUser();
	if (!user) return Promise.resolve(null);
	return new Promise((resolve) => {
		user.getSession((err: Error | null, session: CognitoUserSession | null) => {
			if (err || !session || !session.isValid()) return resolve(null);
			resolve(userFromSession(session));
		});
	});
}

/** A valid Cognito ID token (auto-refreshed), or null if signed out. */
export function getIdToken(): Promise<string | null> {
	const user = userPool().getCurrentUser();
	if (!user) return Promise.resolve(null);
	return new Promise((resolve) => {
		user.getSession((err: Error | null, session: CognitoUserSession | null) => {
			if (err || !session || !session.isValid()) return resolve(null);
			resolve(session.getIdToken().getJwtToken());
		});
	});
}

export async function signOut(): Promise<void> {
	const user = userPool().getCurrentUser();
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
