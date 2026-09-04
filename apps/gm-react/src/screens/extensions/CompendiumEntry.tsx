import { Button } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { formatCr, spellDuration } from '../../app/compendium/import';
import type { CompendiumMonster, CompendiumSpell } from '../../app/compendium/types';

/**
 * Compendium entry rendering — the per-entry primitives (meta lines, the duplicate-guarded import
 * control) and the two statblock detail panels the Compendium tab shows for the selected entry.
 */

/** The import affordances a detail panel needs, threaded down from the Compendium tab. */
export interface EntryImportProps {
	/** True when an entry of this name is already in the vault. */
	inVault: (name: string) => boolean;
	busyKey: string | null;
	confirmKey: string | null;
	setConfirmKey: (key: string | null) => void;
	importEntry: (entry: CompendiumMonster | CompendiumSpell) => Promise<void>;
	canWrite: boolean;
}

export const monsterMeta = (m: CompendiumMonster) =>
	`${m.size} ${m.type} · CR ${formatCr(m.cr)}${m.ac != null ? ` · AC ${m.ac}` : ''}${m.hp != null ? ` · HP ${m.hp}` : ''}`;
export const spellMeta = (s: CompendiumSpell) =>
	`${s.level === 0 ? 'Cantrip' : `Level ${s.level}`} ${s.school} · ${s.castingTime} · ${s.range}`;

const ABILITY_COLUMNS: Array<[label: string, key: string]> = [
	['STR', 'strength'],
	['DEX', 'dexterity'],
	['CON', 'constitution'],
	['INT', 'intelligence'],
	['WIS', 'wisdom'],
	['CHA', 'charisma'],
];

/** One labeled detail line in the entry panel (rendered only when there is a value). */
export function DetailLine({ label, value }: { label: string; value?: string | null }) {
	if (!value) return null;
	return (
		<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
			<span style={{ font: `600 12px ${T.sans}`, color: T.ink }}>{label}. </span>
			{value}
		</div>
	);
}

/**
 * The import control with the duplicate guard: a same-name entry already in the vault flips the
 * button into an explicit two-step "Import again → Import copy / Keep" confirm — never silent.
 */
export function ImportControl({
	name,
	inVault,
	busy,
	disabled,
	confirming,
	onConfirmChange,
	onImport,
	size = 'sm',
}: {
	name: string;
	inVault: boolean;
	busy: boolean;
	disabled: boolean;
	confirming: boolean;
	onConfirmChange: (on: boolean) => void;
	onImport: () => void;
	size?: 'sm' | 'md';
}) {
	if (inVault && confirming) {
		return (
			<span style={{ display: 'inline-flex', gap: 6 }}>
				{/* The "Import again" button that raised this confirm unmounts itself, so focus fell to
				    <body> and a keyboard user had to Tab in from the top of the page to answer it. */}
				<Button
					variant="danger"
					size={size}
					autoFocus
					disabled={disabled || busy}
					onClick={onImport}
				>
					Import copy
				</Button>
				<Button variant="ghost" size={size} onClick={() => onConfirmChange(false)}>
					Keep
				</Button>
			</span>
		);
	}
	if (inVault) {
		return (
			<Button
				variant="ghost"
				size={size}
				icon="import"
				disabled={disabled || busy}
				aria-label={`Import ${name} again (already in vault)`}
				onClick={() => onConfirmChange(true)}
			>
				Import again
			</Button>
		);
	}
	return (
		<Button
			variant="secondary"
			size={size}
			icon="import"
			disabled={disabled || busy}
			onClick={onImport}
		>
			{busy ? 'Importing…' : 'Import'}
		</Button>
	);
}

