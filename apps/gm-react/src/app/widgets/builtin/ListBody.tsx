import { getContentItemsForActor } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import type { BoardWidget } from '../../board-helpers';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n';
import { Muted, bodyWrap, cfg } from '../../widget-body-kit';

/**
 * Moved from `app/widget-bodies.tsx` by RC-WID-4.1 — the file grew past what one module should
 * hold once every system widget type gained a body, so each hand-written body now lives in its own
 * file under `app/widgets/builtin/`. This is a pure move: the component below is byte-for-byte the
 * one that used to sit in `widget-bodies.tsx`.
 */

export function ListBody({
	widget,
	kind,
	unit,
}: {
	widget: BoardWidget;
	kind: 'note' | 'object';
	unit: MessageKey;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	// The SAME visibility-respecting content read Knowledge lists with — a player-viewed board never
	// shows a DM-only row here. `count` is the widget's configured row cap.
	const count = Math.max(1, Number(cfg<number>(widget, 'count') ?? 5) || 5);
	const items = getContentItemsForActor(
		runtime.state.content,
		runtime.state.permissions,
		runtime.defaultActorId,
	).filter((item) => item.kind === kind);
	if (items.length === 0) {
		return (
			<Muted>
				{kind === 'note' ? t('widgetBody.list.notesEmpty') : t('widgetBody.list.objectsEmpty')}
			</Muted>
		);
	}
	const shown = items.slice(0, count);
	return (
		<div style={bodyWrap}>
			{shown.map((item) => (
				<div
					key={item.id}
					style={{
						font: 'var(--text-xs)/1.4 var(--font-sans)',
						color: 'var(--color-text-secondary)',
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{item.title}
				</div>
			))}
			<Muted>
				{t('widgetBody.list.count', {
					shown: shown.length,
					total: items.length,
					unit: t(unit),
				})}
			</Muted>
		</div>
	);
}
