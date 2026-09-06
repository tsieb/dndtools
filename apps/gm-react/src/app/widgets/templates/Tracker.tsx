import { DefinitionList, ProgressMeter, Stat } from '../../../ds';
import {
	ComputedFields,
	TemplateEmpty,
	TemplateNote,
	TemplateShell,
	cfg,
	type WidgetTemplateProps,
} from './shared';

/**
 * `tracker` — quantities that move (RC-WID-1.2): hit points, a countdown's remaining segments, a
 * clock's filled ticks. A row that carries a `value` and a `max` becomes a `ProgressMeter`; rows
 * with a bare `value` and no ceiling become `Stat` tiles, because a meter with an invented maximum
 * would misreport the number it is supposed to be tracking.
 *
 * When no row carries a measure at all, the tracker reads out its own CONFIGURATION instead: a
 * numeric field with a declared ceiling becomes a meter, a bare number becomes a figure, and the
 * remaining settings are listed underneath. Some things a table tracks — the weather, a doom clock —
 * are a DM's judgement rather than something the core derives, and a widget whose measure is its
 * configuration is the honest way to say so. Failing that (no measures and no configured numbers) it
 * falls back to the row COUNT, the one thing a list-shaped source can always be tracked by.
 */
export function TrackerTemplate({ widget, definition, data }: WidgetTemplateProps) {
	const query = data.primary;
	const rows = query?.rows ?? [];
	const metered = rows.filter(
		(row) => typeof row.value === 'number' && typeof row.max === 'number',
	);
	const counted = rows.filter(
		(row) => typeof row.value === 'number' && typeof row.max !== 'number',
	);
	const hasMeasure = metered.length > 0 || counted.length > 0;

	// The instance's own settings, read only when the data carries no measure — a source that reports
	// real numbers is never overridden by what somebody typed into Customize.
	const settings = hasMeasure
		? []
		: (definition?.configFields ?? widget.configFields).filter(
				(field) => (field.group ?? 'content') === 'content',
			);
	const configuredNumbers = settings
		.filter((field) => field.control === 'number')
		.map((field) => ({
			key: field.key,
			label: field.label,
			max: field.max,
			value: cfg(widget, field.key),
		}))
		.filter((entry): entry is typeof entry & { value: number } => typeof entry.value === 'number');
	const otherSettings = settings
		.filter((field) => field.control !== 'number')
		.map((field) => ({ label: field.label, value: cfg(widget, field.key) }))
		.filter((entry) => entry.value !== undefined && entry.value !== '');
	const hasConfigured = configuredNumbers.length > 0 || otherSettings.length > 0;

	return (
		<TemplateShell testId="widget-template-tracker">
			{query?.header ? <TemplateNote>{query.header}</TemplateNote> : null}
			<ComputedFields data={data} />
			{rows.length === 0 && !hasConfigured ? <TemplateEmpty query={query} /> : null}
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
			{configuredNumbers.map((entry) =>
				typeof entry.max === 'number' ? (
					<ProgressMeter
						key={entry.key}
						label={entry.label}
						value={entry.value}
						max={entry.max}
						valueLabel={`${entry.value} of ${entry.max}`}
						tone="accent"
						size="sm"
					/>
				) : (
					<Stat
						key={entry.key}
						label={entry.label}
						value={entry.value}
						style={{ padding: 'var(--space-2)' }}
					/>
				),
			)}
			{otherSettings.length > 0 ? (
				<DefinitionList
					layout="stacked"
					items={otherSettings.map((entry) => ({ label: entry.label, value: String(entry.value) }))}
				/>
			) : null}
			{rows.length > 0 && !hasMeasure && !hasConfigured ? (
				<Stat label={query?.label ?? 'Tracked'} value={rows.length} unit="rows" />
			) : null}
		</TemplateShell>
	);
}
