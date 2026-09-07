import { useMemo, useState } from 'react';
import {
	spellSlotLevelOf,
	type CoreCommand,
	type ResourceInstance,
	type SystemRecovery,
} from '@dndtools/core';
import { Button, EmptyState, Field, Icon, Input, Select, type DSChangeEvent } from '../../ds';
import { Panel, T } from '../screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';

/**
 * RC-CHR-1.1 — the class-resource economy, driven by the ACTIVE system package.
 *
 * Every row here is one `ResourceInstance` (`packages/core/src/state/character-resources.ts`): the
 * package's own rule (label, kind, recovery, maximum from its `maxFormula` at the character's
 * level) fused with the counters stored on the sheet. Nothing 5e-specific is named in this file —
 * a monk's ki and a Generic stress clock render through the same code because the package declares
 * both, and the maximum follows a level-up on its own because `commitAdvancement` re-derives it
 * from the formula (RC-SYS-2.2) rather than from a number copied onto the sheet once.
 *
 * Shared by the Player screen and the read-only player view, so it takes plain data plus a
 * `dispatch` and owns no reads: the caller does the actor-scoped read (`getCharacterForActor` →
 * `CharacterView.resources`), which is also what decides whether a player sees a DM-only resource.
 *
 * Writes are the existing core commands — `character.set-class-resource` for a stored counter and
 * `character.add-system-resource` to instantiate one the package declares. Spell slots are NOT
 * here: they keep the design system's dedicated `SpellSlots` economy, and hit points belong to the
 * vitals bar; both would read as "just another resource row" if they were folded in.
 */

/** Package keys that name the hit-point pool — shown by the vitals bar, never as a resource row. */
const HIT_POINT_KEYS = new Set(['hitPoints', 'hp']);

/** Above this maximum a row of pips stops being countable at a glance and becomes a counter. */
const MAX_PIPS = 10;

/** Pips are pointer targets: WCAG 2.5.8 asks for 24px, and they wrap rather than shrink. */
const PIP_SIZE = 24;

const RECOVERY_LABEL: Record<SystemRecovery, MessageKey> = {
	short: 'character.resources.recoversShort',
	long: 'character.resources.recoversLong',
	scene: 'character.resources.recoversScene',
	never: 'character.resources.recoversNever',
};

/** The recharge bands `character.set-class-resource` accepts for a homebrew resource. */
const HOMEBREW_RECHARGES = ['short', 'long', 'none'] as const;
type HomebrewRecharge = (typeof HOMEBREW_RECHARGES)[number];
const HOMEBREW_RECHARGE_LABEL: Record<HomebrewRecharge, MessageKey> = {
	short: 'character.resources.recoversShort',
	long: 'character.resources.recoversLong',
	none: 'character.resources.recoversNever',
};

export type ResourceDispatch = (command: CoreCommand) => Promise<boolean> | boolean;

/** A resource row belongs on this panel when it is a countable pool the sheet carries. */
function isPanelResource(resource: ResourceInstance): boolean {
	if (HIT_POINT_KEYS.has(resource.key)) return false;
	if (resource.kind === 'slots') return false;
	return spellSlotLevelOf(resource.key) === null;
}

