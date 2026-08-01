import React from 'react';

/**
 * Brand — the locked Lamplight mark and wordmark.
 *
 * The mark is a GM screen seen from above: folded panels with the light behind them. It is NOT an
 * icon — it never joins the Lucide vocabulary in `Icon.jsx` and never sits inline in content. Use it
 * for app chrome, title/loading surfaces, and anywhere the product identifies itself.
 *
 * Geometry is the design system's 64 grid, verbatim. `stroke-width` stays 5.5 grid units at every
 * rendered size (scaling the whole SVG, never the stroke) — thinning it is what closes the disc up
 * first, and the gap between the disc and the fold IS the light. Do not add a ring, badge, or other
 * container: the tile radius is the only frame the mark gets.
 *
 * Canonical source: the "DND Tools Design System" project — assets/logo.svg,
 * guidelines/brand-mark.card.html, guidelines/brand-wordmark.card.html.
 */
export function BrandMark({ size = 30, title, style, ...rest }) {
	return (
		<svg
			viewBox="0 0 64 64"
			width={size}
			height={size}
			role={title ? 'img' : undefined}
			aria-hidden={title ? undefined : 'true'}
			aria-label={title}
			style={{ display: 'block', flex: 'none', ...style }}
			{...rest}
		>
			<circle cx="32" cy="13" r="5.5" fill="var(--color-accent)" />
			<path
				d="M9 47L23 25L41 47L55 25"
				fill="none"
				stroke="var(--color-text-primary)"
				strokeWidth="5.5"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/**
 * The wordmark's falloff: "Lamp" holds full brightness and "light" decays left to right, stopping at
 * 4.8:1 on the dark ground so it still passes AA at every size. Never let the tail go dimmer than the
 * last stop. Backgrounds that cannot clip text to a gradient fall back to a flat tail.
 */
const FALLOFF = 'linear-gradient(90deg,#f4dbaa 0%,#dcae69 45%,#b58e56 80%,#9d7a4f 100%)';

/**
 * BrandWordmark — "Lamplight" set in the display face, uppercase, 0.075em tracking. Never re-set the
 * name in another family, and never rotate it. Below ~13px the falloff stops resolving; use
 * `<BrandMark />` alone instead of shrinking this further.
 */
export function BrandWordmark({ size = 15, style, ...rest }) {
	return (
		<span
			style={{
				font: `700 ${size}px var(--font-display)`,
				letterSpacing: '.075em',
				textTransform: 'uppercase',
				whiteSpace: 'nowrap',
				color: 'var(--color-text-primary)',
				...style,
			}}
			{...rest}
		>
			Lamp
			<span
				style={{
					backgroundImage: FALLOFF,
					WebkitBackgroundClip: 'text',
					backgroundClip: 'text',
					color: 'transparent',
				}}
			>
				light
			</span>
		</span>
	);
}

/**
 * BrandLockup — the compact horizontal lockup used in app chrome: mark beside wordmark, with the
 * product name exposed to assistive tech once (the wordmark itself is decorative text, so the
 * accessible name lives on the wrapper).
 */
export function BrandLockup({ markSize = 30, wordSize = 15, gap = 10, style, ...rest }) {
	return (
		<span
			role="img"
			aria-label="Lamplight"
			style={{ display: 'inline-flex', alignItems: 'center', gap, ...style }}
			{...rest}
		>
			<BrandMark size={markSize} />
			<BrandWordmark size={wordSize} aria-hidden="true" />
		</span>
	);
}
