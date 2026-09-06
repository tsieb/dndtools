import { getContentItemsForActor } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import type { BoardWidget } from '../../board-helpers';
import { Muted, bodyWrap, cfg } from '../../widget-body-kit';

/**
 * The `notes` Command Center widget (RC-WID-4.1) — the notes most recently touched, `count` deciding
 * how many. Same visibility-respecting read the Knowledge lists use, so a DM-only note never appears
 * on a board a player is looking at.
 */
export function NotesBody({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const count = Math.max(1, Number(cfg<string>(widget, 'count') ?? 5) || 5);
	const notes = getContentItemsForActor(
		runtime.state.content,
		runtime.state.permissions,
		runtime.defaultActorId,
	).filter((item) => item.kind === 'note');
	if (notes.length === 0) return <Muted>{t('widgetBody.notes.empty')}</Muted>;
	const shown = notes.slice(0, count);
	return (
		<div style={bodyWrap}>
			{shown.map((note) => (
				<div
					key={note.id}
					style={{
						font: 'var(--text-xs)/1.4 var(--font-sans)',
						color: 'var(--color-text-secondary)',
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{note.title}
				</div>
			))}
			<Muted>{t('widgetBody.notes.count', { shown: shown.length, total: notes.length })}</Muted>
		</div>
	);
}
