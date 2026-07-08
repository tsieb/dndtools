import { useState, type ReactNode } from 'react';
import { Button, Dialog, Icon, Switch, Toaster } from '../ds';
import { BackBar, Page, T, eb } from '../app/screen-kit';
import { DNDAccount } from '../runtime/mockCampaign';

/**
 * Upgrade — "Plans & cloud", a faithful React port of the design-package `views/upgrade.jsx`
 * PricingSection: the acquisition surface for a local-first app ("free to play, pay only for the
 * cloud"). The plan cards read the real `DNDAccount.subscription.plans`; the marketing copy (`why`)
 * and the detailed feature matrix are NOT present in the mock, so they fall back to a local
 * design-vocabulary matrix (noted in the report).
 *
 * Plan state: billing has no Core backing BY DESIGN (local-first app, no account/transport,
 * ADR-014), so the active plan is device-local app state persisted to localStorage — the same
 * Contract-1 pattern Settings uses for theme/tier. The Upgrade/Switch CTAs open the design
 * package's changePlan confirm modal (settings.jsx `A.MODALS.changePlan`, ported below as a local
 * DS Dialog); Confirm really changes the plan on this device and survives reload, but takes NO
 * payment — and says so in the dialog instead of pretending to charge. The full-screen Signup flow
 * + CloudChip/CloudOverlay nudges (which depend on a global app dispatch the React port lacks)
 * remain intentionally out of scope for this single route.
 */

const sub = ((DNDAccount as any).subscription ?? {}) as any;
const PLANS: any[] = sub.plans ?? [];
const planById = (id: string) => PLANS.find((p) => p.id === id) || PLANS[0];

// A plan chosen through the confirm dialog is device-local app state (no Core/billing backing by
// design), persisted to localStorage so it survives reload. Until the user picks one, the active
// plan is the mock account's `subscription.current` — the SAME representation Settings'
// Subscription pane reads — so the two screens never disagree about which plan you're on.
const LOCAL_PLAN = PLANS.find((p) => !p.cloud) ?? PLANS[0];
const PLAN_KEY = 'dndtools:react:plan';

function readPlanId(): string {
	try {
		const v = window.localStorage.getItem(PLAN_KEY);
		if (v && PLANS.some((p) => p.id === v)) return v;
	} catch {
		/* ignore */
	}
	if (PLANS.some((p) => p.id === sub.current)) return sub.current;
	return LOCAL_PLAN?.id;
}

function writePlanId(id: string) {
	try {
		window.localStorage.setItem(PLAN_KEY, id);
	} catch {
		/* ignore */
	}
}

const FALLBACK_WHY =
	'DND Tools runs entirely on your device, free, forever. The paid plans exist only to cover the cost of the cloud services some tables want — sync, off-device backup, audio projection and AI — which run on servers we rent by the gigabyte and the minute.';

// `sub.matrix` is absent from the mock, so this is the design-vocabulary fallback comparison built from
// the same three plan tiers (hearth / lantern / beacon). Cells: true → check, false → dash, string → value.
const FALLBACK_MATRIX: { group: string; rows: { label: string; cloud?: boolean; hearth: any; lantern: any; beacon: any }[] }[] = [
	{
		group: 'At the table',
		rows: [
			{ label: 'On-device vault', hearth: true, lantern: true, beacon: true },
			{ label: 'Core widgets, maps & fog', hearth: true, lantern: true, beacon: true },
			{ label: 'Players at the table', hearth: '4', lantern: '6', beacon: '12' },
			{ label: 'Co-DM seats', hearth: false, lantern: '1', beacon: '3' },
			{ label: 'Community modules (read-only)', hearth: true, lantern: true, beacon: true },
		],
	},
	{
		group: 'Cloud',
		rows: [
			{ label: 'Sync across devices', cloud: true, hearth: false, lantern: true, beacon: true },
			{ label: 'Off-device backup', cloud: true, hearth: false, lantern: true, beacon: true },
			{ label: 'Vault storage', cloud: true, hearth: '—', lantern: '20 GB', beacon: '200 GB' },
			{ label: 'Live audio projection', cloud: true, hearth: false, lantern: true, beacon: true },
		],
	},
	{
		group: 'Assist & publish',
		rows: [
			{ label: 'AI assist credits', cloud: true, hearth: false, lantern: '500 / mo', beacon: 'Unlimited' },
			{ label: 'Public campaign wikis', cloud: true, hearth: false, lantern: false, beacon: true },
			{ label: 'Priority sync & support', cloud: true, hearth: false, lantern: false, beacon: true },
		],
	},
];

