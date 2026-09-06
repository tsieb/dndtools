/**
 * CharBuilder — Step 2 — class, subclass, level and background.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { Select } from '../../../ds';
import { T } from '../../screen-kit';
import { FieldLabel, NumStepper, Tile } from '../ui';
import type { Wizard } from '../wizard';
import { useI18n } from '../../../i18n';

export function ClassLevelStep({ w }: { w: Wizard }) {
	const { t } = useI18n();
	const {
		isPhone,
		isPc,
		clsChoices,
		bgChoices,
		clsId,
		bgId,
		clsObj,
		bgObj,
		setCls,
		setBackground,
		subclass,
		setSubclass,
		level,
		setLevel,
	} = w;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<div>
				<FieldLabel
					hint={t('charBuilder.classHint', {
						hd: clsObj.hd,
						primary: clsObj.primary,
						saves: clsObj.saves,
					})}
				>
					{t('charBuilder.class')}
				</FieldLabel>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))',
						gap: 10,
					}}
				>
					{clsChoices.map((c) => (
						<Tile
							key={c.id}
							on={clsId === c.id}
							onClick={() => {
								setCls(c.id);
								setSubclass('');
							}}
							title={c.name}
							sub={`${c.hd} · ${c.primary}`}
							compact
						/>
					))}
				</div>
				{isPc && (
					<div style={{ font: `11.5px ${T.sans}`, color: T.ter, marginTop: 8 }}>
						{t('charBuilder.classesSupported')}
					</div>
				)}
			</div>
			<div
				style={{
					display: 'grid',
					// The identity step's identical 1.4fr/1fr track is already phone-guarded; this one was
					// missed, and NumStepper is width:fit-content so the row could not shrink to fit 393px.
					gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1.4fr 1fr',
					gap: 16,
				}}
			>
				<div>
					<FieldLabel hint={t('charBuilder.subclassHint')}>{t('charBuilder.subclass')}</FieldLabel>
					<Select
						value={subclass}
						onChange={(e: any) => setSubclass(e.target.value)}
						options={[
							{ value: '', label: t('charBuilder.noneYet') },
							...clsObj.sub.split(', ').map((s) => ({ value: s, label: s })),
						]}
						aria-label={t('charBuilder.subclass')}
						style={{ width: '100%' }}
					/>
				</div>
				<div>
					<FieldLabel>{t('charBuilder.level')}</FieldLabel>
					<NumStepper
						value={level}
						min={1}
						max={20}
						onChange={setLevel}
						mono
						label={t('charBuilder.levelUnit')}
					/>
				</div>
			</div>
			<div>
				<FieldLabel hint={t('charBuilder.backgroundHint', { skills: bgObj.skills })}>
					{t('charBuilder.background')}
				</FieldLabel>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))',
						gap: 10,
					}}
				>
					{bgChoices.map((b) => (
						<Tile
							key={b.id}
							on={bgId === b.id}
							onClick={() => setBackground(b.id)}
							title={b.name}
							sub={b.skills}
							compact
						/>
					))}
				</div>
			</div>
		</div>
	);
}
