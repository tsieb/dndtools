import { type MapView } from '@dndtools/core';
import { Badge, Button } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { fogRegionSummary } from '../../app/fogRegions';
import { useI18n } from '../../i18n';

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
	const { t } = useI18n();
	return (
		<Panel
			title={
				<span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
					{t('atlas.fogOfWar')}
					<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
						{t('atlas.fogChanges', { count: mapView?.fog.length ?? 0 })}
						{/* The list below renders `fog.slice(-4)`, so on a map with 12 ops the header
									    counted 12 over four rows with nothing saying the rest were elided. */}
						{(mapView?.fog.length ?? 0) > 4 ? ` · ${t('atlas.latestFourShown')}` : ''}
					</span>
				</span>
			}
		>
			<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.sub }}>{t('atlas.fogIntro')}</div>
			{isDm && mapView && (
				<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
					<Button
						variant="secondary"
						size="sm"
						icon="reveal"
						disabled={!selectedId}
						onClick={() => onOpenFog('reveal')}
					>
						{t('atlas.revealArea')}
					</Button>
					<Button
						variant="secondary"
						size="sm"
						icon="conceal"
						disabled={!selectedId}
						onClick={() => onOpenFog('conceal')}
					>
						{t('atlas.concealArea')}
					</Button>
				</div>
			)}
			{mapView && mapView.fog.length > 0 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
					{mapView.fog.slice(-4).map((op) => (
						<div
							key={op.id}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
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
