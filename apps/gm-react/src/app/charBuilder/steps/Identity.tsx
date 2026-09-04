/**
 * CharBuilder — Step 1 — identity: kind, name, alignment, PC owner, ancestry and portrait tone.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { Input, Select } from '../../../ds';
import { T } from '../../screen-kit';
import { ALIGNMENTS, BUILDER, KINDS, portraitGradient } from '../data';
import { FieldLabel, HonestNote, Tile } from '../ui';
import type { Wizard } from '../wizard';

export function IdentityStep({ w }: { w: Wizard }) {
	const {
		isPhone,
		isPc,
		players,
		kind,
		setKind,
		name,
		setName,
		align,
		setAlign,
		race,
		setRace,
		grad,
		setGrad,
		ownerId,
		setOwner,
	} = w;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<div>
				<FieldLabel>Kind</FieldLabel>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: isPhone ? 'repeat(2,minmax(0,1fr))' : 'repeat(4,1fr)',
						gap: 10,
					}}
				>
					{KINDS.map((k) => (
						<Tile
							key={k.id}
							on={kind === k.id}
							onClick={() => setKind(k.id)}
							title={k.label}
							compact
							icon={k.icon}
						/>
					))}
				</div>
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1.4fr 1fr',
					gap: 16,
				}}
			>
				<div>
					<FieldLabel>Name</FieldLabel>
					<Input
						value={name}
						onChange={(e: any) => setName(e.target.value)}
						placeholder="e.g. Sister Avelin"
						aria-label="Name"
						style={{ width: '100%' }}
					/>
				</div>
				<div>
					<FieldLabel>Alignment</FieldLabel>
					<Select
						value={align}
						onChange={(e: any) => setAlign(e.target.value)}
						options={ALIGNMENTS.map((a) => ({ value: a, label: a }))}
						aria-label="Alignment"
						style={{ width: '100%' }}
					/>
				</div>
			</div>
			{isPc && (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1.4fr 1fr',
						gap: 16,
					}}
				>
					<div>
						{/* Core rule: a PC draft is owned by exactly ONE player (CHAR-013); the owner
											    fills and finalizes the guided steps. */}
						<FieldLabel hint="A PC belongs to a player — the guided draft is created in their name">
							Owned by
						</FieldLabel>
						{players.length > 0 ? (
							<Select
								value={ownerId}
								onChange={(e: any) => setOwner(e.target.value)}
								options={players.map((p) => ({ value: p.id, label: p.displayName }))}
								aria-label="Owned by"
								style={{ width: '100%' }}
							/>
						) : (
							<HonestNote>Add a player in Settings before building a player character.</HonestNote>
						)}
					</div>
				</div>
			)}
			<div>
				<FieldLabel hint="Sets racial traits & ability bonuses">Ancestry / race</FieldLabel>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))',
						gap: 10,
					}}
				>
					{BUILDER.races.map((r) => (
						<Tile
							key={r.id}
							on={race === r.id}
							onClick={() => setRace(r.id)}
							title={r.name}
							sub={r.sub}
							compact
						/>
					))}
				</div>
			</div>
			<div>
				<FieldLabel>Portrait tone</FieldLabel>
				<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
					<span
						style={{
							width: 56,
							height: 56,
							borderRadius: 12,
							flex: '0 0 auto',
							position: 'relative',
							overflow: 'hidden',
							background: portraitGradient(grad),
							border: `1px solid ${T.bd}`,
						}}
					>
						<span
							style={{
								position: 'absolute',
								inset: 0,
								backgroundImage:
									'linear-gradient(var(--map-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--map-grid-line) 1px,transparent 1px)',
								backgroundSize: '14px 14px',
							}}
						/>
					</span>
					<input
						type="range"
						min="0"
						max="359"
						value={grad}
						onChange={(e) => setGrad(Number(e.target.value))}
						aria-label="Portrait tone"
						style={{ flex: 1, accentColor: 'var(--color-accent)' }}
					/>
					<span
						style={{
							font: `12px ${T.mono}`,
							color: T.ter,
							width: 38,
							textAlign: 'right',
						}}
					>
						{grad}°
					</span>
				</div>
			</div>
		</div>
	);
}
