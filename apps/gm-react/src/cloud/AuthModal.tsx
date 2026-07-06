// Embedded Cognito auth modal (sign-in / sign-up / confirm-code), styled with the
// design system's accessible Dialog (focus trap + Esc handled by the DS). Rendered
// by AuthProvider; opened via requireAuth()/openAuthModal(). Actions are passed in
// as props (no context import) to keep it decoupled from AuthContext.
import { useState } from 'react';
import { Dialog, Field, Input, Button, Toaster } from '../ds';

type View = 'sign-in' | 'sign-up' | 'confirm';

interface Props {
  open: boolean;
  onClose(): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  confirm(email: string, code: string): Promise<void>;
  resend(email: string): Promise<void>;
}

function passwordProblem(pw: string): string | null {
  if (pw.length < 12) return 'Use at least 12 characters.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw))
    return 'Include upper- and lower-case letters and a number.';
  return null;
}

function message(err: unknown): string {
  const m = (err as { message?: string })?.message;
  return m || 'Something went wrong. Please try again.';
}

export function AuthModal({ open, onClose, signIn, signUp, confirm, resend }: Props) {
  const [view, setView] = useState<View>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (next: View) => {
    setError(null);
    setBusy(false);
    setView(next);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (view === 'sign-in') {
        await signIn(email.trim(), password);
        // success: AuthProvider closes the modal.
      } else if (view === 'sign-up') {
        const problem = passwordProblem(password);
        if (problem) throw new Error(problem);
        await signUp(email.trim(), password);
        Toaster.info('We sent a confirmation code to your email.');
        reset('confirm');
      } else {
        await confirm(email.trim(), code.trim());
        Toaster.success('Account confirmed — sign in to continue.');
        setPassword('');
        reset('sign-in');
      }
    } catch (err) {
      // A sign-in against an unconfirmed account routes to the confirm step.
      if ((err as { code?: string })?.code === 'UserNotConfirmedException') {
        Toaster.info('Please confirm your email first.');
        reset('confirm');
      } else {
        setError(message(err));
        setBusy(false);
      }
    }
  }

  const title = view === 'sign-in' ? 'Sign in' : view === 'sign-up' ? 'Create an account' : 'Confirm your email';
  const description =
    view === 'confirm'
      ? `Enter the code we emailed to ${email || 'your address'}.`
      : 'Accounts are only needed for internet remote play and cloud sync. Local play never requires one.';

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="sm" tone="default">
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 'var(--space-4, 16px)' }}>
        <Field label="Email" htmlFor="auth-email" required>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            disabled={busy || view === 'confirm'}
            required
          />
        </Field>

        {view !== 'confirm' && (
          <Field
            label="Password"
            htmlFor="auth-password"
            required
            help={view === 'sign-up' ? 'At least 12 characters with upper, lower, and a number.' : undefined}
          >
            <Input
              id="auth-password"
              type="password"
              autoComplete={view === 'sign-up' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
          </Field>
        )}

        {view === 'confirm' && (
          <Field label="Confirmation code" htmlFor="auth-code" required>
            <Input
              id="auth-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
              disabled={busy}
              required
            />
          </Field>
        )}

        {error && (
          <p role="alert" style={{ color: 'var(--color-status-error-text)', margin: 0, fontSize: 'var(--text-sm)' }}>
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="md" disabled={busy}>
          {busy
            ? 'Please wait…'
            : view === 'sign-in'
              ? 'Sign in'
              : view === 'sign-up'
                ? 'Create account'
                : 'Confirm'}
        </Button>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
          {view === 'sign-in' && (
            <button type="button" className="link" onClick={() => reset('sign-up')} disabled={busy}>
              Create an account
            </button>
          )}
          {view === 'sign-up' && (
            <button type="button" className="link" onClick={() => reset('sign-in')} disabled={busy}>
              I already have an account
            </button>
          )}
          {view === 'confirm' && (
            <>
              <button
                type="button"
                className="link"
                onClick={async () => {
                  try {
                    await resend(email.trim());
                    Toaster.info('Sent a new code.');
                  } catch (err) {
                    setError(message(err));
                  }
                }}
                disabled={busy}
              >
                Resend code
              </button>
              <button type="button" className="link" onClick={() => reset('sign-in')} disabled={busy}>
                Back to sign in
              </button>
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}
