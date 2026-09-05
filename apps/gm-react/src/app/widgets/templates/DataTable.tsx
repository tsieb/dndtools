import { DataTable } from '../../../ds';
import {
	ComputedFields,
	TemplateEmpty,
	TemplateNote,
	TemplateShell,
	emptyNoticeOf,
	type WidgetTemplateProps,
} from './shared';

/**
 * `data-table` — the tabular template (RC-WID-1.2). Rows come from the definition's FIRST data
 * query, already actor-filtered and audience-gated by `dataEnvironment`; this file only decides
 * which columns are worth showing.
 *
 * Columns are derived from the rows rather than declared, because the query sources return
 * different shapes: a combatant carries a measure and a detail, a map carries only a description.
 * A column no row populates is dropped instead of drawn as a strip of em dashes.
 */
export function DataTableTemplate({ data }: WidgetTemplateProps) {
	const query = data.primary;
	const rows = query?.rows ?? [];
	const hasSecondary = rows.some((row) => row.secondary);
	const hasMeta = rows.some((row) => row.meta);

	const columns = [
		{ key: 'primary', header: query?.label ?? 'Name', strong: true, wrap: true },
		...(hasSecondary ? [{ key: 'secondary', header: 'Detail', wrap: true }] : []),
		...(hasMeta ? [{ key: 'meta', header: 'Tag' }] : []),
	];

	return (
		<TemplateShell testId="widget-template-data-table">
			{query?.header ? <TemplateNote>{query.header}</TemplateNote> : null}
			<ComputedFields data={data} />
			{rows.length === 0 ? (
				<TemplateEmpty query={query} />
			) : (
				<DataTable
					dense
					ariaLabel={query?.label ?? 'Widget data'}
					columns={columns}
					rows={rows}
					rowKey={(row: { id: string }) => row.id}
					empty={emptyNoticeOf(query) ?? undefined}
				/>
			)}
		</TemplateShell>
	);
}
