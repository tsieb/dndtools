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

export function ClassLevelStep({ w }: { w: Wizard }) {
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
					hint={`Hit die ${clsObj.hd} · primary ${clsObj.primary} · saves ${clsObj.saves}`}
				>
					Class
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
						The guided PC flow supports these classes today — more arrive with future rule packages.
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
					<FieldLabel hint="Optional at level 1">Subclass</FieldLabel>
					<Select
						value={subclass}
						onChange={(e: any) => setSubclass(e.target.value)}
						options={[
							{ value: '', label: '— none yet —' },
							...clsObj.sub.split(', ').map((s) => ({ value: s, label: s })),
						]}
						aria-label="Subclass"
						style={{ width: '100%' }}
					/>
				</div>
				<div>
					<FieldLabel>Level</FieldLabel>
					<NumStepper value={level} min={1} max={20} onChange={setLevel} mono label="level" />
				</div>
			</div>
			<div>
				<FieldLabel hint={`Grants ${bgObj.skills}`}>Background</FieldLabel>
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
