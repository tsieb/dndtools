import { useState } from 'react';
import { Button, IconButton, Sheet } from '../../ds';
import { T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useI18n } from '../../i18n';

/** Keep one primary action visible; secondary actions remain discoverable on touch. */
export function RosterActions({
	canStart,
	starting,
	onStart,
	onCreate,
	onImport,
}: {
	canStart: boolean;
	starting: boolean;
	onStart: () => void;
	onCreate: () => void;
	onImport: () => void;
}) {
	const { t } = useI18n();
	const compact = useViewport() !== 'desktop';
	const [open, setOpen] = useState(false);
	const actions = (
		<>
			{canStart && (
				<Button
					variant={compact ? 'secondary' : 'ghost'}
					icon="sword"
					disabled={starting}
					onClick={() => {
						setOpen(false);
						onStart();
					}}
				>
					{t(starting ? 'characters.startingCombat' : 'characters.startCombat')}
				</Button>
			)}
			<Button
				variant={compact ? 'secondary' : 'ghost'}
				icon="import"
				onClick={() => {
					setOpen(false);
					onImport();
				}}
			>
				{t('characters.importJson')}
			</Button>
		</>
	);
	return (
		<>
			{compact ? (
				<>
					<IconButton
						variant="ghost"
						icon="more"
						size="lg"
						label={t('characters.moreActions')}
						onClick={() => setOpen(true)}
					/>
					<Sheet open={open} onClose={() => setOpen(false)} title={t('characters.moreActions')}>
						<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}>
							{actions}
						</div>
					</Sheet>
				</>
			) : (
				actions
			)}
			<Button variant="primary" icon="new-character" onClick={onCreate}>
				{t('characters.newCharacter')}
			</Button>
		</>
	);
}
