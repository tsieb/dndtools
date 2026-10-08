import { useI18n } from '../../../../i18n';
import { Muted, bodyWrap, cfg } from '../../../widget-body-kit';
import { LiveReadout } from '../../builtin/live';
import type { WidgetTemplateProps } from '../shared';

/**
 * `item-list` — the GM board's quick reference and prep lists (RC-WID-5.7; the `quick-reference` and
 * `prep` builtin bodies until then, unchanged on screen): the first `count` titles of the
 * definition's first query, and how many there are. The query is the visibility-respecting content
 * read Knowledge lists with, so a player-viewed board never shows a DM-only row here. A `notes` query
 * counts notes; any other counts reference rows.
 */
export function ItemListTemplate({ widget, data }: WidgetTemplateProps) {
	const { t } = useI18n();
	const query = data.primary;
	const kind = query?.source === 'notes' ? 'note' : 'object';
	const unit = kind === 'note' ? 'widgetBody.list.unitNotes' : 'widgetBody.list.unitObjects';
	// `count` is the widget's configured row cap.
	const count = Math.max(1, Number(cfg<number>(widget, 'count') ?? 5) || 5);
	const items = (query?.rows ?? []).map((row) => ({ id: row.id, title: row.primary }));
	const shown = items.slice(0, count);
	return (
		// Natural height, not the tile's: rows past the tile edge scroll in the frame's region rather
		// than squeezing (and clipping mid-line). Rows sit tighter than the kit's gap so the default
		// tile shows whole lines.
		<div
			style={{
				...bodyWrap,
				gap: 'var(--space-1)',
				height: 'auto',
				minHeight: '100%',
				overflow: 'visible',
			}}
		>
			{shown.map((item) => (
				<div
					key={item.id}
					style={{
						font: 'var(--text-xs)/1.4 var(--font-sans)',
						color: 'var(--color-text-secondary)',
						overflowWrap: 'anywhere',
						flexShrink: 0,
					}}
				>
					{item.title}
				</div>
			))}
			<LiveReadout>
				<Muted>
					{items.length === 0
						? kind === 'note'
							? t('widgetBody.list.notesEmpty')
							: t('widgetBody.list.objectsEmpty')
						: t('widgetBody.list.count', {
								shown: shown.length,
								total: items.length,
								unit: t(unit),
							})}
				</Muted>
			</LiveReadout>
		</div>
	);
}
