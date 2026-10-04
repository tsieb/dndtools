import { useState } from 'react';
import type { CharacterInventory, EncumbranceState, EquipmentItem } from '@dndtools/core';
import {
	Badge,
	Button,
	EmptyState,
	Field,
	Icon,
	IconButton,
	Input,
	ProgressMeter,
	Stat,
} from '../../ds';
import type { DSChangeEvent } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import type { Dispatch } from './shared';

// ── Equipment / currency / encumbrance — REAL structured inventory (I10 S10.1.3 / S10.4.2) ────────
const COIN_ORDER: { key: 'pp' | 'gp' | 'ep' | 'sp' | 'cp'; label: MessageKey }[] = [
	{ key: 'pp', label: 'player.equipment.coin.pp' },
	{ key: 'gp', label: 'player.equipment.coin.gp' },
	{ key: 'ep', label: 'player.equipment.coin.ep' },
	{ key: 'sp', label: 'player.equipment.coin.sp' },
	{ key: 'cp', label: 'player.equipment.coin.cp' },
];
const ENCUMBRANCE_META: Record<
	EncumbranceState['level'],
	{ label: MessageKey; status: 'success' | 'warning' | 'error' }
> = {
	unencumbered: { label: 'player.equipment.enc.unencumbered', status: 'success' },
	encumbered: { label: 'player.equipment.enc.encumbered', status: 'warning' },
	'heavily-encumbered': { label: 'player.equipment.enc.heavilyEncumbered', status: 'warning' },
	overloaded: { label: 'player.equipment.enc.overloaded', status: 'error' },
};

