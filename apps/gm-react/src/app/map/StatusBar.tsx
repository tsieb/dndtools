import { Icon } from '../../ds';
import { T } from '../screen-kit';
import type { MapEditorApi } from './useMapEditor';
import { TOOLS_BY_ID } from './tools';

/**
 * MAP-021 — the editor status bar: active tool · active layer · zoom% · cursor x,y · N selected · a
 * one-line hint. A calm, always-present readout so the DM never has to guess what a click will do.
 */
export function StatusBar({
	editor,
	cursor,
	activeLayerName,
}: {
	editor: MapEditorApi;
	cursor: { x: number; y: number } | null;
	activeLayerName: string | null;
}) {
	const def = TOOLS_BY_ID.get(editor.tool);
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 16,
				padding: '5px 14px',
				borderTop: `1px solid ${T.bd}`,
				background: T.surf,
				font: `10.5px ${T.mono}`,
				color: T.ter,
				flex: '0 0 auto',
				flexWrap: 'wrap',
			}}
		>
			<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
				<Icon name={def?.icon ?? 'tool-select'} size={12} color={T.ter} />
				{def?.label ?? editor.tool}
			</span>
			<span>Layer: {activeLayerName ?? '—'}</span>
			<span>{Math.round(editor.zoom * 100)}%</span>
			<span>
				x {cursor ? cursor.x.toFixed(3) : '—'} · y {cursor ? cursor.y.toFixed(3) : '—'}
			</span>
			{editor.selection.length > 0 && (
				<span style={{ color: T.acc }}>{editor.selection.length} selected</span>
			)}
			<div style={{ flex: 1 }} />
			<span
				style={{
					maxWidth: '48%',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					fontFamily: T.sans,
				}}
			>
				{def?.hint}
			</span>
		</div>
	);
}
