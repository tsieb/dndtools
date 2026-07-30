import React from 'react';

/**
 * DefinitionList — label/value pairs for detail panels: a creature's properties, a scene's
 * settings summary, an item's stats. `layout="rows"` (default) sets a tight two-column grid with
 * the label in the tracked eyebrow style; `layout="stacked"` puts the value under the label for
 * narrow columns. Values can be any node (chips, mono numbers). A missing value renders an em dash,
 * never a blank.
 */
export function DefinitionList({ items = [], layout = 'rows', style, ...rest }) {
	if (layout === 'stacked') {
		return (
			<dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', ...style }} {...rest}>
				{items.map((it, i) => (
					<div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
						<dt style={LABEL}>{it.label}</dt>
						<dd style={{ ...VALUE, margin: 0 }}>{render(it.value)}</dd>
					</div>
				))}
			</dl>
		);
	}
	return (
		// `auto 1fr` plus a nowrap label meant a long term ("Condition Immunities", "Proficiency
		// Bonus") forced the first track to its full intrinsic width and pushed the whole list past a
		// narrow panel. `minmax(0, …)` lets both tracks shrink; LABEL below now wraps rather than
		// overflowing when they do.
		<dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr)', columnGap: 'var(--space-4)', rowGap: 'var(--space-2)', alignItems: 'baseline', ...style }} {...rest}>
			{items.map((it, i) => (
				<React.Fragment key={i}>
					<dt style={{ ...LABEL, paddingTop: 1 }}>{it.label}</dt>
					<dd style={{ ...VALUE, margin: 0, fontFamily: it.mono ? 'var(--font-mono)' : 'var(--font-sans)' }}>{render(it.value)}</dd>
				</React.Fragment>
			))}
		</dl>
	);
}

function render(v) {
	return v === undefined || v === null || v === '' ? '—' : v;
}

const LABEL = {
	fontFamily: 'var(--font-sans)',
	fontSize: 'var(--text-2xs)',
	fontWeight: 'var(--font-weight-semibold)',
	letterSpacing: 'var(--tracking-wider)',
	textTransform: 'uppercase',
	color: 'var(--color-text-tertiary)',
};
const VALUE = {
	fontFamily: 'var(--font-sans)',
	fontSize: 'var(--text-sm)',
	color: 'var(--color-text-primary)',
	lineHeight: 1.5,
};
