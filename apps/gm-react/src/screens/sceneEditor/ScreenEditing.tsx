import { useLayoutEffect, useRef } from 'react';
import { Toaster } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { BoardWidget } from '../../app/board-helpers';
import { usePanelFocusReturn } from '../../app/usePanelFocusReturn';
import { useI18n } from '../../i18n';
import { SceneMetaPanel } from './SceneMetaPanel';
import { Inspector } from './Inspector';
import { PlayerPreviewOverlay, type PlayerPreviewOverlayProps } from './PlayerPreviewOverlay';
import type { useSceneCommands } from './useSceneCommands';

// The screen board's edit- and preview-mode drawers, loaded by `screenParts.tsx` on first use.

/**
 * The preview overlay on a screen. Its phone list scrolls within the board stage, which is shorter
 * than the old editor's, so the host gives a list that has no tab stop of its own one to scroll by
 * keyboard (axe scrollable-region-focusable). The wrapper is `display: contents`, so the overlay
 * still covers the stage.
 */
export function ScreenPreviewOverlay(props: PlayerPreviewOverlayProps) {
	const host = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const list = host.current?.querySelector<HTMLElement>(
			'[data-testid="player-preview-overlay"] > ul',
		);
		if (list && !list.hasAttribute('tabindex')) list.tabIndex = 0;
	});
	return (
		<div ref={host} style={{ display: 'contents' }}>
			<PlayerPreviewOverlay {...props} />
		</div>
	);
}

/** The screen board borrows the editor's drawers, with its own dispatch and undo stack. */
export function ScreenInspector({
	sceneId,
	widgets,
	selectedId,
	metaOpen,
	phone,
	history,
	dispatch,
	onMove,
	onResize,
	onRemove,
	onClose,
}: {
	sceneId: string;
	widgets: BoardWidget[];
	selectedId: string | null;
	metaOpen: boolean;
	phone: boolean;
	history: ReturnType<typeof useSceneCommands>['history'];
	dispatch: (command: Parameters<ReturnType<typeof useRuntime>['dispatch']>[0]) => Promise<boolean>;
	onMove: (id: string, x: number, y: number) => Promise<boolean>;
	onResize: (id: string, w: number, h: number) => Promise<boolean>;
	onRemove: (id: string) => Promise<void>;
	onClose: () => void;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const configQueue = useRef(Promise.resolve());
	const actorId = runtime.defaultActorId;
	const scene = runtime.state.scenes.scenes[sceneId];
	const instance = scene?.widgets.find((widget) => widget.id === selectedId);
	const widget = widgets.find((widget) => widget.id === selectedId);
	usePanelFocusReturn(metaOpen || !!widget);
	if (!scene) return null;
	function configure(key: string, value: unknown) {
		configQueue.current = configQueue.current.then(async () => {
			const latest = runtime.state.scenes.scenes[sceneId]?.widgets.find((w) => w.id === selectedId);
			if (!latest) return;
			await dispatch({
				type: 'scene.configure-widget',
				actorId,
				payload: {
					sceneId,
					widgetInstanceId: latest.id,
					configuration: { ...latest.configuration, [key]: value },
				},
			});
		});
		return configQueue.current;
	}
	if (metaOpen)
		return (
			<SceneMetaPanel
				key={sceneId}
				scene={scene}
				name={scene.name}
				description={scene.description}
				tags={scene.tags}
				phone={phone}
				onSave={async (meta) => {
					if (
						await dispatch({
							type: 'scene.update-metadata',
							actorId,
							payload: { sceneId, ...meta },
						})
					) {
						Toaster.success(t('sceneEditor.detailsSaved'));
						onClose();
					}
				}}
				onClose={onClose}
			/>
		);
	if (!widget || !instance) return null;
	return (
		<Inspector
			key={instance.id}
			widget={widget}
			phone={phone}
			history={history}
			focusOrder={instance.layout.focusOrder}
			onVisibility={(value) => configure('visibility', value)}
			onConfigure={configure}
			onMove={(x, y) => onMove(instance.id, x, y)}
			onResize={(w, h) => onResize(instance.id, w, h)}
			onFocusOrder={(focusOrder) =>
				dispatch({
					type: 'scene.set-focus-order',
					actorId,
					payload: { sceneId, widgetInstanceId: instance.id, focusOrder },
				})
			}
			onRemove={() => onRemove(instance.id)}
			onClose={onClose}
		/>
	);
}
