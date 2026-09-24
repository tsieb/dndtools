import { Icon, IconButton } from '../../ds';
import { T } from '../screen-kit';
import { useI18n } from '../../i18n';
import type { MapEditorApi, MapNoticeTone } from './useMapEditor';
const NOTICE_ICON: Record<MapNoticeTone, string> = {
	warning: 'warning',
	success: 'check',
	info: 'info',
};
export function MapEditorNotice({ editor }: { editor: MapEditorApi }) {
	const { t } = useI18n();
	return (
		<>
			{editor.notice && (
				<div
					// `setNotice` is where useMapEditor funnels EVERY command rejection and thrown error,
					// and the editor's only live region is fed by `announce()`, which setNotice never
					// calls — so "layer is locked" was silent to AT and looked like a neutral FYI.
					// The skin used to be hard-coded to WARNING, but `projectToPlayers` reports its success
					// through the same banner: "Projected “Docks” to 3 players." arrived yellow, behind a
					// warning triangle, indistinguishable from a refusal. Tone now travels with the text.
					role={editor.noticeTone === 'warning' ? 'alert' : 'status'}
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						padding: 'var(--space-2) var(--space-3)',
						background: `var(--color-status-${editor.noticeTone}-subtle)`,
						borderBottom: `1px solid var(--color-status-${editor.noticeTone}-border)`,
						font: `12.5px ${T.sans}`,
						color: `var(--color-status-${editor.noticeTone}-text)`,
					}}
				>
					<Icon name={NOTICE_ICON[editor.noticeTone]} size={15} />
					<span style={{ flex: 1 }}>{editor.notice}</span>
					<IconButton
						icon="close"
						label={t('mapEditor.dismiss')}
						variant="ghost"
						onClick={() => editor.setNotice(null)}
					/>
				</div>
			)}
		</>
	);
}
