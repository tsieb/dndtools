import type { CSSProperties } from 'react';
import { listWidgetLayoutCommands, resolveLayoutCommandPayload } from '@dndtools/core';
import { Button, Field, Select } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { LayoutHistory } from '../../app/canvas/useLayoutHistory';
import { fitWidgetSize, widgetSizePresets, type BoardWidget } from '../../app/board-helpers';
import { useI18n, type MessageKey } from '../../i18n';
import { Section, TransformPanel } from './fields';

const BUTTON_ROW: CSSProperties = { display: 'flex', gap: 'var(--space-1-5)', flexWrap: 'wrap' };
const NOTE: CSSProperties = {
	font: 'var(--text-xs) var(--font-sans)',
	color: 'var(--color-text-secondary)',
};

const SIZE_LABELS: MessageKey[] = [
	'sceneEditor.sizeSmall',
	'sceneEditor.sizeMedium',
	'sceneEditor.sizeLarge',
];

const DOCK_EDGES = ['none', 'left', 'right', 'top', 'bottom'] as const;

/**
 * The Inspector's Transform tab: size presets, the numeric position and size, the dock edge and the
 * widget's place in the keyboard order. Split out of `Inspector.tsx` by RC-POL-1.3.
 */
export function InspectorTransform({
	widget,
	history,
	resizable,
	focusOrder,
	onResize,
	onMove,
	onFocusOrder,
}: {
	widget: BoardWidget;
	history: LayoutHistory;
	resizable: boolean;
	focusOrder: number | null;
	onResize: (w: number, h: number) => void;
	onMove?: (x: number, y: number) => void;
	onFocusOrder: (order: number | null) => void;
}) {
	const { t } = useI18n();
	const resize = (w: number, h: number) => {
		const fitted = fitWidgetSize(widget, w, h, false);
		onResize(fitted.w, fitted.h);
	};
	const runtime = useRuntime();
	const scene = Object.values(runtime.state.scenes.scenes).find((candidate) =>
		candidate.widgets.some((instance) => instance.id === widget.id),
	);
	const instance = scene?.widgets.find((w) => w.id === widget.id);
	const dockCommands =
		scene && instance
			? listWidgetLayoutCommands(
					scene,
					instance,
					runtime.state.permissions,
					runtime.defaultActorId,
				).filter((c) => c.group === 'dock')
			: [];
	// RC-CAN-3.6 — a host that routes moves through its undo stack passes its own; otherwise the
	// panel dispatches `scene.move-widget` directly (not undoable).
	const move =
		onMove ??
		((x: number, y: number) => {
			if (!scene) return;
			void runtime.dispatch({
				type: 'scene.move-widget',
				actorId: runtime.defaultActorId,
				payload: { sceneId: scene.id, widgetInstanceId: widget.id, x, y },
			});
		});
	const dockLabel = (edge: (typeof DOCK_EDGES)[number]) =>
		edge === 'none'
			? t('sceneEditor.none')
			: edge === 'top'
				? t('sceneEditor.topDock')
				: t(`builder.dock.${edge}`);

	return (
		<>
			<Section label={t('sceneEditor.size')}>
				{resizable ? (
					<div style={BUTTON_ROW}>
						{widgetSizePresets(widget, false, false).map(({ w, h }, index) => (
							<Button
								key={SIZE_LABELS[index]}
								variant="secondary"
								size="sm"
								onClick={() => resize(w, h)}
							>
								{t(SIZE_LABELS[index])}
							</Button>
						))}
					</div>
				) : (
					<div style={NOTE}>
						{t('sceneEditor.sizeLocked', { name: widget.title, width: widget.w, height: widget.h })}
					</div>
				)}
			</Section>

			<Section label={t('sceneEditor.transform')}>
				<TransformPanel widget={widget} resizable={resizable} onMove={move} onResize={resize} />
				{dockCommands.length > 0 && (
					<Field label={t('sceneEditor.dockToEdge')}>
						<Select
							value={instance?.layout.dock ?? 'none'}
							options={DOCK_EDGES.map((edge) => ({ value: edge, label: dockLabel(edge) }))}
							onChange={(e: { target: { value: string } }) => {
								const descriptor = dockCommands.find((c) => c.id === `dock-${e.target.value}`);
								const command =
									descriptor && scene && instance
										? resolveLayoutCommandPayload(descriptor, scene, instance)
										: null;
								if (command)
									void history.run(
										{ ...command, actorId: runtime.defaultActorId },
										t(
											e.target.value === 'none'
												? 'sceneEditor.history.undocked'
												: 'sceneEditor.history.docked',
											{ name: widget.title },
										),
									);
							}}
						/>
					</Field>
				)}
			</Section>

			{/* CANVAS-016 — pin where this widget lands in the canvas's keyboard traversal
			    (`scene.set-focus-order`); "Auto" clears back to the core's derived order. */}
			<Section label={t('sceneEditor.keyboardOrder')}>
				<div style={NOTE}>{t('sceneEditor.keyboardOrderHelp')}</div>
				<div style={BUTTON_ROW}>
					<Button
						variant="secondary"
						size="sm"
						// Soft, not native: pressing Earlier until the widget reaches Position 1 natively
						// disabled the very button the user was standing on, and the browser dropped focus
						// to `<body>`. DS Button swallows the click on a truthy `aria-disabled` and keeps the
						// tab stop, which is also the only channel this control has for saying why.
						aria-disabled={focusOrder === 0 || undefined}
						title={focusOrder === 0 ? t('sceneEditor.alreadyFirst') : undefined}
						onClick={() => {
							if (focusOrder === 0) return;
							onFocusOrder(Math.max(0, (focusOrder ?? 0) - 1));
						}}
					>
						{t('sceneEditor.earlier')}
					</Button>
					<Button variant="secondary" size="sm" onClick={() => onFocusOrder((focusOrder ?? 0) + 1)}>
						{t('sceneEditor.later')}
					</Button>
					{focusOrder !== null && (
						<Button variant="ghost" size="sm" onClick={() => onFocusOrder(null)}>
							{t('sceneEditor.auto')}
						</Button>
					)}
				</div>
				<div aria-live="polite" style={{ ...NOTE, fontFamily: 'var(--font-mono)' }}>
					{focusOrder === null
						? t('sceneEditor.autoLayoutOrder')
						: t('sceneEditor.position', { index: focusOrder + 1 })}
				</div>
			</Section>
		</>
	);
}
