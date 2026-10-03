import { useSyncExternalStore, type ReactNode } from 'react';
import {
	isFeatureVisible,
	resolveMaturitySignals,
	visibleFeatures,
	type FeatureTier,
} from '@dndtools/core';
import { Badge, Icon, RadioCard } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { Panel, T, radioGroupKeyDown } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	SETTINGS_FEATURE_GATES,
	TIER_ATTR,
	TIER_EVENT,
	TIER_KEY,
	readTier,
	setDocAttr,
} from './shared';
/** The three authored complexity levels — each maps 1:1 onto a real Core `FeatureTier`. */
export const COMPLEXITY_LEVELS: {
	id: string;
	name: MessageKey;
	icon: string;
	tier: FeatureTier;
	rec?: boolean;
	blurb: MessageKey;
}[] = [
	{
		id: 'beginner',
		name: 'settings.experience.beginner',
		icon: 'Sprout',
		tier: 'core',
		blurb: 'settings.experience.beginnerBlurb',
	},
	{
		id: 'standard',
		name: 'settings.experience.standard',
		icon: 'SlidersHorizontal',
		tier: 'intermediate',
		rec: true,
		blurb: 'settings.experience.standardBlurb',
	},
	{
		id: 'expert',
		name: 'settings.experience.expert',
		icon: 'Wrench',
		tier: 'advanced',
		blurb: 'settings.experience.expertBlurb',
	},
];

/** The experience-complexity card: the real feature-tier control Appearance hosts. */
export function ExperienceComplexity() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const tier = useSettingsTier();
	// RC-UX-3.5 — usage-driven disclosure alongside the manually-chosen tier above: real counts
	// against the declared thresholds (`MATURITY_SIGNALS`), read-only (a signal reveals itself by
	// vault usage, never a switch a DM flips — a toggle here would be a fake control, ADR-002/025).
	const maturitySignals = resolveMaturitySignals(runtime.state);
	const activeLvl = COMPLEXITY_LEVELS.find((l) => l.tier === tier) ?? COMPLEXITY_LEVELS[1];
	return (
		<Panel
			title={t('settings.experience.title')}
			action={<Badge status="neutral">{t(activeLvl.name)}</Badge>}
		>
			<div
				style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub, marginBottom: T.space.one }}
			>
				{t('settings.experience.intro')}
			</div>
			<div
				// This was the last hand-rolled picker in the file with visual-only selection: three
				// plain buttons whose chosen one differed by border/background alone, each its own tab
				// stop, with nothing announcing which was active. The declared-radiogroup shape used by
				// "Tool preferences" below (and by Onboarding's choice cards) is the house pattern.
				role="radiogroup"
				aria-label={t('settings.experience.title')}
				onKeyDown={radioGroupKeyDown}
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
					gap: T.space.three,
				}}
			>
				{COMPLEXITY_LEVELS.map((l) => {
					const levelTier = l.tier;
					const on = levelTier === tier;
					const reveals = visibleFeatures(levelTier).map((f) => f.label);
					return (
						<RadioCard
							key={l.id}
							value={l.tier}
							checked={on}
							onChange={() => {
								setDocAttr(TIER_ATTR, TIER_KEY, levelTier);
							}}
							icon={l.icon}
							style={{
								minWidth: 0,
								maxWidth: '100%',
								textAlign: 'left',
								padding: T.space.four,
								borderRadius: T.radius.lg,
								cursor: 'pointer',
								border: `1px solid ${on ? T.accBd : T.bd}`,
								background: on ? T.accSub : T.surf,
								boxShadow: on ? T.smd : 'none',
							}}
						>
							<div
								style={{
									display: 'flex',
									minWidth: 0,
									alignItems: 'center',
									gap: T.space.two,
									flexWrap: 'wrap',
								}}
							>
								<span style={{ font: `600 var(--text-base) ${T.sans}`, color: T.ink }}>
									{t(l.name)}
								</span>
								{l.rec && !on && <Badge status="neutral">{t('common.badge.recommended')}</Badge>}
								{on && (
									<span style={{ marginLeft: 'auto' }}>
										<Icon name="check" size={16} color={T.acc} />
									</span>
								)}
							</div>
							<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>{t(l.blurb)}</div>
							<div
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: T.space.one,
									marginTop: T.space.half,
								}}
							>
								{reveals.map((r) => (
									<span
										key={r}
										style={{
											display: 'flex',
											minWidth: 0,
											alignItems: 'center',
											gap: T.space.oneHalf,
											font: `var(--text-xs) ${T.sans}`,
											color: T.sub,
											overflowWrap: 'anywhere',
										}}
									>
										<Icon name="check" size={12} color={on ? T.acc : T.ter} />
										{r}
									</span>
								))}
							</div>
						</RadioCard>
					);
				})}
			</div>
			{maturitySignals.length > 0 && (
				<div
					style={{
						marginTop: T.space.four,
						paddingTop: T.space.four,
						borderTop: `1px solid ${T.bd}`,
						display: 'flex',
						flexDirection: 'column',
						gap: T.space.two,
					}}
				>
					<div style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.sub }}>
						{t('settings.experience.growingInto')}
					</div>
					{maturitySignals.map(({ signal, count, reached }) => (
						<div
							key={signal.id}
							style={{ display: 'flex', alignItems: 'center', gap: T.space.two, minWidth: 0 }}
						>
							<Icon name={reached ? 'check' : 'lock'} size={13} color={reached ? T.acc : T.ter} />
							<span
								style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub, overflowWrap: 'anywhere' }}
							>
								{signal.label}
							</span>
							<span style={{ marginLeft: 'auto', font: `var(--text-xs) ${T.mono}`, color: T.sub }}>
								{Math.min(count, signal.threshold)}/{signal.threshold}
							</span>
						</div>
					))}
				</div>
			)}
		</Panel>
	);
}

/** One subscription for the shell, sections, picker and links, including other open windows. */
function subscribeTier(onChange: () => void) {
	const onStorage = (event: StorageEvent) => {
		if (event.key !== TIER_KEY && event.key !== null) return;
		// readTier prefers the pre-paint attribute; invalidate it when another window writes.
		document.documentElement.removeAttribute(TIER_ATTR);
		onChange();
	};
	window.addEventListener(TIER_EVENT, onChange);
	window.addEventListener('storage', onStorage);
	return () => {
		window.removeEventListener(TIER_EVENT, onChange);
		window.removeEventListener('storage', onStorage);
	};
}
export function useSettingsTier() {
	return useSyncExternalStore(subscribeTier, readTier);
}

export function settingsGateVisible(gateKey: string, tier: FeatureTier) {
	return isFeatureVisible(gateKey, tier, SETTINGS_FEATURE_GATES);
}

/** Render nothing below the declared tier; children (including dialogs) are unmounted. */
export function SettingsSection({ gateKey, children }: { gateKey: string; children: ReactNode }) {
	const tier = useSettingsTier();
	const gate = SETTINGS_FEATURE_GATES.find((entry) => entry.id === gateKey);
	if (!gate || !settingsGateVisible(gateKey, tier)) return null;
	return (
		<div id={gate.sectionAnchor} data-settings-section={gate.id}>
			{children}
		</div>
	);
}
