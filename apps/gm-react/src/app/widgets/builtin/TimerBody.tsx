import { useEffect, useState } from 'react';
import { getTimerCountdown } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import type { BoardWidget } from '../../board-helpers';
import { useI18n } from '../../../i18n';
import {
	Muted,
	OpChip,
	cfg,
	useSessionOnlyReason,
	type WidgetCommandHandler,
} from '../../widget-body-kit';

/**
 * Moved from `app/widget-bodies.tsx` by RC-WID-4.1 — the file grew past what one module should
 * hold once every system widget type gained a body, so each hand-written body now lives in its own
 * file under `app/widgets/builtin/`. This is a pure move: the component below is byte-for-byte the
 * one that used to sit in `widget-bodies.tsx`.
 */

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

	const declares = (type: string) => !!onCommand && widget.commands.includes(type);
	const op = (type: string, payload: Record<string, unknown> = {}) =>
		declares(type) ? () => onCommand?.(type, payload) : undefined;
	const sessionOnly = useSessionOnlyReason();
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
				<div
					style={{
						font: '700 26px var(--font-mono)',
						color: URGENCY_COLOR[countdown.urgency] ?? 'var(--color-text-primary)',
						letterSpacing: '.04em',
					}}
				>
					{countdown.display}
				</div>
				{countdown.status !== 'stopped' && <Muted>{countdown.statusLabel}</Muted>}
			</div>
			<div
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
						onPress={op('timer.reset')}
					/>
				)}
			</div>
		</div>
	);
}
