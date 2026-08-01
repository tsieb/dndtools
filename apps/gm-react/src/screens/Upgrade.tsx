import { useState, type ReactNode } from 'react';
import { Button, Dialog, Icon, Switch, Toaster } from '../ds';
import { BackBar, Page, T, eb } from '../app/screen-kit';
import { useAuth } from '../cloud/AuthContext';
import { isAccountApiConfigured } from '../cloud/config';
import { useViewport } from '../app/useViewport';
import {
	OFFLINE_FALLBACK_MATRIX,
	PLAN_CARDS,
	useEntitlements,
	type PlanCard,
	type PlanId,
} from '../cloud/entitlements';

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

const PLANS: PlanCard[] = PLAN_CARDS;
const planById = (id: string) => PLANS.find((p) => p.id === id) || PLANS[0];

const WHY_PREVIEW =
	'Lamplight keeps your local campaign and core table tools available for free. Lantern and Beacon are no-charge previews of optional hosted services: encrypted off-device backup, internet play, and campaign publishing. Availability depends on this build and device.';
const WHY_UNAVAILABLE =
	'Lamplight keeps your local campaign and core table tools available for free. Lantern and Beacon describe planned hosted services, but this release cannot activate a paid cloud plan or take payment.';

function MatrixCell({ v, accent }: { v: unknown; accent?: boolean }) {
	if (v === true)
		return (
			<span role="img" aria-label="Included">
				<Icon name="check" size={16} color={accent ? T.acc : T.ok} />
			</span>
		);
	if (v === false)
		return (
			<span role="img" aria-label="Not included" style={{ font: `13px ${T.sans}`, color: T.ter }}>
				—
			</span>
		);
	return <span style={{ font: `12.5px ${T.sans}`, color: T.ink }}>{v as ReactNode}</span>;
}

/**
 * ChangePlanDialog — the design package's changePlan confirm modal (settings.jsx
 * `A.MODALS.changePlan`) on the DS Dialog. Confirm performs a REAL plan change — saved to the
 * account when the backend is reachable, to this device otherwise — but checkout is SIMULATED
 * either way (no payment processor exists) and the dialog says so explicitly. The cloud→local
 * downgrade warning is per the design source. Price reflects the billing-cycle toggle honestly
 * (annual = 10× monthly).
 */
