import { useEffect, useState, type ReactNode } from 'react';
import { getQuickTimerForActor, type CoreCommand } from '@dndtools/core';
import { Button, Input, SegmentedControl } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { T } from '../screen-kit';

/** One labelled group of the quick panel. */
export function Section({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.oneHalf }}>
			<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>{label}</div>
			{children}
		</div>
	);
}

/** RC-SES-4.4 — the quick-panel timer's urgency-band numeral color (mirrors `TimerBody`'s widget). */
const URGENCY_COLOR: Record<string, string> = {
	danger: T.err,
	warning: T.warn,
	normal: T.ink,
};

const NOTE = { font: `var(--text-xs) ${T.sans}`, color: T.sub } as const;

type TimerOperation =
	| 'session.quick-timer.pause'
	| 'session.quick-timer.resume'
	| 'session.quick-timer.reset'
	| 'session.quick-timer.lap';

/**
 * RC-SES-4.4 — the quick panel's timer (moved out of `QuickPanel.tsx` for size, RC-POL-1.4). A DM sees
 * the full control surface (either kind); a player or a preview sees only the "Back in M:SS" break
 * card, never a countdown (a countdown is DM-only pacing). The read is actor-scoped:
 * `queries/session-quick-timer.ts` decides what this viewer gets, never this component.
 */
export function QuickTimerSection({
	isDm,
	writesBlocked,
	dispatch,
}: {
	isDm: boolean;
	writesBlocked: boolean;
	dispatch: (command: CoreCommand) => Promise<boolean>;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const state = runtime.state;
	const [timerMode, setTimerMode] = useState<'countdown' | 'break'>('countdown');
	const [timerMinutes, setTimerMinutes] = useState('5');
	const [timerLabel, setTimerLabel] = useState('');
	const [nowIso, setNowIso] = useState(() => new Date().toISOString());

	// The timer ticks only while it is actually running (an idle/paused panel schedules no timer),
	// mirroring the Timer widget body's own tick discipline.
	const timerTicking = state.session.quickTimer?.status === 'running';
	useEffect(() => {
		if (!timerTicking) return;
		setNowIso(new Date().toISOString());
		const id = window.setInterval(() => setNowIso(new Date().toISOString()), 500);
		return () => window.clearInterval(id);
	}, [timerTicking]);

	const view = getQuickTimerForActor(state.session.quickTimer, state.permissions, actorId, nowIso);
	if (!(view.control || view.breakCard || (isDm && !writesBlocked))) return null;

	function startTimer(): void {
		const minutes = Number(timerMinutes);
		if (!Number.isFinite(minutes) || minutes <= 0) return;
		void dispatch({
			type: 'session.quick-timer.start',
			actorId,
			payload: {
				kind: timerMode,
				durationSeconds: Math.round(minutes * 60),
				...(timerLabel.trim() ? { label: timerLabel.trim() } : {}),
			},
		});
		setTimerLabel('');
	}

	const operate = (type: TimerOperation) => void dispatch({ type, actorId, payload: {} });

	const control = view.control;
	return (
		<Section label={t('session.quick.timer')}>
			{control ? (
				<>
					<div
						data-testid="quick-timer-display"
						style={{
							font: `700 var(--text-xl) ${T.mono}`,
							color: URGENCY_COLOR[control.countdown.urgency] ?? T.ink,
							letterSpacing: '.02em',
						}}
					>
						{control.countdown.display}
					</div>
					<div style={NOTE}>
						{control.timer.label ??
							t(
								control.timer.kind === 'break'
									? 'session.quick.timerModeBreak'
									: 'session.quick.timerModeCountdown',
							)}
					</div>
					<div style={{ display: 'flex', gap: T.space.oneHalf, flexWrap: 'wrap' }}>
						<Button
							variant="secondary"
							size="sm"
							icon={control.countdown.status === 'running' ? 'pause' : 'play'}
							disabled={writesBlocked}
							onClick={() =>
								operate(
									control.countdown.status === 'running'
										? 'session.quick-timer.pause'
										: 'session.quick-timer.resume',
								)
							}
						>
							{t(
								control.countdown.status === 'running'
									? 'session.quick.timerPause'
									: 'session.quick.timerResume',
							)}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							icon="retry"
							disabled={writesBlocked}
							onClick={() => operate('session.quick-timer.reset')}
						>
							{t('session.quick.timerReset')}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							data-testid="quick-timer-lap"
							disabled={writesBlocked || control.countdown.status !== 'running'}
							onClick={() => operate('session.quick-timer.lap')}
						>
							{t('session.quick.timerLap')}
						</Button>
					</div>
					{control.timer.laps.length > 0 && (
						<div data-testid="quick-timer-laps" style={NOTE}>
							{t('session.quick.timerLapCount', { count: control.timer.laps.length })}
						</div>
					)}
				</>
			) : view.breakCard ? (
				<div
					data-testid="quick-timer-break-card"
					style={{ display: 'flex', flexDirection: 'column', gap: T.space.half }}
				>
					<div style={{ font: `600 var(--text-md) ${T.mono}`, color: T.ink }}>
						{t('session.quick.timerBackIn', { display: view.breakCard.display })}
					</div>
					{view.breakCard.label && <div style={NOTE}>{view.breakCard.label}</div>}
				</div>
			) : (
				<form
					style={{ display: 'flex', flexDirection: 'column', gap: T.space.oneHalf }}
					onSubmit={(e) => {
						e.preventDefault();
						startTimer();
					}}
				>
					<SegmentedControl
						size="sm"
						ariaLabel={t('session.quick.timerModeLabel')}
						value={timerMode}
						onChange={(v: 'countdown' | 'break') => setTimerMode(v)}
						options={[
							{ value: 'countdown', label: t('session.quick.timerModeCountdown') },
							{ value: 'break', label: t('session.quick.timerModeBreak') },
						]}
					/>
					<div style={{ display: 'flex', gap: T.space.oneHalf }}>
						<Input
							type="number"
							min={1}
							value={timerMinutes}
							onChange={(e: { target: { value: string } }) => setTimerMinutes(e.target.value)}
							aria-label={t('session.quick.timerMinutes')}
							style={{ width: '4rem' }}
						/>
						<Input
							value={timerLabel}
							onChange={(e: { target: { value: string } }) => setTimerLabel(e.target.value)}
							placeholder={t('session.quick.timerLabelPlaceholder')}
							aria-label={t('session.quick.timerLabelPlaceholder')}
							style={{ flex: 1, minWidth: 0 }}
						/>
					</div>
					<Button
						type="submit"
						variant="secondary"
						size="sm"
						data-testid="quick-timer-start"
						disabled={!Number(timerMinutes)}
					>
						{t('session.quick.timerStart')}
					</Button>
				</form>
			)}
		</Section>
	);
}
