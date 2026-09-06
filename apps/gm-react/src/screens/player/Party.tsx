import { useState } from 'react';
import type { PartyOverview } from '@dndtools/core';
import {
	Avatar,
	Badge,
	Button,
	Chip,
	ConditionBadge,
	HPBar,
	Icon,
	IconButton,
	Input,
	Toaster,
} from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { condKey, type Dispatch } from './shared';

// ── Party — real overview + DM-only logistics (marching order / shared stash, CHAR-011) ──────────
export function PlayerParty({
	party,
	selfId,
	isDm,
	actorId,
	compact,
	dispatch,
}: {
	party: PartyOverview;
	selfId: string;
	isDm: boolean;
	actorId: string;
	compact: boolean;
	dispatch: Dispatch;
}) {
	const { t } = useI18n();
	// Real party overview — members are the visible PCs only (DM-only NPCs never reach this list).
	const members = party.members.filter((m) => m.kind === 'pc');
	const [itemName, setItemName] = useState('');
	const [itemDetail, setItemDetail] = useState('');

	const setOrder = (order: string[]) =>
		dispatch({ type: 'character.set-marching-order', actorId, payload: { order } });
	const moveUp = (index: number) => {
		if (index <= 0) return;
		const next = [...party.marchingOrder];
		[next[index - 1], next[index]] = [next[index], next[index - 1]];
		void setOrder(next);
	};
	// The order was move-UP-only, so pushing the front rank to the back of a five-person marching
	// order meant pressing "Move X up" on the four below it in the right sequence, and the LAST member
	// could not be moved down at all. `SceneCardsPanel` and `Atlas` both ship the pair.
	const moveDown = (index: number) => {
		if (index < 0 || index >= party.marchingOrder.length - 1) return;
		const next = [...party.marchingOrder];
		[next[index], next[index + 1]] = [next[index + 1], next[index]];
		void setOrder(next);
	};
	// Clearing the order is a one-click destroy of DM-authored data behind a button labelled just
	// "Clear" in a Panel header, which reads like a filter reset. `setOrder(previous)` is its exact
	// inverse, and the shared stash's Remove one column over already ships this toast.
	const clearOrder = async () => {
		const previous = [...party.marchingOrder];
		const ok = await setOrder([]);
		if (!ok) return;
		Toaster.success(t('player.party.orderCleared'), {
			action: t('common.action.undo'),
			onAction: () => {
				void setOrder(previous).then((restored) => {
					if (restored) Toaster.success(t('player.party.orderRestored'));
				});
			},
		});
	};
	const addItem = async () => {
		if (!itemName.trim()) return;
		// Authored on the player surface, so it's shared with the party (not the dm-only default).
		const ok = await dispatch({
			type: 'character.upsert-party-inventory-item',
			actorId,
			payload: {
				name: itemName.trim(),
				detail: itemDetail.trim(),
				visibility: 'player-visible',
				sharedWith: [],
			},
		});
		if (ok) {
			setItemName('');
			setItemDetail('');
		}
	};
	// Removal is instant with an UNDO toast — the undo re-creates the item through the same upsert
	// command, preserving its id via the schema's optional `id` (same pattern as scene delete).
	const removeItem = async (item: PartyOverview['inventory'][number]) => {
		const ok = await dispatch({
			type: 'character.remove-party-inventory-item',
			actorId,
			payload: { itemId: item.id },
		});
		if (!ok) return;
		Toaster.success(t('player.party.itemRemoved', { name: item.name }), {
			action: t('common.action.undo'),
			onAction: () => {
				void dispatch({
					type: 'character.upsert-party-inventory-item',
					actorId,
					payload: {
						id: item.id,
						name: item.name,
						detail: item.detail,
						visibility: item.visibility,
						sharedWith: [],
					},
				}).then((restored) => {
					if (restored) Toaster.success(t('player.party.itemRestored', { name: item.name }));
				});
			},
		});
	};

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'minmax(0,1.4fr) minmax(0,1fr)',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<Panel
				title={t('player.party.title')}
				action={
					<Badge status="neutral">{t('player.party.memberCount', { count: members.length })}</Badge>
				}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
					{members.map((p) => {
						const downed = p.hp === 0;
						const self = p.characterId === selfId;
						return (
							<div
								key={p.characterId}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 13,
									padding: 12,
									borderRadius: 11,
									border: `1px solid ${downed ? 'var(--color-status-error-border)' : self ? T.accBd : T.bd}`,
									background: downed
										? 'var(--color-status-error-subtle)'
										: self
											? T.accSub
											: T.surf,
								}}
							>
								<Avatar
									name={p.name}
									size="sm"
									ring={downed ? 'danger' : self ? 'active' : 'none'}
								/>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
										<span style={{ font: `600 13.5px ${T.sans}` }}>{p.name}</span>
										{self && <Badge status="accent">{t('player.party.you')}</Badge>}
										<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
											{t('player.party.ac', { ac: p.ac })}
										</span>
									</div>
									<div style={{ marginTop: 5, maxWidth: 240 }}>
										<HPBar current={p.hp} max={p.maxHp} size="sm" />
									</div>
									<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: 4 }}>
										{t('player.party.slotsAndResources', {
											slots: p.availableSpellSlots,
											resources: p.availableClassResources,
										})}
									</div>
								</div>
								<div
									style={{
										display: 'flex',
										flexDirection: 'column',
										gap: 5,
										alignItems: 'flex-end',
									}}
								>
									{p.conditions.length ? (
										p.conditions.map((c) => {
											const k = condKey(c);
											return k ? (
												<ConditionBadge key={c} condition={k} compact />
											) : (
												<Chip key={c} tone="neutral">
													{c}
												</Chip>
											);
										})
									) : (
										<span style={{ font: `11px ${T.sans}`, color: T.ter }}>—</span>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</Panel>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<Panel
					title={t('player.party.marchingOrder')}
					action={
						isDm && party.marchingOrder.length > 0 ? (
							<Button variant="ghost" size="sm" onClick={() => void clearOrder()}>
								{t('player.party.clearOrder')}
							</Button>
						) : undefined
					}
				>
					{party.marchingOrder.length === 0 ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
								{t('player.party.noOrder')}
							</div>
							{isDm && members.length > 0 && (
								<Button
									variant="secondary"
									size="sm"
									icon="players"
									onClick={() => setOrder(members.map((m) => m.characterId))}
								>
									{t('player.party.setFromRoster')}
								</Button>
							)}
						</div>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column' }}>
							{party.marchingOrder.map((id, i) => {
								const m = party.members.find((x) => x.characterId === id);
								return (
									<div
										key={id}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 9,
											padding: '5px 0',
											borderTop: i ? `1px solid ${T.bd}` : 'none',
										}}
									>
										<span
											style={{
												font: `700 12px ${T.mono}`,
												color: T.acc,
												width: 18,
												textAlign: 'center',
											}}
										>
											{i + 1}
										</span>
										<span style={{ flex: 1, font: `12.5px ${T.sans}` }}>{m?.name ?? id}</span>
										{/* RENDERED-and-disabled at the ends, not omitted: dropping the control off row 1
										    collapsed that row's right gutter, so its name column ran ~28px wider
										    than every other row and the list visibly stepped in at the top. Same
										    shape SceneCardsPanel and Atlas already use. */}
										{isDm && (
											<>
												{/* …and SOFT-disabled at the ends: promoting a member to rank 1 is the normal
												    way to use this, and a native `disabled` applied at that moment removed the
												    button the DM had just pressed from the tab order, dropping focus to <body>.
												    Soft keeps the tab stop, the name and the explanation. */}
												<IconButton
													icon="chevron-up"
													label={t('player.party.moveUp', {
														name: m?.name ?? t('player.party.member'),
													})}
													variant="ghost"
													size="sm"
													aria-disabled={i === 0 || undefined}
													onClick={() => {
														if (i === 0) return;
														moveUp(i);
													}}
												/>
												<IconButton
													icon="chevron-down"
													label={t('player.party.moveDown', {
														name: m?.name ?? t('player.party.member'),
													})}
													variant="ghost"
													size="sm"
													aria-disabled={i === party.marchingOrder.length - 1 || undefined}
													onClick={() => {
														if (i === party.marchingOrder.length - 1) return;
														moveDown(i);
													}}
												/>
											</>
										)}
									</div>
								);
							})}
						</div>
					)}
				</Panel>
				<Panel title={t('player.party.stash')}>
					{party.inventory.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							{t('player.party.stashEmpty')}
						</div>
					) : (
						party.inventory.map((s, i) => (
							<div
								key={s.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '7px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<Icon name="tag" size={14} color={T.ter} />
								<span style={{ flex: 1, font: `12.5px ${T.sans}` }}>{s.name}</span>
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>{s.detail}</span>
								{isDm && s.visibility === 'dm-only' && (
									<Badge status="neutral" icon="hidden">
										{t('common.visibility.dmOnly')}
									</Badge>
								)}
								{isDm && (
									<IconButton
										icon="close"
										label={t('player.party.removeItem', { name: s.name })}
										variant="ghost"
										size="sm"
										onClick={() => void removeItem(s)}
									/>
								)}
							</div>
						))
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
									value={itemName}
									aria-label={t('player.party.itemName')}
									onChange={(e: any) => setItemName(e.target.value)}
									placeholder={t('player.party.itemNamePlaceholder')}
									style={{ flex: 1 }}
								/>
								<Input
									value={itemDetail}
									aria-label={t('player.party.itemDetail')}
									onChange={(e: any) => setItemDetail(e.target.value)}
									placeholder={t('player.party.itemDetailPlaceholder')}
									style={{ flex: 1 }}
								/>
							</div>
							<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
								<Button
									variant="secondary"
									size="sm"
									icon="add"
									disabled={!itemName.trim()}
									onClick={addItem}
								>
									{t('player.party.addToStash')}
								</Button>
							</div>
						</div>
					)}
				</Panel>
			</div>
		</div>
	);
}
