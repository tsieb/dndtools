import { AudioPanel as Panel } from './AudioPanel';
import { useMemo, useSyncExternalStore } from 'react';
import {
	AUDIO_SFX_EVENT_KINDS,
	audioSfxEventSettingsForActor,
	listAudioAutomationRulesForActor,
	listBuiltinSfxCuesForEvent,
	type AudioSfxEventKind,
} from '@dndtools/core';
import { Badge, EmptyState, Switch } from '../../ds';
import { T } from '../../app/screen-kit';
import { TRIGGER_LABELS } from './shared';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { ensureAudioPlayback } from '../../runtime/audio-playback';
import { ensureSfxEvents, type SfxFiringStatus } from '../../runtime/sfx-events';

/**
 * RC-AUD-3.2 — the SOUND EFFECTS section of the Automation tab: one durable toggle per SFX event, the
 * starter cues that ship for it, and an honest readout of what this device has actually played.
 *
 * The toggle is a MUTE, not a delete: turning an event off leaves every rule on it armed and resolving,
 * and the rule list above says "Turned off" rather than going quiet. That is why the switch sits next to
 * the rules instead of hiding in a settings page — the DM sees the rule and the switch that silences it
 * in one place. Player devices never render this: the read model returns nothing for a non-DM actor.
 */
export function SfxEventsPanel({ canEdit }: { canEdit: boolean }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const state = runtime.state;
	const dmId = runtime.defaultActorId;

	const sfx = useMemo(() => ensureSfxEvents(runtime, ensureAudioPlayback(runtime)), [runtime]);
	const firings = useSyncExternalStore(sfx.subscribe, sfx.getSnapshot, sfx.getSnapshot);

	const settings = useMemo(
		() => audioSfxEventSettingsForActor(state.audio, state.permissions, dmId),
		[state.audio, state.permissions, dmId],
	);
	const rules = useMemo(
		() => listAudioAutomationRulesForActor(state.audio, state.permissions, dmId),
		[state.audio, state.permissions, dmId],
	);

	if (!settings) return null;

	const setEvent = (event: AudioSfxEventKind, enabled: boolean) => {
		void runtime.dispatch({
			type: 'audio.set-sfx-event',
			actorId: dmId,
			payload: { event, enabled },
		});
	};

	const statusLabel: Record<SfxFiringStatus, string> = {
		played: t('audio.sfx.status.played'),
		muted: t('audio.sfx.status.muted'),
		blocked: t('audio.sfx.status.blocked'),
		'no-rule': t('audio.sfx.status.noRule'),
	};

	return (
		<Panel title={t('audio.sfx.heading')}>
			<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter }}>
				{t('audio.sfx.intro')}
			</div>
			<div
				data-testid="sfx-events"
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-2)',
					marginTop: 'var(--space-2)',
				}}
			>
				{AUDIO_SFX_EVENT_KINDS.map((event) => {
					const name = t(TRIGGER_LABELS[event]);
					const count = rules.filter((rule) => rule.trigger === event).length;
					const cues = listBuiltinSfxCuesForEvent(event);
					return (
						<div
							key={event}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								padding: 'var(--space-2) var(--space-3)',
								border: `calc(var(--space-0-5) / 2) solid ${T.bd}`,
								borderRadius: 'var(--radius-md)',
								background: T.surf,
							}}
						>
							<div style={{ flex: '1 1 auto', minWidth: 0 }}>
								<div
									style={{
										font: `600 var(--text-sm) ${T.sans}`,
										color: settings[event] ? T.ink : T.ter,
									}}
								>
									{name}
								</div>
								<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
									{count > 0 ? t('audio.sfx.rulesArmed', { count }) : t('audio.sfx.noRules')}
									{cues.length > 0 ? ` · ${cues.map((cue) => cue.name).join(', ')}` : ''}
								</div>
							</div>
							{!settings[event] && <Badge status="neutral">{t('audio.sfx.off')}</Badge>}
							<Switch
								checked={settings[event]}
								disabled={!canEdit}
								onChange={(next: boolean) => setEvent(event, next)}
								aria-label={t('audio.sfx.toggle', { event: name })}
							/>
						</div>
					);
				})}
			</div>

			<div
				style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.ter, marginTop: 'var(--space-3)' }}
			>
				{t('audio.sfx.recentHeading')}
			</div>
			{firings.recent.length === 0 ? (
				<EmptyState
					illustration="audio-empty"
					inset
					icon="audio"
					title={t('audio.sfx.recentHeading')}
					description={t('audio.sfx.recentEmpty')}
				/>
			) : (
				<ul
					data-testid="sfx-recent"
					style={{
						listStyle: 'none',
						margin: 'var(--space-1-5) 0 0',
						padding: 'var(--space-0)',
						display: 'grid',
						gap: 'var(--space-1)',
					}}
				>
					{firings.recent.map((firing) => (
						<li
							key={firing.id}
							style={{
								font: `var(--text-xs)/1.5 ${T.sans}`,
								color: T.ter,
								display: 'flex',
								gap: 'var(--space-2)',
							}}
						>
							<span style={{ color: T.ink }}>{t(TRIGGER_LABELS[firing.event])}</span>
							<span>{statusLabel[firing.status]}</span>
							{firing.detail && <span>{firing.detail}</span>}
						</li>
					))}
				</ul>
			)}

			<div
				style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter, marginTop: 'var(--space-3)' }}
			>
				<strong style={{ color: T.ink, font: `600 var(--text-xs) ${T.sans}` }}>
					{t('audio.sfx.starterHeading')}
				</strong>
				<div>{t('audio.sfx.starterIntro')}</div>
			</div>
		</Panel>
	);
}
