import { type ReactNode } from 'react';
import { Badge, Button, Field, Icon, Input, SpellSlots } from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import {
	availableClassResource,
	availableSlots,
	type ClassResource,
	type PreparedSpell,
	type SpellSlotLevel,
} from '@dndtools/core';
import { Panel, T, eb, mono } from '../../../app/screen-kit';
import { useI18n } from '../../../i18n';

/** The spellcasting panel — slot economy, class resources, known/prepared spells and the DM's
 * declare-slot / add-spell editors. Extracted from Characters.tsx unchanged (RC-STB-2.6). */
export function SpellsPanel({
	isDm,
	editMode,
	slots,
	classResources,
	spells,
	spellName,
	setSpellName,
	spellLevel,
	setSpellLevel,
	slotLevel,
	setSlotLevel,
	slotMax,
	setSlotMax,
	toggleSlot,
	togglePrepared,
	addSpell,
	declareSlots,
	fieldError,
}: {
	isDm: boolean;
	editMode: boolean;
	slots: SpellSlotLevel[];
	classResources: ClassResource[];
	spells: PreparedSpell[];
	spellName: string;
	setSpellName: (next: string) => void;
	spellLevel: string;
	setSpellLevel: (next: string) => void;
	slotLevel: string;
	setSlotLevel: (next: string) => void;
	slotMax: string;
	setSlotMax: (next: string) => void;
	toggleSlot: (level: number, max: number, expended: number, filled: boolean) => Promise<void>;
	togglePrepared: (spell: PreparedSpell) => Promise<void>;
	addSpell: () => Promise<void>;
	declareSlots: () => Promise<void>;
	fieldError: (field: 'ac' | 'slots' | 'xp') => ReactNode;
}) {
	const { t } = useI18n();
	return (
		<Panel title={t('characters.spellcasting')}>
			{slots.length > 0 && (
				// Live slot economy (character-sheet template: SpellSlots WITH onToggle) — a pip
				// click spends/recovers through character.set-spell-slots (CHAR-008, DM-or-owner,
				// no session gate). Read-only for any non-DM viewer of this DM sheet.
				<SpellSlots
					readOnly={!isDm}
					levels={slots.map((sl) => ({
						level: sl.level,
						total: sl.max,
						used: sl.max - availableSlots(sl),
					}))}
					onToggle={(level: number, _idx: number, filled: boolean) => {
						const sl = slots.find((s) => s.level === level);
						if (sl) toggleSlot(sl.level, sl.max, sl.max - availableSlots(sl), filled);
					}}
				/>
			)}
			{classResources.length > 0 && (
				<div
					style={{
						marginTop: slots.length ? 12 : 0,
						display: 'flex',
						flexDirection: 'column',
						gap: 6,
					}}
				>
					{classResources.map((r) => (
						<div
							key={r.id}
							style={{
								display: 'flex',
								justifyContent: 'space-between',
								font: `12.5px ${T.sans}`,
								color: T.sub,
							}}
						>
							<span>{r.name}</span>
							<span style={mono}>
								{availableClassResource(r)}/{r.max}
							</span>
						</div>
					))}
				</div>
			)}
			{spells.length > 0 && (
				<div style={{ marginTop: slots.length || classResources.length ? 12 : 0 }}>
					{/* WHAT the character can cast — resources.spells (CHAR-008 PreparedSpell).
									    The extended detail fields (school / casting time / range / components /
									    duration, set via character.set-spell) render as a meta line when present;
									    older {id,name,level,prepared} records show the name alone — no field is
									    ever fabricated. Prepared toggles via character.set-spell. */}
					<div style={{ ...eb, marginBottom: 6 }}>
						{t('characters.spellsPrepared', {
							count: spells.filter((s) => s.prepared).length,
						})}
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
						{spells.map((s) => (
							<div
								key={s.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '7px 10px',
									borderRadius: 9,
									border: `1px solid ${T.bd}`,
									background: T.surf,
								}}
							>
								<span
									style={{
										width: 24,
										height: 24,
										borderRadius: 6,
										flex: '0 0 auto',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										font: `700 12px ${T.mono}`,
										background: T.alt,
										color: T.acc,
									}}
									title={s.level === 0 ? 'Cantrip' : `Level ${s.level}`}
								>
									{s.level}
								</span>
								<span style={{ flex: 1, minWidth: 0 }}>
									<span style={{ display: 'block', font: `600 12.5px ${T.sans}` }}>{s.name}</span>
									{(s.school || s.castingTime || s.range || s.components || s.duration) && (
										<span
											style={{
												display: 'block',
												font: `11px ${T.sans}`,
												color: T.ter,
												marginTop: 1,
											}}
										>
											{[s.school, s.castingTime, s.range, s.components, s.duration]
												.filter(Boolean)
												.join(' · ')}
										</span>
									)}
								</span>
								{isDm ? (
									<button
										type="button"
										aria-pressed={s.prepared}
										// Name the SPELL: a caster's list renders a dozen of these, and
										// "Prepared, toggle button" ×12 gives a screen-reader user
										// browsing by control no way to tell which row they are on.
										// The visible text stays the prefix, so a substring `getByRole`
										// match still finds it.
										aria-label={`${s.prepared ? 'Prepared' : 'Not prepared'} — ${s.name}`}
										onClick={() => togglePrepared(s)}
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 5,
											// 3px padding round an 11px line made this ~21px tall, under
											// WCAG 2.5.8, on the highest-frequency toggle of the sheet.
											// Grown with PADDING plus a 24px floor (24 < the Android
											// 48dp rule, so this cannot shrink it there).
											padding: '6px 10px',
											minHeight: 24,
											boxSizing: 'border-box',
											borderRadius: 14,
											cursor: 'pointer',
											font: `11px ${T.sans}`,
											border: `1px solid ${s.prepared ? T.accBd : T.bd}`,
											background: s.prepared ? T.accSub : T.surf,
											color: s.prepared ? T.acc : T.ter,
										}}
									>
										{s.prepared && <Icon name="check" size={12} />}
										{s.prepared ? 'Prepared' : 'Not prepared'}
									</button>
								) : (
									<Badge status={s.prepared ? 'success' : 'neutral'}>
										{s.prepared ? 'Prepared' : 'Known'}
									</Badge>
								)}
							</div>
						))}
					</div>
				</div>
			)}
			{editMode && isDm && (
				<div
					style={{
						marginTop: 12,
						display: 'flex',
						flexDirection: 'column',
						gap: 10,
						borderTop: `1px solid ${T.bd}`,
						paddingTop: 12,
					}}
				>
					<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
						<Field label={t('characters.addSpell')} style={{ minWidth: 140, flex: 1 }}>
							<Input
								value={spellName}
								placeholder={t('characters.spellPlaceholder')}
								onChange={(e: DSChangeEvent) => setSpellName(e.target.value)}
							/>
						</Field>
						<Field label={t('characters.level')} style={{ width: 70 }}>
							<Input
								type="number"
								min={0}
								max={9}
								value={spellLevel}
								onChange={(e: DSChangeEvent) => setSpellLevel(e.target.value)}
							/>
						</Field>
						<Button variant="secondary" size="sm" disabled={!spellName.trim()} onClick={addSpell}>
							{t('common.action.add')}
						</Button>
					</div>
					<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
						<Field label={t('characters.slotLevel')} style={{ width: 90 }}>
							<Input
								type="number"
								min={0}
								max={9}
								value={slotLevel}
								onChange={(e: DSChangeEvent) => setSlotLevel(e.target.value)}
							/>
						</Field>
						<Field label={t('characters.maxSlots')} style={{ width: 90 }}>
							<Input
								type="number"
								min={0}
								value={slotMax}
								placeholder="0"
								onChange={(e: DSChangeEvent) => setSlotMax(e.target.value)}
							/>
						</Field>
						<Button
							variant="secondary"
							size="sm"
							disabled={slotMax.trim() === ''}
							onClick={declareSlots}
						>
							{t('characters.setSlots')}
						</Button>
						{fieldError('slots')}
					</div>
				</div>
			)}
		</Panel>
	);
}
