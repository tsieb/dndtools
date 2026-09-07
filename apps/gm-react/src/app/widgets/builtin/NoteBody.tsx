import type { BoardWidget } from '../../board-helpers';
import { useI18n } from '../../../i18n';
import { Muted, bodyWrap, cfg } from '../../widget-body-kit';
import { renderMarkdown } from '../../markdown/render';

/**
 * Moved from `app/widget-bodies.tsx` by RC-WID-4.1 — the file grew past what one module should
 * hold once every system widget type gained a body, so each hand-written body now lives in its own
 * file under `app/widgets/builtin/`.
 *
 * RC-KNW-1.1 — the body now renders through the app's ONE markdown pipeline instead of as a raw
 * string, so a note widget on the board shows the same headings, lists, tables and callouts the DM
 * sees in Knowledge. No DM authority is asserted here: a widget can be projected to the table, so a
 * `[!Secret]` callout renders as withheld rather than blurred (fail closed).
 */

export function NoteBody({ widget }: { widget: BoardWidget }) {
	const { t } = useI18n();
	const heading = cfg<string>(widget, 'heading');
	const body = cfg<string>(widget, 'body');
	if (!heading && !body) return <Muted>{t('widgetBody.note.empty')}</Muted>;
	return (
		<div style={{ ...bodyWrap, gap: 6 }}>
			{heading && (
				<div
					style={{
						font: '700 var(--text-sm) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					{heading}
				</div>
			)}
			{body && (
				<div
					style={{
						font: 'var(--text-xs)/1.6 var(--font-sans)',
						color: 'var(--color-text-secondary)',
						overflow: 'hidden',
					}}
				>
					{renderMarkdown(body, { t })}
				</div>
			)}
		</div>
	);
}
