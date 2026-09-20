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
						padding: isPhone
							? 'var(--space-4) var(--space-4) var(--space-0)'
							: 'var(--space-5) var(--space-6) var(--space-0)',
					}}
				>
					<div>
						<h2 style={{ margin: 'var(--space-0)', font: `700 var(--text-xl) ${T.disp}` }}>
							{t('charBuilder.addCharacter')}
						</h2>
						<p
							style={{
								margin: 'var(--space-1) var(--space-0) var(--space-0)',
								font: `var(--text-sm) ${T.sans}`,
								color: T.ter,
							}}
						>
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
						minHeight: 0,
						overflowY: 'auto',
						gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1fr 1fr',
						gap: 'var(--space-4)',
						padding: isPhone ? 'var(--space-4)' : 'var(--space-6) var(--space-6) var(--space-6)',
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
