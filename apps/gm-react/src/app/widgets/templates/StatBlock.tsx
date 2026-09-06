import { DefinitionList, ProgressMeter, Stat } from '../../../ds';
import { TemplateEmpty, TemplateNote, TemplateShell, type WidgetTemplateProps } from './shared';
import { useI18n } from '../../../i18n';

/**
 * `stat-block` — ONE subject in detail (RC-WID-1.2): the bound character, the active combatant, the
 * selected scene. Where the other templates list rows, this one takes the active row (or the first)
 * and gives it the space.
 *
 * It composes the compact DS pieces — `Stat` for the headline figure, `ProgressMeter` for a measure
 * with a ceiling, `DefinitionList` for the remaining properties — rather than the full-page DS
 * `StatBlock`, whose tapered rules, ability grid and action paragraphs need a sheet, not a widget
 * frame a few hundred pixels wide. The subject's other rows are summarised underneath so a
 * multi-row query is not silently truncated to one.
 */
export function StatBlockTemplate({ data }: WidgetTemplateProps) {
	const { t } = useI18n();
	const query = data.primary;
	const rows = query?.rows ?? [];
	const subject = rows.find((row) => row.active) ?? rows[0] ?? null;

	if (!subject) {
		return (
			<TemplateShell testId="widget-template-stat-block">
				<TemplateEmpty query={query} />
			</TemplateShell>
		);
	}

	const items = [
		...(subject.secondary ? [{ label: 'Detail', value: subject.secondary }] : []),
		...(subject.meta ? [{ label: 'Tag', value: subject.meta }] : []),
		...data.computed.map((field) => ({ label: field.label, value: field.display })),
	];

	return (
		<TemplateShell testId="widget-template-stat-block">
			{query?.header ? <TemplateNote>{query.header}</TemplateNote> : null}
			{typeof subject.value === 'number' && typeof subject.max === 'number' ? (
				<ProgressMeter
					label={subject.primary}
					value={subject.value}
					max={subject.max}
					valueLabel={`${subject.value} of ${subject.max}`}
					size="sm"
				/>
			) : (
				<Stat
					label={query?.label ?? 'Subject'}
					value={subject.primary}
					style={{ padding: 'var(--space-2)' }}
				/>
			)}
			{items.length > 0 ? <DefinitionList layout="stacked" items={items} /> : null}
			{rows.length > 1 ? (
				<TemplateNote>{t('widgetTemplate.moreInSource', { count: rows.length - 1 })}</TemplateNote>
			) : null}
		</TemplateShell>
	);
}
