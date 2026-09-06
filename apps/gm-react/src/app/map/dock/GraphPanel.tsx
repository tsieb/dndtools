import { useMemo } from 'react';
import {
	deriveRoomGraph,
	ROOM_STOCKING_KINDS,
	withStocking,
	type MapFeature,
	type RoomGraphNode,
	type RoomStocking,
} from '@dndtools/core';
import { Select } from '../../../ds';
import { T, eb } from '../../screen-kit';
import type { MapEditorApi } from '../useMapEditor';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n';

/**
 * RC-MAP-3.4 — the room graph and the stocking editor.
 *
 * The panel answers the two questions a GM has about a dungeon they did not draw room by room: how do
 * these places connect, and what is in each one. The graph is derived by `deriveRoomGraph` in the core
 * from the features that are on the map RIGHT NOW, so it is honest about hand-drawn and imported maps
 * as well as generated ones, and it goes stale the moment the map changes rather than a moment later.
 *
 * Stocking is a durable command, not panel state: it rides an additive `props.stocking` on the room's
 * own feature and is written with `map.update-features`, so it is undoable, conflict-shaped, and
 * travels with the map to another device. There is nowhere for it to be "set" and yet not saved.
 *
 * The picture at the top is decorative (`aria-hidden`) and every node on it is a row in the list below,
 * which is where the keyboard lives: each row is a button that selects the room and a Select that keys
 * it. Nothing is reachable by pointer alone.
 */

const STOCKING_COLOR: Record<RoomStocking, string> = {
	empty: 'var(--color-text-tertiary)',
	monster: 'var(--color-status-error)',
	treasure: 'var(--color-status-warning)',
	trap: 'var(--color-status-info)',
};

const UNKEYED_COLOR = 'var(--color-border-strong)';

function stockingKey(kind: RoomStocking): MessageKey {
	return `mapGraph.stocking.${kind}` as MessageKey;
}

