import { type MapView } from '@dndtools/core';
import { Badge, Button } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { fogRegionSummary } from '../../app/fogRegions';

/** The Atlas fog-of-war rail — the durable reveal/conceal log for the open map and the two
 * shortcuts into the map editor's fog tool. Extracted from Atlas.tsx unchanged (RC-STB-2.6). */
export function FogPanel({
	mapView,
	isDm,
	selectedId,
	onOpenFog,
}: {
	mapView: MapView | null;
	isDm: boolean;
	selectedId: string | null;
	onOpenFog: (mode: 'reveal' | 'conceal') => void;
}) {
	return (
		<Panel
			title={
				<span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
					Fog of war
					<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
						{mapView?.fog.length ?? 0} {(mapView?.fog.length ?? 0) === 1 ? 'change' : 'changes'}
						{/* The list below renders `fog.slice(-4)`, so on a map with 12 ops the header
									    counted 12 over four rows with nothing saying the rest were elided. */}
						{(mapView?.fog.length ?? 0) > 4 ? ' · latest 4 shown' : ''}
					</span>
				</span>
			}
		>
			<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.sub }}>
				Revealed and concealed areas apply in order — where they overlap, the newer one wins. Every
				change is kept. Draw areas in the map editor.
			</div>
			{isDm && mapView && (
				<div style={{ display: 'flex', gap: 8 }}>
					<Button
						variant="secondary"
						size="sm"
						icon="reveal"
						disabled={!selectedId}
						onClick={() => onOpenFog('reveal')}
					>
						Reveal area
					</Button>
					<Button
						variant="secondary"
						size="sm"
						icon="conceal"
						disabled={!selectedId}
						onClick={() => onOpenFog('conceal')}
					>
						Conceal area
					</Button>
				</div>
			)}
			{mapView && mapView.fog.length > 0 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
					{mapView.fog.slice(-4).map((op) => (
						<div
							key={op.id}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								font: `11px ${T.mono}`,
								color: T.ter,
							}}
						>
							<Badge status={op.kind === 'reveal' ? 'success' : 'neutral'}>
								{op.kind === 'reveal' ? 'Revealed' : 'Concealed'}
							</Badge>
							#{op.sequence} · {fogRegionSummary(op.region)}
						</div>
					))}
				</div>
			)}
		</Panel>
	);
}
