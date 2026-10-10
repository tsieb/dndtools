import type { computeEncounterChallenge } from '@dndtools/core';
import { Badge, Field, Input, ProgressMeter, SegmentedControl, Switch } from '../../ds';
import { useI18n } from '../../i18n';
import { T, eb } from '../screen-kit';
import { DIFFICULTY_BADGE, DIFFICULTY_LABEL, type AmbushMode } from '../EncounterDraft';

/**
 * The encounter builder's two "start" sections below the draft roster, moved out of
 * `EncounterBuilder.tsx` for size (RC-POL-1.4); the dialog keeps the state and passes it in.
 */

const SECTION = {
	display: 'flex',
	borderTop: `1px solid ${T.bd}`,
	paddingTop: T.space.three,
} as const;

const NOTE = { font: `var(--text-xs) ${T.sans}`, color: T.sub } as const;

/**
 * RC-SES-3.5 — how the fight opens: the ambush seed (read from the party's marching order) and
 * whether starting it puts tokens on the session's active map.
 */
export function EncounterOpening({
	ambush,
	hasMarchingOrder,
	activeMapId,
	placeOnMap,
	onAmbush,
	onPlaceOnMap,
}: {
	ambush: AmbushMode;
	hasMarchingOrder: boolean;
	activeMapId: string | null;
	placeOnMap: boolean;
	onAmbush: (next: AmbushMode) => void;
	onPlaceOnMap: (next: boolean) => void;
}) {
	const { t } = useI18n();
	return (
		<div style={{ ...SECTION, flexDirection: 'column', gap: T.space.two }}>
			<div style={eb}>{t('encounter.opening')}</div>
			<SegmentedControl
				ariaLabel={t('encounter.opening')}
				size="sm"
				value={ambush}
				onChange={onAmbush}
				options={[
					{ value: 'none', label: t('encounter.ambush.none') },
					{ value: 'party-ambushes', label: t('encounter.ambush.partyAmbushes') },
					{ value: 'party-surprised', label: t('encounter.ambush.partySurprised') },
				]}
			/>
			<div style={NOTE}>
				{ambush === 'none'
					? t('encounter.ambushNote.none')
					: hasMarchingOrder
						? t('encounter.ambushNote.seeded')
						: t('encounter.ambushNote.noOrder')}
			</div>
			<Switch
				checked={placeOnMap && activeMapId !== null}
				aria-disabled={activeMapId === null || undefined}
				label={t('encounter.placeOnMap')}
				onChange={(next: boolean) => {
					if (activeMapId === null) return;
					onPlaceOnMap(next);
				}}
			/>
			<div style={NOTE}>
				{activeMapId === null ? t('encounter.placeOnMapNoMap') : t('encounter.placeOnMapNote')}
			</div>
		</div>
	);
}

/** The challenge budget — the deterministic core guidance (the template's XP-budget meter). */
export function EncounterChallenge({
	challenge,
	partySize,
	partyLevel,
	onPartySize,
	onPartyLevel,
}: {
	challenge: NonNullable<ReturnType<typeof computeEncounterChallenge>>;
	partySize: string;
	partyLevel: string;
	onPartySize: (value: string) => void;
	onPartyLevel: (value: string) => void;
}) {
	const { t } = useI18n();
	const band = DIFFICULTY_LABEL[challenge.difficulty];
	return (
		<div style={{ ...SECTION, alignItems: 'flex-end', gap: T.space.three, flexWrap: 'wrap' }}>
			{/* rem, not px: at 200% text a px-wide number field clipped its own two digits. */}
			<Field label={t('encounter.partySize')} style={{ width: '5.5rem' }}>
				<Input
					type="number"
					min={1}
					value={partySize}
					onChange={(e: { target: { value: string } }) => onPartySize(e.target.value)}
				/>
			</Field>
			<Field label={t('encounter.avgLevel')} style={{ width: '5.5rem' }}>
				<Input
					type="number"
					min={1}
					max={20}
					value={partyLevel}
					onChange={(e: { target: { value: string } }) => onPartyLevel(e.target.value)}
				/>
			</Field>
			<div style={{ flex: '1 1 200px', minWidth: 160 }}>
				<ProgressMeter
					label={t('encounter.challengeBudget')}
					value={challenge.encounterPoints}
					max={Math.max(1, challenge.partyDeadlyThreshold)}
					valueLabel={t('encounter.points', {
						value: challenge.encounterPoints,
						max: challenge.partyDeadlyThreshold,
					})}
					tone={
						challenge.difficulty === 'deadly'
							? 'error'
							: challenge.difficulty === 'hard'
								? 'warning'
								: 'accent'
					}
					markers={[0.25, 0.5, 0.75].map((f) => Math.round(challenge.partyDeadlyThreshold * f))}
				/>
			</div>
			<Badge status={DIFFICULTY_BADGE[challenge.difficulty] ?? 'neutral'}>
				{band ? t(band) : challenge.difficulty}
			</Badge>
		</div>
	);
}
