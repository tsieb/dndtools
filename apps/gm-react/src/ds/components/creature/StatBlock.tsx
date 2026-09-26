import { dsCopy } from '../../copy';

export interface Feature {
	name: React.ReactNode;
	text: React.ReactNode;
}

export interface StatBlockProps extends React.HTMLAttributes<HTMLElement> {
	attributes?: readonly { key: string; abbreviation?: string; label?: string }[];
	/** Creature name — set in the Cinzel display serif. */
	name: React.ReactNode;
	/** Italic type line, e.g. "Medium humanoid (human), lawful evil". */
	meta?: React.ReactNode;
	ac?: React.ReactNode;
	/** Parenthetical after AC, e.g. "(natural armor)". */
	acNote?: React.ReactNode;
	hp?: number;
	/** Parenthetical HP dice, e.g. "(8d8 + 16)". */
	hpFormula?: React.ReactNode;
	speed?: React.ReactNode;
	/** Raw ability scores. */
	abilities?: Record<string, number | undefined>;
	saves?: React.ReactNode;
	skills?: React.ReactNode;
	resistances?: React.ReactNode;
	immunities?: React.ReactNode;
	conditionImmunities?: React.ReactNode;
	senses?: React.ReactNode;
	languages?: React.ReactNode;
	/** Challenge rating, e.g. "5". Renders the corner CR badge and the Challenge line (with `xp`). */
	cr?: React.ReactNode;
	xp?: React.ReactNode;
	proficiency?: React.ReactNode;
	traits?: Feature[];
	actions?: Feature[];
	bonusActions?: Feature[];
	reactions?: Feature[];
	legendaryActions?: Feature[];
	legendaryIntro?: React.ReactNode;
	/** Overlay an editable combat HP track on the block — same creature, mid-fight. */
	live?: { current: number; max?: number };
	/** Flag a hidden NPC with the purple DM-only visibility cue. */
	dmOnly?: boolean;
}

import React from 'react';
import { AbilityScore } from './AbilityScore';
import { Icon } from '../core/Icon';
import { VisibilityChip } from '../feedback/VisibilityChip';
import { HPBar } from '../domain/HPBar';

/**
 * RC-SYS-2.5 — the fallback attribute row, used ONLY when a caller passes no `attributes`. The keys
 * match the `abilities` prop's existing 5e short keys so an un-migrated caller renders unchanged.
 */
const DEFAULT_ATTRIBUTES: NonNullable<StatBlockProps['attributes']> = Object.freeze([
	{ key: 'str', abbreviation: 'STR' },
	{ key: 'dex', abbreviation: 'DEX' },
	{ key: 'con', abbreviation: 'CON' },
	{ key: 'int', abbreviation: 'INT' },
	{ key: 'wis', abbreviation: 'WIS' },
	{ key: 'cha', abbreviation: 'CHA' },
]);

/** Tapered gold rule — the classic statblock separator. */
function Rule() {
	return (
		<div
			aria-hidden="true"
			style={{
				height: 4,
				margin: 'var(--space-2) 0',
				background:
					'linear-gradient(90deg, var(--color-accent), var(--color-accent-border) 60%, transparent)',
				clipPath: 'polygon(0 0, 100% 35%, 100% 65%, 0 100%)',
			}}
		/>
	);
}

/** One "Property: value" line (Saving Throws, Senses, Languages, …). */
function Property({ label, children }: { label: React.ReactNode; children?: React.ReactNode }) {
	if (children === undefined || children === null || children === '') return null;
	return (
		<p
			style={{
				margin: 0,
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-sm)',
				lineHeight: 1.5,
				color: 'var(--color-text-secondary)',
			}}
		>
			<strong style={{ color: 'var(--color-accent)', fontWeight: 'var(--font-weight-semibold)' }}>
				{label}{' '}
			</strong>
			<span
				style={{
					fontFamily: /Challenge|Proficiency|Hit Points|Armor|Speed/.test(String(label))
						? 'var(--font-mono)'
						: 'var(--font-sans)',
				}}
			>
				{children}
			</span>
		</p>
	);
}

/** A named feature paragraph (trait / action / reaction). Name is bold-italic per 5e convention. */
function Feature({ name, text }: Feature) {
	return (
		<p
			style={{
				margin: 0,
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-sm)',
				lineHeight: 1.55,
				color: 'var(--color-text-primary)',
			}}
		>
			<strong style={{ fontStyle: 'italic', fontWeight: 'var(--font-weight-bold)' }}>
				{name}.{' '}
			</strong>
			<span style={{ color: 'var(--color-text-secondary)' }}>{text}</span>
		</p>
	);
}

function SectionLabel({ children }: { children?: React.ReactNode }) {
	return (
		<div style={{ marginTop: 'var(--space-1)' }}>
			<span
				style={{
					fontFamily: 'var(--font-display)',
					fontSize: 'var(--text-md)',
					fontWeight: 'var(--font-weight-semibold)',
					color: 'var(--color-accent)',
				}}
			>
				{children}
			</span>
			<div
				style={{ height: 1, background: 'var(--color-accent-border)', marginTop: 'var(--space-1)' }}
			/>
		</div>
	);
}

