import { useRef } from 'react';
import { T } from '../../screen-kit';

const BRUSH_MIN = 5;
const BRUSH_MAX = 200;
const BRUSH_STEP = 5;
/** Pixels of drag per unit of brush size — a full-height drag covers the whole range on a phone. */
const BRUSH_PX_PER_UNIT = 2.4;

/**
 * RC-MAP-4.3 — the fog brush's size, as a thing you drag. Vertical because the fog tool's own
 * gesture is horizontal-ish and a phone has more height than width to spare. It is a real
 * `role="slider"`, so the arrow keys, Home and End reach the identical values without a pointer.
 */
export function FogBrushHandle({
	size,
	label,
	onChange,
}: {
	size: number;
	label: string;
	onChange: (value: number) => void;
}) {
	const drag = useRef<{ pointerId: number; y: number; size: number } | null>(null);
	const set = (value: number) =>
		onChange(Math.round(Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, value))));
	return (
		<div
			role="slider"
			tabIndex={0}
			aria-label={label}
			aria-valuemin={BRUSH_MIN}
			aria-valuemax={BRUSH_MAX}
			aria-valuenow={size}
			aria-orientation="vertical"
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId);
				drag.current = { pointerId: event.pointerId, y: event.clientY, size };
				event.stopPropagation();
			}}
			onPointerMove={(event) => {
				const active = drag.current;
				if (!active || active.pointerId !== event.pointerId) return;
				// Up is bigger: the handle grows towards the ring it is sizing.
				set(active.size + (active.y - event.clientY) / BRUSH_PX_PER_UNIT);
				event.stopPropagation();
			}}
			onPointerUp={(event) => {
				drag.current = null;
				event.stopPropagation();
			}}
			onPointerCancel={() => {
				drag.current = null;
			}}
			onKeyDown={(event) => {
				const step =
					event.key === 'ArrowUp' || event.key === 'ArrowRight'
						? BRUSH_STEP
						: event.key === 'ArrowDown' || event.key === 'ArrowLeft'
							? -BRUSH_STEP
							: 0;
				if (step !== 0) {
					event.preventDefault();
					set(size + step);
				} else if (event.key === 'Home') {
					event.preventDefault();
					set(BRUSH_MIN);
				} else if (event.key === 'End') {
					event.preventDefault();
					set(BRUSH_MAX);
				}
			}}
			style={{
				pointerEvents: 'auto',
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: 48,
				height: 48,
				borderRadius: 24,
				border: `1px solid ${T.accBd}`,
				background: T.surf,
				color: T.acc,
				font: `700 12px ${T.sans}`,
				touchAction: 'none',
				cursor: 'ns-resize',
			}}
		>
			{size}
		</div>
	);
}
