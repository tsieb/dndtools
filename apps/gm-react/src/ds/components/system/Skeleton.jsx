import React from 'react';

/** Title-line widths for `variant="list"`, cycled per row so a stack doesn't read as a barcode. */
const LIST_TITLE_WIDTHS = ['68%', '52%', '74%', '46%'];

/**
 * Skeleton — the loading placeholder: a sunken block with a single warm shimmer sweep (the only
 * load affordance in the system). The shimmer collapses under the resolved reduce-motion
 * preference. Use `variant="text"` for line runs (set `lines`), `circle` for avatars, `rect` for
 * media/cards. Match the skeleton's size to the content it stands in for so layout doesn't jump.
 *
 * RC-DSN-3.4 — the two first-load shapes every screen needs: `list` stands in for a stack of rows
 * (set `rows`, `avatar` for a leading glyph, `height` per row) and `canvas` for a map, board or scene
 * surface. `canvas` fills its box but never collapses below a usable height, because a canvas
 * container is usually sized by its content — which is exactly what hasn't arrived yet.
 */
export function Skeleton({
	variant = 'rect',
	width,
	height,
	lines = 1,
	rows = 3,
	avatar = false,
	radius,
	style,
	...rest
}) {
	const base = {
		background:
			'linear-gradient(90deg, var(--color-surface-sunken) 25%, var(--color-surface-alt) 37%, var(--color-surface-sunken) 63%)',
		backgroundSize: '400% 100%',
		animation: 'dnd-shimmer 1.4s ease-in-out infinite',
		borderRadius: radius || 'var(--radius-sm)',
	};

	if (variant === 'list') {
		return (
			<span
				aria-hidden="true"
				data-skeleton="list"
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-2)',
					width: width || '100%',
					...style,
				}}
				{...rest}
			>
				{Array.from({ length: Math.max(1, rows) }).map((_, i) => (
					<span
						key={i}
						data-skeleton-row=""
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-3)',
							height: height || 44,
							padding: '0 var(--space-3)',
							border: '1px solid var(--color-border)',
							borderRadius: radius || 'var(--radius-md)',
						}}
					>
						{avatar && (
							<span
								className="dnd-skeleton"
								style={{
									...base,
									flex: 'none',
									width: 24,
									height: 24,
									borderRadius: 'var(--radius-full)',
								}}
							/>
						)}
						<span
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 'var(--space-1-5)',
								flex: 1,
								minWidth: 0,
							}}
						>
							<span
								className="dnd-skeleton"
								style={{
									...base,
									height: 10,
									width: LIST_TITLE_WIDTHS[i % LIST_TITLE_WIDTHS.length],
								}}
							/>
							<span className="dnd-skeleton" style={{ ...base, height: 8, width: '32%' }} />
						</span>
					</span>
				))}
			</span>
		);
	}

	if (variant === 'canvas') {
		return (
			<span
				className="dnd-skeleton"
				aria-hidden="true"
				data-skeleton="canvas"
				style={{
					...base,
					display: 'block',
					width: width || '100%',
					height: height || '100%',
					minHeight: 240,
					borderRadius: radius || 'var(--radius-lg)',
					...style,
				}}
				{...rest}
			/>
		);
	}

	if (variant === 'circle') {
		const d = width || height || 40;
		return (
			<span
				className="dnd-skeleton"
				aria-hidden="true"
				style={{
					...base,
					display: 'inline-block',
					width: d,
					height: d,
					borderRadius: 'var(--radius-full)',
					...style,
				}}
				{...rest}
			/>
		);
	}

	if (variant === 'text') {
		return (
			<span
				aria-hidden="true"
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-2)',
					width: width || '100%',
					...style,
				}}
				{...rest}
			>
				{Array.from({ length: lines }).map((_, i) => (
					<span
						key={i}
						className="dnd-skeleton"
						style={{
							...base,
							height: height || 12,
							width: i === lines - 1 && lines > 1 ? '60%' : '100%',
							borderRadius: 'var(--radius-sm)',
						}}
					/>
				))}
			</span>
		);
	}

	return (
		<span
			className="dnd-skeleton"
			aria-hidden="true"
			style={{
				...base,
				display: 'block',
				width: width || '100%',
				height: height || 80,
				borderRadius: radius || 'var(--radius-md)',
				...style,
			}}
			{...rest}
		/>
	);
}
