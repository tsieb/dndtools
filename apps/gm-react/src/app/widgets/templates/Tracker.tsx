import { ProgressMeter, Stat } from '../../../ds';
import {
	ComputedFields,
	TemplateEmpty,
	TemplateNote,
	TemplateShell,
	type WidgetTemplateProps,
} from './shared';

/**
 * `tracker` — quantities that move (RC-WID-1.2): hit points, a countdown's remaining segments, a
 * clock's filled ticks. A row that carries a `value` and a `max` becomes a `ProgressMeter`; rows
 * with a bare `value` and no ceiling become `Stat` tiles, because a meter with an invented maximum
 * would misreport the number it is supposed to be tracking.
 *
 * When no row carries a measure at all, the tracker falls back to the row COUNT — the honest thing a
 * list-shaped source can be tracked by — and says so in the label.
 */
export function TrackerTemplate({ data }: WidgetTemplateProps) {
	const query = data.primary;
	const rows = query?.rows ?? [];
	const metered = rows.filter(
		(row) => typeof row.value === 'number' && typeof row.max === 'number',
	);
	const counted = rows.filter(
		(row) => typeof row.value === 'number' && typeof row.max !== 'number',
	);
	const hasMeasure = metered.length > 0 || counted.length > 0;

	return (
		<TemplateShell testId="widget-template-tracker">
			{query?.header ? <TemplateNote>{query.header}</TemplateNote> : null}
			<ComputedFields data={data} />
			{rows.length === 0 ? <TemplateEmpty query={query} /> : null}
			{metered.map((row) => (
				<ProgressMeter
					key={row.id}
					label={row.primary}
					value={row.value}
					max={row.max}
					valueLabel={`${row.value} of ${row.max}`}
					tone={row.active ? 'accent' : 'neutral'}
					size="sm"
				/>
			))}
			{counted.length > 0 ? (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
						gap: 'var(--space-2)',
					}}
				>
					{counted.map((row) => (
						<Stat
							key={row.id}
							label={row.primary}
							value={row.value}
							style={{ padding: 'var(--space-2)' }}
						/>
					))}
				</div>
			) : null}
			{rows.length > 0 && !hasMeasure ? (
				<Stat label={query?.label ?? 'Tracked'} value={rows.length} unit="rows" />
			) : null}
		</TemplateShell>
	);
}
