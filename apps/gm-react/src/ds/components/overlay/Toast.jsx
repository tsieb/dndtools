import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * Toast — the transient confirmation surface the system's plain-state voice asks for ("Saved",
 * "Projection queued", "Pushed to 3 players"). It speaks a fact and leaves; it never blocks the DM
 * mid-session. Status maps to a DISTINCT icon shape (A11Y-011) so severity survives grayscale.
 *
 * Three exports work together:
 *   • Toaster      — a tiny framework-free store. Call Toaster.success('Saved') from anywhere
 *                    (event handlers, async callbacks) with no ref plumbing.
 *   • ToastViewport — mount ONCE near the app root; it subscribes to Toaster and stacks the toasts.
 *   • Toast        — the presentational row, exported for bespoke placements / static demos.
 */

// ── Store ────────────────────────────────────────────────────────────────────────────────────
let _items = [];
let _id = 0;
const _listeners = new Set();
const _emit = () => {
	_listeners.forEach((fn) => fn(_items));
};

// Auto-dismiss used to be a bare `setTimeout(dismiss, 4500)` that nothing could stop. Eight call
// sites put this project's destructive-op UNDO inside a toast, so tabbing to Undo made it vanish
// under your own focus — WCAG 2.2.1 (Timing Adjustable) is a Level A criterion. Timers are now
// cancellable and the remaining time is preserved across a pause. Hover and keyboard focus need
// SEPARATE flags: with one shared boolean, moving the mouse away while the control still had focus
// cleared the hold and the toast disappeared anyway.
const _timers = new Map();
const _remaining = new Map();
const _startedAt = new Map();
let _hovered = false;
let _focused = false;
const _isPaused = () => _hovered || _focused;

function _clearTimer(id) {
	const handle = _timers.get(id);
	if (handle != null) clearTimeout(handle);
	_timers.delete(id);
}

function _arm(id) {
	_clearTimer(id);
	const ms = _remaining.get(id);
	if (!ms || ms <= 0 || _isPaused()) return;
	_startedAt.set(id, Date.now());
	_timers.set(
		id,
		setTimeout(() => {
			_remaining.delete(id);
			Toaster.dismiss(id);
		}, ms),
	);
}

export const Toaster = {
	show(input) {
		const opts = typeof input === 'string' ? { message: input } : input || {};
		const id = opts.id != null ? opts.id : ++_id;
		// A toast carrying an ACTION is an affordance, not an announcement: it must survive until the
		// user takes it or dismisses it. Callers can still pin an explicit duration.
		const defaultDuration = opts.action != null ? 0 : 4500;
		const toast = { id, status: 'info', duration: defaultDuration, ...opts };
		_items = [..._items.filter((t) => t.id !== id), toast];
		_emit();
		_remaining.set(id, toast.duration > 0 ? toast.duration : 0);
		_arm(id);
		return id;
	},
	/** Hold every auto-dismiss open while the stack is hovered or holds keyboard focus. */
	setPaused(reason, on) {
		if (reason === 'focus') _focused = !!on;
		else _hovered = !!on;
		if (_isPaused()) {
			for (const id of [..._timers.keys()]) {
				const started = _startedAt.get(id) ?? Date.now();
				const left = (_remaining.get(id) ?? 0) - (Date.now() - started);
				_remaining.set(id, Math.max(600, left));
				_clearTimer(id);
			}
			return;
		}
		for (const t of _items) _arm(t.id);
	},
	success(message, opts) {
		return Toaster.show({ status: 'success', message, ...opts });
	},
	warning(message, opts) {
		return Toaster.show({ status: 'warning', message, ...opts });
	},
	error(message, opts) {
		return Toaster.show({ status: 'error', message, duration: 7000, ...opts });
	},
	info(message, opts) {
		return Toaster.show({ status: 'info', message, ...opts });
	},
	dismiss(id) {
		_clearTimer(id);
		_remaining.delete(id);
		_startedAt.delete(id);
		_items = _items.filter((t) => t.id !== id);
		_emit();
	},
	clear() {
		for (const id of [..._timers.keys()]) _clearTimer(id);
		_remaining.clear();
		_startedAt.clear();
		_items = [];
		_emit();
	},
	subscribe(fn) {
		_listeners.add(fn);
		fn(_items);
		return () => _listeners.delete(fn);
	},
};