export function CharacterResourcesPanel({
	characterId,
	actorId,
	resources,
	canManage,
	compact,
	dispatch,
}: {
	characterId: string;
	actorId: string;
	/** Every resource the active package declares for this character, actor-scoped by the caller. */
	resources: ResourceInstance[];
	/** Owner-or-DM: the same authority the core re-checks on every write below. */
	canManage: boolean;
	compact: boolean;
	dispatch: ResourceDispatch;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [adding, setAdding] = useState(false);
	const [homebrewName, setHomebrewName] = useState('');
	const [homebrewMax, setHomebrewMax] = useState('3');
	const [homebrewRecharge, setHomebrewRecharge] = useState<HomebrewRecharge>('long');
	const [offeredKey, setOfferedKey] = useState('');

	const panelResources = useMemo(() => resources.filter(isPanelResource), [resources]);
	/** Carried by the sheet — the rows with counters. */
	const carried = panelResources.filter((resource) => resource.present);
	/** Declared by the package but not on this sheet: offered, never silently invented. */
	const offered = panelResources.filter((resource) => !resource.present);

	/** Set a stored resource's expended count. `character.add-system-resource` gives it its maximum,
	 * so a spend is always an update of counters the sheet already carries. */
	const setExpended = (resource: ResourceInstance, expended: number) =>
		dispatch({
			type: 'character.set-class-resource',
			actorId,
			payload: {
				characterId,
				id: resource.key,
				name: resource.label,
				max: resource.max,
				recharge:
					resource.recovery === 'short' || resource.recovery === 'long'
						? resource.recovery
						: 'none',
				expended: Math.min(resource.max, Math.max(0, expended)),
			},
		});

	const spend = (resource: ResourceInstance) => setExpended(resource, resource.expended + 1);
	const recover = (resource: ResourceInstance) => setExpended(resource, resource.expended - 1);

	const addDeclared = (key: string) => {
		setOfferedKey('');
		return dispatch({
			type: 'character.add-system-resource',
			actorId,
			payload: { characterId, key },
		});
	};

	const addHomebrew = async () => {
		const name = homebrewName.trim();
		const max = Number.parseInt(homebrewMax, 10);
		if (!name || !Number.isInteger(max) || max < 0) return;
		const accepted = await dispatch({
			type: 'character.set-class-resource',
			actorId,
			payload: {
				characterId,
				id: runtime.newId(),
				name,
				max,
				recharge: homebrewRecharge,
				expended: 0,
			},
		});
		if (accepted) {
			setHomebrewName('');
			setHomebrewMax('3');
			setAdding(false);
		}
	};

	return (
		<Panel
			title={t('character.resources.title')}
			action={
				canManage && (
					<Button
						variant="secondary"
						size="sm"
						icon="add"
						aria-expanded={adding}
						onClick={() => setAdding((open) => !open)}
					>
						{t('character.resources.add')}
					</Button>
				)
			}
		>
			{carried.length === 0 ? (
				<EmptyState
					inset
					icon="sparkle"
					title={t('character.resources.emptyTitle')}
					description={t('character.resources.emptyBody')}
				/>
			) : (
				carried.map((resource, index) => (
					<ResourceRow
						key={resource.key}
						resource={resource}
						index={index}
						canManage={canManage}
						compact={compact}
						onSpend={() => void spend(resource)}
						onRecover={() => void recover(resource)}
						onSetExpended={(expended) => void setExpended(resource, expended)}
					/>
				))
			)}
			{adding && canManage && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 12,
						marginTop: 4,
						padding: 14,
						borderRadius: 10,
						border: `1px solid ${T.bd}`,
						background: T.alt,
					}}
				>
					{offered.length > 0 && (
						<div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
							<Field label={t('character.resources.fromSystem')} style={{ flex: '1 1 180px' }}>
								<Select
									value={offeredKey}
									options={[
										{ value: '', label: t('character.resources.choose') },
										...offered.map((resource) => ({
											value: resource.key,
											label: resource.label,
										})),
									]}
									onChange={(e: DSChangeEvent) => setOfferedKey(e.target.value)}
								/>
							</Field>
							<Button
								variant="secondary"
								size="sm"
								disabled={!offeredKey}
								onClick={() => void addDeclared(offeredKey)}
							>
								{t('character.resources.addFromSystem')}
							</Button>
						</div>
					)}
					<div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
						<Field label={t('character.resources.customName')} style={{ flex: '1 1 160px' }}>
							<Input
								value={homebrewName}
								placeholder={t('character.resources.customNamePlaceholder')}
								onChange={(e: DSChangeEvent) => setHomebrewName(e.target.value)}
							/>
						</Field>
						<Field label={t('character.resources.customMax')} style={{ flex: '0 0 90px' }}>
							<Input
								type="number"
								min={0}
								value={homebrewMax}
								onChange={(e: DSChangeEvent) => setHomebrewMax(e.target.value)}
							/>
						</Field>
						<Field label={t('character.resources.customRecovery')} style={{ flex: '1 1 160px' }}>
							<Select
								value={homebrewRecharge}
								options={HOMEBREW_RECHARGES.map((recharge) => ({
									value: recharge,
									label: t(HOMEBREW_RECHARGE_LABEL[recharge]),
								}))}
								onChange={(e: DSChangeEvent) =>
									setHomebrewRecharge(e.target.value as HomebrewRecharge)
								}
							/>
						</Field>
						<Button
							variant="primary"
							size="sm"
							disabled={homebrewName.trim().length === 0}
							onClick={() => void addHomebrew()}
						>
							{t('character.resources.addCustom')}
						</Button>
					</div>
					<p style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, margin: 0 }}>
						{t('character.resources.customHelp')}
					</p>
				</div>
			)}
		</Panel>
	);
}

