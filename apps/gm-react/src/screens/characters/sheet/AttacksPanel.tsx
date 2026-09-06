import { Button, DataTable, IconButton, Input } from '../../../ds';
import { type CharacterView } from '@dndtools/core';
import { Panel, T } from '../../../app/screen-kit';

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
	return (
		<Panel
			title="Attacks"
			action={
				editMode && isDm && attackRows === null ? (
					<Button
						variant="secondary"
						size="sm"
						icon="note-edit"
						onClick={() =>
							setAttackRows(
								view.attacks.map((a: any) => ({
									id: a.id,
									name: a.name,
									detail: a.detail ?? '',
								})),
							)
						}
					>
						Edit attacks
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
								aria-label="Attack name"
								placeholder="Name"
								// Two tracks but THREE children: with everything auto-placed, the Detail
								// input landed in the 28px remove column (~4 characters wide) and the
								// remove button got a full-width row to itself. Letting Name own row 1
								// puts Detail + remove on row 2, and keeps DOM order == reading order.
								style={isPhone ? { gridColumn: '1 / -1' } : undefined}
								onChange={(e: any) =>
									setAttackRows((rows) =>
										rows!.map((x, j) => (j === idx ? { ...x, name: e.target.value } : x)),
									)
								}
							/>
							<Input
								value={a.detail}
								aria-label="Attack detail"
								placeholder="e.g. Melee · +4 to hit · 1d8+2 slashing"
								onChange={(e: any) =>
									setAttackRows((rows) =>
										rows!.map((x, j) => (j === idx ? { ...x, detail: e.target.value } : x)),
									)
								}
							/>
							<IconButton
								icon="close"
								label="Remove attack"
								variant="ghost"
								size="sm"
								onClick={() => setAttackRows((rows) => rows!.filter((_, j) => j !== idx))}
							/>
						</div>
					))}
					{attackRows.length === 0 && (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							Saving with no rows clears the attack list.
						</div>
					)}
					<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
						<Button
							variant="secondary"
							size="sm"
							icon="add"
							onClick={() => setAttackRows((rows) => [...(rows ?? []), { name: '', detail: '' }])}
						>
							Add attack
						</Button>
						<div style={{ flex: 1 }} />
						<Button variant="ghost" size="sm" onClick={() => setAttackRows(null)}>
							Cancel
						</Button>
						<Button variant="primary" size="sm" onClick={saveAttacks}>
							Save attacks
						</Button>
					</div>
				</div>
			) : view.attacks.length > 0 ? (
				<DataTable
					ariaLabel="Attacks"
					columns={[
						{ key: 'name', header: 'Name', strong: true },
						{ key: 'detail', header: 'Detail', mono: true },
					]}
					rows={view.attacks}
					rowKey={(r: any) => r.id}
				/>
			) : (
				<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
					No attacks recorded.{isDm ? ' Use Edit to add them.' : ''}
				</div>
			)}
		</Panel>
	);
}
