import { useState } from 'react';
import { Button, Field, IconButton, Input } from '../ds';
import { T, eb } from './screen-kit';
import { useI18n } from '../i18n';
import { nextQuickDraftKey, type DraftRow } from './EncounterDraft';

/**
 * The encounter builder's draft-editing surfaces: the ad-hoc quick-add row and the draft roster
 * (per-combatant initiative, count steppers, CR, visibility, removal).
 *
 * A pure move out of `EncounterBuilder.tsx` (RC-ENG-2.2 — that file had grown past the RC-STB-2.7
 * file-size limit). The markup, the handlers and the local draft state are exactly what lived
 * inline; only the values the dialog still owns (`rows`, `mode`, `patchRow`) cross as props.
 */

/** Ad-hoc quick add — a monster that is not in the vault yet. */
export function QuickAddFoe({ onAdd }: { onAdd: (row: DraftRow) => void }) {
	const { t } = useI18n();
	const [qName, setQName] = useState('');
	const [qHp, setQHp] = useState('7');
	const [qAc, setQAc] = useState('13');

	function submit() {
		const name = qName.trim();
		if (!name) return;
		onAdd({
			key: nextQuickDraftKey(),
			kind: 'monster',
			name,
			characterId: null,
			// `Number('') || 0` is 0, so clearing the HP field quick-added a monster that was
			// already Down — while the very next line sensibly falls back to AC 10.
			maxHp: Math.max(1, Math.trunc(Number(qHp)) || 1),
			ac: Math.max(0, Math.trunc(Number(qAc)) || 10),
			initiative: '',
			cr: 1,
			quantity: 1,
			hidden: false,
			dexMod: 0,
		});
		setQName('');
	}

	return (
		<>
			{/* Ad-hoc quick add — a monster that is not in the vault yet. */}
			<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
				<Field label={t('encounter.quickAdd')} style={{ flex: '2 1 160px' }}>
					<Input
						value={qName}
						placeholder={t('encounter.quickAddPlaceholder')}
						onChange={(e: { target: { value: string } }) => setQName(e.target.value)}
						onKeyDown={(e: { key: string }) => {
							if (e.key === 'Enter') submit();
						}}
					/>
				</Field>
				<Field label={t('encounter.hp')} style={{ width: 72 }}>
					<Input
						type="number"
						// `quickAdd` floors at 1, so min={0} let the browser's own validation and the
						// spinner offer a value the code silently overrode.
						min={1}
						value={qHp}
						onChange={(e: { target: { value: string } }) => setQHp(e.target.value)}
					/>
				</Field>
				<Field label={t('encounter.ac')} style={{ width: 72 }}>
					<Input
						type="number"
						min={0}
						value={qAc}
						onChange={(e: { target: { value: string } }) => setQAc(e.target.value)}
					/>
				</Field>
				<Button variant="secondary" size="sm" icon="add" disabled={!qName.trim()} onClick={submit}>
					{t('encounter.add')}
				</Button>
			</div>
		</>
	);
}

