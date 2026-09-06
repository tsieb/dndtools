/**
 * CharBuilder — Step 4 — attacks & kit: armor class, hit points, speed and the custom attack rows.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { Icon, IconButton, Input } from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import { T } from '../../screen-kit';
import { FieldLabel, NumStepper } from '../ui';
import type { Wizard } from '../wizard';
import { useI18n } from '../../../i18n';

export function KitStep({ w }: { w: Wizard }) {
	const { t } = useI18n();
	const { isPhone, kind, ac, setAc, hp, setHp, speed, setSpeed, attacks, setAttacks } = w;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : 'repeat(3,1fr)',
					gap: 14,
				}}
			>
				<div>
					<FieldLabel>{t('characters.armorClass')}</FieldLabel>
					<NumStepper
						value={ac}
						min={1}
						max={30}
						onChange={setAc}
						mono
						label={t('charBuilder.armorClassUnit')}
					/>
				</div>
				<div>
					<FieldLabel>{t('characters.hitPoints')}</FieldLabel>
					<NumStepper
						value={hp}
						min={1}
						max={600}
						step={kind === 'monster' ? 5 : 1}
						onChange={setHp}
						mono
						label={t('charBuilder.hitPointsUnit')}
					/>
				</div>
				<div>
					<FieldLabel>{t('charBuilder.speedFt')}</FieldLabel>
					<NumStepper
						value={speed}
						min={0}
						max={120}
						step={5}
						onChange={setSpeed}
						mono
						label={t('charBuilder.speedUnit')}
					/>
				</div>
			</div>
			<div>
				<FieldLabel hint={t('charBuilder.attacksHint')}>
					{t('charBuilder.attacksActions')}
				</FieldLabel>
				{/* All kinds carry custom attacks now: NPC/monster/sidekick via quick-create,
									    a PC via the draft's kit step (finalize-draft carries kit attacks onto the PC). */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{attacks.map((at, idx) => (
						<div
							key={idx}
							style={{
								display: 'grid',
								// Five inputs + a delete button on one 393px row left each field a
								// few characters wide. Two-up on a phone, matching the AC/HP/Speed
								// grid in the same step.
								gridTemplateColumns: isPhone
									? 'minmax(0,1fr) minmax(0,1fr)'
									: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,1fr) minmax(0,1fr) 28px',
								gap: 8,
								alignItems: 'center',
							}}
						>
							<Input
								value={at.name}
								aria-label={t('characters.attackName')}
								onChange={(e: DSChangeEvent) =>
									setAttacks((a) =>
										a.map((x, j) => (j === idx ? { ...x, name: e.target.value } : x)),
									)
								}
								placeholder={t('characters.name')}
							/>
							<Input
								value={at.kind}
								aria-label={t('charBuilder.attackKind')}
								onChange={(e: DSChangeEvent) =>
									setAttacks((a) =>
										a.map((x, j) => (j === idx ? { ...x, kind: e.target.value } : x)),
									)
								}
								placeholder={t('charBuilder.attackKindPlaceholder')}
							/>
							<Input
								value={at.hit}
								aria-label={t('charBuilder.attackToHit')}
								onChange={(e: DSChangeEvent) =>
									setAttacks((a) =>
										a.map((x, j) => (j === idx ? { ...x, hit: e.target.value } : x)),
									)
								}
								placeholder={t('charBuilder.attackHitPlaceholder')}
							/>
							<Input
								value={at.dmg}
								aria-label={t('charBuilder.attackDamage')}
								onChange={(e: DSChangeEvent) =>
									setAttacks((a) =>
										a.map((x, j) => (j === idx ? { ...x, dmg: e.target.value } : x)),
									)
								}
								placeholder={t('characters.damage')}
							/>
							<Input
								value={at.type}
								aria-label={t('charBuilder.damageType')}
								onChange={(e: DSChangeEvent) =>
									setAttacks((a) =>
										a.map((x, j) => (j === idx ? { ...x, type: e.target.value } : x)),
									)
								}
								placeholder={t('charBuilder.damageTypePlaceholder')}
							/>
							<IconButton
								icon="close"
								label={t('characters.removeAttack')}
								variant="ghost"
								size="sm"
								onClick={() => setAttacks((a) => a.filter((_, j) => j !== idx))}
							/>
						</div>
					))}
					<button
						type="button"
						onClick={() =>
							setAttacks((a) => [
								...a,
								{ name: '', kind: 'Melee', hit: '+0', dmg: '1d6', type: '' },
							])
						}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 7,
							padding: 10,
							borderRadius: 10,
							border: `1.5px dashed ${T.bdS}`,
							background: 'transparent',
							cursor: 'pointer',
							color: T.ter,
							font: `600 12.5px ${T.sans}`,
						}}
					>
						<Icon name="add" size={14} />
						{t('characters.addAttack')}
					</button>
				</div>
			</div>
		</div>
	);
}
