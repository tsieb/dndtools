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
  return new CognitoUser({ Username: email, Pool: userPool(), Storage: tokenStore });
}

/** Load persisted tokens into memory. Call once at app start before reading auth state. */
export async function hydrateAuth(): Promise<void> {
  await tokenStore.hydrate();
}

export function signUp(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    userPool().signUp(
      email,
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

function userFromSession(session: CognitoUserSession): AuthUser {
  const payload = session.getIdToken().decodePayload() as Record<string, unknown>;
  return {
    sub: String(payload.sub ?? ''),
    email: String(payload.email ?? ''),
  };
}

export function signIn(email: string, password: string): Promise<AuthUser> {
  return new Promise((resolve, reject) => {
    cognitoUser(email).authenticateUser(
      new AuthenticationDetails({ Username: email, Password: password }),
      {
        onSuccess: (session) => resolve(userFromSession(session)),
        onFailure: (err) => reject(err),
        // A NEW_PASSWORD_REQUIRED challenge is not expected for self-signup users;
        // surface it as an error rather than silently stalling.
        newPasswordRequired: () => reject(new Error('A new password is required for this account.')),
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

export function signOut(): Promise<void> {
  const user = userPool().getCurrentUser();
  return new Promise((resolve) => {
    if (!user) return resolve();
    user.signOut(() => resolve());
  });
}
