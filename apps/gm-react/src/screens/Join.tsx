import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, Icon, Skeleton } from '../ds';
import { Illustration } from '../ds/illustrations';
import { T } from '../app/screen-kit';
import { useAuth } from '../cloud/AuthContext';
import { isAuthConfigured } from '../cloud/config';
import { AppApiError, resolveInvite, type ResolvedInvite } from '../cloud/appApi';
import { useI18n } from '../i18n';

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
	| { phase: 'invalid'; message: 'join.unavailable' | 'join.expired' | 'join.checkFailed' }
	| { phase: 'ready'; invite: ResolvedInvite };

const WRAP: React.CSSProperties = {
	minHeight: 'var(--app-viewport-height)',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	padding: 'var(--space-6)',
	background: 'var(--color-bg)',
};

const CARD: React.CSSProperties = {
	width: 'min(100%, 28rem)',
	minWidth: 0,
	overflowWrap: 'anywhere',
	display: 'flex',
	flexDirection: 'column',
	gap: 'var(--space-4)',
	padding: 'var(--space-6)',
	borderRadius: 'var(--radius-lg)',
};

export function Join() {
	const location = useLocation();
	const navigate = useNavigate();
	const auth = useAuth();
	const { t, formatDate } = useI18n();
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
					e instanceof AppApiError && e.code === 'not-configured'
						? 'join.unavailable'
						: e instanceof AppApiError && (e.status === 404 || e.status === 410)
							? 'join.expired'
							: 'join.checkFailed';
				setState({ phase: 'invalid', message });
			});
		return () => {
			cancelled = true;
		};
	}, [token, retryNonce]);

	const signedOut = isAuthConfigured && auth.status !== 'signed-in';
	return (
		<div style={WRAP}>
			<Card elevation="raised" style={CARD} role="main" aria-label={t('join.invite')}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
					<span
						style={{
							width: 'var(--space-10)',
							height: 'var(--space-10)',
							borderRadius: 'var(--radius-md)',
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
					<h1 style={{ margin: T.space.zero, font: `700 var(--text-2xl) ${T.disp}`, color: T.ink }}>
						{t('join.heading')}
					</h1>
				</div>

				{state.phase !== 'ready' && (
					<Illustration
						name={state.phase === 'invalid' ? 'connection-lost' : 'invites-empty'}
						style={{ alignSelf: 'center' }}
					/>
				)}
				{state.phase === 'loading' && (
					<div
						style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}
						role="status"
						aria-live="polite"
					>
						{t('join.checking')}
						<Skeleton variant="text" style={{ marginTop: 'var(--space-3)' }} />
					</div>
				)}
				{state.phase === 'missing' && (
					<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
						{t('join.incomplete')}
					</div>
				)}
				{state.phase === 'invalid' && (
					// The failure arrives asynchronously and the loading region unmounts, so without a
					// live region a screen-reader user was never told the invite check had failed.
					<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }} role="alert">
						{t(state.message)}
					</div>
				)}
				{state.phase === 'ready' && (
					<>
						<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
							<strong style={{ color: T.ink }}>{state.invite.invitedBy}</strong>{' '}
							{t('join.invitedYouToJoin')}{' '}
							<strong style={{ color: T.ink }}>{state.invite.campaignName}</strong>
							{state.invite.role === 'co-dm' ? (
								<>
									{' '}
									{t('join.asA')} <strong style={{ color: T.acc }}>{t('join.coDm')}</strong>
								</>
							) : null}
							.{state.invite.note ? ` “${state.invite.note}”` : ''}
						</div>
						{state.invite.role === 'co-dm' && (
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 'var(--space-2)',
									padding: 'var(--space-3)',
									borderRadius: 'var(--radius-md)',
									background: T.accSub,
									border: `thin solid ${T.accBd}`,
									font: `var(--text-sm)/1.5 ${T.sans}`,
									color: T.sub,
								}}
							>
								<Icon name="session-bolt" size="sm" />
								<span>{t('join.coDmNote')}</span>
							</div>
						)}
						<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
							{t('join.expires', { date: formatDate(state.invite.expiresAt * 1000) })}
						</div>
						{signedOut && (
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 'var(--space-3)',
									padding: 'var(--space-3)',
									borderRadius: 'var(--radius-md)',
									background: T.sunken,
									flexWrap: 'wrap',
									border: `thin solid ${T.bd}`,
									font: `var(--text-sm)/1.5 ${T.sans}`,
									color: T.sub,
								}}
							>
								<Icon name="UserCircle" size="sm" />
								<span style={{ flex: 1 }}>{t('join.signInPrompt')}</span>
								<Button variant="secondary" onClick={() => auth.openAuthModal()}>
									{t('settings.account.signIn')}
								</Button>
							</div>
						)}
						<Button variant="primary" icon="play" onClick={() => navigate('/play')}>
							{t('join.openPlayerApp')}
						</Button>
						<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter }}>
							{t('join.playerAppHint')}
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
						title={state.phase === 'loading' ? t('join.checking') : undefined}
						onClick={() => setRetryNonce((n) => n + 1)}
					>
						{t('join.tryAgain')}
					</Button>
				)}
				{(state.phase === 'invalid' || state.phase === 'missing') && (
					<Button variant="secondary" onClick={() => navigate('/')}>
						{t('join.goToApp')}
					</Button>
				)}
			</Card>
		</div>
	);
}
