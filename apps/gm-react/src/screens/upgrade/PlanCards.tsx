import { usePlanCards } from './usePlanCards';
import { Button, Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import type { EntitlementsValue, PlanId, PlanCard } from '../../cloud/entitlements';
import type { PaidPlanId } from '../../cloud/appApi';
import { billingWebHost } from '../../cloud/billing';

interface Props {
	ent: EntitlementsValue;
	planId: PlanId;
	currentPrice: number;
	busy: boolean;
	liveBilling: boolean;
	subscribed: boolean;
	portalMode: boolean;
	checkoutMode: boolean;
	openPortal: () => void;
	setCheckoutTo: (id: PaidPlanId) => void;
	setConfirmTo: (id: PlanId) => void;
	priceStr: (plan: PlanCard) => string;
	perStr: (plan: PlanCard) => string;
}
export function PlanCards({
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
}: Props) {
	const { t } = useI18n();
	const plans = usePlanCards();
	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
				gap: T.space.four,
			}}
		>
			{plans.map((pl) => {
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
							gap: T.space.four,
							padding: T.space.six,
							borderRadius: T.radius.xl,
							border: `1px solid ${featured ? T.accBd : T.bd}`,
							background: featured
								? `linear-gradient(180deg, ${T.accSub}, ${T.raised} 46%)`
								: T.surf,
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
									font: `600 var(--text-sm) ${T.sans}`,
									letterSpacing: '.07em',
									textTransform: 'uppercase',
									color: T.accFg,
									background: T.acc,
									padding: 'var(--space-0-5) var(--space-3)',
									borderRadius: T.radius.full,
								}}
							>
								{t('common.badge.recommended')}
							</span>
						)}
						<div style={{ display: 'flex', alignItems: 'center', gap: T.space.three }}>
							<span
								style={{
									width: 36,
									height: 36,
									borderRadius: T.radius.md,
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
								<div style={{ font: `700 var(--text-md) ${T.sans}`, color: T.ink }}>{pl.name}</div>
								<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>{pl.tagline}</div>
							</div>
						</div>
						<div style={{ display: 'flex', alignItems: 'baseline', gap: T.space.one }}>
							<span style={{ font: `800 var(--text-2xl) ${T.mono}`, color: T.ink }}>
								{priceStr(pl)}
							</span>
							<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>{perStr(pl)}</span>
							{pl.cloud && (
								<span
									style={{
										marginLeft: 'auto',
										font: `var(--text-sm) ${T.sans}`,
										color: T.ter,
										display: 'inline-flex',
										alignItems: 'center',
										gap: T.space.one,
									}}
								>
									<Icon name="connection" size={12} color={T.acc} />
									{t('upgrade.cloud')}
								</span>
							)}
						</div>
						<div style={{ height: T.space.one, background: T.bd }} />
						<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.two, flex: 1 }}>
							{pl.features.map((f: string) => (
								<span
									key={f}
									style={{
										display: 'flex',
										alignItems: 'flex-start',
										gap: T.space.two,
										font: `var(--text-sm)/1.45 ${T.sans}`,
										color: T.sub,
									}}
								>
									<span style={{ marginTop: T.space.one }}>
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
									variant={featured ? 'primary' : 'secondary'}
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
									variant={featured ? 'primary' : 'secondary'}
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
								variant={featured ? 'primary' : 'secondary'}
								size="md"
								icon="ArrowUp"
								disabled={busy || ent.loading || !ent.canChangePlan}
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
								disabled={busy || ent.loading || !ent.canChangePlan}
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
	);
}
