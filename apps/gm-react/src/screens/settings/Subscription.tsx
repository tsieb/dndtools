import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Icon, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { PLAN_CARDS, useEntitlements } from '../../cloud/entitlements';
import {
	billingConfigured,
	billingInformsOnly,
	billingWebHost,
	canOpenPortal,
	canStartCheckout,
	openBillingPortal,
	subscriptionPhase,
} from '../../cloud/billing';
/* ---- Subscription (REAL entitlements hook — server-backed when signed in, honest local fallback).
 * Two honest modes: the explicit no-payment PREVIEW (no processor configured), or LIVE billing
 * (ADR-027: Stripe-hosted Checkout + portal, offered on the web build only; other surfaces inform).
 * The app ships no billing-management UI of its own — cancel/change/card/invoices are the portal. */
export function SettingsSubscription() {
	const { t, formatNumber, formatDate } = useI18n();
	const navigate = useNavigate();
	const ent = useEntitlements();
	const [busy, setBusy] = useState(false);
	const current = PLAN_CARDS.find((p) => p.id === ent.plan) ?? PLAN_CARDS[0];
	const live = billingConfigured(ent);
	const checkoutMode = canStartCheckout(ent);
	const portalMode = canOpenPortal(ent);
	const informsOnly = billingInformsOnly(ent);
	const phase = subscriptionPhase(ent.billing);
	// Prices are launch prices in USD; the currency renders per locale, the amount does not
	// change. Whole dollars only — every price is a round number.
	const price = (amount: number) =>
		formatNumber(amount, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
	const periodEnd =
		ent.billing?.currentPeriodEnd != null
			? formatDate(ent.billing.currentPeriodEnd * 1000, { dateStyle: 'long' })
			: '';
	const currentPriceLine = current.price
		? live
			? ent.billing?.interval === 'year'
				? t('settings.subscription.pricePerYear', { price: price(current.price * 10) })
				: t('settings.subscription.pricePerMonth', { price: price(current.price) })
			: t('settings.subscription.pricePlanned', { price: price(current.price) })
		: t('settings.subscription.free');
	// The link text is emphasised mid-sentence, so format each sentence whole and split it around
	// that value rather than freezing English word order into fragments.
	const plansLink = t('settings.subscription.plansLink');
	const gatedSentence = t('settings.subscription.noSelfServe', { link: plansLink });
	const [gatedBefore, gatedAfter = ''] = gatedSentence.split(plansLink);
	const previewSentence = t('settings.subscription.previewBody', {
		link: plansLink,
		location: t(
			ent.serverBacked
				? 'settings.subscription.storedOnAccount'
				: 'settings.subscription.storedOnDevice',
		),
	});
	const [previewBefore, previewAfter = ''] = previewSentence.split(plansLink);
	const sourceBadge =
		ent.source === 'server' ? (
			<Badge status="success" icon="check">
				{live
					? t('settings.subscription.sourceAccountLive')
					: t('settings.subscription.sourceAccount')}
			</Badge>
		) : ent.source === 'cache' ? (
			<Badge status="warning">{t('settings.subscription.sourceCache')}</Badge>
		) : (
			<Badge status="neutral">{t('settings.subscription.sourceDevice')}</Badge>
		);
	const openPortal = () => {
		setBusy(true);
		openBillingPortal().catch((e: unknown) => {
			setBusy(false);
			Toaster.error(e instanceof Error ? e.message : t('upgrade.portal.failed'));
		});
	};
	const phaseLine =
		phase === 'renewing'
			? t('settings.subscription.renewsOn', { date: periodEnd })
			: phase === 'ending'
				? t('settings.subscription.endsOn', { date: periodEnd })
				: phase === 'past-due'
					? t('settings.subscription.pastDue')
					: phase === 'ended'
						? t('settings.subscription.endedOn')
						: t('settings.subscription.noSubscription');
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 16,
					padding: '18px 20px',
					borderRadius: 14,
					border: `1px solid ${T.accBd}`,
					background: `linear-gradient(135deg, ${T.accSub}, ${T.raised})`,
					boxShadow: T.smd,
					flexWrap: 'wrap',
				}}
			>
				<span
					style={{
						width: 46,
						height: 46,
						borderRadius: 12,
						flex: '0 0 auto',
						background: T.acc,
						color: T.accFg,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Icon name={current.cloud ? 'connection' : 'home'} size="lg" />
				</span>
				<div style={{ flex: '1 1 220px' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
						<span style={{ font: `700 19px ${T.disp}` }}>{ent.loading ? '…' : current.name}</span>
						{sourceBadge}
						{live && ent.billing && !ent.billing.livemode && (
							<Badge status="warning">{t('settings.subscription.testMode')}</Badge>
						)}
					</div>
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
						{live
							? t('settings.subscription.planLineLive', {
									tagline: current.tagline,
									price: currentPriceLine,
								})
							: t('settings.subscription.planLine', {
									tagline: current.tagline,
									price: currentPriceLine,
								})}
					</div>
				</div>
				<Button variant="secondary" size="sm" icon="arrow-up" onClick={() => navigate('/upgrade')}>
					{live ? t('settings.subscription.comparePlans') : t('settings.subscription.compare')}
				</Button>
			</div>

			{/* ADR-027: the subscription's lifecycle + the one way to manage it (Stripe's portal). */}
			{live && (
				<Panel
					title={t('settings.subscription.billingTitle')}
					action={
						portalMode ? (
							<Button
								variant="secondary"
								size="sm"
								icon="CreditCard"
								disabled={busy}
								onClick={openPortal}
							>
								{t('settings.subscription.manageBilling')}
							</Button>
						) : undefined
					}
				>
					<div
						data-testid="billing-phase"
						style={{
							font: `12.5px/1.6 ${T.sans}`,
							color: phase === 'past-due' ? T.warn : T.sub,
						}}
					>
						{phaseLine}
					</div>
					{informsOnly && (
						<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginTop: 6 }}>
							{t('settings.subscription.manageOnWeb', { host: billingWebHost() })}
						</div>
					)}
				</Panel>
			)}

			<Panel
				title={t('settings.subscription.planPreview')}
				action={
					<Button
						variant="ghost"
						size="sm"
						iconRight="arrow-right"
						onClick={() => navigate('/upgrade')}
					>
						{t('settings.subscription.fullComparison')}
					</Button>
				}
			>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
						gap: 14,
					}}
				>
					{PLAN_CARDS.map((pl) => {
						const on = pl.id === ent.plan;
						return (
							<div
								key={pl.id}
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 12,
									padding: 16,
									borderRadius: 13,
									position: 'relative',
									border: `1px solid ${on ? T.accBd : pl.popular ? T.bdS : T.bd}`,
									background: on ? T.accSub : T.surf,
									boxShadow: on ? T.smd : 'none',
								}}
							>
								{pl.popular && !on && (
									<span
										style={{
											position: 'absolute',
											top: -9,
											right: 14,
											font: `600 10px ${T.sans}`,
											letterSpacing: '.06em',
											textTransform: 'uppercase',
											color: T.accFg,
											background: T.acc,
											padding: '2px 8px',
											borderRadius: 20,
										}}
									>
										{t('common.badge.recommended')}
									</span>
								)}
								<div>
									<div style={{ font: `700 16px ${T.disp}`, color: on ? T.acc : T.ink }}>
										{pl.name}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{pl.tagline}</div>
								</div>
								<div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
									<span style={{ font: `700 26px ${T.mono}`, color: T.ink }}>
										{pl.price ? price(pl.price) : t('settings.subscription.free')}
									</span>
									{pl.price > 0 && (
										<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
											{t('settings.subscription.perMonth')}
										</span>
									)}
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
									{pl.features.map((f: string) => (
										<span
											key={f}
											style={{
												display: 'flex',
												alignItems: 'flex-start',
												gap: 7,
												font: `11.5px/1.4 ${T.sans}`,
												color: T.sub,
											}}
										>
											<span style={{ marginTop: T.space.half }}>
												<Icon name="check" size={12} color={pl.cloud ? T.acc : T.ter} />
											</span>
											{f}
										</span>
									))}
								</div>
								{on ? (
									<Button variant="secondary" size="sm" disabled>
										{t('settings.subscription.currentPlan')}
									</Button>
								) : live ? (
									// Live billing: the Upgrade screen starts Checkout (web) or informs (elsewhere);
									// a subscribed account changes plans on the portal.
									ent.billing?.active ? (
										<Button
											variant="secondary"
											size="sm"
											icon="CreditCard"
											disabled={busy || !portalMode}
											onClick={openPortal}
										>
											{portalMode
												? t('settings.subscription.manageBilling')
												: t('settings.subscription.manageAt', { host: billingWebHost() })}
										</Button>
									) : (
										<Button
											variant={pl.cloud ? 'primary' : 'secondary'}
											size="sm"
											icon={pl.cloud ? 'arrow-up' : undefined}
											onClick={() => navigate('/upgrade')}
										>
											{pl.cloud && checkoutMode
												? t('settings.subscription.subscribe')
												: t('settings.subscription.viewPlan')}
										</Button>
									)
								) : (
									<Button
										variant={pl.price > (current.price || 0) ? 'primary' : 'secondary'}
										size="sm"
										icon={pl.price > (current.price || 0) ? 'arrow-up' : undefined}
										onClick={() => navigate('/upgrade')}
									>
										{ent.serverBacked && !ent.canChangePlan
											? t('settings.subscription.viewPlan')
											: pl.cloud
												? t('settings.subscription.tryPreview')
												: t('settings.subscription.switch')}
									</Button>
								)}
							</div>
						);
					})}
				</div>
			</Panel>

			<Panel
				title={t(
					live
						? 'settings.subscription.billingTitleLive'
						: ent.serverBacked && !ent.canChangePlan
							? 'settings.subscription.availabilityTitle'
							: 'settings.subscription.previewTitle',
				)}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
					{live ? (
						t('settings.subscription.billingBodyLive')
					) : ent.serverBacked && !ent.canChangePlan ? (
						<>
							{gatedBefore}
							<strong style={{ color: T.ink }}>{plansLink}</strong>
							{gatedAfter}
						</>
					) : (
						<>
							{previewBefore}
							<strong style={{ color: T.ink }}>{plansLink}</strong>
							{previewAfter}
						</>
					)}
				</div>
			</Panel>
		</div>
	);
}
