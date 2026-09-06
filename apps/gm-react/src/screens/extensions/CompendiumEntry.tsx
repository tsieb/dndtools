import { Button } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { formatCr, spellDuration } from '../../app/compendium/import';
import type { MonsterFieldReport } from '../../app/compendium/import';
import type { CompendiumMonster, CompendiumSpell } from '../../app/compendium/types';
import { useI18n, type MessageKey, type MessageValues } from '../../i18n';

type Translate = (key: MessageKey, values?: MessageValues) => string;

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
	/**
	 * RC-SYS-2.5 — how the ACTIVE system package's creature schema fits this monster. `null` for a
	 * spell (spells are vault objects, not creatures).
	 */
	monsterFit: (monster: CompendiumMonster) => MonsterFieldReport;
}

export const monsterMeta = (m: CompendiumMonster) =>
	`${m.size} ${m.type} · CR ${formatCr(m.cr)}${m.ac != null ? ` · AC ${m.ac}` : ''}${m.hp != null ? ` · HP ${m.hp}` : ''}`;
export const spellMeta = (s: CompendiumSpell, t: Translate) =>
	`${
		s.level === 0
			? t('extensions.compendium.cantrip')
			: t('extensions.compendium.levelValue', { level: s.level })
	} ${s.school} · ${s.castingTime} · ${s.range}`;

// The ability abbreviations are rules vocabulary rather than interface copy — they come from the
// system, not from this screen. See the HANDOFF in the commit that migrated `screens/player/`.
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
	const { t } = useI18n();
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
					{t('extensions.compendium.importCopy')}
				</Button>
				<Button variant="ghost" size={size} onClick={() => onConfirmChange(false)}>
					{t('extensions.compendium.keep')}
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
				aria-label={t('extensions.compendium.importAgainLabel', { name })}
				onClick={() => onConfirmChange(true)}
			>
				{t('extensions.compendium.importAgain')}
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
			{busy ? t('extensions.compendium.importing') : t('extensions.compendium.import')}
		</Button>
	);
}

/**
 * RC-SYS-2.5 — the import FIELD REPORT: what the campaign's active rules system does and does not
 * have a place for in this statblock.
 *
 * A 5e monster carries more than most systems declare. Rather than importing it and quietly losing
 * the difference, the preview names the facts that have no home BEFORE the DM commits, and when the
 * system requires a creature field a 5e statblock cannot answer, the import refuses outright — the
 * button is disabled and the reason is on screen (no dead control, no fake success).
 */
function FieldReport({ report }: { report: MonsterFieldReport }) {
	const { t } = useI18n();
	if (report.canHold && report.unmapped.length === 0) return null;
	const refuses = !report.canHold;
	return (
		<div
			role="note"
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 4,
				padding: '8px 10px',
				border: `1px solid ${refuses ? T.err : T.bd}`,
				borderRadius: 10,
				background: T.surf,
			}}
		>
			<div style={{ font: `600 12px ${T.sans}`, color: refuses ? T.err : T.ink }}>
				{refuses
					? t('extensions.compendium.fitRefused')
					: t('extensions.compendium.fitPartial', { count: report.unmapped.length })}
			</div>
			{refuses && (
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
					{t('extensions.compendium.fitMissing', {
						fields: report.missingRequired.map((f) => f.label).join(', '),
					})}
				</div>
			)}
			{report.unmapped.length > 0 && (
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
					{t('extensions.compendium.fitUnmapped', {
						fields: report.unmapped.map((f) => f.label).join(', '),
					})}
				</div>
			)}
		</div>
	);
}