export function MonsterDetail({
	monster,
	imports: { inVault, busyKey, confirmKey, setConfirmKey, importEntry, canWrite },
}: {
	monster: CompendiumMonster;
	imports: EntryImportProps;
}) {
	const m = monster;
	const scores = m.abilityScores;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
			<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
				{monsterMeta(m)} · {m.alignment}
			</div>
			{scores && (
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
					{ABILITY_COLUMNS.map(([label, key]) => (
						<div
							key={key}
							style={{
								textAlign: 'center',
								padding: '6px 2px',
								border: `1px solid ${T.bd}`,
								borderRadius: 8,
								background: T.surf,
							}}
						>
							<div style={{ font: `600 10px ${T.sans}`, color: T.ter }}>{label}</div>
							<div style={{ font: `600 13px ${T.mono}` }}>{scores[key] ?? '—'}</div>
						</div>
					))}
				</div>
			)}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
				<DetailLine
					label="Armor Class"
					value={m.ac != null ? `${m.ac}${m.acDetail ? ` (${m.acDetail})` : ''}` : undefined}
				/>
				<DetailLine
					label="Hit Points"
					value={m.hp != null ? `${m.hp}${m.hitDice ? ` (${m.hitDice})` : ''}` : undefined}
				/>
				<DetailLine
					label="Speed"
					value={
						Object.entries(m.speed ?? {})
							.filter(([, v]) => typeof v === 'number' && v > 0)
							.map(([mode, v]) => `${mode} ${v} ft.`)
							.join(', ') || undefined
					}
				/>
				<DetailLine
					label="Senses"
					value={
						[
							...Object.entries(m.senses ?? {}).map(([s, r]) => `${s} ${r} ft.`),
							...(m.passivePerception != null ? [`passive Perception ${m.passivePerception}`] : []),
						].join(', ') || undefined
					}
				/>
				<DetailLine label="Languages" value={m.languages} />
				<DetailLine label="Damage immunities" value={m.damageImmunities} />
				<DetailLine label="Damage resistances" value={m.damageResistances} />
				<DetailLine label="Condition immunities" value={m.conditionImmunities} />
			</div>
			{((m.traits?.length ?? 0) > 0 || (m.actions?.length ?? 0) > 0) && (
				// Text-only bounded scroller: without a tab stop a keyboard user
				// cannot read past 300px of a statblock they are about to import
				// (WCAG 2.1.1), and axe flags `scrollable-region-focusable`.
				<div
					tabIndex={0}
					role="group"
					aria-label="Traits and actions"
					style={{
						maxHeight: 300,
						overflowY: 'auto',
						display: 'flex',
						flexDirection: 'column',
						gap: 8,
						padding: '10px 12px',
						border: `1px solid ${T.bd}`,
						borderRadius: 10,
						background: T.surf,
					}}
				>
					{(m.traits ?? []).map((t) => (
						<div key={`t-${t.name}`} style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
							<span style={{ font: `600 italic 12px ${T.sans}`, color: T.ink }}>{t.name}. </span>
							{t.desc}
						</div>
					))}
					{(m.actions ?? []).length > 0 && <div style={{ ...eb, marginTop: 2 }}>Actions</div>}
					{(m.actions ?? []).map((a) => (
						<div key={`a-${a.name}`} style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
							<span style={{ font: `600 12px ${T.sans}`, color: T.ink }}>
								{a.name}
								{a.actionType === 'LEGENDARY_ACTION' ? ' (legendary)' : ''}.{' '}
							</span>
							{a.desc}
						</div>
					))}
				</div>
			)}
			<ImportControl
				name={m.name}
				inVault={inVault(m.name)}
				busy={busyKey === m.key}
				disabled={!canWrite || (busyKey !== null && busyKey !== m.key)}
				confirming={confirmKey === m.key}
				onConfirmChange={(on) => setConfirmKey(on ? m.key : null)}
				onImport={() => void importEntry(m)}
				size="md"
			/>
		</div>
	);
}

export function SpellDetail({
	spell,
	imports: { inVault, busyKey, confirmKey, setConfirmKey, importEntry, canWrite },
}: {
	spell: CompendiumSpell;
	imports: EntryImportProps;
}) {
	const s = spell;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
			<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
				{spellMeta(s)}
				{s.ritual ? ' · ritual' : ''}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
				<DetailLine label="Casting time" value={s.castingTime} />
				<DetailLine label="Range" value={s.range} />
				<DetailLine label="Components" value={s.components} />
				<DetailLine label="Duration" value={spellDuration(s)} />
				<DetailLine label="Classes" value={s.classes?.join(', ')} />
			</div>
			<div
				tabIndex={0}
				role="group"
				aria-label="Spell description"
				style={{
					maxHeight: 300,
					overflowY: 'auto',
					font: `12.5px/1.6 ${T.sans}`,
					color: T.sub,
					padding: '10px 12px',
					border: `1px solid ${T.bd}`,
					borderRadius: 10,
					background: T.surf,
					whiteSpace: 'pre-line',
				}}
			>
				{s.desc}
				{s.higherLevel ? `\n\nAt higher levels. ${s.higherLevel}` : ''}
			</div>
			<ImportControl
				name={s.name}
				inVault={inVault(s.name)}
				busy={busyKey === s.key}
				disabled={!canWrite || (busyKey !== null && busyKey !== s.key)}
				confirming={confirmKey === s.key}
				onConfirmChange={(on) => setConfirmKey(on ? s.key : null)}
				onImport={() => void importEntry(s)}
				size="md"
			/>
		</div>
	);
}
