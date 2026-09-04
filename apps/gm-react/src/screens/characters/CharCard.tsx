import { Avatar, Badge, Card, Icon, VisibilityChip } from '../../ds';
import { type CharacterView } from '@dndtools/core';
import { T } from '../../app/screen-kit';
import { portraitGradient } from '../../app/CharBuilder';
import { KIND_LABEL, KIND_TONE, gradOf, subtitleOf, visChip } from './shared';

export function CharCard({ view, onOpen }: { view: CharacterView; onOpen: () => void }) {
	const grad = gradOf(view);
	const conditions = view.combat.conditions;
	return (
		<Card
			elevation="flat"
			interactive
			padding="none"
			onClick={onOpen}
			style={{ overflow: 'hidden' }}
		>
			<div style={{ height: 84, background: portraitGradient(grad), position: 'relative' }}>
				<div
					style={{
						position: 'absolute',
						inset: 0,
						backgroundImage:
							'linear-gradient(var(--map-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--map-grid-line) 1px,transparent 1px)',
						backgroundSize: '20px 20px',
					}}
				/>
				<div style={{ position: 'absolute', left: 14, bottom: -18 }}>
					<Avatar name={view.name} ring="turn" />
				</div>
				<div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
					<Badge status={KIND_TONE[view.kind] || 'neutral'}>
						{KIND_LABEL[view.kind] || view.kind}
					</Badge>
				</div>
			</div>
			<div style={{ padding: '24px 14px 14px' }}>
				<div
					style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
				>
					<span style={{ font: `600 14.5px ${T.sans}` }}>{view.name}</span>
					<VisibilityChip level={visChip(view.visibility)} compact />
				</div>
				<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 2 }}>
					{subtitleOf(view, null)}
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 11 }}>
					<span
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 5,
							font: `12px ${T.mono}`,
							color: T.sub,
						}}
					>
						<Icon name="heart" size={14} color={T.err} />
						{view.combat.hp}/{view.combat.maxHp}
					</span>
					<span
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 5,
							font: `12px ${T.mono}`,
							color: T.sub,
						}}
					>
						<Icon name="shield" size={14} color={T.info} />
						{view.combat.ac}
					</span>
					{conditions.length > 0 && (
						<span style={{ font: `12px ${T.mono}`, color: T.ter }}>{conditions.length} cond.</span>
					)}
				</div>
			</div>
		</Card>
	);
}
