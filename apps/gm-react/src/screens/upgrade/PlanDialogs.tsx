import type { ReactNode } from 'react';
import { Button, Dialog, Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { PLAN_CARDS, type PlanCard, type PlanId } from '../../cloud/entitlements';
import type { PaidPlanId } from '../../cloud/appApi';

/**
 * Plan dialogs for the Upgrade ("Plans & cloud") screen, split out of `Upgrade.tsx` by
 * responsibility (RC-STB-2.7 file-size gate):
 * - `ChangePlanDialog` — the SIMULATED plan change (no payment processor configured; ADR-020).
 * - `CheckoutDialog` — the LIVE path (ADR-027): confirm plan + cycle, then hand the browser to
 *   Stripe-hosted Checkout. No card details are ever collected in the app.
 * - `MatrixCell` — one cell of the feature-comparison table.
 */

export const PLANS: PlanCard[] = PLAN_CARDS;
export const planById = (id: string) => PLANS.find((p) => p.id === id) || PLANS[0];

export function MatrixCell({ v, accent }: { v: unknown; accent?: boolean }) {
	const { t } = useI18n();
	if (v === true)
		return (
			<span role="img" aria-label={t('upgrade.included')}>
				<Icon name="check" size={16} color={accent ? T.acc : T.ok} />
			</span>
		);
	if (v === false)
		return (
			<span
				role="img"
				aria-label={t('upgrade.notIncluded')}
				style={{ font: `13px ${T.sans}`, color: T.ter }}
			>
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
export function ChangePlanDialog({
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
	const { t } = useI18n();
	const target = toId ? planById(toId) : null;
	if (!target) return null;
	const current = planById(currentId);
	const up = (target.price || 0) > (current?.price || 0);
	const losesCloud = !!current?.cloud && !target.cloud;
	const price = target.price
		? annual
			? `$${target.price * 10}`
			: `$${target.price}`
		: t('upgrade.free');
	const per = target.price ? (annual ? t('upgrade.perYear') : t('upgrade.perMonth')) : '';
	return (
		<Dialog
			open
			onClose={onClose}
			title={
				target.cloud
					? t('upgrade.tryPreview', { plan: target.name })
					: t('upgrade.switchTo', { plan: target.name })
			}
			description={
				losesCloud
					? t('upgrade.dialog.losesCloud')
					: t('upgrade.dialog.transition', { from: current?.name ?? '', to: target.name })
			}
			icon={target.cloud ? 'connection' : 'home'}
			size="md"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon={up ? 'ArrowUp' : 'check'}
						disabled={busy}
						onClick={() => onConfirm(target.id)}
					>
						{busy ? t('upgrade.dialog.saving') : t('upgrade.dialog.save')}
					</Button>
				</>
			}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'baseline',
					gap: T.space.oneHalf,
					marginBottom: T.space.three,
				}}
			>
				<span style={{ font: `700 28px ${T.mono}`, color: T.ink }}>{price}</span>
				<span style={{ font: `13px ${T.sans}`, color: T.ter }}>{per}</span>
				<span style={{ marginLeft: 'auto', font: `12px ${T.sans}`, color: T.sub }}>
					{target.tagline}
				</span>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}>
				{target.features.map((f: string) => (
					<span
						key={f}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: T.space.two,
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
						gap: T.space.two,
						marginTop: T.space.three,
						padding: `${T.space.three} ${T.space.three}`,
						borderRadius: T.radius.md,
						background: 'var(--color-status-warning-subtle)',
						border: `1px solid ${T.warn}`,
						font: `12px/1.5 ${T.sans}`,
						color: T.sub,
					}}
				>
					<span style={{ marginTop: T.space.half }}>
						<Icon name="warning" size={14} color={T.warn} />
					</span>
					<span>{t('upgrade.dialog.cloudWarning')}</span>
				</div>
			)}
			{/* Honest checkout: there is NO payment processor — the plan choice is real, the charge is not. */}
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					gap: T.space.two,
					marginTop: T.space.three,
					padding: `${T.space.two} ${T.space.three}`,
					borderRadius: T.radius.md,
					background: T.accSub,
					border: `1px solid ${T.accBd}`,
					font: `11.5px/1.5 ${T.sans}`,
					color: T.sub,
				}}
			>
				<span style={{ marginTop: T.space.half }}>
					<Icon name="info" size={13} color={T.acc} />
				</span>
				<span>
					<strong style={{ color: T.ink }}>{t('upgrade.dialog.noPayment')}</strong>{' '}
					{serverBacked ? t('upgrade.dialog.savedToAccount') : t('upgrade.dialog.savedToDevice')}
				</span>
			</div>
		</Dialog>
	);
}

/**
 * CheckoutDialog — ADR-027. Confirms the plan + billing cycle, then hands the browser to
 * Stripe's hosted Checkout page. Nothing about a card is asked for here (or anywhere in the app).
 */
export function CheckoutDialog({
	toId,
	annual,
	busy,
	onClose,
	onConfirm,
}: {
	toId: PaidPlanId | null;
	annual: boolean;
	busy: boolean;
	onClose: () => void;
	onConfirm: (id: PaidPlanId) => void;
}) {
	const { t } = useI18n();
	const target = toId ? planById(toId) : null;
	if (!target) return null;
	const price = annual ? `$${target.price * 10}` : `$${target.price}`;
	const per = annual ? t('upgrade.perYear') : t('upgrade.perMonth');
	return (
		<Dialog
			open
			onClose={onClose}
			title={t('upgrade.subscribeTo', { plan: target.name })}
			description={target.tagline}
			icon="connection"
			size="md"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="CreditCard"
						disabled={busy}
						onClick={() => onConfirm(target.id as PaidPlanId)}
					>
						{busy ? t('upgrade.dialog.redirecting') : t('upgrade.dialog.continueToCheckout')}
					</Button>
				</>
			}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'baseline',
					gap: T.space.oneHalf,
					marginBottom: T.space.three,
				}}
			>
				<span style={{ font: `700 28px ${T.mono}`, color: T.ink }}>{price}</span>
				<span style={{ font: `13px ${T.sans}`, color: T.ter }}>{per}</span>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}>
				{target.features.map((f: string) => (
					<span
						key={f}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: T.space.two,
							font: `12.5px ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon name="check" size={13} color={T.acc} />
						{f}
					</span>
				))}
			</div>
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					gap: T.space.two,
					marginTop: T.space.three,
					padding: `${T.space.two} ${T.space.three}`,
					borderRadius: T.radius.md,
					background: T.accSub,
					border: `1px solid ${T.accBd}`,
					font: `11.5px/1.5 ${T.sans}`,
					color: T.sub,
				}}
			>
				<span style={{ marginTop: T.space.half }}>
					<Icon name="ShieldCheck" size={13} color={T.acc} />
				</span>
				<span>{t('upgrade.dialog.stripeNote')}</span>
			</div>
		</Dialog>
	);
}
