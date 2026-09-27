import { useState, type ReactNode } from 'react';
import type { CharacterInventory, CharacterView, EncumbranceState } from '@dndtools/core';
import { ABILITY_IDS, SKILLS } from '../../app/charImport/skills';
import { AbilityScore, Button, DefinitionList, Field, Icon, Input, Textarea } from '../../ds';
import type { DSChangeEvent } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { useViewport } from '../../app/useViewport';
import { ABIL_ORDER, abilMod, sgn } from '../../app/character/abilities';
import { ABIL_FULL, ABIL_LABEL, cap, type Dispatch } from './shared';
import { PlayerEquipment } from './Equipment';
import './sheet.css';

// ── Sheet — real abilities, attacks, identity fields (edit-field) + one labeled honest gap ────────
const IDENTITY_FIELDS: { key: string; label: MessageKey; hint?: MessageKey }[] = [
	{ key: 'race', label: 'player.sheet.race' },
	{ key: 'subclass', label: 'player.sheet.subclass' },
	{ key: 'background', label: 'player.sheet.background' },
	{ key: 'speed', label: 'player.sheet.speed' },
	{ key: 'init', label: 'player.sheet.init', hint: 'player.sheet.initHint' },
];

export function PlayerSheet({
	C,
	level,
	isDm,
	charId,
	actorId,
	passive,
	profBonus,
	inventory,
	encumbrance,
	canManageInventory,
	dispatch,
	combat,
	spellcasting,
}: {
	combat?: ReactNode;
	spellcasting?: ReactNode;
	C: CharacterView;
	level: number | null;
	isDm: boolean;
	charId: string;
	actorId: string;
	/** Pure derived reads (passivePerception / effectiveProficiencyBonus), computed post-gate. */
	passive: number | null;
	profBonus: number | null;
	/** I10 S10.1.3 / S10.4.2 — structured inventory + derived encumbrance, plus the owner-or-DM gate. */
	inventory: CharacterInventory | null;
	encumbrance: EncumbranceState | null;
	canManageInventory: boolean;
	dispatch: Dispatch;
}) {
	const { t } = useI18n();
	const viewport = useViewport();
	const isPhone = viewport === 'phone';
	const [editing, setEditing] = useState(false);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [backstoryDraft, setBackstoryDraft] = useState<string | null>(null);

	const dataStr = (key: string): string | null => {
		const v = C.data?.[key];
		return typeof v === 'string' && v.trim() !== '' ? v : null;
	};

	const startEdit = () => {
		setDrafts(Object.fromEntries(IDENTITY_FIELDS.map((f) => [f.key, dataStr(f.key) ?? ''])));
		setEditing(true);
	};
	// Save each CHANGED identity field through the real `character.edit-field` data.* write path.
	const saveEdit = async () => {
		for (const f of IDENTITY_FIELDS) {
			const next = (drafts[f.key] ?? '').trim();
			if (next === (dataStr(f.key) ?? '')) continue;
			const ok = await dispatch({
				type: 'character.edit-field',
				actorId,
				payload: { characterId: charId, path: `data.${f.key}`, value: next },
			});
			if (!ok) return; // stop on the first rejection; the error banner explains why
		}
		setEditing(false);
	};
	const saveBackstory = async () => {
		if (backstoryDraft === null) return;
		if (
			await dispatch({
				type: 'character.edit-field',
				actorId,
				payload: { characterId: charId, path: 'data.backstory', value: backstoryDraft.trim() },
			})
		) {
			setBackstoryDraft(null);
		}
	};

	// Abilities — REAL scores from the Core character view only; an absent score renders as '—'.
	const abilities = ABIL_ORDER.map((key) => {
		const score = (C.abilityScores as Record<string, number | undefined>)[key];
		return { key: ABIL_LABEL[key], score };
	});
	const cls = dataStr('class');
	const backstory = dataStr('backstory');

	// Structured proficiencies from the (redacted, player-safe) view — mirrors the roster sheet's
	// panels. Honest empty state when the character carries no proficiency data at all.
	const prof = C.proficiencies;
	const hasProficiencyData =
		Object.keys(prof.skills).length > 0 ||
		prof.saves.length > 0 ||
		prof.proficiencyBonus !== null ||
		prof.hitDice.total > 0;
	const abilScore = (id: string) =>
		(C.abilityScores as Record<string, number | undefined>)[id] ?? 10;

	return (
		<div className="character-sheet" data-testid="character-sheet">
			<div className="character-sheet-column">
				<Panel title={t('characters.abilityScores')} pad={18}>
					<div className="character-sheet-abilities">
						{abilities.map((a) => (
							<AbilityScore
								key={a.key}
								label={a.key}
								score={a.score ?? null}
								aria-label={ABIL_FULL[a.key]}
							/>
						))}
					</div>
					<dl className="character-sheet-summary">
						<div>
							<dt>{t('player.sheet.proficiency')}</dt>
							<dd>{profBonus === null ? '—' : sgn(profBonus)}</dd>
						</div>
						<div>
							<dt>{t('player.sheet.passivePerception')}</dt>
							<dd>{passive ?? '—'}</dd>
						</div>
						<div>
							<dt>{t('player.sheet.hitDice')}</dt>
							<dd>
								{prof.hitDice.total - prof.hitDice.spent}/{prof.hitDice.total} {prof.hitDice.die}
							</dd>
						</div>
					</dl>
				</Panel>
				<Panel title={t('player.sheet.savingThrows')} pad={18}>
					<DefinitionList
						items={ABILITY_IDS.map((a) => ({
							label: ABIL_FULL[a.toUpperCase()],
							value:
								C.abilityScores[a] == null
									? '—'
									: sgn(abilMod(abilScore(a)) + (prof.saves.includes(a) ? (profBonus ?? 0) : 0)),
							mono: true,
						}))}
					/>
				</Panel>
				<Panel title={t('player.sheet.skills')} pad={18}>
					{hasProficiencyData ? (
						<DefinitionList
							items={SKILLS.map((skill) => {
								const rank = prof.skills[skill.id] ?? 'none';
								return {
									label: `${skill.label}${rank === 'expertise' ? ' ★' : rank === 'proficient' ? ' •' : ''}`,
									value:
										C.abilityScores[skill.ability] == null
											? '—'
											: sgn(
													abilMod(abilScore(skill.ability)) +
														(rank === 'expertise' ? 2 : rank === 'proficient' ? 1 : 0) *
															(profBonus ?? 0),
												),
									mono: true,
								};
							})}
						/>
					) : (
						<p>{t('player.sheet.noProficiencies')}</p>
					)}
					<p className="character-sheet-hint">{t('player.sheet.proficiencyLegend')}</p>
				</Panel>
			</div>
			<div className="character-sheet-column">
				{combat}
				{spellcasting}
				<div className="character-sheet-column">
					<Panel
						title={t('player.sheet.identity')}
						pad={14}
						action={
							isDm ? (
								editing ? (
									<div style={{ display: 'flex', gap: 6 }}>
										<Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
											{t('common.action.cancel')}
										</Button>
										<Button variant="primary" size="sm" onClick={saveEdit}>
											{t('common.action.save')}
										</Button>
									</div>
								) : (
									<Button variant="secondary" size="sm" icon="note-edit" onClick={startEdit}>
										{t('common.action.edit')}
									</Button>
								)
							) : undefined
						}
					>
						{editing ? (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
								{IDENTITY_FIELDS.map((f) => (
									<Field key={f.key} label={t(f.label)}>
										<Input
											value={drafts[f.key] ?? ''}
											placeholder={f.hint ? t(f.hint) : undefined}
											onChange={(e: DSChangeEvent) =>
												setDrafts((d) => ({ ...d, [f.key]: e.target.value }))
											}
										/>
									</Field>
								))}
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
									{t('player.sheet.editNote')}
								</div>
							</div>
						) : (
							<DefinitionList
								layout={isPhone ? 'stacked' : 'rows'}
								items={[
									{ label: t('player.sheet.class'), value: cls ? cap(cls) : '—' },
									{
										label: t('player.sheet.level'),
										value: level != null ? String(level) : '—',
										mono: true,
									},
									...IDENTITY_FIELDS.map((f) => ({
										label: t(f.label),
										value: dataStr(f.key) ? cap(dataStr(f.key)!) : '—',
									})),
								]}
							/>
						)}
					</Panel>
					<Panel title={t('player.sheet.attacks')} pad={14}>
						{C.attacks.length === 0 ? (
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
								{t('player.sheet.noAttacks')}
							</div>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column' }}>
								{C.attacks.map((a, i) => (
									<div
										key={a.id ?? i}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 10,
											padding: '8px 2px',
											borderTop: i ? `1px solid ${T.bd}` : 'none',
										}}
									>
										<Icon name="session-bolt" size={15} color={T.acc} />
										<span style={{ flex: 1, font: `600 12.5px ${T.sans}` }}>{a.name}</span>
										<span style={{ font: `11.5px ${T.mono}`, color: T.sub }}>{a.detail}</span>
									</div>
								))}
							</div>
						)}
					</Panel>
				</div>
				<Panel
					title={t('player.sheet.backstory')}
					action={
						isDm && backstoryDraft === null ? (
							<Button
								variant="secondary"
								size="sm"
								icon="note-edit"
								onClick={() => setBackstoryDraft(backstory ?? '')}
							>
								{t('common.action.edit')}
							</Button>
						) : undefined
					}
				>
					{backstoryDraft !== null ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
							<Textarea
								rows={4}
								aria-label={t('player.sheet.backstory')}
								value={backstoryDraft}
								onChange={(e: DSChangeEvent) => setBackstoryDraft(e.target.value)}
								placeholder={t('player.sheet.backstoryPlaceholder')}
							/>
							<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
								<Button variant="ghost" size="sm" onClick={() => setBackstoryDraft(null)}>
									{t('common.action.cancel')}
								</Button>
								<Button variant="primary" size="sm" onClick={saveBackstory}>
									{t('common.action.save')}
								</Button>
							</div>
						</div>
					) : backstory ? (
						<div style={{ font: `13px/1.6 ${T.sans}`, color: T.sub, whiteSpace: 'pre-wrap' }}>
							{backstory}
						</div>
					) : (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							{t('player.sheet.noBackstory')}
						</div>
					)}
				</Panel>
				{/* Skills / saves / hit dice / passive perception — the view's structured `proficiencies`
				    block (player-safe: read through the redacted view + post-gate pure queries), the same
				    slice the roster sheet renders. */}

				{/* I10 S10.1.3 / S10.4.2 — REAL structured equipment / currency / encumbrance, core-backed. */}
				<PlayerEquipment
					charId={charId}
					actorId={actorId}
					inventory={inventory}
					encumbrance={encumbrance}
					canManage={canManageInventory}
					dispatch={dispatch}
				/>
			</div>
		</div>
	);
}
