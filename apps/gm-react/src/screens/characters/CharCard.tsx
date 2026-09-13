import { Avatar, Badge, Card, Chip, ConditionBadge, HPBar, Icon, VisibilityChip } from '../../ds';
import { T } from '../../app/screen-kit';
import { portraitGradient } from '../../app/charBuilder';
import { KIND_LABEL, KIND_TONE, condKey, gradOf, visChip } from './shared';
import type { RosterEntry } from './roster';
import { useI18n } from '../../i18n';

/** Condition badges shown before the rest collapse into "+N more". */
const MAX_CONDITIONS = 3;
/** Tags shown on the card; the filter menu still offers every one. */
const MAX_TAGS = 3;

/**
 * One roster card (RC-CHR-5.3). It answers "who is this and how are they doing" without opening the
 * sheet: portrait tone and initials, class · level, an HP bar, live conditions, who plays them, their
 * tags, and when they last took part in a session. Everything comes from the `RosterEntry` derived
 * in `roster.ts`; a value the actor may not see (a DM-only HP field) is left out, never shown as 0.
 *
 * The accessible name is the character's name alone and the details are its description, so a
 * screen reader announces "Sera Duskwhisper, button" first instead of a run-on of every chip.
 */
export function CharCard({
	entry,
	onOpen,
	tabIndex,
	onFocus,
	describedBy,
}: {
	entry: RosterEntry;
	onOpen: () => void;
	tabIndex?: number;
	onFocus?: () => void;
	/** Extra `aria-describedby` ids (the grid's keyboard hint, on the card that holds the tab stop). */
	describedBy?: string;
}) {
	const { t, formatDate, formatList, formatRelativeTime } = useI18n();
	const { view, className, level, owners, lastPlayed, tags } = entry;
	const grad = gradOf(view);
	const detailsId = `character-card-${view.id}-details`;
	const combat = view.combat as Partial<typeof view.combat>;
	const conditions = Array.isArray(combat.conditions) ? combat.conditions : [];
	const hp = typeof combat.hp === 'number' ? combat.hp : null;
	const maxHp = typeof combat.maxHp === 'number' ? combat.maxHp : null;
	const ac = typeof combat.ac === 'number' ? combat.ac : null;
	const kindLabel = KIND_LABEL[view.kind] ? t(KIND_LABEL[view.kind]) : view.kind;
	const identity =
		[className, level !== null ? t('characters.levelShort', { level }) : null]
			.filter(Boolean)
			.join(' · ') || kindLabel;
	const played =
		lastPlayed === null
			? { text: t('characters.neverPlayed'), title: undefined }
			: lastPlayed.live
				? { text: t('characters.playingNow'), title: undefined }
				: {
						text: t('characters.lastPlayed', {
							when: formatRelativeTime(new Date(lastPlayed.at)),
						}),
						title: formatDate(new Date(lastPlayed.at), { dateStyle: 'medium' }),
					};

	return (
		<Card
			elevation="flat"
			interactive
			padding="none"
			onClick={onOpen}
			aria-label={view.name}
			aria-describedby={[detailsId, describedBy].filter(Boolean).join(' ')}
			data-roster-card=""
			{...(tabIndex !== undefined ? { tabIndex } : null)}
			onFocus={onFocus}
			style={{ overflow: 'hidden', width: '100%', display: 'flex', flexDirection: 'column' }}
		>
			<div style={{ height: 72, background: portraitGradient(grad), position: 'relative' }}>
				<div
					style={{
						position: 'absolute',
						inset: 0,
						backgroundImage:
							'linear-gradient(var(--map-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--map-grid-line) 1px,transparent 1px)',
						backgroundSize: '20px 20px',
					}}
				/>
				<div style={{ position: 'absolute', left: 14, bottom: -22 }}>
					<Avatar name={view.name} size="lg" ring="turn" />
				</div>
				<div
					style={{
						position: 'absolute',
						top: 10,
						right: 10,
						display: 'flex',
						gap: T.space.oneHalf,
					}}
				>
					<Badge status={KIND_TONE[view.kind] || 'neutral'}>{kindLabel}</Badge>
				</div>
			</div>
			<div
				style={{
					padding: `${T.space.eight} ${T.space.four} ${T.space.four}`,
					display: 'flex',
					flexDirection: 'column',
					flex: 1,
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: T.space.two,
					}}
				>
					<span
						style={{
							font: `600 14.5px ${T.sans}`,
							minWidth: 0,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{view.name}
					</span>
					<VisibilityChip level={visChip(view.visibility)} compact />
				</div>
				<div id={detailsId} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
					<div
						style={{
							font: `12px ${T.sans}`,
							color: T.ter,
							marginTop: T.space.half,
							// Class names are stored as the builder's ids ("rogue"); capitalising here keeps
							// "Order of Scribes" intact and never rewrites the stored value.
							textTransform: 'capitalize',
						}}
					>
						{identity}
					</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'flex-end',
							gap: T.space.three,
							marginTop: T.space.three,
						}}
					>
						<div style={{ flex: 1, minWidth: 0 }}>
							{hp !== null && maxHp !== null && maxHp > 0 ? (
								<HPBar current={hp} max={maxHp} label={t('characters.hpLabel')} size="sm" />
							) : hp !== null || maxHp !== null ? (
								<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
									{t('characters.hpUnset')}
								</span>
							) : null}
						</div>
						{ac !== null && (
							<span
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: T.space.one,
									font: `12px ${T.mono}`,
									color: T.sub,
									flex: '0 0 auto',
								}}
							>
								<Icon name="shield" size={14} color={T.info} />
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>{t('characters.ac')}</span>
								{ac}
							</span>
						)}
					</div>
					{conditions.length > 0 && (
						<div
							style={{
								display: 'flex',
								flexWrap: 'wrap',
								gap: T.space.one,
								marginTop: T.space.two,
							}}
						>
							{conditions.slice(0, MAX_CONDITIONS).map((condition) => {
								const key = condKey(condition);
								return (
									<ConditionBadge
										key={condition}
										condition={key ?? undefined}
										label={key ? undefined : condition}
									/>
								);
							})}
							{conditions.length > MAX_CONDITIONS && (
								<span style={{ font: `11.5px ${T.sans}`, color: T.ter, alignSelf: 'center' }}>
									{t('characters.moreConditions', { count: conditions.length - MAX_CONDITIONS })}
								</span>
							)}
						</div>
					)}
					{tags.length > 0 && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: T.space.one,
								marginTop: T.space.two,
								font: `11.5px ${T.sans}`,
								color: T.ter,
								minWidth: 0,
							}}
						>
							<Icon name="tag" size={12} />
							<span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
								{tags.slice(0, MAX_TAGS).join(' · ')}
								{tags.length > MAX_TAGS ? ` · +${tags.length - MAX_TAGS}` : ''}
							</span>
						</div>
					)}
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							gap: T.space.two,
							marginTop: 'auto',
							paddingTop: T.space.three,
						}}
					>
						{owners.length > 0 ? (
							<Chip icon="characters-person" style={{ maxWidth: '100%' }}>
								{t('characters.playedBy', { names: formatList(owners.map((owner) => owner.name)) })}
							</Chip>
						) : view.kind === 'pc' ? (
							<Chip icon="characters-person" style={{ color: T.ter }}>
								{t('characters.noOwner')}
							</Chip>
						) : null}
						<span
							title={played.title}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: T.space.one,
								marginLeft: 'auto',
								font: `11.5px ${T.sans}`,
								color: lastPlayed?.live ? T.acc : T.ter,
							}}
						>
							<Icon name="hourglass" size={12} />
							{played.text}
						</span>
					</div>
				</div>
			</div>
		</Card>
	);
}