function ChangePlanDialog({
	toId,
	currentId,
	annual,
	serverBacked,
	busy,
	onClose,
	onConfirm,
}: {
	toId: PlanId | null;
	currentId: PlanId;
	annual: boolean;
	serverBacked: boolean;
	busy: boolean;
	onClose: () => void;
	onConfirm: (id: PlanId) => void;
}) {
	const target = toId ? planById(toId) : null;
	if (!target) return null;
	const current = planById(currentId);
	const up = (target.price || 0) > (current?.price || 0);
	const losesCloud = !!current?.cloud && !target.cloud;
	const price = target.price ? (annual ? `$${target.price * 10}` : `$${target.price}`) : 'Free';
	const per = target.price ? (annual ? '/yr' : '/mo') : '';
	return (
		<Dialog
			open
			onClose={onClose}
			title={target.cloud ? `Try ${target.name} preview` : `Switch to ${target.name}`}
			description={
				losesCloud ? 'This turns off hosted features now' : `${current?.name} → ${target.name}`
			}
			icon={target.cloud ? 'connection' : 'home'}
			size="md"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
						Cancel
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon={up ? 'ArrowUp' : 'check'}
						disabled={busy}
						onClick={() => onConfirm(target.id)}
					>
						{busy ? 'Saving…' : 'Save plan choice'}
					</Button>
				</>
			}
		>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
				<span style={{ font: `700 28px ${T.mono}`, color: T.ink }}>{price}</span>
				<span style={{ font: `13px ${T.sans}`, color: T.ter }}>{per}</span>
				<span style={{ marginLeft: 'auto', font: `12px ${T.sans}`, color: T.sub }}>
					{target.tagline}
				</span>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
				{target.features.map((f: string) => (
					<span
						key={f}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							font: `12.5px ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon name="check" size={13} color={T.acc} />
						{f}
					</span>
				))}
			</div>
			{losesCloud && (
				<div
					style={{
						display: 'flex',
						alignItems: 'flex-start',
						gap: 8,
						marginTop: 14,
						padding: '11px 13px',
						borderRadius: 9,
						background: 'var(--color-status-warning-subtle)',
						border: `1px solid ${T.warn}`,
						font: `12px/1.5 ${T.sans}`,
						color: T.sub,
					}}
				>
					<span style={{ marginTop: 1 }}>
						<Icon name="warning" size={14} color={T.warn} />
					</span>
					<span>
						Cloud backup and internet play stop as soon as you switch. Your vaults and everything in
						them stay on this device.
					</span>
				</div>
			)}
			{/* Honest checkout: there is NO payment processor — the plan choice is real, the charge is not. */}
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					gap: 8,
					marginTop: 14,
					padding: '10px 12px',
					borderRadius: 9,
					background: T.accSub,
					border: `1px solid ${T.accBd}`,
					font: `11.5px/1.5 ${T.sans}`,
					color: T.sub,
				}}
			>
				<span style={{ marginTop: 1 }}>
					<Icon name="info" size={13} color={T.acc} />
				</span>
				<span>
					<strong style={{ color: T.ink }}>Cloud-plan preview — no payment is taken.</strong>{' '}
					{serverBacked
						? 'Your choice is saved to your account. No card or payment details are requested.'
						: 'No account is connected, so your plan choice is saved on this device only.'}
				</span>
			</div>
		</Dialog>
	);
}

export function Upgrade() {
	const viewport = useViewport();
	const auth = useAuth();
	const ent = useEntitlements();
	const [annual, setAnnual] = useState(false);
	const [confirmTo, setConfirmTo] = useState<PlanId | null>(null);
	const [busy, setBusy] = useState(false);
	const planId = ent.plan;
	// The feature matrix: the server's copy when reachable (live or last-known cache); the
	// annotated offline fallback otherwise. Both share the same shape.
	const matrix = ent.features ?? OFFLINE_FALLBACK_MATRIX;
	const priceStr = (p: PlanCard) =>
		p.price ? (annual ? `$${p.price * 10}` : `$${p.price}`) : 'Free';
	const perStr = (p: PlanCard) => (p.price ? (annual ? '/yr' : '/mo') : '');
	const currentPrice = planById(planId)?.price || 0;
	const planChangesUnavailable = ent.serverBacked && !ent.loading && !ent.canChangePlan;

	const confirmChange = (id: PlanId) => {
		if (!ent.canChangePlan) {
			Toaster.error('Self-service cloud plan changes are not available in this release.');
			return;
		}
		setBusy(true);
		void ent
			.setPlan(id)
			.then(() => {
				setConfirmTo(null);
				Toaster.success(
					ent.serverBacked && ent.simulated
						? `Now trying the ${planById(id)?.name} preview — no payment taken.`
						: `Now on ${planById(id)?.name} on this device.`,
				);
			})
			.catch((e: unknown) => {
				Toaster.error(e instanceof Error ? e.message : 'Could not change the plan.');
			})
			.finally(() => setBusy(false));
	};

	// Nudge, not a wall: the pricing page stays fully usable signed out (device-local choice),
	// but signing in makes the simulated plan follow the account.
	const showSignInNudge = isAccountApiConfigured && auth.status === 'signed-out';

	return (
		<Page max={1080}>
			<BackBar to="/settings" label="Settings" />

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
					Local-first · your table runs offline
				</span>
				<h2
					style={{
						margin: 0,
						font: `800 ${viewport === 'phone' ? 28 : 34}px ${T.disp}`,
						letterSpacing: '-.02em',
						color: T.ink,
					}}
				>
					{planChangesUnavailable
						? 'Local play stays free. Cloud plan sign-up is not available yet.'
						: 'Local play stays free. Cloud plans are in preview.'}
				</h2>
				<p style={{ font: `14px/1.7 ${T.sans}`, color: T.sub, marginTop: 12 }}>
					{planChangesUnavailable ? WHY_UNAVAILABLE : WHY_PREVIEW}
				</p>
			</div>

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
					<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
						Your plan choice is saved on this device. Sign in to keep it with your account.
					</span>
					<Button variant="secondary" size="sm" onClick={() => auth.openAuthModal()}>
						Sign in
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
					Monthly price
				</span>
				<Switch
					checked={annual}
					onChange={() => setAnnual((v) => !v)}
					label=""
					aria-label="Show planned annual pricing"
				/>
				<span style={{ font: `12.5px ${T.sans}`, color: annual ? T.ink : T.ter }}>
					Annual price
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
					Planned: 2 months free
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
									Recommended
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
										Cloud
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
							{/* Opens the changePlan confirm dialog — a real (simulated-checkout) plan change; server-backed when signed in. */}
							{on ? (
								<Button variant="secondary" size="md" disabled icon="check">
									Your current plan
								</Button>
							) : isUpgrade ? (
								/* icon="ArrowUp" is the direct Lucide name (like "Sprout" above): it renders correctly whether or not the registry carries an 'arrow-up' alias, unlike unknown kebab names which fall back to a Square glyph. */
								<Button
									variant="primary"
									size="md"
									icon="ArrowUp"
									disabled={ent.loading || !ent.canChangePlan}
									onClick={() => setConfirmTo(pl.id)}
								>
									{ent.canChangePlan ? `Try ${pl.name} preview` : 'Plan changes unavailable'}
								</Button>
							) : (
								<Button
									variant="secondary"
									size="md"
									disabled={ent.loading || !ent.canChangePlan}
									onClick={() => setConfirmTo(pl.id)}
								>
									{ent.canChangePlan ? `Switch to ${pl.name}` : 'Plan changes unavailable'}
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
					{planChangesUnavailable ? (
						<>
							<strong style={{ color: T.ink }}>Cloud plan sign-up is not available.</strong> The
							listed prices describe planned hosted services; this release cannot take payment or
							activate a paid plan. Your local vaults and table tools remain available.
						</>
					) : (
						<>
							<strong style={{ color: T.ink }}>Preview access is free.</strong> The listed prices
							are planned launch prices for hosted services such as encrypted backup, internet play,
							and publishing. No card is requested during the preview, and your local vaults never
							depend on a cloud plan.
						</>
					)}
				</div>
			</div>

			{/* detailed matrix — served by the account backend when reachable (single source of truth) */}
			<div
				role="region"
				aria-label="Plan feature comparison"
				tabIndex={0}
				style={{
					borderRadius: 16,
					border: `1px solid ${T.bd}`,
					background: T.raised,
					overflowX: 'auto',
					marginTop: 8,
				}}
			>
				<div role="table" aria-label="Plan feature comparison" style={{ minWidth: 620 }}>
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
							Compare every feature
							{ent.source !== 'server' && (
								<span
									style={{
										display: 'block',
										font: `400 10.5px ${T.sans}`,
										color: T.ter,
										marginTop: 2,
									}}
								>
									{ent.source === 'cache'
										? 'Showing the last plan details saved for this account (offline).'
										: 'Offline comparison — connect an account to load live plan details.'}
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
												title="Requires a cloud plan"
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
												Cloud
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
				{planChangesUnavailable
					? 'Planned prices are in USD. This release has no billing or payment flow. No account is needed to keep playing locally.'
					: 'Planned prices are in USD. Preview access is free: there is no billing, payment method, or charge. No account is needed to keep playing locally.'}
			</div>

			<ChangePlanDialog
				toId={ent.canChangePlan ? confirmTo : null}
				currentId={planId}
				annual={annual}
				serverBacked={ent.serverBacked}
				busy={busy}
				onClose={() => setConfirmTo(null)}
				onConfirm={confirmChange}
			/>
		</Page>
	);
}
