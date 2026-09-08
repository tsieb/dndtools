import { useState } from 'react';
import type { CharacterInventory, PartyOverview } from '@dndtools/core';
import { encumbranceLevelFor } from '@dndtools/core';
import { Badge, Button, EmptyState, Icon, IconButton, Input, Select, Toaster } from '../../ds';
import type { DSChangeEvent } from '../../ds';
import { Panel, T } from '../screen-kit';
import { useI18n } from '../../i18n';
import type { Dispatch } from '../../screens/player/shared';

/**
 * RC-CHR-3.2 — Party stash v2. Replaces the name/detail-only stash embedded in
 * `screens/player/Party.tsx` (v1, CHAR-011) with quantity/weight per item (already durable on the
 * item since I10 S10.4.2 — this panel is the first UI to show it), moving items between the stash
 * and a PC, and an encumbrance baseline.
 *
 * Authority mirrors the EXISTING commands exactly (no new core command):
 *   - Add / remove a stash item — DM-only (`character.upsert/remove-party-inventory-item`, unchanged
 *     authority from v1).
 *   - Claim an item to the selected PC — owner-or-DM of that PC (`character.claim-party-inventory-item`,
 *     already atomic: removes/reduces the stash stack and adds the equipment line in one command).
 *   - Deposit an item FROM the selected PC's equipment INTO the stash — DM-only, because it composes
 *     `character.upsert/remove-equipment-item` (owner-or-DM) with `character.upsert-party-inventory-item`
 *     (DM-only); the second step's authority is the binding one, so the action is gated the same way
 *     in the UI rather than offering a control that fails for a player half the time.
 *
 * "Loot log from encounters" — the stash carries no per-item timestamp, but new items are always
 * appended to the end of `party.inventory` (state/character-state.ts `upsertPartyInventoryItem`), so
 * reversing the visible list reads newest-first: the "Recent activity" section below IS that log,
 * fed by whatever the DM writes in an item's `detail` field (e.g. "Goblin ambush, cave B"). Wiring an
 * AUTOMATIC entry when an encounter concludes needs a durable encounter/reward record that does not
 * exist yet — HANDOFF to whichever story adds one (combat-tracker.ts / encounter.ts), outside this
 * story's `Owns: app/character/PartyStash.tsx`.
 */

// Message keys are dotted-camelCase (no hyphens — `i18n/index.test.ts` enforces the convention), so
// the core's hyphenated `EncumbranceLevel` values need this one translation.
const ENCUMBRANCE_KEY: Record<
	ReturnType<typeof encumbranceLevelFor>,
	'unencumbered' | 'encumbered' | 'heavilyEncumbered' | 'overloaded'
> = {
	unencumbered: 'unencumbered',
	encumbered: 'encumbered',
	'heavily-encumbered': 'heavilyEncumbered',
	overloaded: 'overloaded',
};