export function PlayerEquipment({
	charId,
	actorId,
	inventory,
	encumbrance,
	canManage,
	dispatch,
}: {
	charId: string;
	actorId: string;
	inventory: CharacterInventory | null;
	encumbrance: EncumbranceState | null;
	canManage: boolean;
	dispatch: Dispatch;
}) {
	const { t, formatDistance, formatUnit } = useI18n();
	const [name, setName] = useState('');
	const [qty, setQty] = useState('1');
	const [weight, setWeight] = useState('');
	const items = inventory?.items ?? [];
	const currency = inventory?.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

	// Every write is a durable `character.*` command; the core re-checks owner-or-DM authority and the
	// error banner surfaces any rejection (so a non-owner preview never silently mutates).
	const addItem = async () => {
		if (!name.trim()) return;
		// A cleared Qty box used to coerce to 0 and create a phantom "x0" item with no feedback; an
		// item you are adding is at least one of a thing, so blank (and any sub-1 value) means 1.
		const quantity = Math.max(1, Math.trunc(Number(qty) || 1));
		const w = weight.trim() === '' ? 0 : Math.max(0, Number(weight) || 0);
		const ok = await dispatch({
			type: 'character.upsert-equipment-item',
			actorId,
			payload: { characterId: charId, name: name.trim(), quantity, weight: w },
		});
		if (ok) {
			setName('');
			setQty('1');
			setWeight('');
		}
	};
	const removeItem = (item: EquipmentItem) =>
		dispatch({
			type: 'character.remove-equipment-item',
			actorId,
			payload: { characterId: charId, itemId: item.id },
		});
	// Quantity step / equipped toggle both go through the PATCH-semantics upsert (id preserves the item;
	// `name` is required by the schema so the existing name is re-sent).
	const stepQty = (item: EquipmentItem, delta: number) =>
		dispatch({
			type: 'character.upsert-equipment-item',
			actorId,
			payload: {
				characterId: charId,
				id: item.id,
				name: item.name,
				quantity: Math.max(0, item.quantity + delta),
			},
		});
	const toggleEquipped = (item: EquipmentItem) =>
		dispatch({
			type: 'character.upsert-equipment-item',
			actorId,
			payload: { characterId: charId, id: item.id, name: item.name, equipped: !item.equipped },
		});
	// Currency: signed per-coin adjust (fail-closed on overspend in the core — the banner explains).
	const adjustCoin = (coin: string, delta: number) =>
		dispatch({
			type: 'character.set-currency',
			actorId,
			payload: { characterId: charId, mode: 'adjust', currency: { [coin]: delta } },
		});
	const consolidate = () =>
		dispatch({
			type: 'character.set-currency',
			actorId,
			payload: { characterId: charId, consolidate: true },
		});

	const enc = encumbrance;
	const encMeta = enc ? ENCUMBRANCE_META[enc.level] : null;
	// Weights are pounds because the rules carry them in pounds; only the number and the unit's
	// spelling are localized (ADR-032 §4, the same split `formatDistance` makes for feet).
	const lb = (value: number) => formatUnit(Number(value.toFixed(value % 1 ? 1 : 0)), 'pound');

	return (
		// Side by side at 1.4 : 1 while both columns fit their content; stacked otherwise. The
		// rem minimums grow with large text, so a 200% preference stacks instead of overflowing
		// the sheet column (a grid's `fr` tracks cannot shrink below their content and widened it).
		<div
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				gap: 'var(--space-4)',
				alignItems: 'flex-start',
			}}
		>
			{/* An unpadded wrapper, so both columns grow from the same zero basis. */}
			<div style={{ flex: '1.4 1 0', minWidth: 'min(100%, 14rem)' }}>
				<Panel title={t('player.equipment.title', { count: items.length })}>
					{items.length === 0 ? (
						<EmptyState
							inset
							illustration="inventory-empty"
							description={t('player.equipment.empty')}
						/>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column' }}>
							{items.map((item, i) => (
								<div
									key={item.id}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 'var(--space-2)',
										padding: 'var(--space-2) 0',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
									}}
								>
									<Icon
										name={item.equipped ? 'shield' : 'tag'}
										size={14}
										color={item.equipped ? T.acc : T.ter}
									/>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>
											{item.name}
											{item.equipped && (
												<span style={{ marginLeft: 'var(--space-1-5)' }}>
													<Badge status="accent">{t('player.equipment.equippedBadge')}</Badge>
												</span>
											)}
										</div>
										<div style={{ font: `var(--text-xs) ${T.mono}`, color: T.ter }}>
											{t('player.equipment.weights', {
												each: lb(item.weight),
												total: lb(item.quantity * item.weight),
											})}
											{item.notes ? ` · ${item.notes}` : ''}
										</div>
									</div>
									{canManage ? (
										<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
											<IconButton
												icon="chevron-down"
												// At 1, stepping down clamped to 0 and left a `×0` ghost row that stayed in
												// the list and kept accepting presses. Removing the item is a different,
												// already-present action — so say so instead of pretending to work.
												label={t(
													item.quantity <= 1
														? 'player.equipment.cannotGoBelowOne'
														: 'player.equipment.oneFewer',
													{ name: item.name },
												)}
												aria-disabled={item.quantity <= 1 ? true : undefined}
												variant="ghost"
												size="sm"
												onClick={() => void stepQty(item, -1)}
											/>
											<span
												style={{
													font: `700 var(--text-xs) ${T.mono}`,
													minWidth: 22,
													textAlign: 'center',
												}}
											>
												{item.quantity}
											</span>
											<IconButton
												icon="chevron-up"
												label={t('player.equipment.oneMore', { name: item.name })}
												variant="ghost"
												size="sm"
												onClick={() => void stepQty(item, 1)}
											/>
											<button
												type="button"
												aria-pressed={item.equipped}
												onClick={() => void toggleEquipped(item)}
												style={{
													// 3px + an 11px line + 3px is a ~21px target, under the WCAG 2.5.8
													// floor, wedged between icon buttons that DO meet it.
													padding: 'var(--space-1-5) var(--space-2)',
													minHeight: 24,
													boxSizing: 'border-box',
													borderRadius: 'var(--radius-lg)',
													cursor: 'pointer',
													font: `var(--text-xs) ${T.sans}`,
													border: `1px solid ${item.equipped ? T.accBd : T.bd}`,
													background: item.equipped ? T.accSub : T.surf,
													color: item.equipped ? T.acc : T.ter,
												}}
											>
												{t(item.equipped ? 'player.equipment.equipped' : 'player.equipment.equip')}
											</button>
											<IconButton
												icon="close"
												label={t('player.equipment.removeItem', { name: item.name })}
												variant="ghost"
												size="sm"
												onClick={() => void removeItem(item)}
											/>
										</div>
									) : (
										<span style={{ font: `var(--text-xs) ${T.mono}`, color: T.ter }}>
											×{item.quantity}
										</span>
									)}
								</div>
							))}
						</div>
					)}
					{canManage && (
						<div
							style={{
								display: 'flex',
								gap: 'var(--space-2)',
								marginTop: 'var(--space-3)',
								paddingTop: 'var(--space-3)',
								borderTop: `1px solid ${T.bd}`,
								alignItems: 'flex-end',
								flexWrap: 'wrap',
							}}
						>
							<Field label={t('player.equipment.itemField')}>
								<Input
									value={name}
									onChange={(e: DSChangeEvent) => setName(e.target.value)}
									placeholder={t('player.equipment.itemPlaceholder')}
								/>
							</Field>
							<Field label={t('player.equipment.qtyField')}>
								<Input
									type="number"
									value={qty}
									onChange={(e: DSChangeEvent) => setQty(e.target.value)}
									style={{ width: 70 }}
								/>
							</Field>
							<Field label={t('player.equipment.weightField')}>
								<Input
									type="number"
									value={weight}
									onChange={(e: DSChangeEvent) => setWeight(e.target.value)}
									placeholder="0"
									style={{ width: 90 }}
								/>
							</Field>
							<Button
								variant="secondary"
								size="sm"
								icon="add"
								disabled={!name.trim()}
								onClick={addItem}
							>
								{t('common.action.add')}
							</Button>
						</div>
					)}
				</Panel>
			</div>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-4)',
					flex: '1 1 0',
					minWidth: 'min(100%, 11.5rem)',
				}}
			>
				<Panel title={t('player.equipment.encumbrance')}>
					{enc && encMeta ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
								<Badge status={encMeta.status}>{t(encMeta.label)}</Badge>
								{enc.speedPenalty !== 0 && (
									<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
										{t('player.equipment.speedPenalty', {
											amount: formatDistance(enc.speedPenalty),
										})}
									</span>
								)}
							</div>
							<ProgressMeter
								value={Math.min(enc.carriedWeight, enc.carryCapacity)}
								max={enc.carryCapacity || 1}
								label={t('player.equipment.carried', {
									carried: enc.carriedWeight.toFixed(enc.carriedWeight % 1 ? 1 : 0),
									capacity: lb(enc.carryCapacity),
								})}
							/>
							<div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
								<Stat label={t('player.equipment.itemsStat')} value={lb(enc.itemWeight)} />
								<Stat label={t('player.equipment.coinsStat')} value={lb(enc.coinWeight)} />
								<Stat label={t('player.equipment.capacityStat')} value={lb(enc.carryCapacity)} />
							</div>
						</div>
					) : (
						<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
							{t('player.equipment.noEncumbrance')}
						</div>
					)}
				</Panel>
				<Panel
					title={t('player.equipment.currency')}
					action={
						canManage ? (
							<Button variant="ghost" size="sm" onClick={() => void consolidate()}>
								{t('player.equipment.consolidate')}
							</Button>
						) : undefined
					}
				>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
						{COIN_ORDER.map((coin) => (
							<div
								key={coin.key}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 'var(--space-2)',
									padding: 'var(--space-1) 0',
								}}
							>
								<span style={{ font: `700 var(--text-xs) ${T.mono}`, color: T.acc, width: 26 }}>
									{t(coin.label)}
								</span>
								<span style={{ flex: 1, font: `var(--text-sm) ${T.mono}` }}>
									{currency[coin.key]}
								</span>
								{canManage && (
									<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
										<IconButton
											icon="chevron-down"
											label={t('player.equipment.spendCoin', { coin: t(coin.label) })}
											variant="ghost"
											size="sm"
											onClick={() => void adjustCoin(coin.key, -1)}
										/>
										<IconButton
											icon="chevron-up"
											label={t('player.equipment.addCoin', { coin: t(coin.label) })}
											variant="ghost"
											size="sm"
											onClick={() => void adjustCoin(coin.key, 1)}
										/>
									</div>
								)}
							</div>
						))}
					</div>
				</Panel>
			</div>
		</div>
	);
}