function FeatureList({ items = [] }: { items?: Feature[] }) {
	if (!items.length) return null;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
			{items.map((f, i) => (
				<Feature key={i} name={f.name} text={f.text} />
			))}
		</div>
	);
}

/**
 * StatBlock — the iconic creature/NPC reference card a DM pulls up while building an encounter or
 * running combat. Cinzel name + italic meta line, a tinted defenses band (AC · HP · Speed), the
 * ability cells, a property list, then traits / actions / reactions / legendary actions, separated
 * by the tapered gold rules. Numbers are mono; `dmOnly` flags hidden NPCs with the purple cue.
 * Pass `live` HP to overlay an editable HP track on top — the same creature, mid-fight.
 *
 * RC-SYS-2.5 — the card carries no rules of its own. `attributes` is the ACTIVE system package's
 * `attributes[]` (`{ key, abbreviation | label }`), so a system with three approaches draws three
 * cells and a system with none draws no grid at all; it defaults to the 5e six only so a caller that
 * has no package to hand still renders. Likewise `cr` / `xp`: a system whose creature schema
 * declares no challenge rating passes neither, and the CR badge and the Challenge line simply are
 * not there — the card never invents a rating the system does not define.
 */
export function StatBlock({
	name,
	meta,
	ac,
	acNote,
	hp,
	hpFormula,
	speed,
	abilities = {},
	attributes,
	saves,
	skills,
	resistances,
	immunities,
	conditionImmunities,
	senses,
	languages,
	cr,
	xp,
	proficiency,
	traits = [],
	actions = [],
	bonusActions = [],
	reactions = [],
	legendaryActions = [],
	legendaryIntro,
	live,
	dmOnly = false,
	style,
	...rest
}: StatBlockProps) {
	// The system's attributes, in the order the package authored them. `attributes` may legitimately
	// be an empty array — a system that declares none draws no grid, which is not the same thing as a
	// caller that supplied no package (undefined) and gets the 5e six.
	const cells = (attributes ?? DEFAULT_ATTRIBUTES).map((attr) => ({
		key: attr.key,
		label: attr.abbreviation || attr.label || attr.key,
		score: abilities[attr.key],
	}));
	return (
		<article
			style={{
				background: 'var(--color-surface-raised)',
				border: '1px solid var(--color-accent-border)',
				borderTop: '3px solid var(--color-accent)',
				borderRadius: 'var(--radius-md)',
				boxShadow: 'var(--shadow-md)',
				padding: 'var(--space-5)',
				color: 'var(--color-text-primary)',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				...style,
			}}
			{...rest}
		>
			{/* Header */}
			<header
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					justifyContent: 'space-between',
					gap: 'var(--space-3)',
				}}
			>
				<div style={{ minWidth: 0 }}>
					<h3
						style={{
							margin: 0,
							fontFamily: 'var(--font-display)',
							fontSize: 'var(--text-xl)',
							fontWeight: 'var(--font-weight-bold)',
							letterSpacing: 'var(--tracking-tight)',
							lineHeight: 1.1,
							color: 'var(--color-text-primary)',
						}}
					>
						{name}
					</h3>
					{meta && (
						<p
							style={{
								margin: '2px 0 0',
								fontFamily: 'var(--font-sans)',
								fontSize: 'var(--text-sm)',
								fontStyle: 'italic',
								color: 'var(--color-text-tertiary)',
							}}
						>
							{meta}
						</p>
					)}
				</div>
				<div
					style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: '0 0 auto' }}
				>
					{cr !== undefined && cr !== null && (
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								padding: 'var(--space-1) var(--space-3)',
								borderRadius: 'var(--radius-md)',
								background: 'var(--color-accent-subtle)',
								border: '1px solid var(--color-accent-border)',
							}}
						>
							<span
								style={{
									fontFamily: 'var(--font-sans)',
									fontSize: 'var(--text-2xs)',
									fontWeight: 'var(--font-weight-semibold)',
									letterSpacing: 'var(--tracking-wider)',
									textTransform: 'uppercase',
									color: 'var(--color-text-tertiary)',
								}}
							>
								{dsCopy['ds.statBlock.cr']}
							</span>
							<span
								style={{
									fontFamily: 'var(--font-mono)',
									fontSize: 'var(--text-lg)',
									fontWeight: 'var(--font-weight-bold)',
									lineHeight: 1,
									color: 'var(--color-accent)',
								}}
							>
								{cr}
							</span>
						</div>
					)}
					{dmOnly && <VisibilityChip level="dm-only" compact />}
				</div>
			</header>

			{/* Defenses band */}
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: 'var(--space-5)',
					padding: 'var(--space-2) var(--space-3)',
					borderRadius: 'var(--radius-sm)',
					background: 'var(--color-surface-sunken)',
					border: '1px solid var(--color-border)',
				}}
			>
				<Defense icon="shield" label={dsCopy['ds.statBlock.armorClass']} value={ac} note={acNote} />
				<Defense
					icon="heart"
					label={dsCopy['ds.statBlock.hitPoints']}
					value={hp}
					note={hpFormula}
				/>
				<Defense icon="travel" label={dsCopy['ds.statBlock.speed']} value={speed} />
			</div>

			{/* Live HP track (combat) */}
			{live && (
				<div
					style={{
						padding: 'var(--space-2) var(--space-3) var(--space-3)',
						borderRadius: 'var(--radius-sm)',
						background: 'var(--color-accent-subtle)',
						border: '1px solid var(--color-accent-border)',
					}}
				>
					<HPBar
						current={live.current}
						max={(live.max ?? hp) as number}
						label={dsCopy['ds.statBlock.thisCombatant']}
						size="md"
					/>
				</div>
			)}

			{/* Ability scores */}
			{cells.length > 0 && (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: `repeat(${Math.min(cells.length, 6)}, 1fr)`,
						gap: 'var(--space-2)',
					}}
				>
					{cells.map((cell) => (
						<AbilityScore key={cell.key} label={cell.label} score={cell.score ?? 10} size="sm" />
					))}
				</div>
			)}

			{/* Property list */}
			{(saves ||
				skills ||
				resistances ||
				immunities ||
				conditionImmunities ||
				senses ||
				languages ||
				proficiency ||
				(cr != null && xp)) && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-1)',
						marginTop: 'var(--space-1)',
					}}
				>
					<Property label={dsCopy['ds.statBlock.savingThrows']}>{saves}</Property>
					<Property label={dsCopy['ds.statBlock.skills']}>{skills}</Property>
					<Property label={dsCopy['ds.statBlock.damageResistances']}>{resistances}</Property>
					<Property label={dsCopy['ds.statBlock.damageImmunities']}>{immunities}</Property>
					<Property label={dsCopy['ds.statBlock.conditionImmunities']}>
						{conditionImmunities}
					</Property>
					<Property label={dsCopy['ds.statBlock.senses']}>{senses}</Property>
					<Property label={dsCopy['ds.statBlock.languages']}>{languages}</Property>
					{cr != null && xp && (
						<Property label={dsCopy['ds.statBlock.challenge']}>
							{cr} ({xp}
							{dsCopy['ds.statBlock.xp']}
						</Property>
					)}
					<Property label={dsCopy['ds.statBlock.proficiencyBonus']}>{proficiency}</Property>
				</div>
			)}

			{/* Traits */}
			{traits.length > 0 && (
				<>
					<Rule />
					<FeatureList items={traits} />
				</>
			)}

			{/* Actions */}
			{actions.length > 0 && (
				<>
					<SectionLabel>{dsCopy['ds.statBlock.actions']}</SectionLabel>
					<FeatureList items={actions} />
				</>
			)}
			{bonusActions.length > 0 && (
				<>
					<SectionLabel>{dsCopy['ds.statBlock.bonusActions']}</SectionLabel>
					<FeatureList items={bonusActions} />
				</>
			)}
			{reactions.length > 0 && (
				<>
					<SectionLabel>{dsCopy['ds.statBlock.reactions']}</SectionLabel>
					<FeatureList items={reactions} />
				</>
			)}
			{legendaryActions.length > 0 && (
				<>
					<SectionLabel>{dsCopy['ds.statBlock.legendaryActions']}</SectionLabel>
					{legendaryIntro && (
						<p
							style={{
								margin: 0,
								fontFamily: 'var(--font-sans)',
								fontSize: 'var(--text-sm)',
								lineHeight: 1.55,
								color: 'var(--color-text-tertiary)',
								fontStyle: 'italic',
							}}
						>
							{legendaryIntro}
						</p>
					)}
					<FeatureList items={legendaryActions} />
				</>
			)}
		</article>
	);
}

function Defense({
	icon,
	label,
	value,
	note,
}: {
	icon: string;
	label: React.ReactNode;
	value?: React.ReactNode;
	note?: React.ReactNode;
}) {
	if (value === undefined || value === null || value === '') return null;
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
			<Icon name={icon} size={18} color="var(--color-accent)" />
			<div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
				<span
					style={{
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-2xs)',
						fontWeight: 'var(--font-weight-semibold)',
						letterSpacing: 'var(--tracking-wider)',
						textTransform: 'uppercase',
						color: 'var(--color-text-tertiary)',
					}}
				>
					{label}
				</span>
				<span
					style={{
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-base)',
						color: 'var(--color-text-primary)',
					}}
				>
					<strong style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-weight-bold)' }}>
						{value}
					</strong>
					{note && (
						<span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>{note}</span>
					)}
				</span>
			</div>
		</div>
	);
}
