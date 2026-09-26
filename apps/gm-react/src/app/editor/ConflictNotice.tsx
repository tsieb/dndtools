import { Button, Icon } from '../../ds';
import { T } from '../screen-kit';
import { useI18n } from '../../i18n';

/**
 * The editor's conflict state (RC-KNW-1.2): the note changed elsewhere, so NOTHING was written. The
 * DM picks a side; autosave stays off until they do. Warning tone paired with the warning glyph, so
 * the state does not rest on colour alone.
 */
export function ConflictNotice({
	busy,
	onKeepMine,
	onUseSaved,
}: {
	busy: boolean;
	onKeepMine: () => void;
	onUseSaved: () => void;
}) {
	const { t } = useI18n();
	return (
		<div
			style={{
				border: `1px solid ${T.warn}`,
				borderRadius: T.radius.md,
				padding: `${T.space.three} ${T.space.three}`,
				display: 'flex',
				flexDirection: 'column',
				gap: T.space.two,
			}}
		>
			<span
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					gap: T.space.two,
					font: `var(--text-sm)/1.5 ${T.sans}`,
					color: T.ink,
				}}
			>
				<Icon name="warning" size="micro" color={T.warn} />
				{t('editor.conflictBody')}
			</span>
			<div style={{ display: 'flex', gap: T.space.two, flexWrap: 'wrap' }}>
				<Button variant="secondary" size="sm" disabled={busy} onClick={onKeepMine}>
					{t('editor.keepMine')}
				</Button>
				<Button variant="ghost" size="sm" disabled={busy} onClick={onUseSaved}>
					{t('editor.useSaved')}
				</Button>
			</div>
		</div>
	);
}
