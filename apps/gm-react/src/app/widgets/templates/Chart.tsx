import {
	ComputedFields,
	TemplateEmpty,
	TemplateNote,
	TemplateShell,
	type WidgetTemplateProps,
} from './shared';

/**
 * `chart` — a horizontal bar comparison (RC-WID-1.2). One form only, on purpose: a widget frame is a
 * few hundred pixels of a busy board, and a labelled bar row is the one chart that stays readable
 * (and sortable by eye) at that size.
 *
 * Accessibility drives the markup. The bars are decorative `aria-hidden` divs and every value is
 * ALSO printed as text in the same row, so the chart reads correctly with no images, no colour
 * perception and a screen reader — no ARIA chart role, no invisible summary that can drift from the
 * bars. Rows without a numeric measure are listed without a bar rather than dropped, so the chart
 * never quietly omits part of its own data.
 */
export function ChartTemplate({ data }: WidgetTemplateProps) {
	const query = data.primary;
	const rows = query?.rows ?? [];
	const measured = rows.filter((row) => typeof row.value === 'number');
	// One scale for the whole chart: each row's own `max` when it declares one, else the largest
	// value present. A per-row scale would make bars of different meanings look comparable.
	const ceiling = measured.reduce((top, row) => Math.max(top, row.max ?? row.value ?? 0), 0);

	return (
		<TemplateShell testId="widget-template-chart">
			{query?.header ? <TemplateNote>{query.header}</TemplateNote> : null}
			<ComputedFields data={data} />
			{rows.length === 0 ? (
				<TemplateEmpty query={query} />
			) : (
				<ul
					style={{
						margin: 0,
						padding: 0,
						listStyle: 'none',
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-1-5)',
					}}
				>
					{rows.map((row) => {
						const value = typeof row.value === 'number' ? row.value : null;
						const fraction =
							value !== null && ceiling > 0 ? Math.max(0, Math.min(1, value / ceiling)) : 0;
						return (
							<li key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
								<span
									style={{
										display: 'flex',
										justifyContent: 'space-between',
										gap: 'var(--space-2)',
										font: 'var(--text-2xs) var(--font-sans)',
										color: 'var(--color-text-secondary)',
										minWidth: 0,
									}}
								>
									<span
										style={{
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										}}
									>
										{row.primary}
									</span>
									<span style={{ font: 'var(--text-2xs) var(--font-mono)', flex: '0 0 auto' }}>
										{value === null ? '—' : row.max != null ? `${value} / ${row.max}` : value}
									</span>
								</span>
								<div
									aria-hidden="true"
									style={{
										height: 6,
										borderRadius: 'var(--radius-full)',
										background: 'var(--color-surface-alt)',
										overflow: 'hidden',
									}}
								>
									<div
										style={{
											height: '100%',
											width: `${Math.round(fraction * 100)}%`,
											background: row.active ? 'var(--color-accent)' : 'var(--color-accent-border)',
										}}
									/>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</TemplateShell>
	);
}
