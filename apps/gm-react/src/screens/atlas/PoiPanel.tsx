import { type MapView, type SceneVisibility } from '@dndtools/core';
import { Button, EmptyState, Icon, Skeleton, VisibilityChip } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { VIS_CHIP, VIS_LABEL } from '../../app/map/mapVisibility';
import { ghostBtn } from './shared';
import { useI18n } from '../../i18n';

/** The Atlas points-of-interest rail — the actor-visible POIs of the open map, with the DM's
 * visibility toggle and delete. Extracted from Atlas.tsx unchanged (RC-STB-2.6). */
export function PoiPanel({
	mapView,
	isDm,
	loading,
	busy,
	selPoiId,
	onSelectPoi,
	onAddPoi,
	onTogglePoiVisibility,
	onDeletePoi,
}: {
	mapView: MapView | null;
	isDm: boolean;
	loading: boolean;
	busy: boolean;
	selPoiId: string | null;
	onSelectPoi: (poiId: string | null) => void;
	onAddPoi: () => void;
	onTogglePoiVisibility: (poiId: string, visibility: SceneVisibility) => void;
	onDeletePoi: (poiId: string) => void;
}) {
	const { t } = useI18n();
	return (
		<Panel
			title={
				<span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
					{t('atlas.pois')}
					<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
						{mapView?.pois.length ?? 0}
						{isDm && mapView && mapView.hidden.pois > 0
							? ` · ${t('atlas.hiddenCount', { count: mapView.hidden.pois })}`
							: ''}
					</span>
				</span>
			}
		>
			{isDm && mapView && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 6,
						paddingBottom: 10,
						borderBottom: `1px solid ${T.bd}`,
					}}
				>
					<Button variant="secondary" size="sm" icon="poi" onClick={onAddPoi}>
						{t('atlas.placePoi')}
					</Button>
					<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>{t('atlas.placePoiHint')}</div>
				</div>
			)}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
				{mapView?.pois.map((poi) => (
					<div
						key={poi.id}
						style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}
					>
						<button
							type="button"
							title={t('atlas.highlightOnMap')}
							aria-label={t('atlas.highlightPoi', { name: poi.label })}
							// The last colour-only selection state in this screen: the row's only
							// cue was the label turning accent-coloured (WCAG 1.4.1/4.1.2). The map
							// chips (aria-current) and Graph's nodes/facets (aria-pressed) already
							// expose theirs.
							aria-pressed={poi.id === selPoiId}
							onClick={() => onSelectPoi(poi.id === selPoiId ? null : poi.id)}
							style={{
								...ghostBtn,
								flex: 1,
								minWidth: 0,
								flexDirection: 'column',
								alignItems: 'flex-start',
								textAlign: 'left',
							}}
						>
							<span
								style={{
									font: `12.5px ${T.sans}`,
									color: poi.id === selPoiId ? T.acc : T.ink,
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									maxWidth: '100%',
								}}
							>
								{poi.label}
							</span>
							<span style={{ font: `10.5px ${T.mono}`, color: T.ter }}>{poi.category}</span>
						</button>
						{isDm ? (
							<>
								{/* compact chip = the grayscale-safe status display; the button stays the toggle */}
								<button
									type="button"
									title={t('atlas.visibilityToggleTitle', {
										visibility: VIS_LABEL[poi.visibility] ?? poi.visibility,
									})}
									aria-label={t('atlas.visibilityToggleLabel', {
										name: poi.label,
										visibility: VIS_LABEL[poi.visibility] ?? poi.visibility,
									})}
									disabled={busy}
									onClick={() => onTogglePoiVisibility(poi.id, poi.visibility)}
									style={ghostBtn}
								>
									<VisibilityChip level={VIS_CHIP[poi.visibility] ?? 'dm-only'} compact />
								</button>
								<button
									type="button"
									title={t('atlas.deletePoi')}
									aria-label={t('atlas.deletePoiLabel', { name: poi.label })}
									disabled={busy}
									onClick={() => onDeletePoi(poi.id)}
									style={ghostBtn}
								>
									<Icon name="delete" size={14} color={T.ter} />
								</button>
							</>
						) : (
							<VisibilityChip level={VIS_CHIP[poi.visibility] ?? 'dm-only'} />
						)}
					</div>
				))}
				{mapView && mapView.pois.length === 0 && (
					<EmptyState
						inset
						icon="poi"
						title={t(isDm ? 'atlas.noPoisDm' : 'atlas.noPoisPlayer')}
						description={isDm ? t('atlas.noPoisHint') : undefined}
					/>
				)}
				{!mapView &&
					(loading ? (
						<Skeleton height={44} />
					) : (
						<EmptyState inset icon="atlas-map" title={t('atlas.openMapForPois')} />
					))}
			</div>
		</Panel>
	);
}