// ── Presentational row ───────────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
	success: 'var(--color-status-success)',
	warning: 'var(--color-status-warning)',
	error: 'var(--color-status-error)',
	info: 'var(--color-status-info)',
};

export function Toast({
	status = 'info',
	title,
	message,
	action,
	onAction,
	onDismiss,
	style,
	// A live region only announces reliably when it is ALREADY in the DOM and its CONTENTS change.
	// Stacked in `ToastViewport` each row is inserted together with its text in a single mutation, so
	// polite announcements were routinely dropped — i.e. the app's only confirmation channel was
	// silent. The viewport now hosts two permanent regions and passes `live={false}` here; a bespoke
	// standalone `<Toast>` keeps the old self-announcing behaviour.
	live = true,
	...rest
}) {
	const accent = STATUS_COLOR[status] || STATUS_COLOR.info;
	return (
		<div
			role={live ? (status === 'error' ? 'alert' : 'status') : undefined}
			aria-atomic={live ? 'true' : undefined}
			style={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: 'var(--space-3)',
				width: 360,
				maxWidth: '92vw',
				boxSizing: 'border-box',
				padding: 'var(--space-3) var(--space-3-5, 14px)',
				background: 'var(--color-surface-overlay)',
				border: '1px solid var(--color-border-strong)',
				borderLeft: `3px solid ${accent}`,
				borderRadius: 'var(--radius-md)',
				boxShadow: 'var(--shadow-lg)',
				color: 'var(--color-text-primary)',
				animation: 'dndToastIn var(--duration-standard) var(--easing-decelerate)',
				...style,
			}}
			{...rest}
		>
			<style>
				{
					'@keyframes dndToastIn{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}'
				}
			</style>
			<span style={{ display: 'inline-flex', flex: '0 0 auto', color: accent, marginTop: 1 }}>
				<Icon name={status} size="sm" />
			</span>
			<div
				style={{
					flex: 1,
					minWidth: 0,
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-0-5, 2px)',
				}}
			>
				{title && (
					<div
						style={{
							fontFamily: 'var(--font-sans)',
							fontSize: 'var(--text-sm)',
							fontWeight: 'var(--font-weight-semibold)',
							lineHeight: 1.3,
						}}
					>
						{title}
					</div>
				)}
				{message && (
					<div
						style={{
							fontFamily: 'var(--font-sans)',
							fontSize: 'var(--text-sm)',
							lineHeight: 1.45,
							color: title ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
						}}
					>
						{message}
					</div>
				)}
			</div>
			{action && (
				<button
					type="button"
					onClick={onAction}
					style={{
						flex: '0 0 auto',
						border: 'none',
						background: 'transparent',
						color: 'var(--color-accent)',
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-sm)',
						fontWeight: 'var(--font-weight-semibold)',
						cursor: 'pointer',
						padding: 'var(--space-1) var(--space-1-5)',
						borderRadius: 'var(--radius-sm)',
						whiteSpace: 'nowrap',
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = 'var(--color-interactive-hover)';
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = 'transparent';
					}}
				>
					{action}
				</button>
			)}
			{onDismiss && (
				<button
					type="button"
					aria-label="Dismiss"
					onClick={onDismiss}
					style={{
						flex: '0 0 auto',
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 24,
						height: 24,
						border: 'none',
						background: 'transparent',
						color: 'var(--color-text-tertiary)',
						borderRadius: 'var(--radius-sm)',
						cursor: 'pointer',
						marginTop: -1,
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.color = 'var(--color-text-primary)';
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.color = 'var(--color-text-tertiary)';
					}}
				>
					<Icon name="close" size="micro" />
				</button>
			)}
		</div>
	);
}

