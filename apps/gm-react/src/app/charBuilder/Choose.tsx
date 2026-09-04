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
	return (
		<Overlay key="choose" onClose={onClose} label="Add a character" phone={isPhone}>
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
						<h2 style={{ margin: 0, font: `700 24px ${T.disp}` }}>Add a character</h2>
						<p style={{ margin: '4px 0 0', font: `13px ${T.sans}`, color: T.ter }}>
							Build one from scratch with the guided 5e wizard.
						</p>
					</div>
					<IconButton icon="close" label="Close" variant="ghost" onClick={onClose} />
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
						title="Build from scratch"
						desc="A guided 5e wizard — identity, class, ability scores, kit, and notes. Standard array, point buy, or your own rolls."
						cta="Start building"
						onClick={onScratch}
						primary
					/>
					<PathCard
						icon="import"
						title="Import character file (JSON)"
						desc="A D&D Beyond character export or a dndtools character JSON. You review exactly what maps — and what doesn't — before anything is created."
						cta="Choose a file"
						onClick={onImport}
					/>
				</div>
			</div>
		</Overlay>
	);
}
