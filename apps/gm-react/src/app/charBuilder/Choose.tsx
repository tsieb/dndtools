/**
 * CharBuilder entry choice — build from scratch, or import a character file.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { IconButton } from '../../ds';
import { T } from '../screen-kit';
import { Overlay } from './Overlay';
import { PathCard } from './ui';
import { useI18n } from '../../i18n';

export function ChoosePhase({
	isPhone,
	onClose,
	onScratch,
	onImport,
}: {
	isPhone: boolean;
	onClose: () => void;
	onScratch: () => void;
	onImport: () => void;
}) {
	const { t } = useI18n();
	return (
		<Overlay key="choose" onClose={onClose} label={t('charBuilder.addCharacter')} phone={isPhone}>
			<div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: isPhone ? '16px 16px 0' : '20px 28px 0',
					}}
				>
					<div>
						<h2 style={{ margin: 0, font: `700 24px ${T.disp}` }}>
							{t('charBuilder.addCharacter')}
						</h2>
						<p style={{ margin: '4px 0 0', font: `13px ${T.sans}`, color: T.ter }}>
							{t('charBuilder.addCharacterHint')}
						</p>
					</div>
					<IconButton
						icon="close"
						label={t('common.action.close')}
						variant="ghost"
						onClick={onClose}
					/>
				</div>
				<div
					style={{
						flex: 1,
						display: 'grid',
						gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1fr 1fr',
						gap: 18,
						padding: isPhone ? '16px' : '24px 28px 28px',
						alignItems: 'stretch',
					}}
				>
					<PathCard
						icon="new-character"
						title={t('charBuilder.fromScratch')}
						desc={t('charBuilder.fromScratchDesc')}
						cta={t('charBuilder.startBuilding')}
						onClick={onScratch}
						primary
					/>
					<PathCard
						icon="import"
						title={t('charBuilder.importFile')}
						desc={t('charBuilder.importFileDesc')}
						cta={t('charBuilder.chooseFile')}
						onClick={onImport}
					/>
				</div>
			</div>
		</Overlay>
	);
}
