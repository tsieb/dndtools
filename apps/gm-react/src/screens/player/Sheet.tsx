import { useState } from 'react';
import type { CharacterInventory, CharacterView, EncumbranceState } from '@dndtools/core';
import { ABILITY_IDS, SKILLS } from '../../app/charImport/skills';
import { Button, DefinitionList, Field, Icon, Input, Stat, Textarea } from '../../ds';
import type { DSChangeEvent } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { useViewport } from '../../app/useViewport';
import { ABIL_ORDER, abilMod, sgn } from '../../app/character/abilities';
import { ABIL_FULL, ABIL_LABEL, cap, type Dispatch } from './shared';
import { PlayerEquipment } from './Equipment';

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
}: {
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
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : 'auto 1fr',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<div
				style={{
					display: isPhone ? 'grid' : 'flex',
					gridTemplateColumns: isPhone ? 'repeat(3, 1fr)' : undefined,
					flexDirection: 'column',
					gap: 10,
					width: isPhone ? 'auto' : 120,
				}}
			>
				{abilities.map((a) => (
					<div
						key={a.key}
						style={{
							minWidth: 0,
							textAlign: 'center',
							padding: '10px 6px',
							borderRadius: 11,
							border: `1px solid ${T.bd}`,
							background: T.surf,
						}}
					>
						<div style={{ ...eb, color: T.ter, overflowWrap: 'anywhere' }}>{ABIL_FULL[a.key]}</div>
						<div style={{ font: `700 24px ${T.mono}`, lineHeight: 1 }}>
							{a.score !== undefined ? sgn(abilMod(a.score)) : '—'}
						</div>
						<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: 2 }}>
							{a.score ?? '—'}
						</div>
					</div>
				))}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: isPhone ? '1fr' : '1.1fr 1fr',
						gap: 16,
						alignItems: 'start',
					}}
				>
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
				<Panel title={t('player.sheet.skillsAndSaves')}>
					{hasProficiencyData && profBonus !== null ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
							<div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
								<Stat label={t('player.sheet.proficiency')} value={sgn(profBonus)} />
								{passive !== null && (
									<Stat
										label={t('player.sheet.passivePerception')}
										value={String(passive)}
										icon="visibility-players"
									/>
								)}
								{prof.hitDice.total > 0 && (
									<Stat
										label={t('player.sheet.hitDice')}
										value={`${prof.hitDice.total - prof.hitDice.spent}/${prof.hitDice.total} ${prof.hitDice.die}`}
									/>
								)}
							</div>
							<div>
								<div style={{ ...eb, marginBottom: 6 }}>{t('player.sheet.savingThrows')}</div>
								<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
									{ABILITY_IDS.map((a) => {
										const proficient = prof.saves.includes(a);
										const bonus = abilMod(abilScore(a)) + (proficient ? profBonus : 0);
										return (
											<span
												key={a}
												style={{
													display: 'inline-flex',
													alignItems: 'center',
													gap: 6,
													padding: '4px 10px',
													borderRadius: 16,
													font: `12px ${T.sans}`,
													border: `1px solid ${proficient ? T.accBd : T.bd}`,
													background: proficient ? T.accSub : T.surf,
													color: proficient ? T.acc : T.ter,
												}}
											>
												{a.toUpperCase()}
												<span style={{ font: `12px ${T.mono}` }}>{sgn(bonus)}</span>
											</span>
										);
									})}
								</div>
							</div>
							<div>
								<div style={{ ...eb, marginBottom: 6 }}>{t('player.sheet.skills')}</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 18px' }}>
									{SKILLS.map((s) => {
										const skillLevel = prof.skills[s.id] ?? 'none';
										const bonus =
											abilMod(abilScore(s.ability)) +
											(skillLevel === 'expertise'
												? profBonus * 2
												: skillLevel === 'proficient'
													? profBonus
													: 0);
										return (
											<div
												key={s.id}
												style={{
													display: 'flex',
													alignItems: 'center',
													gap: 8,
													font: `12.5px ${T.sans}`,
													color: skillLevel === 'none' ? T.ter : T.ink,
												}}
											>
												<span
													aria-hidden
													style={{
														width: 8,
														height: 8,
														borderRadius: '50%',
														flex: '0 0 auto',
														background: skillLevel === 'none' ? 'transparent' : T.acc,
														border: `1.5px solid ${skillLevel === 'none' ? T.bdS : T.acc}`,
													}}
												/>
												<span style={{ flex: 1, minWidth: 0 }}>
													{s.label}
													{skillLevel === 'expertise' ? ' ★' : ''}
												</span>
												<span style={{ font: `12px ${T.mono}` }}>{sgn(bonus)}</span>
											</div>
										);
									})}
								</div>
								<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 8 }}>
									{t('player.sheet.proficiencyLegend')}
								</div>
							</div>
						</div>
					) : (
						// Honest empty state — no proficiency data on this character yet, nothing is faked.
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							{t('player.sheet.noProficiencies')}
						</div>
					)}
				</Panel>
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
