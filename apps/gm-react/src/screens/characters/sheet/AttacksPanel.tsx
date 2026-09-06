import { Button, DataTable, IconButton, Input } from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import { type CharacterView } from '@dndtools/core';
import { Panel, T } from '../../../app/screen-kit';
import { useI18n } from '../../../i18n';

/** The attacks list and its DM/owner full-replacement editor (`character.update-attacks`).
 * Extracted from Characters.tsx unchanged (RC-STB-2.6). */
export function AttacksPanel({
	view,
	isDm,
	editMode,
	attackRows,
	setAttackRows,
	saveAttacks,
	isPhone,
}: {
	view: CharacterView;
	isDm: boolean;
	editMode: boolean;
	attackRows: { id?: string; name: string; detail: string }[] | null;
	setAttackRows: (
		next:
			| ({ id?: string; name: string; detail: string }[] | null)
			| ((
					previous: { id?: string; name: string; detail: string }[] | null,
			  ) => { id?: string; name: string; detail: string }[] | null),
	) => void;
	saveAttacks: () => Promise<void>;
	isPhone: boolean;
}) {
	const { t } = useI18n();
	return (
		<Panel
			title={t('characters.attacks')}
			action={
				editMode && isDm && attackRows === null ? (
					<Button
						variant="secondary"
						size="sm"
						icon="note-edit"
						onClick={() =>
							setAttackRows(
								view.attacks.map((a) => ({
									id: a.id,
									name: a.name,
									detail: a.detail ?? '',
								})),
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
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{attackRows.map((a, idx) => (
						<div
							key={a.id ?? `new-${idx}`}
							style={{
								display: 'grid',
								// The sheet's outer grid is phone-guarded but this nested attack editor was
								// not: Name + Detail + remove crushed onto one 393px row.
								gridTemplateColumns: isPhone ? 'minmax(0,1fr) 28px' : '1fr 1.5fr 28px',
								gap: 8,
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
					<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
						<Button variant="primary" size="sm" onClick={saveAttacks}>
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
					{t(isDm ? 'characters.noAttacksDm' : 'characters.noAttacks')}
				</div>
			)}
		</Panel>
	);
}
