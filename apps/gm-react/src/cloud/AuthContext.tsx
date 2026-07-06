// Global auth state for gm-react. Local-first: when identity isn't configured the
// provider reports status 'unconfigured' and cloud entry points hide themselves.
// requireAuth() is the gate cloud features call — it resolves immediately if signed
// in, otherwise opens the auth modal and resolves once the user signs in (or false
// if they dismiss it). The provider renders the auth modal itself.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isAuthConfigured } from './config';
import {
  hydrateAuth,
  currentUser,
  signIn as doSignIn,
  signUp as doSignUp,
  confirmSignUp as doConfirm,
  resendCode as doResend,
  signOut as doSignOut,
  getIdToken as doGetIdToken,
  type AuthUser,
} from './auth';
import { AuthModal } from './AuthModal';

export type AuthStatus = 'loading' | 'unconfigured' | 'signed-out' | 'signed-in';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  isConfigured: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  confirm(email: string, code: string): Promise<void>;
  resend(email: string): Promise<void>;
  signOut(): Promise<void>;
  getIdToken(): Promise<string | null>;
  /** Ensure the user is signed in; opens the modal if needed. Resolves true if signed in. */
  requireAuth(): Promise<boolean>;
  /** Open the auth modal directly (e.g. from an "Account" button). */
  openAuthModal(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isAuthConfigured ? 'loading' : 'unconfigured');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const gateResolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    if (!isAuthConfigured) return;
    let cancelled = false;
    (async () => {
      await hydrateAuth();
      const u = await currentUser();
      if (cancelled) return;
      setUser(u);
      setStatus(u ? 'signed-in' : 'signed-out');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveGate = useCallback((ok: boolean) => {
    gateResolver.current?.(ok);
    gateResolver.current = null;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const u = await doSignIn(email, password);
      setUser(u);
      setStatus('signed-in');
      setModalOpen(false);
      resolveGate(true);
    },
    [resolveGate],
  );

  const signOut = useCallback(async () => {
    await doSignOut();
    setUser(null);
    setStatus('signed-out');
  }, []);

  const requireAuth = useCallback((): Promise<boolean> => {
    if (!isAuthConfigured) return Promise.resolve(false);
    if (user) return Promise.resolve(true);
    setModalOpen(true);
    return new Promise<boolean>((resolve) => {
      gateResolver.current = resolve;
    });
  }, [user]);

  const openAuthModal = useCallback(() => setModalOpen(true), []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    resolveGate(false);
  }, [resolveGate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isConfigured: isAuthConfigured,
      signIn,
      signUp: doSignUp,
      confirm: doConfirm,
      resend: doResend,
      signOut,
      getIdToken: doGetIdToken,
      requireAuth,
      openAuthModal,
    }),
    [status, user, signIn, signOut, requireAuth, openAuthModal],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isAuthConfigured && (
        <AuthModal
          open={modalOpen}
          onClose={closeModal}
          signIn={signIn}
          signUp={doSignUp}
          confirm={doConfirm}
          resend={doResend}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
