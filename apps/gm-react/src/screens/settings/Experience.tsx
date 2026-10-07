import { useSyncExternalStore, type ReactNode } from 'react';
import {
	isFeatureVisible,
	resolveMaturitySignals,
	SECTION_FEATURE_GATES,
	tierHiddenSections,
	type FeatureTier,
} from '@dndtools/core';
import { Badge, Button, Icon } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { Panel, T, radioGroupKeyDown } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { STEP_IDS, type BuilderStepId, type WidgetDraft } from '../../app/widgetBuilder/draft';
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
					// RC-UX-6.4 — what this level keeps out of sight, from the complexity map. The three
					// lists differ by construction; the old "reveals" list printed the same four core
					// features on every card.
					const hides = tierHiddenSections(levelTier).map((gate) => ({
						id: gate.id,
						label: t((gate.summaryKey ?? gate.labelKey) as MessageKey),
					}));
					// The radio is the level's name and blurb; the list beside it is its description. As
					// one 10-item button the card was taller than a phone's scroll pane at 200% text (its
					// centre landed under the footer) and its accessible name read the whole list.
					const revealsId = `experience-reveals-${l.id}`;
					return (
						<div
							key={l.id}
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: T.space.two,
								minWidth: 0,
								padding: T.space.four,
								borderRadius: T.radius.lg,
								border: `1px solid ${on ? T.accBd : T.bd}`,
								background: on ? T.accSub : T.surf,
								boxShadow: on ? T.smd : 'none',
							}}
						>
							<button
								type="button"
								role="radio"
								aria-checked={on}
								aria-describedby={revealsId}
								tabIndex={on ? 0 : -1}
								onClick={() => setDocAttr(TIER_ATTR, TIER_KEY, levelTier)}
								style={{
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'flex-start',
									gap: T.space.two,
									minWidth: 0,
									width: '100%',
									padding: T.space.zero,
									border: 'none',
									background: 'transparent',
									color: T.ink,
									textAlign: 'left',
									cursor: 'pointer',
								}}
							>
								<Icon name={l.icon} size="sm" />
								<span
									style={{
										display: 'flex',
										alignSelf: 'stretch',
										minWidth: 0,
										alignItems: 'center',
										gap: T.space.two,
										flexWrap: 'wrap',
									}}
								>
									<span style={{ font: `600 var(--text-base) ${T.sans}`, color: T.ink }}>
										{t(l.name)}
									</span>
									{l.rec && !on && (
										// The badge drops to its own line rather than breaking mid-word.
										<Badge status="neutral" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
											{t('common.badge.recommended')}
										</Badge>
									)}
									{on && (
										<span style={{ marginLeft: 'auto' }}>
											<Icon name="check" size={16} color={T.acc} />
										</span>
									)}
								</span>
								<span style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
									{t(l.blurb)}
								</span>
							</button>
							<div
								id={revealsId}
								data-experience-hides={l.id}
								style={{ display: 'flex', flexDirection: 'column', gap: T.space.one }}
							>
								<span style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.sub }}>
									{hides.length
										? t('settings.experience.hides')
										: t('settings.experience.hidesNone')}
								</span>
								{hides.map((h) => (
									<span
										key={h.id}
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
										<Icon name="hidden" size={12} color={on ? T.acc : T.ter} />
										{h.label}
									</span>
								))}
							</div>
						</div>
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

/** Any complexity-map gate (`SECTION_FEATURE_GATES`), for readers outside Settings. */
export function featureGateVisible(gateId: string, tier: FeatureTier) {
	return isFeatureVisible(gateId, tier, SECTION_FEATURE_GATES);
}

/**
 * RC-UX-6.4 — the widget builder's steps at this tier. Advanced (custom code, host access) is left
 * out below its complexity-map gate (`builder.step.advanced`) unless the draft already uses it, has
 * an issue there, or is open on it: hiding work that exists would leave it unreachable, not simpler.
 */
export function shownBuilderSteps(
	draft: WidgetDraft,
	tier: FeatureTier,
	current: BuilderStepId,
	issues: readonly { step: BuilderStepId }[],
): BuilderStepId[] {
	const keepAdvanced =
		featureGateVisible('builder.step.advanced', tier) ||
		current === 'advanced' ||
		draft.runtime === 'custom-html-js' ||
		draft.hostPermissions.length > 0 ||
		draft.networkDestinations.length > 0 ||
		issues.some((issue) => issue.step === 'advanced');
	return STEP_IDS.filter((id) => id !== 'advanced' || keepAdvanced);
}

/** What the builder's stepper left out and the real unlock: the RC-UX-5.2 gate, in place. */
export function AdvancedStepGate({ tier }: { tier: FeatureTier }) {
	const { t } = useI18n();
	const gate = SECTION_FEATURE_GATES.find((entry) => entry.id === 'builder.step.advanced');
	const needed = gate?.minTier ?? 'intermediate';
	const levelName = (of: FeatureTier) => {
		const level = COMPLEXITY_LEVELS.find((entry) => entry.tier === of);
		return level ? t(level.name) : of;
	};
	return (
		<div
			data-testid="widget-builder-advanced-hidden"
			style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
		>
			<span style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
				{t('settings.gated.body', {
					panel: t('builder.step.advanced'),
					level: levelName(needed),
					active: levelName(tier),
				})}
			</span>
			<Button
				variant="secondary"
				size="sm"
				style={{ alignSelf: 'flex-start' }}
				onClick={() => setDocAttr(TIER_ATTR, TIER_KEY, needed)}
			>
				{t('settings.gated.switchTo', { level: levelName(needed) })}
			</Button>
		</div>
	);
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