export function MonsterDetail({
	monster,
	imports: { inVault, busyKey, confirmKey, setConfirmKey, importEntry, canWrite, monsterFit },
}: {
	monster: CompendiumMonster;
	imports: EntryImportProps;
}) {
	const { t } = useI18n();
	const m = monster;
	const scores = m.abilityScores;
	// RC-SYS-2.5 — what this campaign's rules system can actually keep of a 5e statblock.
	const fit = monsterFit(m);
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
					label={t('extensions.compendium.armorClass')}
					value={m.ac != null ? `${m.ac}${m.acDetail ? ` (${m.acDetail})` : ''}` : undefined}
				/>
				<DetailLine
					label={t('extensions.compendium.hitPoints')}
					value={m.hp != null ? `${m.hp}${m.hitDice ? ` (${m.hitDice})` : ''}` : undefined}
				/>
				<DetailLine
					label={t('extensions.compendium.speed')}
					value={
						Object.entries(m.speed ?? {})
							.filter(([, v]) => typeof v === 'number' && v > 0)
							.map(([mode, v]) =>
								t('extensions.compendium.feet', { label: mode, value: v as number }),
							)
							.join(', ') || undefined
					}
				/>
				<DetailLine
					label={t('extensions.compendium.senses')}
					value={
						[
							...Object.entries(m.senses ?? {}).map(([sense, range]) =>
								t('extensions.compendium.feet', { label: sense, value: range }),
							),
							...(m.passivePerception != null
								? [t('extensions.compendium.passivePerception', { value: m.passivePerception })]
								: []),
						].join(', ') || undefined
					}
				/>
				<DetailLine label={t('extensions.compendium.languages')} value={m.languages} />
				<DetailLine
					label={t('extensions.compendium.damageImmunities')}
					value={m.damageImmunities}
				/>
				<DetailLine
					label={t('extensions.compendium.damageResistances')}
					value={m.damageResistances}
				/>
				<DetailLine
					label={t('extensions.compendium.conditionImmunities')}
					value={m.conditionImmunities}
				/>
			</div>
			{((m.traits?.length ?? 0) > 0 || (m.actions?.length ?? 0) > 0) && (
				// Text-only bounded scroller: without a tab stop a keyboard user
				// cannot read past 300px of a statblock they are about to import
				// (WCAG 2.1.1), and axe flags `scrollable-region-focusable`.
				<div
					tabIndex={0}
					role="group"
					aria-label={t('extensions.compendium.traitsActions')}
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
					{(m.traits ?? []).map((trait) => (
						<div key={`t-${trait.name}`} style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
							<span style={{ font: `600 italic 12px ${T.sans}`, color: T.ink }}>
								{trait.name}.{' '}
							</span>
							{trait.desc}
						</div>
					))}
					{(m.actions ?? []).length > 0 && (
						<div style={{ ...eb, marginTop: 2 }}>{t('extensions.compendium.actions')}</div>
					)}
					{(m.actions ?? []).map((a) => (
						<div key={`a-${a.name}`} style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
							<span style={{ font: `600 12px ${T.sans}`, color: T.ink }}>
								{a.name}
								{a.actionType === 'LEGENDARY_ACTION'
									? ` (${t('extensions.compendium.legendary')})`
									: ''}
								.{' '}
							</span>
							{a.desc}
						</div>
					))}
				</div>
			)}
			<FieldReport report={fit} />
			<ImportControl
				name={m.name}
				inVault={inVault(m.name)}
				busy={busyKey === m.key}
				disabled={!canWrite || !fit.canHold || (busyKey !== null && busyKey !== m.key)}
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
	const { t } = useI18n();
	const s = spell;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
			<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
				{spellMeta(s, t)}
				{s.ritual ? ` · ${t('extensions.compendium.ritual')}` : ''}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
				<DetailLine label={t('extensions.compendium.castingTime')} value={s.castingTime} />
				<DetailLine label={t('extensions.compendium.range')} value={s.range} />
				<DetailLine label={t('extensions.compendium.components')} value={s.components} />
				<DetailLine label={t('extensions.compendium.duration')} value={spellDuration(s)} />
				<DetailLine label={t('extensions.compendium.classes')} value={s.classes?.join(', ')} />
			</div>
			<div
				tabIndex={0}
				role="group"
				aria-label={t('extensions.compendium.spellDescription')}
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
				{s.higherLevel ? `\n\n${t('extensions.compendium.higherLevels')} ${s.higherLevel}` : ''}
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