/** One resource: its name, the band that returns it, and the economy itself. */
function ResourceRow({
	resource,
	index,
	canManage,
	compact,
	onSpend,
	onRecover,
	onSetExpended,
}: {
	resource: ResourceInstance;
	index: number;
	canManage: boolean;
	compact: boolean;
	onSpend: () => void;
	onRecover: () => void;
	onSetExpended: (expended: number) => void;
}) {
	const { t } = useI18n();
	const available = resource.available;
	// A track (a Generic stress clock) FILLS as it is used, so its pips read the other way round
	// from a pool that DRAINS: the same counters, told the way the sheet's owner thinks about them.
	const fills = resource.kind === 'track' || resource.kind === 'clock';
	const usePips = resource.max > 0 && resource.max <= MAX_PIPS;

	return (
		<div
			role="group"
			aria-label={resource.label}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 11,
				flexWrap: compact ? 'wrap' : 'nowrap',
				padding: '9px 0',
				borderTop: index ? `1px solid ${T.bd}` : 'none',
			}}
		>
			<Icon name="sparkle" size={17} color={T.acc} />
			<div style={{ flex: '1 1 120px', minWidth: 0 }}>
				<div style={{ font: `600 12.5px ${T.sans}`, color: T.ink }}>{resource.label}</div>
				<div style={{ font: `10.5px ${T.sans}`, color: T.sub }}>
					{t(RECOVERY_LABEL[resource.recovery])}
					{resource.diceNotation ? ` · ${resource.diceNotation}` : ''}
				</div>
			</div>
			{usePips ? (
				<div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
					{Array.from({ length: resource.max }).map((_, pip) => {
						// Filled means "spent" on a track and "still available" on a pool; either way a
						// click moves this pip's own state, so the pointer and the keyboard do the same.
						const filled = fills ? pip < resource.expended : pip < available;
						const nextExpended = fills
							? filled
								? pip
								: pip + 1
							: filled
								? resource.expended + 1
								: resource.expended - 1;
						return (
							<button
								key={pip}
								type="button"
								disabled={!canManage}
								aria-pressed={filled}
								aria-label={t(
									fills
										? filled
											? 'character.resources.pipMarked'
											: 'character.resources.pipClear'
										: filled
											? 'character.resources.pipAvailable'
											: 'character.resources.pipExpended',
									{ name: resource.label, index: pip + 1 },
								)}
								onClick={() => onSetExpended(nextExpended)}
								style={{
									width: PIP_SIZE,
									height: PIP_SIZE,
									flex: '0 0 auto',
									padding: 0,
									borderRadius: '50%',
									cursor: canManage ? 'pointer' : 'default',
									background: filled ? T.acc : 'transparent',
									border: `1.5px solid ${filled ? T.acc : T.bdS}`,
								}}
							/>
						);
					})}
				</div>
			) : (
				<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
					<Button
						variant="ghost"
						size="sm"
						icon="remove"
						disabled={!canManage || available <= 0}
						aria-label={t('character.resources.spendOne', { name: resource.label })}
						onClick={onSpend}
					/>
					<Button
						variant="ghost"
						size="sm"
						icon="add"
						disabled={!canManage || resource.expended <= 0}
						aria-label={t('character.resources.recoverOne', { name: resource.label })}
						onClick={onRecover}
					/>
				</div>
			)}
			{/* Inside the row's named group, so "4/5" is read as this resource's own count. */}
			<span style={{ font: `12px ${T.mono}`, color: T.sub, minWidth: 44, textAlign: 'right' }}>
				{available}/{resource.max}
			</span>
		</div>
	);
}
