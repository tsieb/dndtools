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
import { useI18n } from '../../../i18n';

export function IdentityStep({ w }: { w: Wizard }) {
	const { t } = useI18n();
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
				<FieldLabel>{t('charBuilder.kind')}</FieldLabel>
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
							title={t(k.label)}
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
					<FieldLabel>{t('charBuilder.name')}</FieldLabel>
					<Input
						value={name}
						onChange={(e: any) => setName(e.target.value)}
						placeholder={t('charBuilder.namePlaceholder')}
						aria-label={t('charBuilder.name')}
						style={{ width: '100%' }}
					/>
				</div>
				<div>
					<FieldLabel>{t('charBuilder.alignment')}</FieldLabel>
					<Select
						value={align}
						onChange={(e: any) => setAlign(e.target.value)}
						options={ALIGNMENTS.map((a) => ({ value: a, label: a }))}
						aria-label={t('charBuilder.alignment')}
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
						<FieldLabel hint={t('charBuilder.ownerHint')}>
							{t('charBuilder.ownedByLabel')}
						</FieldLabel>
						{players.length > 0 ? (
							<Select
								value={ownerId}
								onChange={(e: any) => setOwner(e.target.value)}
								options={players.map((p) => ({ value: p.id, label: p.displayName }))}
								aria-label={t('charBuilder.ownedByLabel')}
								style={{ width: '100%' }}
							/>
						) : (
							<HonestNote>{t('charBuilder.needPlayer')}</HonestNote>
						)}
					</div>
				</div>
			)}
			<div>
				<FieldLabel hint={t('charBuilder.ancestryHint')}>{t('charBuilder.ancestry')}</FieldLabel>
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
				<FieldLabel>{t('charBuilder.portraitTone')}</FieldLabel>
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
						aria-label={t('charBuilder.portraitTone')}
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