export function GraphPanel({
	editor,
	announce,
}: {
	editor: MapEditorApi;
	announce: (message: string) => void;
}) {
	const { t } = useI18n();
	const layers = editor.layers;

	const graph = useMemo(
		() => deriveRoomGraph(layers.map((layer) => ({ id: layer.layerId, content: layer.content }))),
		[layers],
	);
	const lockedLayers = useMemo(
		() => new Set(layers.filter((layer) => layer.locked).map((layer) => layer.layerId)),
		[layers],
	);
	const unreachable = useMemo(() => new Set(graph.unreachable), [graph]);
	const positions = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.centre])), [graph]);

	const selectedId = editor.selection.length === 1 ? (editor.selection[0] as string) : null;

	const select = (node: RoomGraphNode) => {
		editor.setSelection([node.id]);
		// Centring is what makes "selecting a node selects the room" visible on a map bigger than the
		// viewport: without it the selection is real and off screen, which reads as nothing happening.
		editor.setCenter(node.centre);
		announce(t('mapGraph.selectedRoom', { name: node.label }));
	};

	const setStocking = async (node: RoomGraphNode, stocking: RoomStocking | null) => {
		const layer = layers.find((entry) => entry.layerId === node.layerId);
		const feature = layer?.content.find((entry: MapFeature) => entry.id === node.id);
		if (!layer || !feature) {
			editor.setNotice(t('mapGraph.gone'));
			return;
		}
		const ok = await editor.run({
			type: 'map.update-features',
			actorId: editor.actorId,
			payload: {
				mapId: editor.mapId,
				layerId: node.layerId,
				features: [withStocking(feature, stocking)],
			},
		} as never);
		if (ok) {
			announce(
				stocking === null
					? t('mapGraph.cleared', { name: node.label })
					: t('mapGraph.keyed', { name: node.label, kind: t(stockingKey(stocking)) }),
			);
		}
	};

	if (graph.nodes.length === 0) {
		return (
			<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
				<div style={eb}>{t('mapGraph.title')}</div>
				<p style={{ margin: 0, font: `12px ${T.sans}`, color: T.sub }}>{t('mapGraph.empty')}</p>
			</div>
		);
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
			<div style={eb}>{t('mapGraph.title')}</div>
			<p style={{ margin: 0, font: `11px ${T.mono}`, color: T.ter }}>
				{t('mapGraph.summary', {
					rooms: graph.roomCount,
					corridors: graph.corridorCount,
					keyed: graph.stockedRooms,
				})}
			</p>
			{graph.unreachable.length > 0 && (
				<p style={{ margin: 0, font: `11.5px ${T.sans}`, color: T.warn }}>
					{t('mapGraph.unreachable', { count: graph.unreachable.length })}
				</p>
			)}

			{/* The picture. Decorative: every node here is a row below, and the rows carry the keyboard
			    path, the names and the controls. */}
			<svg
				viewBox="0 0 100 100"
				aria-hidden="true"
				focusable="false"
				preserveAspectRatio="xMidYMid meet"
				data-testid="map-graph-picture"
				style={{
					width: '100%',
					height: 160,
					background: T.sunken,
					border: `1px solid ${T.bd}`,
					borderRadius: 6,
				}}
			>
				{graph.edges.map((edge) => {
					const from = positions.get(edge.from);
					const to = positions.get(edge.to);
					if (!from || !to) return null;
					return (
						<line
							key={`${edge.from}-${edge.to}`}
							x1={from.x * 100}
							y1={from.y * 100}
							x2={to.x * 100}
							y2={to.y * 100}
							stroke={T.bd}
							strokeWidth={1}
							strokeDasharray={edge.kind === 'door' ? undefined : '2 2'}
							vectorEffect="non-scaling-stroke"
						/>
					);
				})}
				{graph.nodes.map((node) => (
					<circle
						key={node.id}
						cx={node.centre.x * 100}
						cy={node.centre.y * 100}
						r={node.kind === 'room' ? 2.6 : 1.6}
						fill={node.stocking ? STOCKING_COLOR[node.stocking] : UNKEYED_COLOR}
						stroke={node.id === selectedId ? T.acc : 'transparent'}
						strokeWidth={2}
						vectorEffect="non-scaling-stroke"
						style={{ cursor: 'pointer' }}
						onClick={() => select(node)}
					/>
				))}
			</svg>

			<ul
				aria-label={t('mapGraph.nodesLabel')}
				style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0, padding: 0 }}
			>
				{graph.nodes.map((node) => {
					const selected = node.id === selectedId;
					const locked = lockedLayers.has(node.layerId);
					return (
						<li
							key={node.id}
							style={{
								listStyle: 'none',
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: 6,
								borderRadius: 6,
								border: `1px solid ${selected ? T.acc : T.bd}`,
								background: selected ? T.alt : T.surf,
							}}
						>
							<span
								aria-hidden="true"
								style={{
									flex: '0 0 auto',
									width: 8,
									height: 8,
									borderRadius: '50%',
									background: node.stocking ? STOCKING_COLOR[node.stocking] : UNKEYED_COLOR,
								}}
							/>
							<button
								type="button"
								aria-pressed={selected}
								onClick={() => select(node)}
								style={{
									flex: 1,
									minWidth: 0,
									textAlign: 'left',
									background: 'none',
									border: 'none',
									padding: 0,
									cursor: 'pointer',
									color: T.ink,
									font: `12px ${T.sans}`,
								}}
							>
								<span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
									{node.number === null
										? node.label
										: t('mapGraph.roomLabel', { number: node.number, name: node.label })}
								</span>
								<span style={{ font: `10.5px ${T.mono}`, color: T.ter }}>
									{t('mapGraph.links', { count: node.degree })}
									{unreachable.has(node.id) ? ` · ${t('mapGraph.noWayIn')}` : ''}
								</span>
							</button>
							{/* The Select's own wrapper is not sizable from outside (ds/components/forms/Select.jsx
							    styles the <select>, not the div), so the column width lives here. */}
							<div style={{ flex: '0 0 122px' }}>
								<Select
									value={node.stocking ?? ''}
									disabled={!editor.isDm || locked}
									aria-label={t('mapGraph.stockingFor', { name: node.label })}
									options={[
										{ value: '', label: t('mapGraph.stocking.none') },
										...ROOM_STOCKING_KINDS.map((kind) => ({
											value: kind,
											label: t(stockingKey(kind)),
										})),
									]}
									onChange={(e: { target: { value: string } }) =>
										void setStocking(node, (e.target.value || null) as RoomStocking | null)
									}
								/>
							</div>
						</li>
					);
				})}
			</ul>
			{!editor.isDm && (
				<p style={{ margin: 0, font: `11.5px ${T.sans}`, color: T.ter }}>{t('mapGraph.dmOnly')}</p>
			)}
		</div>
	);
}
