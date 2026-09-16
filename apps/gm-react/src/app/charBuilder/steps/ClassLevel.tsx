/**
 * CharBuilder — Step 2 — class, subclass, level and background.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4). RC-CHR-5.2 added the
 * class preview card: what the active system package gives the picked class at the picked level.
 */
import type { SystemRecovery } from '@dndtools/core';
import { Select } from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import { T, eb } from '../../screen-kit';
import { previewClass, type ClassFeaturePreview } from '../classPreview';
import { FieldLabel, NumStepper, Tile } from '../ui';
import type { Wizard } from '../wizard';
import { useI18n, type MessageKey } from '../../../i18n';

const RECOVERY_LABEL: Record<SystemRecovery, MessageKey> = {
	short: 'charBuilder.recovery.short',
	long: 'charBuilder.recovery.long',
	scene: 'charBuilder.recovery.scene',
	never: 'charBuilder.recovery.never',
};

/** The picked class, with the package's own numbers for it — the tiles only name the class. */
function ClassPreviewCard({ w }: { w: Wizard }) {
	const { t } = useI18n();
	const { clsObj, clsId, level, subclass, effScores, systemPackage } = w;
	const preview = previewClass(systemPackage, clsId, { level, scores: effScores, subclass });
	const amount = (f: ClassFeaturePreview) => {
		if (f.needsSubclass)
			return t('charBuilder.featureNeedsSubclass', { subclass: f.needsSubclass });
		if (f.value === null) return t('charBuilder.featureOnSheet');
		if (f.unlocksAt !== null) return t('charBuilder.featureUnlocks', { level: f.unlocksAt });
		if (f.diceNotation)
			return t('charBuilder.featureDice', { count: f.value, die: f.diceNotation });
		return String(f.value);
	};
	const empty = preview.features.length === 0 && !preview.spellcasting;
	return (
		<section
			aria-label={t('charBuilder.classPreview', { class: clsObj.name })}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: T.space.two,
				marginTop: T.space.three,
				padding: `${T.space.three} ${T.space.four}`,
				borderRadius: T.radius.lg,
				background: T.surf,
				border: `1px solid ${T.accBd}`,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: T.space.two, flexWrap: 'wrap' }}>
				{/* The display face (Cinzel) only starts at 24px — RC-ENG-8.4's emphasis lint. This is a
				    card label at 16px, so it takes the sans face and keeps its weight. */}
				<span style={{ font: `700 16px ${T.sans}`, color: T.ink }}>{clsObj.name}</span>
				<span style={{ font: `12px ${T.sans}`, color: T.sub }}>
					{t('charBuilder.classHint', {
						hd: clsObj.hd,
						primary: clsObj.primary,
						saves: clsObj.saves,
					})}
				</span>
			</div>
			<div style={eb}>
				{t('charBuilder.featuresFrom', { system: systemPackage.displayName, level })}
			</div>
			{empty ? (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					{t('charBuilder.noClassFeatures', {
						system: systemPackage.displayName,
						class: clsObj.name,
					})}
				</div>
			) : (
				<ul
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: T.space.oneHalf,
						listStyle: 'none',
						margin: T.space.zero,
						padding: T.space.zero,
					}}
				>
					{preview.features.map((f) => (
						<li
							key={f.key}
							style={{
								display: 'flex',
								alignItems: 'baseline',
								gap: T.space.two,
								flexWrap: 'wrap',
								font: `12.5px ${T.sans}`,
								color: T.sub,
							}}
						>
							<span style={{ fontWeight: 600, color: T.ink }}>{f.label}</span>
							<span
								style={{
									font: `12px ${T.mono}`,
									color: f.needsSubclass || f.unlocksAt !== null ? T.ter : T.acc,
								}}
							>
								{amount(f)}
							</span>
							<span style={{ color: T.ter }}>· {t(RECOVERY_LABEL[f.recovery])}</span>
						</li>
					))}
					{preview.spellcasting && (
						<li style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
							{t('charBuilder.spellcasting', { ability: preview.spellcasting })}
						</li>
					)}
				</ul>
			)}
		</section>
	);
}

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
				<FieldLabel>{t('charBuilder.class')}</FieldLabel>
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
				<ClassPreviewCard w={w} />
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
						onChange={(e: DSChangeEvent) => setSubclass(e.target.value)}
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