export function PartyStash({
	party,
	partyStrength,
	selfId,
	selfName,
	selfInventory,
	isDm,
	canClaim,
	actorId,
	dispatch,
}: {
	party: PartyOverview;
	partyStrength: number;
	selfId: string;
	selfName: string;
	selfInventory: CharacterInventory | null;
	isDm: boolean;
	canClaim: boolean;
	actorId: string;
	dispatch: Dispatch;
}) {
	const { t } = useI18n();
	const [name, setName] = useState('');
	const [detail, setDetail] = useState('');
	const [qty, setQty] = useState('1');
	const [weight, setWeight] = useState('0');
	const [depositItemId, setDepositItemId] = useState('');
	const [depositQty, setDepositQty] = useState('1');

	const totalWeight = party.inventory.reduce((sum, item) => sum + item.quantity * item.weight, 0);
	const level = encumbranceLevelFor(totalWeight, partyStrength);
	const capacity = partyStrength * 15;

	const addItem = async () => {
		if (!name.trim()) return;
		const ok = await dispatch({
			type: 'character.upsert-party-inventory-item',
			actorId,
			payload: {
				name: name.trim(),
				detail: detail.trim(),
				quantity: Math.max(0, Math.trunc(Number(qty)) || 0),
				weight: Math.max(0, Number(weight)) || 0,
				visibility: 'player-visible',
				sharedWith: [],
			},
		});
		if (ok) {
			setName('');
			setDetail('');
			setQty('1');
			setWeight('0');
		}
	};

	// Removal is instant with an UNDO toast, mirroring the v1 stash's pattern.
	const removeItem = async (item: PartyOverview['inventory'][number]) => {
		const ok = await dispatch({
			type: 'character.remove-party-inventory-item',
			actorId,
			payload: { itemId: item.id },
		});
		if (!ok) return;
		Toaster.success(t('player.stash.itemRemoved', { name: item.name }), {
			action: t('common.action.undo'),
			onAction: () => {
				void dispatch({
					type: 'character.upsert-party-inventory-item',
					actorId,
					payload: {
						id: item.id,
						name: item.name,
						detail: item.detail,
						quantity: item.quantity,
						weight: item.weight,
						visibility: item.visibility,
						sharedWith: [],
					},
				}).then((restored) => {
					if (restored) Toaster.success(t('player.stash.itemRestored', { name: item.name }));
				});
			},
		});
	};

	// Claim — the ATOMIC core command; the whole remaining stack goes to the selected PC.
	const claimItem = (item: PartyOverview['inventory'][number]) =>
		dispatch({
			type: 'character.claim-party-inventory-item',
			actorId,
			payload: { characterId: selfId, itemId: item.id },
		}).then((ok) => {
			if (ok) Toaster.success(t('player.stash.claimed', { name: item.name, character: selfName }));
		});

	// Deposit — composes the two existing commands (see file docstring for the authority rationale).
	const depositItem = async () => {
		const item = selfInventory?.items.find((i) => i.id === depositItemId);
		if (!item) return;
		const amount = Math.min(item.quantity, Math.max(1, Math.trunc(Number(depositQty)) || 1));
		const removeOk =
			amount >= item.quantity
				? await dispatch({
						type: 'character.remove-equipment-item',
						actorId,
						payload: { characterId: selfId, itemId: item.id },
					})
				: await dispatch({
						type: 'character.upsert-equipment-item',
						actorId,
						payload: {
							characterId: selfId,
							id: item.id,
							name: item.name,
							quantity: item.quantity - amount,
						},
					});
		if (!removeOk) return;
		const ok = await dispatch({
			type: 'character.upsert-party-inventory-item',
			actorId,
			payload: {
				name: item.name,
				detail: t('player.stash.depositedFrom', { character: selfName }),
				quantity: amount,
				weight: item.weight,
				visibility: 'player-visible',
				sharedWith: [],
			},
		});
		if (ok) {
			setDepositItemId('');
			setDepositQty('1');
		}
	};

	// "Recent activity" — newest-first, the stash's only ordering signal (see docstring).
	const recent = [...party.inventory].reverse();

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel
				title={t('player.stash.title')}
				action={
					<Badge
						status={
							level === 'unencumbered' ? 'neutral' : level === 'encumbered' ? 'warning' : 'error'
						}
					>
						{t(`player.stash.encumbrance.${ENCUMBRANCE_KEY[level]}`, {
							weight: Math.round(totalWeight),
							capacity: Math.round(capacity),
						})}
					</Badge>
				}
			>
				{party.inventory.length === 0 ? (
					<EmptyState
						inset
						icon="tag"
						title={t('player.stash.emptyTitle')}
						description={t('player.stash.emptyBody')}
					/>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{party.inventory.map((item, i) => (
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
								<Icon name="tag" size={14} color={T.ter} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `12.5px ${T.sans}` }}>
										{item.name}
										{item.quantity !== 1 && <span style={{ color: T.ter }}> ×{item.quantity}</span>}
									</div>
									{item.detail && (
										<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{item.detail}</div>
									)}
								</div>
								{isDm && item.visibility === 'dm-only' && (
									<Badge status="neutral" icon="hidden">
										{t('common.visibility.dmOnly')}
									</Badge>
								)}
								{canClaim && (
									<Button variant="ghost" size="sm" onClick={() => void claimItem(item)}>
										{t('player.stash.claim', { character: selfName })}
									</Button>
								)}
								{isDm && (
									<IconButton
										icon="close"
										label={t('player.stash.removeItem', { name: item.name })}
										variant="ghost"
										size="sm"
										onClick={() => void removeItem(item)}
									/>
								)}
							</div>
						))}
					</div>
				)}
				{isDm && (
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 8,
							marginTop: 10,
							paddingTop: 12,
							borderTop: `1px solid ${T.bd}`,
						}}
					>
						<div style={{ display: 'flex', gap: 8 }}>
							<Input
								value={name}
								aria-label={t('player.stash.itemName')}
								onChange={(e: DSChangeEvent) => setName(e.target.value)}
								placeholder={t('player.stash.itemNamePlaceholder')}
								style={{ flex: 2 }}
							/>
							<Input
								type="number"
								value={qty}
								aria-label={t('player.stash.itemQuantity')}
								onChange={(e: DSChangeEvent) => setQty(e.target.value)}
								style={{ flex: 1 }}
							/>
							<Input
								type="number"
								value={weight}
								aria-label={t('player.stash.itemWeight')}
								onChange={(e: DSChangeEvent) => setWeight(e.target.value)}
								style={{ flex: 1 }}
							/>
						</div>
						<Input
							value={detail}
							aria-label={t('player.stash.itemDetail')}
							onChange={(e: DSChangeEvent) => setDetail(e.target.value)}
							placeholder={t('player.stash.itemDetailPlaceholder')}
						/>
						<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
							<Button
								variant="secondary"
								size="sm"
								icon="add"
								disabled={!name.trim()}
								onClick={() => void addItem()}
							>
								{t('player.stash.addToStash')}
							</Button>
						</div>
					</div>
				)}
				{isDm && selfInventory && selfInventory.items.length > 0 && (
					<div
						style={{
							display: 'flex',
							gap: 8,
							alignItems: 'center',
							marginTop: 10,
							paddingTop: 12,
							borderTop: `1px solid ${T.bd}`,
						}}
					>
						<Select
							value={depositItemId}
							onChange={(e: DSChangeEvent) => setDepositItemId(e.target.value)}
							options={[
								{ value: '', label: t('player.stash.depositPlaceholder') },
								...selfInventory.items.map((item) => ({
									value: item.id,
									label: `${item.name} ×${item.quantity}`,
								})),
							]}
							aria-label={t('player.stash.depositItem')}
							style={{ flex: 2 }}
						/>
						<Input
							type="number"
							value={depositQty}
							aria-label={t('player.stash.depositQuantity')}
							onChange={(e: DSChangeEvent) => setDepositQty(e.target.value)}
							style={{ width: 70 }}
						/>
						<Button
							variant="ghost"
							size="sm"
							disabled={!depositItemId}
							onClick={() => void depositItem()}
						>
							{t('player.stash.deposit', { character: selfName })}
						</Button>
					</div>
				)}
			</Panel>
			<Panel title={t('player.stash.recentActivity')}>
				{recent.length === 0 ? (
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{t('player.stash.emptyBody')}</div>
				) : (
					recent.slice(0, 10).map((item, i) => (
						<div
							key={item.id}
							style={{ padding: '7px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}
						>
							<span style={{ font: `12px ${T.sans}` }}>
								{item.name}
								{item.quantity !== 1 ? ` ×${item.quantity}` : ''}
							</span>
							{item.detail && (
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}> — {item.detail}</span>
							)}
						</div>
					))
				)}
			</Panel>
		</div>
	);
}
