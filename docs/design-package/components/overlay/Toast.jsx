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
const _emit = () => { _listeners.forEach((fn) => fn(_items)); };

export const Toaster = {
	show(input) {
		const opts = typeof input === 'string' ? { message: input } : (input || {});
		const id = opts.id != null ? opts.id : ++_id;
		const toast = { id, status: 'info', duration: 4500, ...opts };
		_items = [..._items.filter((t) => t.id !== id), toast];
		_emit();
		if (toast.duration && toast.duration > 0) {
			setTimeout(() => Toaster.dismiss(id), toast.duration);
		}
		return id;
	},
	success(message, opts) { return Toaster.show({ status: 'success', message, ...opts }); },
	warning(message, opts) { return Toaster.show({ status: 'warning', message, ...opts }); },
	error(message, opts) { return Toaster.show({ status: 'error', message, duration: 7000, ...opts }); },
	info(message, opts) { return Toaster.show({ status: 'info', message, ...opts }); },
	dismiss(id) { _items = _items.filter((t) => t.id !== id); _emit(); },
	clear() { _items = []; _emit(); },
	subscribe(fn) { _listeners.add(fn); fn(_items); return () => _listeners.delete(fn); },
};

// ── Presentational row ───────────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
	success: 'var(--color-status-success)',
	warning: 'var(--color-status-warning)',
	error: 'var(--color-status-error)',
	info: 'var(--color-status-info)',
};

export function Toast({ status = 'info', title, message, action, onAction, onDismiss, style, ...rest }) {
	const accent = STATUS_COLOR[status] || STATUS_COLOR.info;
	return (
		<div
			role="status"
			aria-live={status === 'error' ? 'assertive' : 'polite'}
			style={{
				display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
				width: 360, maxWidth: '92vw', boxSizing: 'border-box',
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
			<style>{'@keyframes dndToastIn{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}'}</style>
			<span style={{ display: 'inline-flex', flex: '0 0 auto', color: accent, marginTop: 1 }}><Icon name={status} size="sm" /></span>
			<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5, 2px)' }}>
				{title && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-semibold)', lineHeight: 1.3 }}>{title}</div>}
				{message && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.45, color: title ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>{message}</div>}
			</div>
			{action && (
				<button type="button" onClick={onAction} style={{ flex: '0 0 auto', border: 'none', background: 'transparent', color: 'var(--color-accent)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer', padding: 'var(--space-1) var(--space-1-5)', borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap' }}
					onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-interactive-hover)'; }}
					onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
				>{action}</button>
			)}
			{onDismiss && (
				<button type="button" aria-label="Dismiss" onClick={onDismiss} style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', marginTop: -1 }}
					onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
					onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
				><Icon name="close" size="micro" /></button>
			)}
		</div>
	);
}

// ── Viewport ─────────────────────────────────────────────────────────────────────────────────
const PLACEMENT = {
	'top-right': { top: 0, right: 0, alignItems: 'flex-end' },
	'top-center': { top: 0, left: '50%', transform: 'translateX(-50%)', alignItems: 'center' },
	'bottom-right': { bottom: 0, right: 0, alignItems: 'flex-end', flexDirection: 'column-reverse' },
	'bottom-center': { bottom: 0, left: '50%', transform: 'translateX(-50%)', alignItems: 'center', flexDirection: 'column-reverse' },
};

export function ToastViewport({ placement = 'top-right', style, ...rest }) {
	const [items, setItems] = React.useState([]);
	React.useEffect(() => Toaster.subscribe(setItems), []);
	const pos = PLACEMENT[placement] || PLACEMENT['top-right'];
	return (
		<div
			aria-live="polite"
			style={{
				position: 'fixed', zIndex: 'var(--z-toast)',
				display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
				padding: 'var(--space-4)', pointerEvents: 'none',
				maxHeight: '100vh', overflow: 'hidden',
				...pos, ...style,
			}}
			{...rest}
		>
			{items.map((t) => (
				<div key={t.id} style={{ pointerEvents: 'auto' }}>
					<Toast
						status={t.status}
						title={t.title}
						message={t.message}
						action={t.action}
						onAction={t.action ? () => { if (t.onAction) t.onAction(); Toaster.dismiss(t.id); } : undefined}
						onDismiss={() => Toaster.dismiss(t.id)}
					/>
				</div>
			))}
		</div>
	);
}
