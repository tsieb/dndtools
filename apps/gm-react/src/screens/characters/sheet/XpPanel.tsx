import { useState } from 'react';
import { Button, Field, Input } from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import { xpForLevel } from '@dndtools/core';
import { Panel, T, mono } from '../../../app/screen-kit';
import { useI18n } from '../../../i18n';
import type { SheetIO, SheetSubject } from './subject';

/**
 * Level and experience, and `character.set-xp` — the CHAR-009 write the core takes from the DM or the
 * character's owner (it drives XP-mode level-up eligibility). Drawn only where the plan admits `xp`.
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
	const level = subject.advancement?.level ?? subject.level ?? 1;
	const xp = subject.advancement?.xp ?? 0;
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
					alignItems: 'center',
					gap: T.space.three,
					flexWrap: 'wrap',
					font: `var(--text-sm) ${T.sans}`,
					color: T.sub,
				}}
			>
				<span style={mono}>{t('characters.levelValue', { level })}</span>
				<span style={mono}>{t('characters.xpValue', { xp })}</span>
				{level < 20 && (
					<span style={{ color: T.ter }}>
						{t('characters.nextAt', { xp: xpForLevel(level + 1) ?? '—' })}
					</span>
				)}
			</div>
			<div
				style={{
					marginTop: T.space.three,
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
