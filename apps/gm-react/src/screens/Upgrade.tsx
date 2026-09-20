import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Icon, Switch, Toaster } from '../ds';
import { BackBar, Page, T } from '../app/screen-kit';
import { useAuth } from '../cloud/AuthContext';
import { isAccountApiConfigured } from '../cloud/config';
import { useI18n } from '../i18n';
import { PlanStatus } from './upgrade/PlanStatus';
import { PlanCards } from './upgrade/PlanCards';
import { PlanComparison } from './upgrade/PlanComparison';
import { LegalLinks } from './legal/LegalLinks';
import { useEntitlements, type PlanCard, type PlanId } from '../cloud/entitlements';
import {
	billingConfigured,
	billingInformsOnly,
	billingWebHost,
	canOpenPortal,
	canStartCheckout,
	openBillingPortal,
	readCheckoutReturn,
	startCheckout,
	stripCheckoutReturn,
} from '../cloud/billing';
import type { PaidPlanId } from '../cloud/appApi';

/**
 * Upgrade — "Plans & cloud", the acquisition surface for a local-first app ("free to play, pay
 * only for the cloud"), a React port of the design-package `views/upgrade.jsx` PricingSection.
 *
 * Plan state comes from `useEntitlements()` — REAL server entitlements when the account backend
 * is configured and the user is signed in (the feature matrix below is then the server's copy,
 * the single source of truth; `OFFLINE_FALLBACK_MATRIX` renders only offline/unconfigured).
 * Configured web accounts use Stripe-hosted checkout/portal. Without live billing, an explicit
 * no-payment preview saves the plan to the account or this device. Native builds inform only.
 */

import { CheckoutDialog, ChangePlanDialog, planById } from './upgrade/PlanDialogs';

/** How many refreshes to try after a successful Checkout return, and how far apart. The webhook
 *  usually lands within a couple of seconds; this covers a slow one without spinning forever. */
const CHECKOUT_CONFIRM_ATTEMPTS = 12;
const CHECKOUT_CONFIRM_INTERVAL_MS = 2500;

