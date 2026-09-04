import { type MapListEntry, type MapState } from '@dndtools/core';
import { Button, Icon, Skeleton, StatusDot } from '../../ds';
import { T, srOnly } from '../../app/screen-kit';
import { pickRasterAssetId } from '../../app/mapGeometry';
import { useAssetObjectUrl } from '../../platform/assetUrl';

/** Map-switcher chip thumbnail: the map's real raster bytes when they exist on this device
 *  (content-addressed asset store), else the atlas glyph. Missing bytes degrade to the glyph —
 *  never a broken image. */
function MapChipThumb({ assetId, active }: { assetId: string | null; active: boolean }) {
	const url = useAssetObjectUrl(assetId);
	if (!url) return <Icon name="atlas-map" size={14} color={active ? T.acc : T.ter} />;
	return (
		<img
			src={url}
			alt=""
			style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover', flex: '0 0 auto' }}
		/>
	);
}

/** The map switcher: one chip per actor-visible map, plus "Open in map editor" and (DM only)
 * "New map". Extracted from Atlas.tsx unchanged (RC-STB-2.6). */
export function MapChips({
	maps,
	mapsState,
	selectedId,
	delivered,
	loading,
	isDm,
	creating,
	onSelect,
	onOpenEditor,
	onToggleCreate,
}: {
	maps: MapListEntry[];
	mapsState: MapState;
	selectedId: string | null;
	delivered: Set<string>;
	loading: boolean;
	isDm: boolean;
	creating: boolean;
	onSelect: (mapId: string) => void;
	onOpenEditor: () => void;
	onToggleCreate: () => void;
}) {
	return (
		<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
			{maps.map((mp) => {
				const on = mp.id === selectedId;
				return (
					<button
						key={mp.id}
						type="button"
						// The open map was signalled by border/background/text colour alone.
						aria-current={on ? 'true' : undefined}
						onClick={() => onSelect(mp.id)}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							padding: '7px 12px',
							borderRadius: 9,
							cursor: 'pointer',
							border: `1px solid ${on ? T.accBd : T.bd}`,
							background: on ? T.accSub : T.surf,
							color: on ? T.acc : T.sub,
							font: `600 12.5px ${T.sans}`,
						}}
					>
						<MapChipThumb
							assetId={pickRasterAssetId(mapsState.maps[mp.id]?.assetIds ?? [], mapsState.assets)}
							active={on}
						/>
						{mp.name}
						{delivered.has(mp.id) && (
							// The dot alone was the ONLY cue that a map is on the players' screens
							// (WCAG 1.4.1), and `forced-colors` flattens every status colour to
							// CanvasText so it disappears entirely there. StatusDot's own docs say it
							// must never be the sole signal. The word rides in the button's accessible
							// name; the dot stays the at-a-glance cue.
							<>
								<StatusDot status="live" pulse />
								{/* A player reading their OWN chip row was told "Live to players" about
									    their own screen. Say whose screen it is. */}
								<span style={srOnly}>{isDm ? 'Live to players' : 'On your screen'}</span>
							</>
						)}
					</button>
				);
			})}
			{maps.length === 0 && loading && (
				// Hydration in flight — skeleton chips, never a premature "no maps" claim.
				<>
					<Skeleton width={128} height={33} radius={9} />
					<Skeleton width={104} height={33} radius={9} />
					<Skeleton width={118} height={33} radius={9} />
				</>
			)}
			{maps.length === 0 && !loading && (
				<span style={{ font: `13px ${T.sans}`, color: T.ter, padding: '7px 4px' }}>
					{isDm ? 'No maps yet.' : 'No maps are visible to you.'}
				</span>
			)}
			<div style={{ flex: 1 }} />
			<Button variant="ghost" size="sm" icon="edit" disabled={!selectedId} onClick={onOpenEditor}>
				Open in map editor
			</Button>
			{isDm && (
				<Button
					variant="secondary"
					size="sm"
					icon="new-map"
					aria-expanded={creating}
					onClick={onToggleCreate}
				>
					New map
				</Button>
			)}
		</div>
	);
}
