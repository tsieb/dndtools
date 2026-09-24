import { useEffect, useRef, useState } from 'react';
import { getTimerCountdown } from '@dndtools/core';
import { Icon } from '../../../ds';
import { useRuntime } from '../../../runtime/RuntimeContext';
import type { BoardWidget } from '../../board-helpers';
import { useI18n } from '../../../i18n';
import {
	Muted,
	OpChip,
	SR_ONLY,
	cfg,
	useSessionOnlyReason,
	type WidgetCommandHandler,
} from '../../widget-body-kit';
import { LiveReadout } from './live';

/**
 * Moved from `app/widget-bodies.tsx` by RC-WID-4.1 — the file grew past what one module should
 * hold once every system widget type gained a body, so each hand-written body now lives in its own
 * file under `app/widgets/builtin/`. This is a pure move: the component below is byte-for-byte the
 * one that used to sit in `widget-bodies.tsx`.
 */

/**
 * How much time the tile's Add control gives back. One minute is the unit a DM asks for out loud
 * ("give them another minute"); a configurable step would need a configure command the timer
 * definition does not declare.
 */
const ADVANCE_SECONDS = 60;

const URGENCY_COLOR: Record<string, string> = {
	danger: 'var(--color-status-error-text)',
	warning: 'var(--color-status-warning-text)',
	normal: 'var(--color-text-primary)',
};

export function TimerBody({
	widget,
	onCommand,
}: {
	widget: BoardWidget;
	onCommand?: WidgetCommandHandler;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const configured = Number(cfg<number>(widget, 'durationSeconds') ?? 60) || 60;
	// The DURABLE session timer for this widget instance (SES-005); the countdown view is a pure
	// function of (timer, now) — the GUI only ticks a clock and re-derives (never owns timer state).
	const timer = runtime.state.session.timers[widget.id] ?? null;
	const [nowIso, setNowIso] = useState(() => new Date().toISOString());
	const countdown = getTimerCountdown(timer, nowIso, configured);
	const ticking = countdown.status === 'running';
	useEffect(() => {
		if (!ticking) return;
		// Re-anchor immediately: `nowIso` may be stale from mount (set before the timer started).
		setNowIso(new Date().toISOString());
		const id = window.setInterval(() => setNowIso(new Date().toISOString()), 500);
		return () => window.clearInterval(id);
	}, [ticking]);

	// Freeze the spoken time on durable timer changes and urgency transitions. Ordinary clock
	// ticks must not mutate the live text, but explicit adjustments must be announced even when
	// paused or when the urgency stays the same. Revision also covers operations from other views.
	const announcementKey = `${countdown.status}:${countdown.urgency}:${timer?.revision ?? 0}:${configured}`;
	const [announced, setAnnounced] = useState({ key: announcementKey, display: countdown.display });
	if (announced.key !== announcementKey) {
		setAnnounced({ key: announcementKey, display: countdown.display });
	}
	const urgent = countdown.urgency !== 'normal';

	const declares = (type: string) => !!onCommand && widget.commands.includes(type);
	const op = (type: string, payload: Record<string, unknown> = {}) =>
		declares(type) ? () => onCommand?.(type, payload) : undefined;
	const sessionOnly = useSessionOnlyReason();

	// RC-WID-4.4 — Reset stops the timer, and a stopped timer has no Reset control, so the button
	// that was just pressed unmounted under the keyboard and focus fell to <body>. Hand focus to the
	// transport instead: starting again is the next thing a DM does after a reset.
	const controlsRef = useRef<HTMLDivElement | null>(null);
	const refocusTransport = useRef(false);
	useEffect(() => {
		if (countdown.status !== 'stopped' || !refocusTransport.current) return;
		refocusTransport.current = false;
		controlsRef.current?.querySelector<HTMLElement>('button')?.focus();
	}, [countdown.status]);
	const reset = op('timer.reset');

	const transport: {
		icon: string;
		label: string;
		ariaLabel?: string;
		command: string;
		payload: Record<string, unknown>;
	} =
		countdown.status === 'running'
			? { icon: 'pause', label: t('widgetBody.timer.pause'), command: 'timer.pause', payload: {} }
			: countdown.status === 'paused'
				? {
						icon: 'play',
						label: t('widgetBody.timer.resume'),
						command: 'timer.resume',
						payload: {},
					}
				: {
						icon: 'play',
						label: t('widgetBody.timer.start'),
						ariaLabel: t('widgetBody.timer.startAria', { seconds: configured }),
						command: 'timer.start',
						payload: { durationSeconds: configured },
					};

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', height: '100%' }}>
			<div style={{ minWidth: 0 }}>
				{/* `timer` is a live region that is OFF by default: the figure is readable on demand
				    without narrating every tick. Urgency was colour alone; the warning shape survives
				    forced-colors mode, which repaints the red and the amber as one system colour. */}
				<div
					role="timer"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-1-5)',
						font: '700 26px var(--font-mono)',
						color: URGENCY_COLOR[countdown.urgency] ?? 'var(--color-text-primary)',
						letterSpacing: '.04em',
					}}
				>
					{urgent && <Icon name="warning" size={18} />}
					{countdown.display}
				</div>
				<LiveReadout>
					{countdown.status !== 'stopped' && <Muted>{countdown.statusLabel}</Muted>}
					{timer && <span style={SR_ONLY}> {announced.display}</span>}
				</LiveReadout>
			</div>
			<div
				ref={controlsRef}
				style={{
					marginLeft: 'auto',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'flex-end',
					gap: 4,
				}}
			>
				{/* ONE transport control whose label/icon/command follow the status, NOT three
				    conditionally-rendered siblings. JSX gives each `{cond && …}` expression its own
				    fixed child slot, so React could not reconcile Pause (slot 2) with Resume (slot 3):
				    pressing Pause DESTROYED the very button the user had just activated, dropping
				    focus to <body> so the next Tab restarted at the skip link. */}
				<OpChip
					icon={transport.icon}
					label={transport.label}
					ariaLabel={transport.ariaLabel}
					unavailableReason={sessionOnly}
					onPress={op(transport.command, transport.payload)}
				/>
				{countdown.status !== 'stopped' && declares('timer.reset') && (
					<OpChip
						icon="retry"
						label={t('widgetBody.timer.reset')}
						unavailableReason={sessionOnly}
						onPress={
							reset &&
							(() => {
								refocusTransport.current = true;
								reset();
							})
						}
					/>
				)}
				{/* RC-WID-4.2 — `timer.advance` was a DECLARED operate command with no control anywhere on
				    the tile, so the only way to give the table another minute was to reset and restart.
				    The core adds `deltaSeconds` to the remaining duration whatever the status, so this is
				    offered in every state, not only while running. */}
				{declares('timer.advance') && (
					<OpChip
						icon="add"
						label={t('widgetBody.timer.advance')}
						ariaLabel={t('widgetBody.timer.advanceAria', { seconds: ADVANCE_SECONDS })}
						unavailableReason={sessionOnly}
						onPress={op('timer.advance', { deltaSeconds: ADVANCE_SECONDS })}
					/>
				)}
			</div>
		</div>
	);
}