// ── Viewport ─────────────────────────────────────────────────────────────────────────────────
const PLACEMENT = {
	'top-right': { top: 0, right: 0, alignItems: 'flex-end' },
	'top-center': { top: 0, left: '50%', transform: 'translateX(-50%)', alignItems: 'center' },
	'bottom-right': { bottom: 0, right: 0, alignItems: 'flex-end', flexDirection: 'column-reverse' },
	'bottom-center': {
		bottom: 0,
		left: '50%',
		transform: 'translateX(-50%)',
		alignItems: 'center',
		flexDirection: 'column-reverse',
	},
};

export function ToastViewport({ placement = 'top-right', style, ...rest }) {
	const [items, setItems] = React.useState([]);
	React.useEffect(() => Toaster.subscribe(setItems), []);
	// Releasing the pause when the viewport unmounts stops a stuck flag from pinning every future
	// toast open for the rest of the session.
	React.useEffect(
		() => () => {
			Toaster.setPaused('hover', false);
			Toaster.setPaused('focus', false);
		},
		[],
	);
	const pos = PLACEMENT[placement] || PLACEMENT['top-right'];
	const polite = items.filter((t) => t.status !== 'error');
	const assertive = items.filter((t) => t.status === 'error');
	return (
		<div
			style={{
				position: 'fixed',
				zIndex: 'var(--z-toast)',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				padding:
					'calc(var(--space-4) + var(--safe-area-top, 0px)) calc(var(--space-4) + var(--safe-area-right, 0px)) calc(var(--space-4) + var(--safe-area-bottom, 0px)) calc(var(--space-4) + var(--safe-area-left, 0px))',
				pointerEvents: 'none',
				maxHeight: 'var(--app-viewport-height)',
				overflow: 'hidden',
				...pos,
				...style,
			}}
			onMouseEnter={() => Toaster.setPaused('hover', true)}
			onMouseLeave={() => Toaster.setPaused('hover', false)}
			onFocus={() => Toaster.setPaused('focus', true)}
			onBlur={() => Toaster.setPaused('focus', false)}
			{...rest}
		>
			{/* The polite region is PERMANENT and WRAPS the rows (`display:contents`, so it changes no
			    layout): a `role="status"` inserted together with its own text — which is what a per-row
			    role does — is routinely dropped by screen readers, and this is the app's only
			    confirmation channel. Wrapping rather than mirroring keeps the copy in the DOM exactly
			    once, so `getByText` on a toast message stays unambiguous.
			    The assertive region is NOT permanent, and deliberately so: `role="alert"` announces on
			    insertion, and an always-present empty alert would make every bare `getByRole('alert')`
			    in the app ambiguous. */}
			<div role="status" aria-live="polite" style={{ display: 'contents' }}>
				{polite.map((t) => (
					<Row key={t.id} toast={t} />
				))}
			</div>
			{assertive.length > 0 && (
				<div role="alert" style={{ display: 'contents' }}>
					{assertive.map((t) => (
						<Row key={t.id} toast={t} />
					))}
				</div>
			)}
		</div>
	);
}

/** One stacked row. `live={false}`: the group wrapper above owns the live-region role. */
function Row({ toast: t }) {
	return (
		<div style={{ pointerEvents: 'auto' }}>
			<Toast
				live={false}
				status={t.status}
				title={t.title}
				message={t.message}
				action={t.action}
				onAction={
					t.action
						? () => {
								if (t.onAction) t.onAction();
								Toaster.dismiss(t.id);
							}
						: undefined
				}
				onDismiss={() => Toaster.dismiss(t.id)}
			/>
		</div>
	);
}