function MatrixCell({ v, accent }: { v: any; accent?: boolean }) {
	if (v === true) return <Icon name="check" size={16} color={accent ? T.acc : T.ok} />;
	if (v === false) return <span style={{ font: `13px ${T.sans}`, color: T.ter }}>—</span>;
	return <span style={{ font: `12.5px ${T.sans}`, color: T.ink }}>{v as ReactNode}</span>;
}

/**
 * ChangePlanDialog — port of the design package's changePlan confirm modal (settings.jsx
 * `A.MODALS.changePlan`) onto the DS Dialog. Confirm performs a REAL device-local plan change
 * (persisted via `writePlanId` by the caller) — but billing has no Core/transport backing, so no
 * payment happens and the dialog says so plainly. The cloud→local downgrade warning is per the
 * design source. Price reflects the billing-cycle toggle honestly (annual = 10× monthly).
 */
function ChangePlanDialog({
	toId,
	currentId,
	annual,
	onClose,
	onConfirm,
}: {
	toId: string | null;
	currentId: string;
	annual: boolean;
	onClose: () => void;
	onConfirm: (id: string) => void;
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
			title={`${up ? 'Upgrade to' : 'Switch to'} ${target.name}`}
			description={losesCloud ? 'This will turn off cloud sync' : `${current?.name} → ${target.name}`}
			icon={target.cloud ? 'connection' : 'home'}
			size="md"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
					<Button variant="primary" size="sm" icon={up ? 'ArrowUp' : 'check'} onClick={() => onConfirm(target.id)}>
						{target.price ? `Confirm — ${price}${per}` : 'Confirm'}
					</Button>
				</>
			}
		>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
				<span style={{ font: `700 28px ${T.mono}`, color: T.ink }}>{price}</span>
				<span style={{ font: `13px ${T.sans}`, color: T.ter }}>{per}</span>
				<span style={{ marginLeft: 'auto', font: `12px ${T.sans}`, color: T.sub }}>{target.tagline}</span>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
				{(target.features ?? []).map((f: string) => (
					<span key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12.5px ${T.sans}`, color: T.sub }}>
						<Icon name="check" size={13} color={T.acc} />{f}
					</span>
				))}
			</div>
			{losesCloud && (
				<div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: '11px 13px', borderRadius: 9, background: 'var(--color-status-warning-subtle)', border: `1px solid ${T.warn}`, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
					<span style={{ marginTop: 1 }}><Icon name="warning" size={14} color={T.warn} /></span>
					<span>Your vaults stay on this device, but cloud sync, AI credits, and extra player seats will stop at the end of the cycle.</span>
				</div>
			)}
			{/* Honest-local: billing has no Core/transport backing — the plan choice is real, the charge is not. */}
			<div style={{ marginTop: 14, font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
				No payment is taken and no account is created. Your plan choice is saved on this device only.
			</div>
		</Dialog>
	);
}

export function Upgrade() {
	const [annual, setAnnual] = useState(false);
	const [planId, setPlanId] = useState<string>(() => readPlanId());
	const [confirmTo, setConfirmTo] = useState<string | null>(null);
	const why: string = sub.why ?? FALLBACK_WHY;
	const matrix = (sub.matrix as typeof FALLBACK_MATRIX | undefined) ?? FALLBACK_MATRIX;
	const cycleLabel = annual ? 'annually' : 'monthly';

	const priceStr = (p: any) => (p?.price ? (annual ? `$${p.price * 10}` : `$${p.price}`) : 'Free');
	const perStr = (p: any) => (p?.price ? (annual ? '/yr' : '/mo') : '');
	const currentPrice = planById(planId)?.price || 0;

	const confirmChange = (id: string) => {
		setPlanId(id);
		writePlanId(id);
		setConfirmTo(null);
		Toaster.success(`Now on ${planById(id)?.name}`);
	};

	if (PLANS.length === 0) {
		return (
			<Page max={1080}>
				<BackBar to="/settings" label="Settings" />
				<div style={{ textAlign: 'center', color: T.ter, font: `14px ${T.sans}` }}>No plans to compare.</div>
			</Page>
		);
	}

	return (
		<Page max={1080}>
			<BackBar to="/settings" label="Settings" />

			{/* hero */}
			<div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 8px' }}>
				<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 20, background: T.accSub, border: `1px solid ${T.accBd}`, font: `600 11.5px ${T.sans}`, color: T.acc, marginBottom: 16 }}>
					<Icon name="Sprout" size={13} />Local-first · your table runs offline
				</span>
				<h2 style={{ margin: 0, font: `800 34px ${T.disp}`, letterSpacing: '-.02em', color: T.ink }}>Free to play. Pay only for the cloud.</h2>
				<p style={{ font: `14px/1.7 ${T.sans}`, color: T.sub, marginTop: 12 }}>{why}</p>
			</div>

			{/* billing cycle toggle */}
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '22px 0 20px' }}>
				<span style={{ font: `12.5px ${T.sans}`, color: annual ? T.ter : T.ink }}>Monthly</span>
				<Switch checked={annual} onChange={() => setAnnual((v) => !v)} label="" aria-label="Bill annually (2 months free)" />
				<span style={{ font: `12.5px ${T.sans}`, color: annual ? T.ink : T.ter }}>Annual</span>
				<span style={{ font: `600 11px ${T.sans}`, color: T.acc, background: T.accSub, border: `1px solid ${T.accBd}`, borderRadius: 20, padding: '2px 8px' }}>2 months free</span>
			</div>

			{/* plan cards */}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
				{PLANS.map((pl) => {
					const on = pl.id === planId;
					const featured = pl.popular;
					const isUpgrade = (pl.price || 0) > currentPrice;
					return (
						<div key={pl.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, padding: 22, borderRadius: 16, border: `1px solid ${featured ? T.accBd : T.bd}`, background: featured ? `linear-gradient(180deg, ${T.accSub}, ${T.raised} 46%)` : T.raised, boxShadow: featured ? T.smd : 'none' }}>
							{featured && <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', font: `600 10px ${T.sans}`, letterSpacing: '.07em', textTransform: 'uppercase', color: T.accFg, background: T.acc, padding: '3px 11px', borderRadius: 20 }}>Most chosen</span>}
							<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
								<span style={{ width: 36, height: 36, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: pl.cloud ? T.acc : T.alt, color: pl.cloud ? T.accFg : T.acc }}>
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
								{pl.cloud && <span style={{ marginLeft: 'auto', font: `11px ${T.sans}`, color: T.ter, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="connection" size={12} color={T.acc} />Cloud</span>}
							</div>
							<div style={{ height: 1, background: T.bd }} />
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
								{(pl.features ?? []).map((f: string) => (
									<span key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, font: `12.5px/1.45 ${T.sans}`, color: T.sub }}>
										<span style={{ marginTop: 1 }}><Icon name="check" size={13} color={pl.cloud ? T.acc : T.ter} /></span>{f}
									</span>
								))}
							</div>
							{/* Opens the changePlan confirm dialog — a real device-local plan change, no payment (no core command; billing is out of core scope by design). */}
							{on ? (
								<Button variant="secondary" size="md" disabled icon="check">Your current plan</Button>
							) : isUpgrade ? (
								/* icon="ArrowUp" is the direct Lucide name (like "Sprout" above): it renders correctly whether or not the registry carries an 'arrow-up' alias, unlike unknown kebab names which fall back to a Square glyph. */
								<Button variant="primary" size="md" icon="ArrowUp" onClick={() => setConfirmTo(pl.id)}>Upgrade to {pl.name}</Button>
							) : (
								<Button variant="secondary" size="md" onClick={() => setConfirmTo(pl.id)}>Switch to {pl.name}</Button>
							)}
						</div>
					);
				})}
			</div>

			{/* honest cost note */}
			<div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, margin: '22px 0', padding: '14px 16px', borderRadius: 12, background: T.surf, border: `1px solid ${T.bd}` }}>
				<Icon name="info" size={17} color={T.acc} />
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					<strong style={{ color: T.ink }}>Why isn&rsquo;t cloud free?</strong> Sync, backup, audio projection and AI all run on servers we rent by the gigabyte and the minute. The plan price covers that cost — it isn&rsquo;t a markup on features you already own. Cancel any time and your vaults stay exactly where they are, on your device.
				</div>
			</div>

			{/* detailed matrix */}
			<div style={{ borderRadius: 16, border: `1px solid ${T.bd}`, background: T.raised, overflow: 'hidden', marginTop: 8 }}>
				<div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr 1fr 1fr', alignItems: 'end', gap: 0, padding: '16px 20px', borderBottom: `1px solid ${T.bdS}`, background: T.surf }}>
					<div style={{ font: `700 14px ${T.disp}`, color: T.ink }}>Compare every feature</div>
					{PLANS.map((pl) => (
						<div key={pl.id} style={{ textAlign: 'center' }}>
							<div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: `700 13px ${T.sans}`, color: pl.id === planId ? T.acc : T.ink }}>
								{pl.cloud && <Icon name="connection" size={12} color={T.acc} />}{pl.name}
							</div>
							<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: 2 }}>{priceStr(pl)}{perStr(pl)}</div>
						</div>
					))}
				</div>
				{matrix.map((grp) => (
					<div key={grp.group}>
						<div style={{ padding: '11px 20px 7px', ...eb, color: T.ter, background: T.alt, borderBottom: `1px solid ${T.bd}` }}>{grp.group}</div>
						{grp.rows.map((r, i) => (
							<div key={r.label} style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr 1fr 1fr', alignItems: 'center', padding: '12px 20px', borderBottom: i === grp.rows.length - 1 ? 'none' : `1px solid ${T.bd}` }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `13px ${T.sans}`, color: T.ink }}>
									{r.label}
									{r.cloud && <span title="Requires a cloud plan" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: `600 9.5px ${T.sans}`, letterSpacing: '.04em', textTransform: 'uppercase', color: T.acc, background: T.accSub, border: `1px solid ${T.accBd}`, borderRadius: 5, padding: '1px 5px' }}><Icon name="connection" size={9} />Cloud</span>}
								</div>
								<div style={{ textAlign: 'center' }}><MatrixCell v={r.hearth} /></div>
								<div style={{ textAlign: 'center' }}><MatrixCell v={r.lantern} accent={r.cloud} /></div>
								<div style={{ textAlign: 'center' }}><MatrixCell v={r.beacon} accent={r.cloud} /></div>
							</div>
						))}
					</div>
				))}
			</div>

			<div style={{ textAlign: 'center', font: `12px ${T.sans}`, color: T.ter, marginTop: 18 }}>
				Prices in USD. Cloud plans bill {cycleLabel} and cancel any time. No account needed to keep playing locally.
			</div>

			<ChangePlanDialog toId={confirmTo} currentId={planId} annual={annual} onClose={() => setConfirmTo(null)} onConfirm={confirmChange} />
		</Page>
	);
}
