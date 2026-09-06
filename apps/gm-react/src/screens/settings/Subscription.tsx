import { useNavigate } from 'react-router-dom';
import { Badge, Button, Icon } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { PLAN_CARDS, useEntitlements } from '../../cloud/entitlements';
/* ---- Subscription (REAL entitlements hook — server-backed when signed in, honest local fallback;
 * plans are ALWAYS explicitly simulated: no payment processor exists anywhere in this product) ------ */
export function SettingsSubscription() {
	const { t, formatNumber } = useI18n();
	const navigate = useNavigate();
	const ent = useEntitlements();
	const current = PLAN_CARDS.find((p) => p.id === ent.plan) ?? PLAN_CARDS[0];
	// Prices are planned launch prices in USD; the currency renders per locale, the amount does not
	// change. Whole dollars only — every planned price is a round number.
	const price = (amount: number) =>
		formatNumber(amount, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
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
				{t('settings.subscription.sourceAccount')}
			</Badge>
		) : ent.source === 'cache' ? (
			<Badge status="warning">{t('settings.subscription.sourceCache')}</Badge>
		) : (
			<Badge status="neutral">{t('settings.subscription.sourceDevice')}</Badge>
		);
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
					</div>
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
						{t('settings.subscription.planLine', {
							tagline: current.tagline,
							price: current.price
								? t('settings.subscription.pricePlanned', { price: price(current.price) })
								: t('settings.subscription.free'),
						})}
					</div>
				</div>
				<Button variant="secondary" size="sm" icon="arrow-up" onClick={() => navigate('/upgrade')}>
					{t('settings.subscription.compare')}
				</Button>
			</div>

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
											<span style={{ marginTop: 1 }}>
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
					ent.serverBacked && !ent.canChangePlan
						? 'settings.subscription.availabilityTitle'
						: 'settings.subscription.previewTitle',
				)}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
					{ent.serverBacked && !ent.canChangePlan ? (
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
