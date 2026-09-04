import { useState } from 'react';
import type { CharacterInventory, EncumbranceState, EquipmentItem } from '@dndtools/core';
import { Badge, Button, Field, Icon, IconButton, Input, ProgressMeter, Stat } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import type { Dispatch } from './shared';

// ── Equipment / currency / encumbrance — REAL structured inventory (I10 S10.1.3 / S10.4.2) ────────
const COIN_ORDER: { key: 'pp' | 'gp' | 'ep' | 'sp' | 'cp'; label: string }[] = [
	{ key: 'pp', label: 'PP' },
	{ key: 'gp', label: 'GP' },
	{ key: 'ep', label: 'EP' },
	{ key: 'sp', label: 'SP' },
	{ key: 'cp', label: 'CP' },
];
const ENCUMBRANCE_META: Record<
	EncumbranceState['level'],
	{ label: string; status: 'success' | 'warning' | 'error' }
> = {
	unencumbered: { label: 'Unencumbered', status: 'success' },
	encumbered: { label: 'Encumbered', status: 'warning' },
	'heavily-encumbered': { label: 'Heavily encumbered', status: 'warning' },
	overloaded: { label: 'Overloaded', status: 'error' },
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
	const viewport = useViewport();
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

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: viewport === 'phone' ? '1fr' : '1.4fr 1fr',
				gap: 16,
				alignItems: 'start',
			}}
		>
			<Panel title={`Equipment (${items.length})`}>
				{items.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No equipment carried yet.</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{items.map((item, i) => (
							<div
								key={item.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '8px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<Icon
									name={item.equipped ? 'shield' : 'tag'}
									size={14}
									color={item.equipped ? T.acc : T.ter}
								/>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 12.5px ${T.sans}` }}>
										{item.name}
										{item.equipped && (
											<span style={{ marginLeft: 6 }}>
												<Badge status="accent">equipped</Badge>
											</span>
										)}
									</div>
									<div style={{ font: `11px ${T.mono}`, color: T.ter }}>
										{item.weight} lb each ·{' '}
										{(item.quantity * item.weight).toFixed(item.weight % 1 ? 1 : 0)} lb total
										{item.notes ? ` · ${item.notes}` : ''}
									</div>
								</div>
								{canManage ? (
									<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
										<IconButton
											icon="chevron-down"
											// At 1, stepping down clamped to 0 and left a `×0` ghost row that stayed in
											// the list and kept accepting presses. Removing the item is a different,
											// already-present action — so say so instead of pretending to work.
											label={
												item.quantity <= 1
													? `Cannot go below one ${item.name} — use Remove ${item.name}`
													: `One fewer ${item.name}`
											}
											aria-disabled={item.quantity <= 1 ? true : undefined}
											variant="ghost"
											size="sm"
											onClick={() => void stepQty(item, -1)}
										/>
										<span style={{ font: `700 12px ${T.mono}`, minWidth: 22, textAlign: 'center' }}>
											{item.quantity}
										</span>
										<IconButton
											icon="chevron-up"
											label={`One more ${item.name}`}
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
												padding: '6px 10px',
												minHeight: 24,
												boxSizing: 'border-box',
												borderRadius: 14,
												cursor: 'pointer',
												font: `11px ${T.sans}`,
												border: `1px solid ${item.equipped ? T.accBd : T.bd}`,
												background: item.equipped ? T.accSub : T.surf,
												color: item.equipped ? T.acc : T.ter,
											}}
										>
											{item.equipped ? 'Equipped' : 'Equip'}
										</button>
										<IconButton
											icon="close"
											label={`Remove ${item.name}`}
											variant="ghost"
											size="sm"
											onClick={() => void removeItem(item)}
										/>
									</div>
								) : (
									<span style={{ font: `12px ${T.mono}`, color: T.ter }}>×{item.quantity}</span>
								)}
							</div>
						))}
					</div>
				)}
				{canManage && (
					<div
						style={{
							display: 'flex',
							gap: 8,
							marginTop: 12,
							paddingTop: 12,
							borderTop: `1px solid ${T.bd}`,
							alignItems: 'flex-end',
							flexWrap: 'wrap',
						}}
					>
						<Field label="Item">
							<Input
								value={name}
								onChange={(e: any) => setName(e.target.value)}
								placeholder="Longsword…"
							/>
						</Field>
						<Field label="Qty">
							<Input
								type="number"
								value={qty}
								onChange={(e: any) => setQty(e.target.value)}
								style={{ width: 70 }}
							/>
						</Field>
						<Field label="Weight (lb)">
							<Input
								type="number"
								value={weight}
								onChange={(e: any) => setWeight(e.target.value)}
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
							Add
						</Button>
					</div>
				)}
			</Panel>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<Panel title="Encumbrance">
					{enc && encMeta ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
								<Badge status={encMeta.status}>{encMeta.label}</Badge>
								{enc.speedPenalty !== 0 && (
									<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										Speed {enc.speedPenalty} ft
									</span>
								)}
							</div>
							<ProgressMeter
								value={Math.min(enc.carriedWeight, enc.carryCapacity)}
								max={enc.carryCapacity || 1}
								label={`${enc.carriedWeight.toFixed(enc.carriedWeight % 1 ? 1 : 0)} / ${enc.carryCapacity} lb`}
							/>
							<div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
								<Stat
									label="Items"
									value={`${enc.itemWeight.toFixed(enc.itemWeight % 1 ? 1 : 0)} lb`}
								/>
								<Stat
									label="Coins"
									value={`${enc.coinWeight.toFixed(enc.coinWeight % 1 ? 1 : 0)} lb`}
								/>
								<Stat label="Capacity" value={`${enc.carryCapacity} lb`} />
							</div>
						</div>
					) : (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No encumbrance data.</div>
					)}
				</Panel>
				<Panel
					title="Currency"
					action={
						canManage ? (
							<Button variant="ghost" size="sm" onClick={() => void consolidate()}>
								Consolidate
							</Button>
						) : undefined
					}
				>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
						{COIN_ORDER.map((coin) => (
							<div
								key={coin.key}
								style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}
							>
								<span style={{ font: `700 12px ${T.mono}`, color: T.acc, width: 26 }}>
									{coin.label}
								</span>
								<span style={{ flex: 1, font: `13px ${T.mono}` }}>{currency[coin.key]}</span>
								{canManage && (
									<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
										<IconButton
											icon="chevron-down"
											label={`Spend one ${coin.label}`}
											variant="ghost"
											size="sm"
											onClick={() => void adjustCoin(coin.key, -1)}
										/>
										<IconButton
											icon="chevron-up"
											label={`Add one ${coin.label}`}
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
