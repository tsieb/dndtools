import { Icon } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { useI18n } from '../i18n';
import type { BoardWidget } from './board-helpers';

/**
 * widget-body-kit — the small presentational pieces `widget-bodies.tsx` shares across every body
 * (config reads, chips, stat pills, the "no session running" guard). Split out under RC-SYS-2.7 to
 * keep `widget-bodies.tsx` under the RC-STB-2.7 800-line hard limit — a PURE move, no behavior
 * change; every export here is unchanged from its original definition in that file.
 */

/** Read a configuration value, falling back to the field's declared default. */
export function cfg<T = unknown>(widget: BoardWidget, key: string): T | undefined {
	const raw = widget.configuration[key];
	if (raw !== undefined && raw !== null && raw !== '') return raw as T;
	const field = widget.configFields.find((f) => f.key === key);
	return field?.default as T | undefined;
}

/** Dispatch a widget-declared durable command; undefined while editing (bodies stay inert). */
export type WidgetCommandHandler = (commandType: string, payload: Record<string, unknown>) => void;

export const bodyWrap: React.CSSProperties = {
	height: '100%',
	display: 'flex',
	flexDirection: 'column',
	gap: 'var(--space-2)',
	minHeight: 0,
	overflow: 'hidden',
};

/** Off-canvas but still announced — for text that only completes a visible readout's sentence. */
export const SR_ONLY: React.CSSProperties = {
	position: 'absolute',
	width: 1,
	height: 1,
	margin: -1,
	padding: 0,
	overflow: 'hidden',
	clip: 'rect(0 0 0 0)',
	whiteSpace: 'nowrap',
	border: 0,
};

export function Chip({
	children,
	tone = 'neutral',
}: {
	children: React.ReactNode;
	tone?: 'neutral' | 'accent';
}) {
	const accent = tone === 'accent';
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				padding: '2px 8px',
				borderRadius: 'var(--radius-full)',
				background: accent ? 'var(--color-accent-subtle)' : 'var(--color-surface-sunken)',
				color: accent ? 'var(--color-accent)' : 'var(--color-text-secondary)',
				font: '600 var(--text-2xs) var(--font-mono)',
				whiteSpace: 'nowrap',
			}}
		>
			{children}
		</span>
	);
}

const opChipStyle: React.CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: 5,
	padding: '4px 10px',
	borderRadius: 'var(--radius-sm)',
	background: 'var(--color-surface-sunken)',
	font: '600 var(--text-2xs) var(--font-sans)',
	color: 'var(--color-text-secondary)',
	whiteSpace: 'nowrap',
};

/**
 * A widget operate affordance. With `onPress` it is a REAL button (accent-toned, keyboard operable);
 * without it it renders the original inert, de-emphasized chip so edit mode keeps the same silhouette.
 */
export function OpChip({
	icon,
	label,
	onPress,
	ariaLabel,
	unavailableReason,
}: {
	icon: string;
	label: string;
	onPress?: () => void;
	ariaLabel?: string;
	/** Present when the command exists but the core would refuse it right now — see below. */
	unavailableReason?: string;
}) {
	if (!onPress) {
		return (
			<span style={opChipStyle} aria-hidden>
				<Icon name={icon} size={13} /> {label}
			</span>
		);
	}
	// A SOFT disable, the pattern `Button`/`IconButton` already use: the chip keeps its place in the
	// tab order and still announces its reason, but it looks unavailable and swallows the press. The
	// alternative — rendering the inert `aria-hidden` span — hides an unexplained dead control, and
	// leaving it fully live sent a command the core rejects with an internal state-machine string.
	const unavailable = !!unavailableReason;
	return (
		<button
			className="scene-board-operation"
			type="button"
			aria-label={
				unavailable ? `${ariaLabel ?? label} — ${unavailableReason}` : (ariaLabel ?? label)
			}
			aria-disabled={unavailable || undefined}
			title={unavailableReason}
			onClick={unavailable ? undefined : onPress}
			onPointerDown={(e) => e.stopPropagation()}
			style={{
				...opChipStyle,
				minWidth: 'var(--operation-touch-target, var(--density-touch-target, auto))',
				minHeight: 'var(--operation-touch-target, var(--density-touch-target, auto))',
				border: '1px solid var(--color-border)',
				background: unavailable ? 'var(--color-surface-sunken)' : 'var(--color-accent-subtle)',
				color: unavailable ? 'var(--color-text-tertiary)' : 'var(--color-accent)',
				cursor: unavailable ? 'not-allowed' : 'pointer',
			}}
		>
			<Icon name={icon} size={13} /> {label}
		</button>
	);
}

/**
 * Dice and timer operate commands declare `writesTo: 'session'`, and the core refuses ANY such
 * command while `session.workflow` is not `'active'`
 * (`packages/core/src/commands/widget-command.ts`). The GM Screen ships seeded Dice and Timer
 * widgets, so on a fresh install the app's home dashboard offered fully live-looking accent buttons
 * whose first press printed the raw internal string "Session widget commands require an active
 * workflow; current workflow is idle." into the screen's alert region.
 */
export function useSessionOnlyReason(): string | undefined {
	const runtime = useRuntime();
	const { t } = useI18n();
	return runtime.state.session.workflow === 'active' ? undefined : t('widgetBody.sessionOnly');
}

export function StatPill({ label, value }: { label: string; value: string }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
			<span
				style={{
					font: '600 var(--text-2xs) var(--font-sans)',
					letterSpacing: 'var(--tracking-wide)',
					textTransform: 'uppercase',
					color: 'var(--color-text-tertiary)',
				}}
			>
				{label}
			</span>
			<span
				style={{
					font: '700 var(--text-sm) var(--font-display)',
					color: 'var(--color-text-primary)',
				}}
			>
				{value}
			</span>
		</div>
	);
}

export function Muted({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-tertiary)' }}
		>
			{children}
		</div>
	);
}
