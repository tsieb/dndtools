// Embedded Cognito auth modal (sign-in / sign-up / confirm-code / password recovery), styled with the
// design system's accessible Dialog (focus trap + Esc handled by the DS). Rendered
// by AuthProvider; opened via requireAuth()/openAuthModal(). Actions are passed in
// as props (no context import) to keep it decoupled from AuthContext.
import { useEffect, useState } from 'react';
import { Dialog, Field, Input, Button, Toaster } from '../ds';
import { CloudOfflineNoticeFor, useCloudActionsFor } from './offline';

type View = 'sign-in' | 'sign-up' | 'confirm' | 'forgot' | 'reset';

interface Props {
	open: boolean;
	onClose(): void;
	signIn(email: string, password: string): Promise<void>;
	signUp(email: string, password: string): Promise<void>;
	confirm(email: string, code: string): Promise<void>;
	resend(email: string): Promise<void>;
	requestPasswordReset(email: string): Promise<void>;
	confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void>;
}

function passwordProblem(pw: string): string | null {
	if (pw.length < 12) return 'Use at least 12 characters.';
	if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw))
		return 'Include upper- and lower-case letters and a number.';
	return null;
}

const RESET_CODE_SENT = 'If an account uses that email, a reset code is on its way.';
// RC-PLT-2.4 — this file writes its own copy rather than reading the catalog (see the note on
// `useCloudActionsFor`), so its offline strings live here with the rest of them.
const OFFLINE_REASON = 'Signing in needs a connection — you’re offline';
const OFFLINE_NOTICE =
	'You’re offline. Your vault keeps working — an account is only needed for optional online services, and you can sign in once you reconnect.';
const RESET_REQUEST_FAILED = 'Couldn’t send a reset code. Check your connection and try again.';

function errorCode(err: unknown): string {
	const candidate = err as { code?: unknown; name?: unknown };
	if (typeof candidate?.code === 'string') return candidate.code;
	return typeof candidate?.name === 'string' ? candidate.name : '';
}

/** Never display a raw provider message from the recovery surface. */
function resetErrorMessage(err: unknown): string {
	const code = errorCode(err);
	if (
		code === 'PasswordResetCodeInvalid' ||
		code === 'UserNotFoundException' ||
		code === 'CodeMismatchException' ||
		code === 'ExpiredCodeException' ||
		code === 'NotAuthorizedException'
	) {
		return 'That code can’t be used. Request a new code and try again.';
	}
	if (code === 'PasswordResetPasswordInvalid' || code === 'InvalidPasswordException') {
		return 'That password doesn’t meet the account password rules.';
	}
	if (
		code === 'PasswordResetLimited' ||
		code === 'LimitExceededException' ||
		code === 'TooManyFailedAttemptsException'
	) {
		return 'Too many attempts. Wait a little, then request a new code.';
	}
	return 'Couldn’t update the password. Request a new code and try again.';
}

function enrollmentErrorMessage(view: 'sign-up' | 'confirm', err: unknown): string {
	const code = errorCode(err);
	if (code === 'LimitExceededException' || code === 'TooManyRequestsException') {
		return 'Too many attempts. Wait a little, then try again.';
	}
	if (view === 'sign-up') {
		if (code === 'UsernameExistsException') {
			return 'An account may already use that email. Try signing in or resetting the password.';
		}
		if (code === 'CodeDeliveryFailureException') {
			return 'The account was created, but the confirmation email could not be sent. Try resending it.';
		}
		if (code === 'InvalidParameterException') {
			return 'Check the email address and password, then try again.';
		}
		return 'Couldn’t create the account. Check your connection and try again.';
	}
	if (code === 'CodeMismatchException' || code === 'ExpiredCodeException') {
		return 'That confirmation code is invalid or expired. Request a new code and try again.';
	}
	return 'Couldn’t confirm the account. Request a new code and try again.';
}

