// Global auth state for gm-react. Local-first: when identity isn't configured the
// provider reports status 'unconfigured' and cloud entry points hide themselves.
// requireAuth() is the gate cloud features call — it resolves immediately if signed
// in, otherwise opens the auth modal and resolves once the user signs in (or false
// if they dismiss it). The provider renders the auth modal itself.
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import type { ReactNode } from 'react';
import { isAuthConfigured } from './config';
import {
	hydrateAuth,
	currentUser,
	signIn as doSignIn,
	signUp as doSignUp,
	confirmSignUp as doConfirm,
	resendCode as doResend,
	requestPasswordReset as doRequestPasswordReset,
	confirmPasswordReset as doConfirmPasswordReset,
	signOut as doSignOut,
	getIdToken as doGetIdToken,
	type AuthUser,
} from './auth';
import { AuthModal } from './AuthModal';

export type AuthStatus = 'loading' | 'unconfigured' | 'signed-out' | 'signed-in' | 'storage-error';

interface AuthContextValue {
	status: AuthStatus;
	user: AuthUser | null;
	/** Non-secret, actionable detail when saved sign-in state could not be read securely. */
	storageError: string | null;
	isConfigured: boolean;
	signIn(email: string, password: string): Promise<void>;
	signUp(email: string, password: string): Promise<void>;
	confirm(email: string, code: string): Promise<void>;
	resend(email: string): Promise<void>;
	requestPasswordReset(email: string): Promise<void>;
	confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void>;
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
	const [storageError, setStorageError] = useState<string | null>(null);
	const [modalOpen, setModalOpen] = useState(false);
	const gateResolvers = useRef<Array<(ok: boolean) => void>>([]);

	useEffect(() => {
		if (!isAuthConfigured) return;
		let cancelled = false;
		(async () => {
			try {
				await hydrateAuth();
				const u = await currentUser();
				if (cancelled) return;
				setUser(u);
				setStorageError(null);
				setStatus(u ? 'signed-in' : 'signed-out');
			} catch {
				if (cancelled) return;
				// Never leave the application in an infinite loading state, and never collapse a damaged
				// encrypted store into an ordinary signed-out state. Cloud actions remain fail-closed while
				// the user's local-first vault remains available.
				setUser(null);
				setStorageError(
					'Saved sign-in details could not be read securely. Restart the app and check your operating-system credential store.',
				);
				setStatus('storage-error');
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const resolveGate = useCallback((ok: boolean) => {
		// Resolve EVERY pending gate: several cloud actions may await auth at once,
		// and dropping all but the last would leave the earlier callers hung forever.
		const pending = gateResolvers.current;
		gateResolvers.current = [];
		for (const resolve of pending) resolve(ok);
	}, []);

	const signIn = useCallback(
		async (email: string, password: string) => {
			const u = await doSignIn(email, password);
			setUser(u);
			setStorageError(null);
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
		if (status === 'loading' || status === 'storage-error') return Promise.resolve(false);
		if (user) return Promise.resolve(true);
		setModalOpen(true);
		return new Promise<boolean>((resolve) => {
			gateResolvers.current.push(resolve);
		});
	}, [status, user]);

	const openAuthModal = useCallback(() => {
		if (status !== 'storage-error') setModalOpen(true);
	}, [status]);

	const closeModal = useCallback(() => {
		setModalOpen(false);
		resolveGate(false);
	}, [resolveGate]);

	const value = useMemo<AuthContextValue>(
		() => ({
			status,
			user,
			storageError,
			isConfigured: isAuthConfigured,
			signIn,
			signUp: doSignUp,
			confirm: doConfirm,
			resend: doResend,
			requestPasswordReset: doRequestPasswordReset,
			confirmPasswordReset: doConfirmPasswordReset,
			signOut,
			getIdToken: doGetIdToken,
			requireAuth,
			openAuthModal,
		}),
		[status, user, storageError, signIn, signOut, requireAuth, openAuthModal],
	);

	return (
		<AuthContext.Provider value={value}>
			{children}
			{storageError && (
				<div
					role="alert"
					style={{
						position: 'fixed',
						top: 'calc(var(--native-titlebar-height, 0px) + 12px)',
						right: 12,
						zIndex: 10000,
						maxWidth: 420,
						padding: '10px 14px',
						border: '1px solid var(--color-status-error-border)',
						borderRadius: 'var(--radius-md, 6px)',
						background: 'var(--color-surface)',
						color: 'var(--color-text-primary)',
						font: '600 13px/1.5 var(--font-sans)',
						boxShadow: 'var(--shadow-lg)',
					}}
				>
					Online account paused — {storageError}
				</div>
			)}
			{isAuthConfigured && (
				<AuthModal
					open={modalOpen}
					onClose={closeModal}
					signIn={signIn}
					signUp={doSignUp}
					confirm={doConfirm}
					resend={doResend}
					requestPasswordReset={doRequestPasswordReset}
					confirmPasswordReset={doConfirmPasswordReset}
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
