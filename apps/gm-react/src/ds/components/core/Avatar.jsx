import React from 'react';

/**
 * Avatar — a participant/character marker. Initials on a warm tinted disc by default; pass `src`
 * for an image. Optional status ring (e.g. connected/active turn) via `ring`.
 */
export function Avatar({ name = '', src, size = 'md', ring, style, ...rest }) {
	const dims = { sm: 28, md: 36, lg: 48, xl: 64 };
	const d = dims[size] || dims.md;
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join('');
	const ringColor =
		ring === 'active'
			? 'var(--color-status-success)'
			: ring === 'turn'
				? 'var(--color-accent)'
				: ring === 'danger'
					? 'var(--color-status-error)'
					: null;
	return (
		<span
			// Every one of the ~14 live call sites renders the name as visible text right beside the
			// avatar, so the initials were a pure duplicate: AT read "G O" and then "Goblin, toggle
			// button" on each combat row and NPC card. Placed before `{...rest}` so a future standalone
			// consumer can re-expose it.
			aria-hidden="true"
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: d,
				height: d,
				borderRadius: 'var(--radius-full)',
				background: 'var(--color-accent-subtle)',
				color: 'var(--color-accent)',
				fontFamily: 'var(--font-sans)',
				fontSize: d * 0.38,
				fontWeight: 'var(--font-weight-semibold)',
				flex: '0 0 auto',
				overflow: 'hidden',
				// `box-shadow` is not painted AT ALL under `forced-colors: active`, so the active/turn/danger
				// ring — the only thing distinguishing whose turn it is in the initiative list — vanished
				// entirely in Windows High Contrast. An `outline` survives and remaps to a system colour.
				//
				// A status ring is a RIM (thicker, flush against the disc); the global `:focus-visible`
				// ring is a DETACHED hairline at `--focus-ring-offset`. They must not be the same shape:
				// `ring="turn"` is `--color-accent`, which is byte-identical to
				// `--color-interactive-focus-ring` in both dark themes (#e0b06f) and near-identical in
				// parchment — so a 2px-at-offset-2 turn ring was pixel-for-pixel the focus ring, and the
				// roster cards / character sheet / import preview all looked permanently focused.
				// Only emit the key when there IS a ring: an inline `outline: 'none'` beats any
				// stylesheet, so writing it unconditionally would suppress the app's focus ring on any
				// future focusable consumer.
				...(ringColor ? { outline: `3px solid ${ringColor}`, outlineOffset: 0 } : null),
				...style,
			}}
			{...rest}
		>
			{src ? (
				<img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
			) : (
				initials || '?'
			)}
		</span>
	);
}