export function Upgrade() {
	const auth = useAuth();
	const ent = useEntitlements();
	const { t } = useI18n();
	const location = useLocation();
	const navigate = useNavigate();
	const [annual, setAnnual] = useState(false);
	const [confirmTo, setConfirmTo] = useState<PlanId | null>(null);
	const [checkoutTo, setCheckoutTo] = useState<PaidPlanId | null>(null);
	const [busy, setBusy] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const planId = ent.plan;
	const priceStr = (p: PlanCard) =>
		p.price ? (annual ? `$${p.price * 10}` : `$${p.price}`) : t('upgrade.free');
	const perStr = (p: PlanCard) =>
		p.price ? (annual ? t('upgrade.perYear') : t('upgrade.perMonth')) : '';
	const currentPrice = planById(planId)?.price || 0;
	// ADR-027 — live billing modes. `liveBilling` (the stage has Stripe configured for this
	// account) takes precedence over the no-payment preview copy on every surface below.
	const liveBilling = billingConfigured(ent);
	const checkoutMode = canStartCheckout(ent);
	const portalMode = canOpenPortal(ent);
	const informsOnly = billingInformsOnly(ent);
	const subscribed = liveBilling && ent.billing?.active === true;
	const planChangesUnavailable =
		!liveBilling && ent.serverBacked && !ent.loading && !ent.canChangePlan;

	// Coming back from Stripe: `?checkout=success` → poll entitlements until the webhook has
	// written the plan (or give up honestly); `?checkout=cancelled` → say so, nothing charged.
	// The marker is removed from the URL so a reload does not replay the toast.
	const checkoutReturn = readCheckoutReturn(location.search);
	const handledReturnRef = useRef(false);
	useEffect(() => {
		if (!checkoutReturn || handledReturnRef.current) return;
		handledReturnRef.current = true;
		navigate(
			{ pathname: location.pathname, search: stripCheckoutReturn(location.search) },
			{ replace: true },
		);
		if (checkoutReturn === 'cancelled') {
			Toaster.info(t('upgrade.checkout.cancelled'));
			return;
		}
		setConfirming(true);
	}, [checkoutReturn, location.pathname, location.search, navigate, t]);
	const confirmAttemptsRef = useRef(0);
	useEffect(() => {
		if (!confirming) return;
		if (subscribed) {
			setConfirming(false);
			Toaster.success(t('upgrade.checkout.confirmed', { plan: planById(planId)?.name ?? '' }));
			return;
		}
		if (confirmAttemptsRef.current >= CHECKOUT_CONFIRM_ATTEMPTS) {
			setConfirming(false);
			Toaster.info(t('upgrade.checkout.pending'));
			return;
		}
		const timer = window.setTimeout(() => {
			confirmAttemptsRef.current += 1;
			void ent.refresh();
		}, CHECKOUT_CONFIRM_INTERVAL_MS);
		return () => window.clearTimeout(timer);
	}, [confirming, subscribed, planId, ent, t]);

	const beginCheckout = (id: PaidPlanId) => {
		setBusy(true);
		startCheckout(id, annual ? 'year' : 'month').catch((e: unknown) => {
			setBusy(false);
			Toaster.error(e instanceof Error ? e.message : t('upgrade.checkout.failed'));
		});
		// On success the browser is leaving for Stripe; `busy` intentionally stays set.
	};
	const openPortal = () => {
		setBusy(true);
		openBillingPortal().catch((e: unknown) => {
			setBusy(false);
			Toaster.error(e instanceof Error ? e.message : t('upgrade.portal.failed'));
		});
	};

	const confirmChange = (id: PlanId) => {
		if (!ent.canChangePlan) {
			Toaster.error(t('upgrade.changeUnavailable'));
			return;
		}
		setBusy(true);
		void ent
			.setPlan(id)
			.then(() => {
				setConfirmTo(null);
				Toaster.success(
					ent.serverBacked && ent.simulated
						? t('upgrade.nowPreviewing', { plan: planById(id)?.name ?? '' })
						: t('upgrade.nowOnDevice', { plan: planById(id)?.name ?? '' }),
				);
			})
			.catch((e: unknown) => {
				Toaster.error(e instanceof Error ? e.message : t('upgrade.changeFailed'));
			})
			.finally(() => setBusy(false));
	};

	// Nudge, not a wall: the pricing page stays fully usable signed out (device-local choice),
	// but signing in makes the simulated plan follow the account.
	const showSignInNudge = isAccountApiConfigured && auth.status === 'signed-out';

	return (
		<Page
			max={1080}
			style={
				{
					'--density-button-height': T.space.twelve,
					'--density-touch-target': T.space.twelve,
				} as CSSProperties
			}
		>
			<BackBar to="/settings" label={t('shell.navSettings')} />

			{/* hero */}
			<div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto var(--space-2)' }}>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: T.space.two,
						padding: 'var(--space-1) var(--space-3)',
						borderRadius: T.radius.full,
						background: T.accSub,
						border: `1px solid ${T.accBd}`,
						font: `600 var(--text-sm) ${T.sans}`,
						color: T.acc,
						marginBottom: T.space.four,
					}}
				>
					<Icon name="Sprout" size={13} />
					{t('upgrade.localFirst')}
				</span>
				<h2
					style={{
						margin: T.space.zero,
						font: `800 var(--text-2xl) ${T.disp}`,
						letterSpacing: '-.02em',
						color: T.ink,
					}}
				>
					{liveBilling
						? t('upgrade.headingLive')
						: planChangesUnavailable
							? t('upgrade.headingUnavailable')
							: t('upgrade.headingPreview')}
				</h2>
				<p style={{ font: `var(--text-sm)/1.7 ${T.sans}`, color: T.sub, marginTop: T.space.three }}>
					{liveBilling
						? t('upgrade.whyLive')
						: planChangesUnavailable
							? t('upgrade.whyUnavailable')
							: t('upgrade.whyPreview')}
				</p>
				{liveBilling && ent.billing && !ent.billing.livemode && (
					<span
						data-testid="billing-test-mode"
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: T.space.oneHalf,
							marginTop: T.space.three,
							padding: 'var(--space-1) var(--space-2)',
							borderRadius: T.radius.full,
							background: 'var(--color-status-warning-subtle)',
							border: `1px solid ${T.warn}`,
							font: `600 var(--text-sm) ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon name="FlaskConical" size={12} color={T.warn} />
						{t('upgrade.testMode')}
					</span>
				)}
			</div>

			{/* ADR-027: a subscribed account manages everything (plan switch, cancel, card, invoices)
			    on Stripe's hosted portal — the app ships no billing-management UI of its own. */}
			{confirming && (
				<div
					role="status"
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: T.space.three,
						margin: 'var(--space-3) auto 0',
						maxWidth: 560,
						padding: 'var(--space-2) var(--space-3)',
						borderRadius: T.radius.md,
						background: T.accSub,
						border: `1px solid ${T.accBd}`,
						font: `var(--text-sm) ${T.sans}`,
						color: T.sub,
					}}
				>
					<Icon name="RefreshCw" size={14} color={T.acc} />
					{t('upgrade.checkout.confirming')}
				</div>
			)}
			{portalMode && (
				<div style={{ display: 'flex', justifyContent: 'center', marginTop: T.space.three }}>
					<Button
						variant="secondary"
						size="sm"
						icon="CreditCard"
						disabled={busy}
						onClick={openPortal}
					>
						{t('upgrade.manageBilling')}
					</Button>
				</div>
			)}
			{informsOnly && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: T.space.three,
						margin: 'var(--space-3) auto 0',
						maxWidth: 560,
						padding: 'var(--space-2) var(--space-3)',
						borderRadius: T.radius.md,
						background: T.surf,
						border: `1px solid ${T.bd}`,
						font: `var(--text-sm) ${T.sans}`,
						color: T.sub,
					}}
				>
					<Icon name="info" size={14} color={T.acc} />
					{t('upgrade.informsOnly', { host: billingWebHost() })}
				</div>
			)}

			{showSignInNudge && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: T.space.three,
						margin: 'var(--space-1) auto 0',
						maxWidth: 560,
						padding: 'var(--space-2) var(--space-3)',
						borderRadius: T.radius.md,
						background: T.surf,
						border: `1px solid ${T.bd}`,
						flexWrap: 'wrap',
					}}
				>
					<Icon name="UserCircle" size={16} color={T.acc} />
					<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>
						{t('upgrade.signInNudge')}
					</span>
					<Button variant="secondary" size="sm" onClick={() => auth.openAuthModal()}>
						{t('settings.account.signIn')}
					</Button>
				</div>
			)}

			{/* billing cycle toggle */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: T.space.three,
					margin: 'var(--space-5) 0 var(--space-5)',
					flexWrap: 'wrap',
				}}
			>
				<span style={{ font: `var(--text-sm) ${T.sans}`, color: annual ? T.ter : T.ink }}>
					{t('upgrade.monthlyPrice')}
				</span>
				<Switch
					checked={annual}
					onChange={() => setAnnual((v) => !v)}
					label=""
					aria-label={liveBilling ? t('upgrade.showAnnualLive') : t('upgrade.showAnnual')}
				/>
				<span style={{ font: `var(--text-sm) ${T.sans}`, color: annual ? T.ink : T.ter }}>
					{t('upgrade.annualPrice')}
				</span>
				<span
					style={{
						font: `600 var(--text-sm) ${T.sans}`,
						color: T.acc,
						background: T.accSub,
						border: `1px solid ${T.accBd}`,
						borderRadius: T.radius.full,
						padding: 'var(--space-0-5) var(--space-2)',
					}}
				>
					{liveBilling ? t('upgrade.annualSavingLive') : t('upgrade.annualSaving')}
				</span>
			</div>

			<PlanStatus ent={ent} />
			<PlanCards
				{...{
					ent,
					planId,
					currentPrice,
					busy,
					liveBilling,
					subscribed,
					portalMode,
					checkoutMode,
					openPortal,
					setCheckoutTo,
					setConfirmTo,
					priceStr,
					perStr,
				}}
			/>

			{/* honest cost note */}
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					gap: T.space.three,
					margin: 'var(--space-5) 0',
					padding: 'var(--space-3) var(--space-4)',
					borderRadius: T.radius.lg,
					background: T.surf,
					border: `1px solid ${T.bd}`,
				}}
			>
				<Icon name="info" size={17} color={T.acc} />
				<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
					{liveBilling ? (
						<>
							<strong style={{ color: T.ink }}>{t('upgrade.note.liveLead')}</strong>{' '}
							{t('upgrade.note.liveBody')}
						</>
					) : planChangesUnavailable ? (
						<>
							<strong style={{ color: T.ink }}>{t('upgrade.note.unavailableLead')}</strong>{' '}
							{t('upgrade.note.unavailableBody')}
						</>
					) : (
						<>
							<strong style={{ color: T.ink }}>{t('upgrade.note.previewLead')}</strong>{' '}
							{t('upgrade.note.previewBody')}
						</>
					)}
				</div>
			</div>

			<PlanComparison {...{ ent, priceStr, perStr }} />

			<div
				style={{
					textAlign: 'center',
					font: `var(--text-sm) ${T.sans}`,
					color: T.ter,
					marginTop: T.space.five,
				}}
			>
				{liveBilling
					? t('upgrade.footer.live')
					: planChangesUnavailable
						? t('upgrade.footer.unavailable')
						: t('upgrade.footer.preview')}
			</div>
			<LegalLinks align="center" style={{ marginTop: T.space.two }} />

			<ChangePlanDialog
				toId={ent.canChangePlan && !liveBilling ? confirmTo : null}
				currentId={planId}
				annual={annual}
				serverBacked={ent.serverBacked}
				busy={busy}
				onClose={() => {
					if (!busy) setConfirmTo(null);
				}}
				onConfirm={confirmChange}
			/>
			<CheckoutDialog
				toId={checkoutMode ? checkoutTo : null}
				annual={annual}
				busy={busy}
				onClose={() => {
					if (!busy) setCheckoutTo(null);
				}}
				onConfirm={beginCheckout}
			/>
		</Page>
	);
}
