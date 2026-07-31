import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * Minimap — the always-on spatial-context overlay (UX-MAP-003). Shows the full map extent at low
 * resolution (base layer only, by design — never a live composite) with a rectangle marking the
 * current viewport; click/tap anywhere to jump the main viewport there. Collapses to a single
 * globe button (state the consumer persists per user per map). Pass `viewport` as normalized
 * 0–1 {x,y,w,h}; `onJump` receives a normalized {x,y} center.
 */
export function Minimap({
	viewport = { x: 0.3, y: 0.25, w: 0.34, h: 0.32 },
	collapsed: controlled,
	defaultCollapsed = false,
	onToggle,
	onJump,
	thumb,
	width = 168,
	aspect = 1.4,
	style,
	...rest
}) {
	const [internal, setInternal] = React.useState(defaultCollapsed);
	const collapsed = controlled != null ? controlled : internal;
	// The collapsed and expanded branches return DIFFERENT element types at the same position, so
	// React destroys the toggle the user just activated rather than reconciling it — focus fell to
	// <body> and the next Tab restarted at the top of the document. Hand focus to the survivor, but
	// only when the toggle was the thing that lost it (a pointer user's focus is elsewhere).
	const toggleRef = React.useRef(null);
	const restoreFocusRef = React.useRef(false);
	const toggle = (e) => {
		restoreFocusRef.current = e?.detail === 0 || document.activeElement === e?.currentTarget;
		const v = !collapsed;
		if (controlled == null) setInternal(v);
		onToggle && onToggle(v);
	};
	React.useEffect(() => {
		if (!restoreFocusRef.current) return;
		restoreFocusRef.current = false;
		const active = document.activeElement;
		if (!active || active === document.body) toggleRef.current?.focus();
	}, [collapsed]);

	if (collapsed) {
		return (
			<button
				type="button"
				ref={toggleRef}
				aria-label="Expand minimap"
				title="Expand minimap"
				onClick={toggle}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: 36,
					height: 36,
					borderRadius: 'var(--radius-md)',
					border: '1px solid var(--color-border-strong)',
					background: 'var(--color-surface-overlay)',
					color: 'var(--color-text-secondary)',
					boxShadow: 'var(--shadow-md)',
					cursor: 'pointer',
					...style,
				}}
				{...rest}
			>
				<Icon name="globe" size={18} />
			</button>
		);
	}

	const jump = (e) => {
		if (!onJump) return;
		// A keyboard Enter/Space on a <button> synthesizes a click with clientX/clientY = 0, so this
		// used to compute a target well above and left of the map and teleport the DM's viewport to
		// the top-left corner. `detail === 0` is the synthesized case; arrow keys are the real
		// keyboard path (see `onJumpKeyDown` below).
		if (e.detail === 0) return;
		const r = e.currentTarget.getBoundingClientRect();
		onJump({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
	};

	// Pointer jumping derives its target from clientX/Y, which has no keyboard equivalent — so
	// arrow keys nudge the viewport centre instead, keeping the minimap operable without a mouse.
	const clamp01 = (n) => Math.min(1, Math.max(0, n));
	const nudge = (dx, dy) => {
		if (!onJump) return;
		const step = 0.1;
		onJump({
			x: clamp01(viewport.x + viewport.w / 2 + dx * step),
			y: clamp01(viewport.y + viewport.h / 2 + dy * step),
		});
	};
	const onJumpKeyDown = (e) => {
		const deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
		const d = deltas[e.key];
		if (!d) return;
		e.preventDefault();
		nudge(d[0], d[1]);
	};

	return (
		<div
			role="group"
			aria-label="Minimap — current viewport highlighted"
			style={{
				width,
				borderRadius: 'var(--radius-md)',
				border: '1px solid var(--color-border-strong)',
				background: 'var(--color-surface-overlay)',
				boxShadow: 'var(--shadow-md)',
				overflow: 'hidden',
				...style,
			}}
			{...rest}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '4px var(--space-2)',
					borderBottom: '1px solid var(--color-border)',
				}}
			>
				<span
					style={{
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-2xs)',
						letterSpacing: 'var(--tracking-wide)',
						textTransform: 'uppercase',
						color: 'var(--color-text-secondary)',
					}}
				>
					Minimap
				</span>
				<button
					type="button"
					ref={toggleRef}
					aria-label="Collapse minimap"
					title="Collapse minimap"
					onClick={toggle}
					style={{
						display: 'inline-flex',
						border: 'none',
						background: 'transparent',
						color: 'var(--color-text-tertiary)',
						cursor: 'pointer',
						padding: 0,
						alignItems: 'center',
						justifyContent: 'center',
						width: 24,
						height: 24,
					}}
				>
					<Icon name="chevron-down" size={14} />
				</button>
			</div>
			<button
				type="button"
				aria-label="Jump viewport — click a spot, or use the arrow keys to pan"
				onClick={jump}
				onKeyDown={onJumpKeyDown}
				style={{
					display: 'block',
					width: '100%',
					padding: 0,
					border: 'none',
					font: 'inherit',
					position: 'relative',
					aspectRatio: String(aspect),
					cursor: 'pointer',
					backgroundColor: 'var(--map-canvas-bg)',
					backgroundImage: thumb
						? `url(${thumb})`
						: 'repeating-linear-gradient(45deg, rgba(224,176,111,.06) 0 8px, transparent 8px 16px), radial-gradient(60% 50% at 55% 45%, color-mix(in oklab, var(--layer-height) 26%, transparent), transparent 70%)',
					backgroundSize: 'cover',
				}}
			>
				<span
					style={{
						position: 'absolute',
						left: `${viewport.x * 100}%`,
						top: `${viewport.y * 100}%`,
						width: `${viewport.w * 100}%`,
						height: `${viewport.h * 100}%`,
						border: '1.5px solid var(--color-accent)',
						borderRadius: 2,
						background: 'color-mix(in oklab, var(--color-accent) 14%, transparent)',
						boxShadow: '0 0 0 1px rgba(0,0,0,.4)',
						pointerEvents: 'none',
					}}
				/>
			</button>
		</div>
	);
}
