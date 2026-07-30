import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Icon } from '../ds';
import { T } from '../app/screen-kit';
import { useAuth } from '../cloud/AuthContext';
import { isAuthConfigured } from '../cloud/config';
import { AppApiError, resolveInvite, type ResolvedInvite } from '../cloud/appApi';

/**
 * Join — the invite-redeem landing (`#/join?token=…`). Chrome-less like `/play`: the person
 * opening an invite link is a PLAYER with no vault, so they must never land in DM onboarding.
 * The token resolves against the PUBLIC app-api route (no account needed to look, matching the
 * server contract); the page then walks them to the player app, with a sign-in step when the
 * build has cloud auth. Resolution failures render honestly (expired/revoked vs unreachable).
 */

type JoinState =
	| { phase: 'loading' }
	| { phase: 'missing' }
	| { phase: 'invalid'; message: string }
	| { phase: 'ready'; invite: ResolvedInvite };

const WRAP: React.CSSProperties = {
	minHeight: 'var(--app-viewport-height)',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	padding: 24,
	background: 'var(--color-bg)',
};

const CARD: React.CSSProperties = {
	width: 'min(440px, 100%)',
	display: 'flex',
	flexDirection: 'column',
	gap: 14,
	padding: '28px 28px 24px',
	borderRadius: 16,
	border: `1px solid ${T.bd}`,
	background: T.raised,
	boxShadow: T.smd,
};

export function Join() {
	const location = useLocation();
	const navigate = useNavigate();
	const auth = useAuth();
	const token = useMemo(
		() => new URLSearchParams(location.search).get('token') ?? '',
		[location.search],
	);
	const [state, setState] = useState<JoinState>(
		token ? { phase: 'loading' } : { phase: 'missing' },
	);
	// The failure copy tells the invitee to "try again", so give them something to press. Bumping
	// this re-runs the resolve effect with the same token.
	const [retryNonce, setRetryNonce] = useState(0);

	useEffect(() => {
		if (!token) {
			setState({ phase: 'missing' });
			return;
		}
		let cancelled = false;
		setState({ phase: 'loading' });
		resolveInvite(token)
			.then((invite) => {
				if (!cancelled) setState({ phase: 'ready', invite });
			})
			.catch((e: unknown) => {
				if (cancelled) return;
				const message =
					e instanceof AppApiError
						? e.message
						: 'This invite link could not be checked — try again.';
				setState({ phase: 'invalid', message });
			});
		return () => {
			cancelled = true;
		};
	}, [token, retryNonce]);

	const signedOut = isAuthConfigured && auth.status !== 'signed-in';
	return (
		<div style={WRAP}>
			<div style={CARD} role="main" aria-label="Campaign invite">
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<span
						style={{
							width: 38,
							height: 38,
							borderRadius: 10,
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							background: T.accSub,
							color: T.acc,
						}}
					>
						<Icon name="send" size="md" />
					</span>
					{/* A styled div left this standalone, emailed-link route with no heading at all. */}
					<h1 style={{ margin: 0, font: `700 17px ${T.disp}`, color: T.ink }}>You’re invited</h1>
				</div>

				{state.phase === 'loading' && (
					<div style={{ font: `13px ${T.sans}`, color: T.ter }} role="status" aria-live="polite">
						Checking your invite…
					</div>
				)}
				{state.phase === 'missing' && (
					<div style={{ font: `13px/1.6 ${T.sans}`, color: T.sub }}>
						This join link is incomplete. Ask your DM to copy the full link from Settings → Players
						and send it again.
					</div>
				)}
				{state.phase === 'invalid' && (
					// The failure arrives asynchronously and the loading region unmounts, so without a
					// live region a screen-reader user was never told the invite check had failed.
					<div style={{ font: `13px/1.6 ${T.sans}`, color: T.sub }} role="alert">
						{state.message}
					</div>
				)}
				{state.phase === 'ready' && (
					<>
						<div style={{ font: `13px/1.6 ${T.sans}`, color: T.sub }}>
							<strong style={{ color: T.ink }}>{state.invite.invitedBy}</strong> invited you to join{' '}
							<strong style={{ color: T.ink }}>{state.invite.campaignName}</strong>
							{state.invite.role === 'co-dm' ? (
								<>
									{' '}
									as a <strong style={{ color: T.acc }}>Co-DM</strong>
								</>
							) : null}
							.{state.invite.note ? ` “${state.invite.note}”` : ''}
						</div>
						{state.invite.role === 'co-dm' && (
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									padding: '9px 12px',
									borderRadius: 10,
									background: T.accSub,
									border: `1px solid ${T.accBd}`,
									font: `12px/1.5 ${T.sans}`,
									color: T.sub,
								}}
							>
								<Icon name="session-bolt" size="sm" />
								<span>
									A Co-DM seat sees the DM’s prep and helps run the table. Your DM finishes the
									promotion when you join their live session.
								</span>
							</div>
						)}
						<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
							Invite expires {new Date(state.invite.expiresAt * 1000).toLocaleDateString()}.
						</div>
						{signedOut && (
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '10px 12px',
									borderRadius: 10,
									background: T.surf,
									border: `1px solid ${T.bd}`,
									font: `12px/1.5 ${T.sans}`,
									color: T.sub,
								}}
							>
								<Icon name="UserCircle" size="sm" />
								<span style={{ flex: 1 }}>
									Sign in (or create a free account) first if your table plays over the internet.
								</span>
								<Button variant="secondary" size="sm" onClick={() => auth.openAuthModal()}>
									Sign in
								</Button>
							</div>
						)}
						<Button variant="primary" icon="play" onClick={() => navigate('/play')}>
							Open the player app
						</Button>
						<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
							From there, join your DM’s table with the table name and PIN they share at game time.
						</div>
					</>
				)}
				{/* Pressing "Try again" flips the phase to `loading`, whose guard used to unmount this exact
				    button — dropping the user's focus to <body> so a keyboard reader had to Tab from the top
				    of the document to reach the result. It now stays mounted for the whole retry and
				    soft-disables (`aria-disabled`, which Button honours by keeping the control focusable and
				    named while swallowing the click; hard `disabled` would blur it and reproduce the bug). */}
				{token && (state.phase === 'invalid' || (state.phase === 'loading' && retryNonce > 0)) && (
					<Button
						variant="secondary"
						icon="retry"
						aria-disabled={state.phase === 'loading' || undefined}
						title={state.phase === 'loading' ? 'Checking your invite…' : undefined}
						onClick={() => setRetryNonce((n) => n + 1)}
					>
						Try again
					</Button>
				)}
				{(state.phase === 'invalid' || state.phase === 'missing') && (
					<Button variant="secondary" onClick={() => navigate('/')}>
						Go to the app
					</Button>
				)}
			</div>
		</div>
	);
}
