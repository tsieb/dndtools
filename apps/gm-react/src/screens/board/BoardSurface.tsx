import { SceneBoardCanvas, type ZoomPreset } from '../../app/SceneBoardCanvas';
import type { BoardWidget } from '../../app/board-helpers';
import { FlowBoard } from '../../app/canvas/FlowBoard';
import { PhoneNavigator } from '../../app/canvas/PhoneNavigator';
import { StackedBoard, type StackedPosture } from '../../app/canvas/StackedBoard';
import type { LayoutHistory } from '../../app/canvas/useLayoutHistory';
import type { Viewport } from '../../app/useViewport';
import { useI18n } from '../../i18n';

/**
 * RC-POL-1.2 — the board's one drawing surface, out of `Board.tsx`: the phone's panel list
 * (`StackedBoard`, RC-CAN-5.1), a flow screen's grid (`FlowBoard`, RC-CAN-7.6), or the bounded
 * canvas inside the phone's Layout navigator (`PhoneNavigator`, RC-CAN-5.4; inert off a phone).
 * While the screen is still being read, the surface says so; once it is read and empty, the
 * illustrated overlay `Board` draws over it owns the copy.
 */
export function BoardSurface({
	posture,
	flow,
	phone,
	viewport,
	editing,
	ready,
	sceneId,
	widgets,
	history,
	selectedId,
	onSelect,
	onMove,
	onResize,
	onRemove,
	onWidgetCommand,
	snap,
	focusOrder,
	zoom,
	onZoom,
	canvasZoom,
	fitFloor,
	onFullScreenChange,
}: {
	posture: StackedPosture;
	flow: boolean;
	phone: boolean;
	viewport: Viewport;
	/** Edit mode outside a player preview. */
	editing: boolean;
	ready: boolean;
	sceneId: string;
	widgets: BoardWidget[];
	history: LayoutHistory;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onMove: (id: string, x: number, y: number) => Promise<boolean>;
	onResize: (id: string, w: number, h: number) => Promise<boolean>;
	onRemove: (id: string) => Promise<void>;
	onWidgetCommand: (
		id: string,
		commandType: string,
		payload: Record<string, unknown>,
	) => Promise<void>;
	snap: boolean;
	focusOrder: string[];
	zoom: ZoomPreset;
	onZoom: (preset: ZoomPreset) => void;
	canvasZoom: ZoomPreset;
	/** RC-CAN-8.6: set while a phone arranges at Fit, which may then go as small as it needs. */
	fitFloor?: number;
	onFullScreenChange: (full: boolean) => void;
}) {
	const { t } = useI18n();
	const tileOps = { onSelect, onMove, onResize, onRemove };
	return posture.stacked ? (
		<StackedBoard
			history={history}
			sceneId={sceneId}
			editing={editing}
			selectedId={selectedId}
			{...tileOps}
			widgets={widgets}
			onWidgetCommand={onWidgetCommand}
			emptyHint={ready ? '' : t('board.preparingHint')}
			emptyTitle={ready ? '' : t('board.preparingTitle')}
			onMaximizedChange={posture.onMaximizedChange}
		/>
	) : flow ? (
		<FlowBoard
			widgets={widgets}
			tier={viewport}
			editing={editing}
			selectedId={selectedId}
			{...tileOps}
			onWidgetCommand={onWidgetCommand}
			history={history}
			emptyTitle=""
			emptyHint=""
		/>
	) : (
		<PhoneNavigator
			active={phone}
			editing={editing}
			{...tileOps}
			widgets={widgets}
			zoom={fitFloor ? 'fit' : zoom}
			onZoom={onZoom}
			onWidgetCommand={onWidgetCommand}
			onFullScreenChange={onFullScreenChange}
		>
			<SceneBoardCanvas
				fitFloor={fitFloor}
				widgets={widgets}
				policy="bounded"
				editing={editing}
				snap={snap}
				selectedId={selectedId}
				{...tileOps}
				focusOrder={focusOrder}
				onWidgetCommand={onWidgetCommand}
				emptyHint={ready ? '' : t('board.preparingHint')}
				// The illustrated overlay owns the ready-empty copy; keep the canvas mounted for shortcuts.
				emptyTitle={ready ? '' : t('board.preparingTitle')}
				history={history}
				zoomPreset={canvasZoom}
				onZoomPresetChange={fitFloor ? undefined : onZoom}
			/>
		</PhoneNavigator>
	);
}