export function DraftRoster({
	rows,
	mode,
	declaresChallenge,
	patchRow,
	onRemove,
}: {
	rows: DraftRow[];
	mode: 'start' | 'reinforce' | null;
	declaresChallenge: boolean;
	patchRow: (key: string, patch: Partial<DraftRow>) => void;
	onRemove: (key: string) => void;
}) {
	const { t } = useI18n();
	const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
	function commitQty(key: string) {
		const draft = qtyDrafts[key];
		setQtyDrafts(({ [key]: _dropped, ...rest }) => rest);
		if (draft === undefined || draft.trim() === '') return;
		const parsed = Number(draft);
		if (Number.isFinite(parsed))
			patchRow(key, { quantity: Math.min(20, Math.max(1, Math.trunc(parsed))) });
	}

	const [crDrafts, setCrDrafts] = useState<Record<string, string>>({});
	function commitCr(key: string) {
		const draft = crDrafts[key];
		setCrDrafts(({ [key]: _dropped, ...rest }) => rest);
		if (draft === undefined || draft.trim() === '') return;
		const parsed = Number(draft);
		if (Number.isFinite(parsed)) patchRow(key, { cr: Math.max(0, parsed) });
	}

	function rollInitiative(row: DraftRow) {
		// A plain table-side d20 + DEX mod pre-fill — the DM can still type over it.
		patchRow(row.key, { initiative: String(1 + Math.floor(Math.random() * 20) + row.dexMod) });
	}

	return (
		<>
			{/* The draft roster — per-combatant initiative (typed or rolled), count, CR, visibility. */}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
				<div style={eb}>{t('encounter.combatants', { count: rows.length })}</div>
				{rows.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('encounter.nonePicked')}</div>
				) : (
					rows.map((r) => (
						<div
							key={r.key}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: '6px 10px',
								borderRadius: 8,
								border: `1px solid ${T.bd}`,
								background: T.surf,
								flexWrap: 'wrap',
							}}
						>
							<span
								style={{
									flex: '1 1 120px',
									minWidth: 0,
									font: `600 13px ${T.sans}`,
									color: T.ink,
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
								}}
							>
								{r.name}
							</span>
							<label
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 5,
									font: `11px ${T.sans}`,
									color: T.ter,
								}}
							>
								{t('encounter.init')}
								<Input
									value={r.initiative}
									placeholder={t('encounter.initPlaceholder')}
									aria-label={t('encounter.initOf', { name: r.name })}
									style={{ width: 58, textAlign: 'center', fontFamily: T.mono }}
									onChange={(e: { target: { value: string } }) =>
										patchRow(r.key, { initiative: e.target.value.replace(/[^-\d]/g, '') })
									}
								/>
							</label>
							<IconButton
								icon="dice"
								label={t('encounter.rollInitiativeFor', { name: r.name })}
								variant="ghost"
								size="sm"
								onClick={() => rollInitiative(r)}
							/>
							{r.kind !== 'character' && (
								<>
									{/* RC-SES-3.5 — count steppers. "Six goblins" is the single most common edit in
							    the builder and typing it into a number field on a phone is the worst
							    way to make it; −/+ are the pointer AND keyboard path (they are real
							    buttons), with the field still there for a jump to 12. */}
									<IconButton
										icon="remove"
										label={t('encounter.decreaseCount', { name: r.name })}
										variant="ghost"
										size="sm"
										aria-disabled={r.quantity <= 1 || undefined}
										onClick={() => {
											if (r.quantity <= 1) return;
											setQtyDrafts(({ [r.key]: _dropped, ...rest }) => rest);
											patchRow(r.key, { quantity: r.quantity - 1 });
										}}
									/>
									<label
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 5,
											font: `11px ${T.sans}`,
											color: T.ter,
										}}
									>
										×
										<Input
											type="number"
											min={1}
											max={20}
											value={qtyDrafts[r.key] ?? r.quantity}
											aria-label={t('encounter.quantityOf', { name: r.name })}
											style={{ width: 56, textAlign: 'center', fontFamily: T.mono }}
											onChange={(e: { target: { value: string } }) =>
												setQtyDrafts((d) => ({ ...d, [r.key]: e.target.value }))
											}
											onBlur={() => commitQty(r.key)}
											onKeyDown={(e: { key: string; preventDefault: () => void }) => {
												if (e.key === 'Enter') {
													e.preventDefault();
													commitQty(r.key);
												}
											}}
										/>
									</label>
									<IconButton
										icon="add"
										label={t('encounter.increaseCount', { name: r.name })}
										variant="ghost"
										size="sm"
										aria-disabled={r.quantity >= 20 || undefined}
										onClick={() => {
											if (r.quantity >= 20) return;
											setQtyDrafts(({ [r.key]: _dropped, ...rest }) => rest);
											patchRow(r.key, { quantity: r.quantity + 1 });
										}}
									/>
									{mode === 'start' && declaresChallenge && (
										<label
											style={{
												display: 'inline-flex',
												alignItems: 'center',
												gap: 5,
												font: `11px ${T.sans}`,
												color: T.ter,
											}}
										>
											{t('encounter.cr')}
											<Input
												type="number"
												min={0}
												step={0.25}
												value={crDrafts[r.key] ?? r.cr}
												aria-label={t('encounter.crOf', { name: r.name })}
												style={{ width: 62, textAlign: 'center', fontFamily: T.mono }}
												onChange={(e: { target: { value: string } }) =>
													setCrDrafts((d) => ({ ...d, [r.key]: e.target.value }))
												}
												onBlur={() => commitCr(r.key)}
												onKeyDown={(e: { key: string; preventDefault: () => void }) => {
													if (e.key === 'Enter') {
														e.preventDefault();
														commitCr(r.key);
													}
												}}
											/>
										</label>
									)}
									<IconButton
										icon={r.hidden ? 'visibility-hidden' : 'visibility-players'}
										label={
											r.hidden
												? t('encounter.startsHidden', { name: r.name })
												: t('encounter.startsVisible', { name: r.name })
										}
										variant="ghost"
										size="sm"
										aria-pressed={r.hidden}
										onClick={() => patchRow(r.key, { hidden: !r.hidden })}
									/>
								</>
							)}
							<IconButton
								icon="close"
								label={t('encounter.removeFromDraft', { name: r.name })}
								variant="ghost"
								size="sm"
								onClick={() => onRemove(r.key)}
							/>
						</div>
					))
				)}
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
					{mode === 'start'
						? t('encounter.initiativeNoteStart')
						: t('encounter.initiativeNoteReinforce')}
				</div>
			</div>
		</>
	);
}
