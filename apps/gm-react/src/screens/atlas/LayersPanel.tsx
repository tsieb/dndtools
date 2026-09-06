import { type MapLayerQueryEntry, type SceneVisibility } from '@dndtools/core';
import { EmptyState, Icon, IconButton, Skeleton, Switch, VisibilityChip } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { CATEGORY_LABEL, CATEGORY_VAR, VIS_CHIP, VIS_LABEL } from '../../app/map/mapVisibility';
import { ghostBtn } from './shared';
import { useI18n } from '../../i18n';

/** The Atlas layers rail — reorder, visibility and enabled state for the actor-visible layers of
 * the open map. Extracted from Atlas.tsx unchanged (RC-STB-2.6). */
export function LayersPanel({
	layers,
	hiddenMatchCount,
	isDm,
	loading,
	busy,
	selectedId,
	onAddLayer,
	onReorderLayer,
	onToggleLayerVisibility,
	onToggleLayerEnabled,
}: {
	layers: MapLayerQueryEntry[];
	hiddenMatchCount: number;
	isDm: boolean;
	loading: boolean;
	busy: boolean;
	selectedId: string | null;
	onAddLayer: () => void;
	onReorderLayer: (layerId: string, toOrder: number) => void;
	onToggleLayerVisibility: (layerId: string, visibility: SceneVisibility) => void;
	onToggleLayerEnabled: (layerId: string, enabled: boolean) => void;
}) {
	const { t } = useI18n();
	return (
		<Panel
			title={
				<span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
					{t('atlas.layers')}
					<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
						{layers.length}
						{isDm && hiddenMatchCount > 0
							? ` · ${t('atlas.hiddenCount', { count: hiddenMatchCount })}`
							: ''}
					</span>
				</span>
			}
			action={
				isDm && selectedId ? (
					<IconButton
						icon="add"
						label={t('atlas.addLayer')}
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={onAddLayer}
					/>
				) : undefined
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
				{layers.map((l, i) => (
					<div
						key={l.layerId}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 9,
							padding: '8px 6px',
							borderRadius: 8,
							background: l.enabled ? 'transparent' : T.alt,
						}}
					>
						{isDm ? (
							// A gap between the two: they are opposite, irreversible-ish writes stacked
							// directly on top of each other, so touching edges make a near-miss land on
							// the wrong one.
							<span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
								<button
									type="button"
									title={t('atlas.moveUp')}
									aria-label={t('atlas.moveLayerUp', { name: l.name })}
									disabled={busy || i === 0}
									onClick={() => onReorderLayer(l.layerId, i - 1)}
									style={{ ...ghostBtn, opacity: i === 0 ? 0.3 : 1 }}
								>
									<Icon name="chevron-up" size={12} color={T.ter} />
								</button>
								<button
									type="button"
									title={t('atlas.moveDown')}
									aria-label={t('atlas.moveLayerDown', { name: l.name })}
									disabled={busy || i === layers.length - 1}
									onClick={() => onReorderLayer(l.layerId, i + 1)}
									style={{ ...ghostBtn, opacity: i === layers.length - 1 ? 0.3 : 1 }}
								>
									<Icon name="chevron-down" size={12} color={T.ter} />
								</button>
							</span>
						) : (
							// A spacer, not a drag handle: there is no drag implementation anywhere in
							// this screen — even the DM reorders with the Move up / Move down buttons
							// above — so a player was shown the universal reorder affordance on a
							// read-only list and got no response to either drag or click. Keep the
							// width so the rows still line up under the DM's chevron column.
							<span style={{ width: 14, flex: '0 0 auto' }} aria-hidden="true" />
						)}
						<span
							style={{
								width: 10,
								height: 10,
								borderRadius: 3,
								background: `var(${CATEGORY_VAR[l.category] ?? '--layer-base'})`,
								flex: '0 0 auto',
							}}
						/>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									font: `12.5px ${T.sans}`,
									color: l.enabled ? T.ink : T.ter,
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
								}}
							>
								{l.name}
							</div>
							<div style={{ font: `10.5px ${T.mono}`, color: T.ter }}>
								{CATEGORY_LABEL[l.category] ?? l.category} · {Math.round(l.opacity * 100)}% ·{' '}
								{t('atlas.marks', { count: l.content.length })}
								{/* `locked` was never rendered, so the only way to discover it was to
											    act and be refused ("Layer … is locked — unlock it first").
											    Text, not an icon: this line is already the row's status area. */}
								{l.locked ? ` · ${t('atlas.locked')}` : ''}
							</div>
						</div>
						{isDm ? (
							<>
								{/* compact chip = the grayscale-safe status display; the button stays the toggle */}
								<button
									type="button"
									title={t('atlas.visibilityToggleTitle', {
										visibility: VIS_LABEL[l.visibility] ?? l.visibility,
									})}
									aria-label={t('atlas.visibilityToggleLabel', {
										name: l.name,
										visibility: VIS_LABEL[l.visibility] ?? l.visibility,
									})}
									disabled={busy}
									onClick={() => onToggleLayerVisibility(l.layerId, l.visibility)}
									style={ghostBtn}
								>
									<VisibilityChip level={VIS_CHIP[l.visibility] ?? 'dm-only'} compact />
								</button>
								<Switch
									checked={l.enabled}
									aria-label={t('atlas.showLayer', { name: l.name })}
									// The only control in the row that stayed live mid-dispatch, so a second
									// click was swallowed by `run`'s busy guard with no feedback at all.
									// SOFT, not native: `busy` flips synchronously inside this switch's own
									// change handler, so a hard `disabled` disabled the control under the
									// user's own focus and the browser dropped focus to `<body>` mid-toggle.
									aria-disabled={busy || undefined}
									onChange={() => onToggleLayerEnabled(l.layerId, l.enabled)}
								/>
							</>
						) : (
							<VisibilityChip level={VIS_CHIP[l.visibility] ?? 'dm-only'} />
						)}
					</div>
				))}
				{layers.length === 0 &&
					(loading ? (
						<Skeleton height={44} />
					) : (
						<EmptyState
							inset
							icon="layers"
							title={t('atlas.noLayers')}
							description={isDm && selectedId ? t('atlas.addLayerHint') : undefined}
						/>
					))}
			</div>
		</Panel>
	);
}
