import { useState } from 'react';
import { Button, Field, Input } from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import { Panel, T } from '../../../app/screen-kit';
import { useI18n } from '../../../i18n';
import type { SheetIO, SheetSubject } from './subject';

/**
 * Setting the experience total: `character.set-xp`, the CHAR-009 write the core takes from the DM or
 * the character's owner (it drives XP-mode level-up eligibility). The level-up wizard below states
 * the level and XP. Drawn only where the plan admits `xp`.
 */
export function XpPanel({
	subject,
	actorId,
	io,
}: {
	subject: SheetSubject;
	actorId: string;
	io: SheetIO;
}) {
	const { t } = useI18n();
	const [xpInput, setXpInput] = useState('');
	async function setXp() {
		// `Number('') || 0` is 0, so an empty field would reset accumulated XP (and revoke level-up
		// eligibility) on a single stray click.
		if (xpInput.trim() === '') {
			io.refuse('Enter an XP total before setting it.', 'xp');
			return;
		}
		const parsed = Number(xpInput);
		if (!Number.isFinite(parsed)) {
			io.refuse('XP must be a number.', 'xp');
			return;
		}
		const n = Math.max(0, Math.trunc(parsed));
		if (
			await io.dispatch(
				{ type: 'character.set-xp', actorId, payload: { characterId: subject.id, xp: n } },
				`Experience set to ${n}.`,
			)
		)
			setXpInput('');
	}
	return (
		<Panel title={t('characters.advancement')}>
			<div
				style={{
					display: 'flex',
					gap: T.space.two,
					alignItems: 'flex-end',
					flexWrap: 'wrap',
				}}
			>
				<Field label={t('characters.setXp')} style={{ width: 120 }}>
					<Input
						type="number"
						value={xpInput}
						onChange={(e: DSChangeEvent) => setXpInput(e.target.value)}
					/>
				</Field>
				<Button variant="secondary" size="sm" onClick={setXp}>
					{t('characters.setXp')}
				</Button>
				{io.fieldError('xp')}
			</div>
		</Panel>
	);
}