export function AuthModal({
	open,
	onClose,
	signIn,
	signUp,
	confirm,
	resend,
	requestPasswordReset,
	confirmPasswordReset,
}: Props) {
	const [view, setView] = useState<View>('sign-in');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [code, setCode] = useState('');
	const [busy, setBusy] = useState(false);
	// Every view of this modal is a Cognito round trip: sign in, sign up, confirm, reset, resend.
	// There is no offline branch to fall back to, so the whole form is gated.
	const cloudActions = useCloudActionsFor(OFFLINE_REASON);
	const [error, setError] = useState<string | null>(null);

	// The modal is a persistently-mounted singleton (AuthProvider never unmounts
	// it), and the sign-in success path closes it without clearing `busy`. Reset
	// the transient flags whenever it opens so a reopened form is never frozen.
	useEffect(() => {
		if (open) {
			setBusy(false);
			setError(null);
		} else {
			setPassword('');
			setCode('');
			setBusy(false);
			setError(null);
			setView('sign-in');
		}
	}, [open]);

	const reset = (next: View) => {
		setError(null);
		setBusy(false);
		setView(next);
	};
	const showSignIn = () => {
		setPassword('');
		setCode('');
		reset('sign-in');
	};
	const beginRecovery = () => {
		setPassword('');
		setCode('');
		reset('forgot');
	};

	async function resendResetCode() {
		// aria-disabled on a plain <button> does not swallow the click the way DS Button does.
		if (cloudActions.blocked) return;
		setError(null);
		setBusy(true);
		try {
			await requestPasswordReset(email.trim());
			Toaster.info(RESET_CODE_SENT);
			setCode('');
		} catch {
			setError(RESET_REQUEST_FAILED);
		} finally {
			setBusy(false);
		}
	}

	async function resendConfirmationCode() {
		// aria-disabled on a plain <button> does not swallow the click the way DS Button does.
		if (cloudActions.blocked) return;
		setError(null);
		setBusy(true);
		try {
			await resend(email.trim());
			Toaster.info('Sent a new confirmation code.');
		} catch (err) {
			setError(enrollmentErrorMessage('confirm', err));
		} finally {
			setBusy(false);
		}
	}

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		// A form submits on Enter without going through the button, so the offline guard has to
		// live here too — the soft-disabled submit button alone would not stop it.
		if (cloudActions.blocked) return;
		setError(null);
		setBusy(true);
		try {
			if (view === 'sign-in') {
				await signIn(email.trim(), password);
				setPassword('');
				// success: AuthProvider closes the modal.
			} else if (view === 'sign-up') {
				const problem = passwordProblem(password);
				if (problem) {
					setError(problem);
					setBusy(false);
					return;
				}
				await signUp(email.trim(), password);
				setPassword('');
				Toaster.info('We sent a confirmation code to your email.');
				reset('confirm');
			} else if (view === 'confirm') {
				await confirm(email.trim(), code.trim());
				Toaster.success('Account confirmed — sign in to continue.');
				showSignIn();
			} else if (view === 'forgot') {
				await requestPasswordReset(email.trim());
				Toaster.info(RESET_CODE_SENT);
				setCode('');
				reset('reset');
			} else {
				const problem = passwordProblem(password);
				if (problem) {
					setError(problem);
					setBusy(false);
					return;
				}
				await confirmPasswordReset(email.trim(), code.trim(), password);
				Toaster.success('Password updated — sign in with your new password.');
				showSignIn();
			}
		} catch (err) {
			// A sign-in against an unconfirmed account routes to the confirm step.
			if (view === 'sign-in' && errorCode(err) === 'UserNotConfirmedException') {
				Toaster.info('Please confirm your email first.');
				setPassword('');
				reset('confirm');
			} else {
				// Sign-in collapses account-state errors, while recovery surfaces only
				// purpose-built messages. Raw Cognito details must never reach either form.
				setError(
					view === 'sign-in'
						? 'Incorrect email or password.'
						: view === 'forgot'
							? RESET_REQUEST_FAILED
							: view === 'reset'
								? resetErrorMessage(err)
								: enrollmentErrorMessage(view, err),
				);
				setBusy(false);
			}
		}
	}

	const title =
		view === 'sign-in'
			? 'Sign in'
			: view === 'sign-up'
				? 'Create an account'
				: view === 'confirm'
					? 'Confirm your email'
					: view === 'forgot'
						? 'Reset your password'
						: 'Enter your reset code';
	const description =
		view === 'confirm'
			? `Enter the code we emailed to ${email || 'your address'}.`
			: view === 'forgot'
				? 'Enter your email. We’ll send a code if an account can use password recovery.'
				: view === 'reset'
					? 'If an account uses that email, enter the code and choose a new password.'
					: 'An account is needed only for optional online services such as internet remote play, encrypted cloud backup, invite links, and publishing. Local play never requires one.';

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title={title}
			description={description}
			size="sm"
			tone="default"
			initialFocus="#auth-email"
			aria-busy={busy}
		>
			<CloudOfflineNoticeFor text={OFFLINE_NOTICE} />
			<form onSubmit={onSubmit} style={{ display: 'grid', gap: 'var(--space-4, 16px)' }}>
				<Field label="Email" htmlFor="auth-email" required>
					<Input
						id="auth-email"
						type="email"
						autoComplete="email"
						value={email}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
						disabled={busy || view === 'confirm' || view === 'reset'}
						maxLength={320}
						required
					/>
				</Field>

				{(view === 'sign-in' || view === 'sign-up' || view === 'reset') && (
					<Field
						label={view === 'reset' ? 'New password' : 'Password'}
						htmlFor="auth-password"
						required
						help={
							view === 'sign-up' || view === 'reset'
								? 'At least 12 characters with upper, lower, and a number.'
								: undefined
						}
					>
						<Input
							id="auth-password"
							type="password"
							autoComplete={
								view === 'sign-up' || view === 'reset' ? 'new-password' : 'current-password'
							}
							value={password}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
							disabled={busy}
							maxLength={256}
							required
						/>
					</Field>
				)}

				{(view === 'confirm' || view === 'reset') && (
					<Field
						label={view === 'reset' ? 'Reset code' : 'Confirmation code'}
						htmlFor="auth-code"
						required
					>
						<Input
							id="auth-code"
							inputMode="numeric"
							autoComplete="one-time-code"
							value={code}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
							disabled={busy}
							maxLength={12}
							required
						/>
					</Field>
				)}

				{error && (
					<p
						role="alert"
						style={{
							color: 'var(--color-status-error-text)',
							margin: 0,
							fontSize: 'var(--text-sm)',
						}}
					>
						{error}
					</p>
				)}

				<Button
					type="submit"
					variant="primary"
					size="md"
					disabled={busy}
					{...cloudActions.offlineProps}
				>
					{busy
						? 'Please wait…'
						: view === 'sign-in'
							? 'Sign in'
							: view === 'sign-up'
								? 'Create account'
								: view === 'confirm'
									? 'Confirm'
									: view === 'forgot'
										? 'Send reset code'
										: 'Set new password'}
				</Button>

				<div
					style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}
				>
					{view === 'sign-in' && (
						<>
							<button type="button" className="link" onClick={beginRecovery} disabled={busy}>
								Forgot password?
							</button>
							<button
								type="button"
								className="link"
								onClick={() => reset('sign-up')}
								disabled={busy}
							>
								Create an account
							</button>
						</>
					)}
					{view === 'sign-up' && (
						<button type="button" className="link" onClick={showSignIn} disabled={busy}>
							I already have an account
						</button>
					)}
					{view === 'confirm' && (
						<>
							<button
								type="button"
								className="link"
								onClick={() => void resendConfirmationCode()}
								disabled={busy}
								aria-disabled={cloudActions.offline || undefined}
								title={cloudActions.offlineProps.title}
								data-cloud-offline={cloudActions.offlineProps['data-cloud-offline']}
							>
								Resend code
							</button>
							<button type="button" className="link" onClick={showSignIn} disabled={busy}>
								Back to sign in
							</button>
						</>
					)}
					{view === 'forgot' && (
						<button type="button" className="link" onClick={showSignIn} disabled={busy}>
							Back to sign in
						</button>
					)}
					{view === 'reset' && (
						<>
							<button
								type="button"
								className="link"
								onClick={() => void resendResetCode()}
								disabled={busy}
								aria-disabled={cloudActions.offline || undefined}
								title={cloudActions.offlineProps.title}
								data-cloud-offline={cloudActions.offlineProps['data-cloud-offline']}
							>
								Send a new code
							</button>
							<button type="button" className="link" onClick={showSignIn} disabled={busy}>
								Back to sign in
							</button>
						</>
					)}
				</div>
			</form>
		</Dialog>
	);
}
