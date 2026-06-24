import React from 'react';
import { Icon } from '../core/Icon.jsx';

const SCHOOL_LABEL = {
	abjuration: 'Abjuration', conjuration: 'Conjuration', divination: 'Divination',
	enchantment: 'Enchantment', evocation: 'Evocation', illusion: 'Illusion',
	necromancy: 'Necromancy', transmutation: 'Transmutation',
};

function ordinal(n) {
	const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function MetaCell({ label, value }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
			<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{label}</span>
			<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{value}</span>
		</div>
	);
}

/**
 * SpellCard — a single spell reference: Cinzel name over the level/school line, a 2×2 meta grid
 * (casting time · range · components · duration), the description, and an optional "At higher
 * levels" note. Concentration and ritual surface as tagged chips because they change how the spell
 * is run at the table. Level 0 reads as a cantrip.
 */
export function SpellCard({
	name, level = 0, school, castingTime, range, components, duration,
	description, higherLevels, concentration = false, ritual = false,
	style, ...rest
}) {
	const schoolLabel = SCHOOL_LABEL[school] || school || '';
	const levelLine = level === 0
		? `${schoolLabel} cantrip`
		: `${ordinal(level)}-level ${schoolLabel.toLowerCase()}${ritual ? ' (ritual)' : ''}`;
	return (
		<article
			style={{
				background: 'var(--color-surface)',
				border: '1px solid var(--color-border)',
				borderRadius: 'var(--radius-md)',
				boxShadow: 'var(--shadow-sm)',
				padding: 'var(--space-4)',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-3)',
				color: 'var(--color-text-primary)',
				...style,
			}}
			{...rest}
		>
			<header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
					<h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-weight-bold)', lineHeight: 1.1, color: 'var(--color-text-primary)' }}>{name}</h3>
					<div style={{ display: 'flex', gap: 'var(--space-1)', flex: '0 0 auto' }}>
						{concentration && <Tag icon="concentration" label="Concentration" tone="warning" />}
						{ritual && <Tag icon="ritual" label="Ritual" tone="info" />}
					</div>
				</div>
				<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontStyle: 'italic', color: 'var(--color-text-tertiary)' }}>{levelLine}</span>
			</header>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2) var(--space-4)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
				<MetaCell label="Casting time" value={castingTime} />
				<MetaCell label="Range" value={range} />
				<MetaCell label="Components" value={components} />
				<MetaCell label="Duration" value={duration} />
			</div>

			{description && <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{description}</p>}
			{higherLevels && (
				<p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
					<strong style={{ fontStyle: 'italic', color: 'var(--color-accent)', fontWeight: 'var(--font-weight-semibold)' }}>At higher levels. </strong>{higherLevels}
				</p>
			)}
		</article>
	);
}

function Tag({ icon, label, tone }) {
	const tones = {
		warning: { fg: 'var(--color-status-warning-text)', bg: 'var(--color-status-warning-subtle)', bd: 'var(--color-status-warning)' },
		info: { fg: 'var(--color-status-info-text)', bg: 'var(--color-status-info-subtle)', bd: 'var(--color-status-info)' },
	};
	const t = tones[tone] || tones.info;
	return (
		<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--font-weight-semibold)', whiteSpace: 'nowrap' }}>
			<Icon name={icon} size={12} /> {label}
		</span>
	);
}
