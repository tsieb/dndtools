import { useState } from 'react';
import { Button, DataTable, IconButton, Input } from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import { Panel, T } from '../../../app/screen-kit';
import { useI18n } from '../../../i18n';
import type { SheetIO, SheetSubject } from './subject';

type AttackRow = { id?: string; name: string; detail: string };

/**
 * The attacks list and its full-replacement editor (`character.update-attacks`, owner-or-DM): the saved
 * rows become the attack list in one validated step, so add, edit and remove share the command. Everyone
 * reads the list; the editor is drawn only for `canEdit`.
 */
export function AttacksPanel({
	subject,
	actorId,
	canEdit,
	compact,
	io,
}: {
	subject: SheetSubject;
	actorId: string;
	canEdit: boolean;
	compact: boolean;
	io: SheetIO;
}) {
	const { t } = useI18n();
	const { view } = subject;
	const isPhone = compact;
	const [attackRows, setAttackRows] = useState<AttackRow[] | null>(null);
	async function saveAttacks() {
		if (!attackRows) return;
		const attacks = attackRows
			.filter((a) => a.name.trim())
			.map((a) => ({
				...(a.id ? { id: a.id } : {}),
				name: a.name.trim(),
				detail: a.detail.trim(),
			}));
		if (
			await io.dispatch(
				{
					type: 'character.update-attacks',
					actorId,
					payload: { characterId: subject.id, attacks },
				},
				`Saved ${attacks.length} ${attacks.length === 1 ? 'attack' : 'attacks'}.`,
			)
		)
			setAttackRows(null);
	}
	return (
		<Panel
			title={t('characters.attacks')}
			action={
				canEdit && attackRows === null ? (
					<Button
						variant="secondary"
						size="sm"
						icon="note-edit"
						onClick={() =>
							setAttackRows(
								view.attacks.map((a) => ({ id: a.id, name: a.name, detail: a.detail ?? '' })),
							)
						}
					>
						{t('characters.editAttacks')}
					</Button>
				) : undefined
			}
		>
			{attackRows !== null ? (
				// Full-replacement editor: the saved rows become the attack list via
				// `character.update-attacks` (rows without an id are new attacks).
				<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}>
					{attackRows.map((a, idx) => (
						<div
							key={a.id ?? `new-${idx}`}
							style={{
								display: 'grid',
								// The sheet's outer grid is phone-guarded but this nested attack editor was
								// not: Name + Detail + remove crushed onto one 393px row.
								gridTemplateColumns: isPhone ? 'minmax(0,1fr) 28px' : '1fr 1.5fr 28px',
								gap: T.space.two,
								alignItems: 'center',
							}}
						>
							<Input
								value={a.name}
								aria-label={t('characters.attackName')}
								placeholder={t('characters.name')}
								// Two tracks but THREE children: with everything auto-placed, the Detail
								// input landed in the 28px remove column (~4 characters wide) and the
								// remove button got a full-width row to itself. Letting Name own row 1
								// puts Detail + remove on row 2, and keeps DOM order == reading order.
								style={isPhone ? { gridColumn: '1 / -1' } : undefined}
								onChange={(e: DSChangeEvent) =>
									setAttackRows((rows) =>
										rows!.map((x, j) => (j === idx ? { ...x, name: e.target.value } : x)),
									)
								}
							/>
							<Input
								value={a.detail}
								aria-label={t('characters.attackDetail')}
								placeholder={t('characters.attackDetailPlaceholder')}
								onChange={(e: DSChangeEvent) =>
									setAttackRows((rows) =>
										rows!.map((x, j) => (j === idx ? { ...x, detail: e.target.value } : x)),
									)
								}
							/>
							<IconButton
								icon="close"
								label={t('characters.removeAttack')}
								variant="ghost"
								size="sm"
								onClick={() => setAttackRows((rows) => rows!.filter((_, j) => j !== idx))}
							/>
						</div>
					))}
					{attackRows.length === 0 && (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							{t('characters.attacksClearNote')}
						</div>
					)}
					<div style={{ display: 'flex', gap: T.space.two, alignItems: 'center' }}>
						<Button
							variant="secondary"
							size="sm"
							icon="add"
							onClick={() => setAttackRows((rows) => [...(rows ?? []), { name: '', detail: '' }])}
						>
							{t('characters.addAttack')}
						</Button>
						<div style={{ flex: 1 }} />
						<Button variant="ghost" size="sm" onClick={() => setAttackRows(null)}>
							{t('common.action.cancel')}
						</Button>
						<Button variant="secondary" size="sm" onClick={saveAttacks}>
							{t('characters.saveAttacks')}
						</Button>
					</div>
				</div>
			) : view.attacks.length > 0 ? (
				<DataTable
					ariaLabel={t('characters.attacks')}
					columns={[
						{ key: 'name', header: t('characters.name'), strong: true },
						{ key: 'detail', header: t('characters.detail'), mono: true },
					]}
					rows={view.attacks}
					rowKey={(r: (typeof view.attacks)[number]) => r.id}
				/>
			) : (
				<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
					{t(canEdit ? 'characters.noAttacksDm' : 'characters.noAttacks')}
				</div>
			)}
		</Panel>
	);
}
