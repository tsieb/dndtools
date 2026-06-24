import React from 'react';
import { AbilityScore } from './AbilityScore.jsx';
import { Icon } from '../core/Icon.jsx';
import { VisibilityChip } from '../feedback/VisibilityChip.jsx';
import { HPBar } from '../domain/HPBar.jsx';

/** Tapered gold rule — the classic statblock separator. */
function Rule() {
	return (
		<div
			aria-hidden="true"
			style={{
				height: 4,
				margin: 'var(--space-2) 0',
				background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-border) 60%, transparent)',
				clipPath: 'polygon(0 0, 100% 35%, 100% 65%, 0 100%)',
			}}
		/>
	);
}

/** One "Property: value" line (Saving Throws, Senses, Languages, …). */
function Property({ label, children }) {
	if (children === undefined || children === null || children === '') return null;
	return (
		<p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
			<strong style={{ color: 'var(--color-accent)', fontWeight: 'var(--font-weight-semibold)' }}>{label} </strong>
			<span style={{ fontFamily: /Challenge|Proficiency|Hit Points|Armor|Speed/.test(String(label)) ? 'var(--font-mono)' : 'var(--font-sans)' }}>{children}</span>
		</p>
	);
}

/** A named feature paragraph (trait / action / reaction). Name is bold-italic per 5e convention. */
function Feature({ name, text }) {
	return (
		<p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--color-text-primary)' }}>
			<strong style={{ fontStyle: 'italic', fontWeight: 'var(--font-weight-bold)' }}>{name}. </strong>
			<span style={{ color: 'var(--color-text-secondary)' }}>{text}</span>
		</p>
	);
}

function SectionLabel({ children }) {
	return (
		<div style={{ marginTop: 'var(--space-1)' }}>
			<span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-md)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent)' }}>{children}</span>
			<div style={{ height: 1, background: 'var(--color-accent-border)', marginTop: 'var(--space-1)' }} />
		</div>
	);
}

function FeatureList({ items = [] }) {
	if (!items.length) return null;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
			{items.map((f, i) => <Feature key={i} name={f.name} text={f.text} />)}
		</div>
	);
}

/**
 * StatBlock — the iconic creature/NPC reference card a DM pulls up while building an encounter or
 * running combat. Cinzel name + italic meta line, a tinted defenses band (AC · HP · Speed), the six
 * ability cells, a property list, then traits / actions / reactions / legendary actions, separated
 * by the tapered gold rules. Numbers are mono; `dmOnly` flags hidden NPCs with the purple cue.
 * Pass `live` HP to overlay an editable HP track on top — the same creature, mid-fight.
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
}) {
	const order = [
		['STR', abilities.str], ['DEX', abilities.dex], ['CON', abilities.con],
		['INT', abilities.int], ['WIS', abilities.wis], ['CHA', abilities.cha],
	];
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
			<header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
				<div style={{ minWidth: 0 }}>
					<h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 'var(--font-weight-bold)', letterSpacing: 'var(--tracking-tight)', lineHeight: 1.1, color: 'var(--color-text-primary)' }}>{name}</h3>
					{meta && <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontStyle: 'italic', color: 'var(--color-text-tertiary)' }}>{meta}</p>}
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: '0 0 auto' }}>
					{cr !== undefined && cr !== null && (
						<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', border: '1px solid var(--color-accent-border)' }}>
							<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>CR</span>
							<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-weight-bold)', lineHeight: 1, color: 'var(--color-accent)' }}>{cr}</span>
						</div>
					)}
					{dmOnly && <VisibilityChip level="dm-only" compact />}
				</div>
			</header>

			{/* Defenses band */}
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
				<Defense icon="shield" label="Armor Class" value={ac} note={acNote} />
				<Defense icon="heart" label="Hit Points" value={hp} note={hpFormula} />
				<Defense icon="travel" label="Speed" value={speed} />
			</div>

			{/* Live HP track (combat) */}
			{live && (
				<div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-subtle)', border: '1px solid var(--color-accent-border)' }}>
					<HPBar current={live.current} max={live.max ?? hp} label="This combatant" size="md" />
				</div>
			)}

			{/* Ability scores */}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-2)' }}>
				{order.map(([label, score]) => (
					<AbilityScore key={label} label={label} score={score ?? 10} size="sm" />
				))}
			</div>

			{/* Property list */}
			{(saves || skills || resistances || immunities || conditionImmunities || senses || languages || proficiency || (cr != null && xp)) && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
					<Property label="Saving Throws">{saves}</Property>
					<Property label="Skills">{skills}</Property>
					<Property label="Damage Resistances">{resistances}</Property>
					<Property label="Damage Immunities">{immunities}</Property>
					<Property label="Condition Immunities">{conditionImmunities}</Property>
					<Property label="Senses">{senses}</Property>
					<Property label="Languages">{languages}</Property>
					{cr != null && xp && <Property label="Challenge">{cr} ({xp} XP)</Property>}
					<Property label="Proficiency Bonus">{proficiency}</Property>
				</div>
			)}

			{/* Traits */}
			{traits.length > 0 && (<><Rule /><FeatureList items={traits} /></>)}

			{/* Actions */}
			{actions.length > 0 && (
				<>
					<SectionLabel>Actions</SectionLabel>
					<FeatureList items={actions} />
				</>
			)}
			{bonusActions.length > 0 && (
				<>
					<SectionLabel>Bonus Actions</SectionLabel>
					<FeatureList items={bonusActions} />
				</>
			)}
			{reactions.length > 0 && (
				<>
					<SectionLabel>Reactions</SectionLabel>
					<FeatureList items={reactions} />
				</>
			)}
			{legendaryActions.length > 0 && (
				<>
					<SectionLabel>Legendary Actions</SectionLabel>
					{legendaryIntro && <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>{legendaryIntro}</p>}
					<FeatureList items={legendaryActions} />
				</>
			)}
		</article>
	);
}

function Defense({ icon, label, value, note }) {
	if (value === undefined || value === null || value === '') return null;
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
			<Icon name={icon} size={18} color="var(--color-accent)" />
			<div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
				<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{label}</span>
				<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>
					<strong style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-weight-bold)' }}>{value}</strong>
					{note && <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>{note}</span>}
				</span>
			</div>
		</div>
	);
}
