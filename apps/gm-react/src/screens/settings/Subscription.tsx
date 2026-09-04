import { useNavigate } from 'react-router-dom';
import { Badge, Button, Icon } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { PLAN_CARDS, useEntitlements } from '../../cloud/entitlements';
/* ---- Subscription (REAL entitlements hook — server-backed when signed in, honest local fallback;
 * plans are ALWAYS explicitly simulated: no payment processor exists anywhere in this product) ------ */
export function SettingsSubscription() {
	const navigate = useNavigate();
	const ent = useEntitlements();
	const current = PLAN_CARDS.find((p) => p.id === ent.plan) ?? PLAN_CARDS[0];
	const sourceBadge =
		ent.source === 'server' ? (
			<Badge status="success" icon="check">
				Account preview
			</Badge>
		) : ent.source === 'cache' ? (
			<Badge status="warning">Last known (offline)</Badge>
		) : (
			<Badge status="neutral">This device only</Badge>
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
						{current.tagline} · {current.price ? `$${current.price}/mo planned` : 'Free'} · preview
						access, no payment
					</div>
				</div>
				<Button variant="secondary" size="sm" icon="arrow-up" onClick={() => navigate('/upgrade')}>
					Compare preview plans
				</Button>
			</div>

			<Panel
				title="Plan preview"
				action={
					<Button
						variant="ghost"
						size="sm"
						iconRight="arrow-right"
						onClick={() => navigate('/upgrade')}
					>
						Full comparison
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
										Recommended
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
										{pl.price ? `$${pl.price}` : 'Free'}
									</span>
									{pl.price > 0 && (
										<span style={{ font: `12px ${T.sans}`, color: T.ter }}>/mo</span>
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
										Current plan
									</Button>
								) : (
									<Button
										variant={pl.price > (current.price || 0) ? 'primary' : 'secondary'}
										size="sm"
										icon={pl.price > (current.price || 0) ? 'arrow-up' : undefined}
										onClick={() => navigate('/upgrade')}
									>
										{ent.serverBacked && !ent.canChangePlan
											? 'View plan'
											: pl.cloud
												? 'Try preview'
												: 'Switch'}
									</Button>
								)}
							</div>
						);
					})}
				</div>
			</Panel>

			<Panel
				title={ent.serverBacked && !ent.canChangePlan ? 'Plan availability' : 'Preview access'}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
					{ent.serverBacked && !ent.canChangePlan ? (
						<>
							Self-service cloud plan changes are not available in this release. The app cannot take
							a payment or activate a paid plan. See{' '}
							<strong style={{ color: T.ink }}>Plans &amp; cloud</strong> for planned hosted
							features; local play remains available.
						</>
					) : (
						<>
							Cloud plans are currently a free preview. Listed prices are planned launch prices; the
							app does not request a payment method or charge you. Your selection is stored{' '}
							{ent.serverBacked ? 'on your account' : 'on this device'} and can be changed from{' '}
							<strong style={{ color: T.ink }}>Plans &amp; cloud</strong>.
						</>
					)}
				</div>
			</Panel>
		</div>
	);
}
