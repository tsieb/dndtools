import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Icon, Switch, Toaster } from '../ds';
import { BackBar, Page, T, eb } from '../app/screen-kit';
import { useAuth } from '../cloud/AuthContext';
import { isAccountApiConfigured } from '../cloud/config';
import { useViewport } from '../app/useViewport';
import { useI18n } from '../i18n';
import { LegalLinks } from './legal/LegalLinks';
import {
	OFFLINE_FALLBACK_MATRIX,
	useEntitlements,
	type PlanCard,
	type PlanId,
} from '../cloud/entitlements';
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
 * Checkout is SIMULATED end to end: the backend stores the plan with `simulated: true` and no
 * payment processor exists anywhere — the confirm dialog says so plainly instead of pretending
 * to charge. Signed-out/unconfigured keeps the honest device-local plan choice (localStorage,
 * the same key Settings' Subscription pane reads) with a nudge to sign in when signing in would
 * make the choice durable.
 */

import {
	CheckoutDialog,
	ChangePlanDialog,
	MatrixCell,
	PLANS,
	planById,
} from './upgrade/PlanDialogs';

/** How many refreshes to try after a successful Checkout return, and how far apart. The webhook
 *  usually lands within a couple of seconds; this covers a slow one without spinning forever. */
const CHECKOUT_CONFIRM_ATTEMPTS = 12;
const CHECKOUT_CONFIRM_INTERVAL_MS = 2500;

export function Upgrade() {
	const viewport = useViewport();
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
	// The feature matrix: the server's copy when reachable (live or last-known cache); the
	// annotated offline fallback otherwise. Both share the same shape.
	const matrix = ent.features ?? OFFLINE_FALLBACK_MATRIX;
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
		<Page max={1080}>
			<BackBar to="/settings" label={t('shell.navSettings')} />

			{/* hero */}
			<div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 8px' }}>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 7,
						padding: '5px 12px',
						borderRadius: 20,
						background: T.accSub,
						border: `1px solid ${T.accBd}`,
						font: `600 11.5px ${T.sans}`,
						color: T.acc,
						marginBottom: 16,
					}}
				>
					<Icon name="Sprout" size={13} />
					{t('upgrade.localFirst')}
				</span>
				<h2
					style={{
						margin: 0,
						font: `800 ${viewport === 'phone' ? 28 : 34}px ${T.disp}`,
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
				<p style={{ font: `14px/1.7 ${T.sans}`, color: T.sub, marginTop: 12 }}>
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
							gap: 6,
							marginTop: 10,
							padding: '4px 10px',
							borderRadius: 20,
							background: 'var(--color-status-warning-subtle)',
							border: `1px solid ${T.warn}`,
							font: `600 11px ${T.sans}`,
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
						gap: 10,
						margin: '12px auto 0',
						maxWidth: 560,
						padding: '10px 14px',
						borderRadius: 10,
						background: T.accSub,
						border: `1px solid ${T.accBd}`,
						font: `12.5px ${T.sans}`,
						color: T.sub,
					}}
				>
					<Icon name="RefreshCw" size={14} color={T.acc} />
					{t('upgrade.checkout.confirming')}
				</div>
			)}
			{portalMode && (
				<div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
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
						gap: 10,
						margin: '12px auto 0',
						maxWidth: 560,
						padding: '10px 14px',
						borderRadius: 10,
						background: T.surf,
						border: `1px solid ${T.bd}`,
						font: `12.5px ${T.sans}`,
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
						gap: 10,
						margin: '4px auto 0',
						maxWidth: 560,
						padding: '10px 14px',
						borderRadius: 10,
						background: T.surf,
						border: `1px solid ${T.bd}`,
						flexWrap: 'wrap',
					}}
				>
					<Icon name="UserCircle" size={16} color={T.acc} />
					<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>{t('upgrade.signInNudge')}</span>
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
					gap: 12,
					margin: '22px 0 20px',
					flexWrap: 'wrap',
				}}
			>
				<span style={{ font: `12.5px ${T.sans}`, color: annual ? T.ter : T.ink }}>
					{t('upgrade.monthlyPrice')}
				</span>
				<Switch
					checked={annual}
					onChange={() => setAnnual((v) => !v)}
					label=""
					aria-label={liveBilling ? t('upgrade.showAnnualLive') : t('upgrade.showAnnual')}
				/>
				<span style={{ font: `12.5px ${T.sans}`, color: annual ? T.ink : T.ter }}>
					{t('upgrade.annualPrice')}
				</span>
				<span
					style={{
						font: `600 11px ${T.sans}`,
						color: T.acc,
						background: T.accSub,
						border: `1px solid ${T.accBd}`,
						borderRadius: 20,
						padding: '2px 8px',
					}}
				>
					{liveBilling ? t('upgrade.annualSavingLive') : t('upgrade.annualSaving')}
				</span>
			</div>

			{/* plan cards */}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
					gap: 16,
				}}
			>
				{PLANS.map((pl) => {
					const on = pl.id === planId;
					const featured = pl.popular;
					const isUpgrade = (pl.price || 0) > currentPrice;
					return (
						<div
							key={pl.id}
							style={{
								position: 'relative',
								display: 'flex',
								flexDirection: 'column',
								gap: 14,
								padding: 22,
								borderRadius: 16,
								border: `1px solid ${featured ? T.accBd : T.bd}`,
								background: featured
									? `linear-gradient(180deg, ${T.accSub}, ${T.raised} 46%)`
									: T.raised,
								boxShadow: featured ? T.smd : 'none',
							}}
						>
							{featured && (
								<span
									style={{
										position: 'absolute',
										top: -10,
										left: '50%',
										transform: 'translateX(-50%)',
										font: `600 10px ${T.sans}`,
										letterSpacing: '.07em',
										textTransform: 'uppercase',
										color: T.accFg,
										background: T.acc,
										padding: '3px 11px',
										borderRadius: 20,
									}}
								>
									{t('common.badge.recommended')}
								</span>
							)}
							<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
								<span
									style={{
										width: 36,
										height: 36,
										borderRadius: 10,
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: pl.cloud ? T.acc : T.alt,
										color: pl.cloud ? T.accFg : T.acc,
									}}
								>
									<Icon name={pl.cloud ? 'connection' : 'home'} size="md" />
								</span>
								<div>
									<div style={{ font: `700 18px ${T.disp}`, color: T.ink }}>{pl.name}</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{pl.tagline}</div>
								</div>
							</div>
							<div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
								<span style={{ font: `800 30px ${T.mono}`, color: T.ink }}>{priceStr(pl)}</span>
								<span style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{perStr(pl)}</span>
								{pl.cloud && (
									<span
										style={{
											marginLeft: 'auto',
											font: `11px ${T.sans}`,
											color: T.ter,
											display: 'inline-flex',
											alignItems: 'center',
											gap: 4,
										}}
									>
										<Icon name="connection" size={12} color={T.acc} />
										{t('upgrade.cloud')}
									</span>
								)}
							</div>
							<div style={{ height: 1, background: T.bd }} />
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
								{pl.features.map((f: string) => (
									<span
										key={f}
										style={{
											display: 'flex',
											alignItems: 'flex-start',
											gap: 8,
											font: `12.5px/1.45 ${T.sans}`,
											color: T.sub,
										}}
									>
										<span style={{ marginTop: 1 }}>
											<Icon name="check" size={13} color={pl.cloud ? T.acc : T.ter} />
										</span>
										{f}
									</span>
								))}
							</div>
							{/* CTA. Live billing (ADR-027): a paid card starts Stripe Checkout, or — once
							    subscribed — every change goes through the hosted portal; non-web surfaces
							    only INFORM (no link, per Play policy). Otherwise the preview/local flow. */}
							{on ? (
								<Button variant="secondary" size="md" disabled icon="check">
									{t('upgrade.currentPlan')}
								</Button>
							) : liveBilling ? (
								subscribed || (portalMode && !pl.cloud) ? (
									<Button
										variant={pl.cloud ? 'primary' : 'secondary'}
										size="md"
										icon="CreditCard"
										disabled={busy || !portalMode}
										onClick={openPortal}
									>
										{portalMode
											? t('upgrade.manageBilling')
											: t('upgrade.manageOnWeb', { host: billingWebHost() })}
									</Button>
								) : pl.cloud ? (
									<Button
										variant="primary"
										size="md"
										icon="CreditCard"
										disabled={busy || !checkoutMode}
										onClick={() => setCheckoutTo(pl.id as PaidPlanId)}
									>
										{checkoutMode
											? t('upgrade.subscribeTo', { plan: pl.name })
											: t('upgrade.subscribeOnWeb', { host: billingWebHost() })}
									</Button>
								) : (
									<Button variant="secondary" size="md" disabled icon="check">
										{t('upgrade.currentPlan')}
									</Button>
								)
							) : isUpgrade ? (
								/* icon="ArrowUp" is the direct Lucide name (like "Sprout" above): it renders correctly whether or not the registry carries an 'arrow-up' alias, unlike unknown kebab names which fall back to a Square glyph. */
								<Button
									variant="primary"
									size="md"
									icon="ArrowUp"
									disabled={ent.loading || !ent.canChangePlan}
									onClick={() => setConfirmTo(pl.id)}
								>
									{ent.canChangePlan
										? t('upgrade.tryPreview', { plan: pl.name })
										: t('upgrade.changesUnavailable')}
								</Button>
							) : (
								<Button
									variant="secondary"
									size="md"
									disabled={ent.loading || !ent.canChangePlan}
									onClick={() => setConfirmTo(pl.id)}
								>
									{ent.canChangePlan
										? t('upgrade.switchTo', { plan: pl.name })
										: t('upgrade.changesUnavailable')}
								</Button>
							)}
						</div>
					);
				})}
			</div>

			{/* honest cost note */}
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					gap: 12,
					margin: '22px 0',
					padding: '14px 16px',
					borderRadius: 12,
					background: T.surf,
					border: `1px solid ${T.bd}`,
				}}
			>
				<Icon name="info" size={17} color={T.acc} />
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
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

			{/* detailed matrix — served by the account backend when reachable (single source of truth) */}
			<div
				role="region"
				aria-label={t('upgrade.matrix.region')}
				tabIndex={0}
				style={{
					borderRadius: 16,
					border: `1px solid ${T.bd}`,
					background: T.raised,
					overflowX: 'auto',
					marginTop: 8,
				}}
			>
				<div role="table" aria-label={t('upgrade.matrix.region')} style={{ minWidth: 620 }}>
					<div
						role="row"
						style={{
							display: 'grid',
							gridTemplateColumns: '1.7fr 1fr 1fr 1fr',
							alignItems: 'end',
							gap: 0,
							padding: '16px 20px',
							borderBottom: `1px solid ${T.bdS}`,
							background: T.surf,
						}}
					>
						<div role="columnheader" style={{ font: `700 14px ${T.disp}`, color: T.ink }}>
							{t('upgrade.matrix.title')}
							{ent.source !== 'server' && (
								<span
									style={{
										display: 'block',
										font: `400 10.5px ${T.sans}`,
										color: T.ter,
										marginTop: 2,
									}}
								>
									{ent.source === 'cache' ? t('upgrade.matrix.cache') : t('upgrade.matrix.offline')}
								</span>
							)}
						</div>
						{PLANS.map((pl) => (
							<div key={pl.id} role="columnheader" style={{ textAlign: 'center' }}>
								<div
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 5,
										font: `700 13px ${T.sans}`,
										color: pl.id === planId ? T.acc : T.ink,
									}}
								>
									{pl.cloud && <Icon name="connection" size={12} color={T.acc} />}
									{pl.name}
								</div>
								<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: 2 }}>
									{priceStr(pl)}
									{perStr(pl)}
								</div>
							</div>
						))}
					</div>
					{matrix.map((grp) => (
						<div key={grp.group} role="rowgroup">
							<div
								role="row"
								style={{
									background: T.alt,
									borderBottom: `1px solid ${T.bd}`,
								}}
							>
								<div
									role="columnheader"
									aria-colspan={4}
									style={{ padding: '11px 20px 7px', ...eb, color: T.ter }}
								>
									{grp.group}
								</div>
							</div>
							{grp.rows.map((r, i) => (
								<div
									key={r.label}
									role="row"
									style={{
										display: 'grid',
										gridTemplateColumns: '1.7fr 1fr 1fr 1fr',
										alignItems: 'center',
										padding: '12px 20px',
										borderBottom: i === grp.rows.length - 1 ? 'none' : `1px solid ${T.bd}`,
									}}
								>
									<div
										role="rowheader"
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 8,
											font: `13px ${T.sans}`,
											color: T.ink,
										}}
									>
										{r.label}
										{r.cloud && (
											<span
												title={t('upgrade.matrix.cloudOnly')}
												style={{
													display: 'inline-flex',
													alignItems: 'center',
													gap: 3,
													font: `600 9.5px ${T.sans}`,
													letterSpacing: '.04em',
													textTransform: 'uppercase',
													color: T.acc,
													background: T.accSub,
													border: `1px solid ${T.accBd}`,
													borderRadius: 5,
													padding: '1px 5px',
												}}
											>
												<Icon name="connection" size={9} />
												{t('upgrade.cloud')}
											</span>
										)}
									</div>
									<div role="cell" style={{ textAlign: 'center' }}>
										<MatrixCell v={r.hearth} />
									</div>
									<div role="cell" style={{ textAlign: 'center' }}>
										<MatrixCell v={r.lantern} accent={r.cloud} />
									</div>
									<div role="cell" style={{ textAlign: 'center' }}>
										<MatrixCell v={r.beacon} accent={r.cloud} />
									</div>
								</div>
							))}
						</div>
					))}
				</div>
			</div>

			<div style={{ textAlign: 'center', font: `12px ${T.sans}`, color: T.ter, marginTop: 18 }}>
				{liveBilling
					? t('upgrade.footer.live')
					: planChangesUnavailable
						? t('upgrade.footer.unavailable')
						: t('upgrade.footer.preview')}
			</div>
			<LegalLinks align="center" style={{ marginTop: 8 }} />

			<ChangePlanDialog
				toId={ent.canChangePlan && !liveBilling ? confirmTo : null}
				currentId={planId}
				annual={annual}
				serverBacked={ent.serverBacked}
				busy={busy}
				onClose={() => setConfirmTo(null)}
				onConfirm={confirmChange}
			/>
			<CheckoutDialog
				toId={checkoutMode ? checkoutTo : null}
				annual={annual}
				busy={busy}
				onClose={() => setCheckoutTo(null)}
				onConfirm={beginCheckout}
			/>
		</Page>
	);
}
