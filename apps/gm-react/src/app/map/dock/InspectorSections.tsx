import type { ReactNode } from 'react';
import type { SceneVisibility } from '@dndtools/core';
import { Button, ConditionBadge, HPBar } from '../../../ds';
import { T, eb } from '../../screen-kit';
import type { MapEditorApi } from '../useMapEditor';
import { VIS_TEXT, bulkResultMessage } from '../mapVocab';
import { useI18n } from '../../../i18n';
import { tokenToolHint } from '../tools';
import type { CombatRosterEntry } from '../canvas/useCombatTokens';

/**
 * The inspector's shared section shell, its multi-select surface, and the RC-MAP-2.1 combat roster.
 *
 * A pure move out of `InspectorPanel.tsx` (RC-ENG-2.2 — that file had grown past its RC-STB-2.7
 * grandfathered baseline, which caps growth rather than permitting it). The markup, the commands
 * and the announcements are unchanged; only `Section` became exported so both files can use it.
 */

/** A labelled group inside the inspector. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
			<div style={eb}>{title}</div>
			{children}
		</div>
	);
}

// ── Multi-select ────────────────────────────────────────────────────────────────────────────────
export function MultiInspector({
	editor,
	announce,
}: {
	editor: MapEditorApi;
	announce: (m: string) => void;
}) {
	const { t } = useI18n();
	const { run, actorId, mapId } = editor;
	const pois = editor.map?.pois ?? [];
	const tokens = editor.map?.tokens ?? [];
	const selectedPois = pois.filter((p) => editor.selection.includes(p.id));
	const selectedTokens = tokens.filter((t) => editor.selection.includes(t.id));

	// `run` executes one command at a time and rejects re-entrant calls, so these loops MUST await.
	// Firing them synchronously applied only the first object while announcing the whole selection
	// had changed — and then cleared the selection, hiding the failure entirely.
	const setVisibility = async (visibility: SceneVisibility) => {
		let changed = 0;
		for (const p of selectedPois) {
			if (
				await run({
					type: 'map.update-poi',
					actorId,
					payload: { mapId, poiId: p.id, visibility },
				} as never)
			)
				changed += 1;
			else break;
		}
		for (const t of selectedTokens) {
			if (
				await run({
					type: 'map.update-token',
					actorId,
					payload: { mapId, tokenId: t.id, visibility },
				} as never)
			)
				changed += 1;
			else break;
		}
		announce(
			bulkResultMessage({
				done: changed,
				attempted: selectedPois.length + selectedTokens.length,
				template: `Set {objects} to ${VIS_TEXT[visibility]}.`,
				refusedVerb: 'changed',
			}),
		);
	};
	const deleteAll = async () => {
		const attempted = selectedPois.length + selectedTokens.length;
		const removed = new Set<string>();
		let deleted = 0;
		for (const p of selectedPois) {
			if (
				await run({ type: 'map.delete-poi', actorId, payload: { mapId, poiId: p.id } } as never)
			) {
				deleted += 1;
				removed.add(p.id);
			} else break;
		}
		for (const t of selectedTokens) {
			if (
				await run({ type: 'map.delete-token', actorId, payload: { mapId, tokenId: t.id } } as never)
			) {
				deleted += 1;
				removed.add(t.id);
			} else break;
		}
		// Clearing the selection on a REFUSAL destroyed the only state the DM could retry from after
		// unlocking the layer — and "Deleted 0 objects." claimed the work had happened. Same defect
		// run #21 fixed in `keyboard.ts`'s `deleteSelection`; this is its sibling call site.
		//
		// A PARTIAL refusal has the same shape and `deleted > 0` did not cover it: the loops stop on
		// the first refusal, so the survivors stayed on the map with their selection wiped, under a
		// message that (correctly) said the rest were refused but left nothing to retry with. Retire
		// only the ids that really went.
		if (deleted > 0) editor.setSelection(editor.selection.filter((id) => !removed.has(id)));
		announce(
			bulkResultMessage({
				done: deleted,
				attempted,
				template: 'Deleted {objects}.',
				refusedVerb: 'deleted',
			}),
		);
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
			<Section title={t('mapInspector.selectedCount', { count: editor.selection.length })}>
				<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
					{t('mapInspector.selectionBreakdown', {
						pois: selectedPois.length,
						tokens: selectedTokens.length,
					})}
				</div>
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					<Button
						variant="secondary"
						size="sm"
						icon="dm-only"
						onClick={() => setVisibility('dm-only')}
					>
						{t('common.visibility.dmOnly')}
					</Button>
					<Button
						variant="secondary"
						size="sm"
						icon="visibility-players"
						onClick={() => setVisibility('player-visible')}
					>
						{t('common.visibility.playerVisible')}
					</Button>
				</div>
				<Button variant="danger" size="sm" icon="delete" onClick={deleteAll}>
					{t('mapInspector.deleteSelection')}
				</Button>
			</Section>
		</div>
	);
}

// ── RC-MAP-2.1 — the running combat ─────────────────────────────────────────────────────────────
//
// The map editor gets its own initiative list rather than borrowing the session tracker widget,
// because the question a DM asks HERE is spatial ("who is on this map, and where"), not procedural
// ("whose turn is it"). It is the other half of the token layer's selection: clicking a token selects
// the row, clicking a row selects the token, both through the shared `SessionSelection` store.

export function CombatRosterSection({
	combat,
	selectedCombatantId,
	onSelect,
}: {
	combat: { round: number; turn: number; roster: readonly CombatRosterEntry[] };
	selectedCombatantId: string | null;
	onSelect: (combatantId: string | null) => void;
}) {
	const { t } = useI18n();
	return (
		<Section title={t('mapInspector.combat')}>
			<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
				{t('mapInspector.combatRound', {
					round: combat.round,
					turn: combat.turn + 1,
					count: combat.roster.length,
				})}
			</div>
			<div style={{ font: `12px ${T.sans}`, color: T.sub }}>{t(tokenToolHint(true))}</div>
			<ul
				aria-label={t('mapInspector.combat')}
				style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}
			>
				{combat.roster.map((row) => {
					const on = row.combatantId === selectedCombatantId;
					return (
						<li key={row.combatantId}>
							<button
								type="button"
								aria-pressed={on}
								onClick={() => onSelect(on ? null : row.combatantId)}
								style={{
									width: '100%',
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									minHeight: 44,
									padding: '6px 8px',
									textAlign: 'left',
									borderRadius: 8,
									border: `1px solid ${on ? T.accBd : T.bd}`,
									background: on ? T.accSub : T.surf,
									color: T.ink,
									font: `13px ${T.sans}`,
									cursor: 'pointer',
									opacity: row.isDefeated ? 0.7 : 1,
								}}
							>
								<span
									style={{
										flex: '0 0 auto',
										width: 6,
										height: 6,
										borderRadius: '50%',
										background: row.isActive ? T.acc : 'transparent',
									}}
								/>
								<span
									style={{
										flex: 1,
										minWidth: 0,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
								>
									{row.name}
									{row.isActive && (
										<span style={{ color: T.sub, font: `11px ${T.sans}` }}>
											{' · '}
											{t('mapInspector.combatActive')}
										</span>
									)}
								</span>
								{row.hp !== null && row.maxHp !== null && (
									<span style={{ flex: '0 0 64px' }}>
										<HPBar current={row.hp} max={row.maxHp} size="sm" showText={false} />
									</span>
								)}
								<span style={{ flex: '0 0 auto', font: `11px ${T.sans}`, color: T.sub }}>
									{row.onThisMap ? '' : t('mapInspector.combatOffMap')}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</Section>
	);
}

export function CombatantInspector({
	row,
	position,
	onClear,
}: {
	row: CombatRosterEntry;
	position: { x: number; y: number } | null;
	onClear: () => void;
}) {
	const { t } = useI18n();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Section title={t('mapInspector.combatant')}>
				<div style={{ font: `600 15px ${T.sans}`, color: T.ink }}>{row.name}</div>
				{row.isActive && (
					<div style={{ font: `12px ${T.sans}`, color: T.acc }}>
						{t('mapInspector.combatActive')}
					</div>
				)}
				{row.hp !== null && row.maxHp !== null && (
					<HPBar current={row.hp} max={row.maxHp} label={t('mapInspector.combatantHp')} />
				)}
				{row.conditions.length > 0 && (
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
						{row.conditions.map((condition) => (
							<ConditionBadge key={condition} condition={condition} />
						))}
					</div>
				)}
				<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
					{position
						? t('mapInspector.combatantAt', {
								x: Math.round(position.x * 100),
								y: Math.round(position.y * 100),
							})
						: t('mapInspector.combatantNoToken')}
				</div>
				<Button variant="ghost" onClick={onClear}>
					{t('mapInspector.combatClear')}
				</Button>
			</Section>
		</div>
	);
}
