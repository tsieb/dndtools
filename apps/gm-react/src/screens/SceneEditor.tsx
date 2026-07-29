import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
	findWidgetDefinition,
	getSceneForActor,
	listWidgetLibrary,
	resolveAddWidgetCommand,
	type WidgetConfigField,
	type WidgetLibraryEntry,
} from '@dndtools/core';
import {
	Badge,
	Button,
	Card,
	Field,
	Icon,
	IconButton,
	Input,
	Select,
	Switch,
	Textarea,
} from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { SceneBoardCanvas, WidgetGlyph } from '../app/SceneBoardCanvas';
import { boardWidgetsOf, payloadIndex, TIER_LABEL, type BoardWidget } from '../app/board-helpers';
import { parseTags } from '../app/scene-helpers';

type Visibility = 'dm-only' | 'shared' | 'player-visible';

/**
 * SceneEditor (`/scene/:id`) — the prototype's scene canvas (`scene-shell.jsx` + `scene-canvas.jsx`)
 * ported as a React screen and wired to the REAL Processing Core widget platform, mirroring the
 * archived Svelte `scene/[id]/+page.svelte`. The scene + its widgets come from `getSceneForActor`
 * (CANVAS-009, which surfaces hidden / conflicted / missing binding states); every edit flows through
 * the single dispatch choke point: `scene.add-widget`, `scene.move-widget`, `scene.resize-widget`,
 * `scene.configure-widget`, `scene.destroy-widget`.
 *
 * Honest deferrals (mock-only in the prototype, no clean core command yet): the AI-generate dialog,
 * the custom-code widget builder, and local undo/redo (the core has no layout history command).
 */
export function SceneEditor() {
	const runtime = useRuntime();
	const navigate = useNavigate();
	const { id = '' } = useParams();
	const actorId = runtime.defaultActorId;

	const [editing, setEditing] = useState(false);
	const [snap, setSnap] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [metaOpen, setMetaOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const summary = getSceneForActor(runtime.state.scenes, runtime.state.permissions, actorId, id, {
		widgetPackages: runtime.state.widgets,
	});
	const denied = 'kind' in summary;
	const rawScene = runtime.state.scenes.scenes[id];

	const widgets: BoardWidget[] = useMemo(() => {
		if (denied || !rawScene) return [];
		return boardWidgetsOf(
			rawScene.widgets,
			payloadIndex(summary.widgets),
			(type) => findWidgetDefinition(runtime.state.widgets, type) ?? null,
		);
		// `rawScene` + `runtime.state.widgets` are fresh references after each dispatch (immutable
		// reducer updates), so this recomputes whenever the scene or widget packages change.
	}, [denied, rawScene, runtime.state.widgets, summary]);

	const library = denied
		? []
		: listWidgetLibrary(runtime.state.widgets, runtime.state.permissions, actorId, {
				profileId: 'desktop',
				includeUnavailable: false,
			});

	const selectedInstance = rawScene?.widgets.find((w) => w.id === selectedId) ?? null;
	const selectedWidget = widgets.find((w) => w.id === selectedId) ?? null;

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			setError(result.rejection.message ?? 'That change couldn’t be applied — try again.');
			return false;
		}
		setError(null);
		return true;
	}

	function move(widgetInstanceId: string, x: number, y: number) {
		return dispatch({
			type: 'scene.move-widget',
			actorId,
			payload: { sceneId: id, widgetInstanceId, x, y },
		});
	}
	function resize(widgetInstanceId: string, w: number, h: number) {
		return dispatch({
			type: 'scene.resize-widget',
			actorId,
			payload: { sceneId: id, widgetInstanceId, w, h },
		});
	}
	async function addWidget(entry: WidgetLibraryEntry) {
		const count = rawScene?.widgets.length ?? 0;
		const cascade = (count % 6) * 28;
		const command = resolveAddWidgetCommand(entry, id, { x: 48 + cascade, y: 48 + cascade });
		if (!command) return;
		const ok = await dispatch({ type: command.type, actorId, payload: command.payload });
		if (ok) {
			setAddOpen(false);
			if (!editing) setEditing(true);
		}
	}
	function destroy(widgetInstanceId: string) {
		setSelectedId(null);
		return dispatch({
			type: 'scene.destroy-widget',
			actorId,
			payload: { sceneId: id, widgetInstanceId },
		});
	}
	// VIEW-mode widget operation (SES-005/SES-003): dispatch a widget-DECLARED durable command through
	// the one envelope the core accepts — fresh idempotencyKey per press + the scene's current revision
	// (`expectedRevision`, packages/core/src/commands/widget-command.ts).
	function operateWidget(
		widgetInstanceId: string,
		commandType: string,
		payload: Record<string, unknown>,
	) {
		if (!rawScene) return;
		return dispatch({
			type: 'widget.dispatch-command',
			actorId,
			idempotencyKey: crypto.randomUUID(),
			payload: {
				sceneId: id,
				widgetInstanceId,
				commandType,
				payload,
				expectedRevision: rawScene.ownership.revision,
			},
		});
	}
	// SCENE METADATA (scene.update-metadata) — scenes are no longer permanently named at creation.
	async function saveMetadata(meta: { name: string; description: string; tags: string[] }) {
		const ok = await dispatch({
			type: 'scene.update-metadata',
			actorId,
			payload: { sceneId: id, name: meta.name, description: meta.description, tags: meta.tags },
		});
		if (ok) setMetaOpen(false);
	}
	// CANVAS-016 — pin the selected widget's explicit keyboard traversal position (null clears it back
	// to the core's derived order).
	function setFocusOrder(widgetInstanceId: string, focusOrder: number | null) {
		return dispatch({
			type: 'scene.set-focus-order',
			actorId,
			payload: { sceneId: id, widgetInstanceId, focusOrder },
		});
	}
	function setVisibility(visibility: Visibility) {
		return setConfig('visibility', visibility);
	}
	// Round-trip a single declared config field through the core. A free-form configuration merge —
	// exactly what `scene.configure-widget` persists — so the canvas body re-renders from the new value
	// and the edit survives reload identically to any other authored change.
	function setConfig(key: string, value: unknown) {
		if (!selectedInstance) return;
		return dispatch({
			type: 'scene.configure-widget',
			actorId,
			payload: {
				sceneId: id,
				widgetInstanceId: selectedInstance.id,
				configuration: { ...selectedInstance.configuration, [key]: value },
			},
		});
	}

	if (denied || !rawScene) {
		return (
			<div style={{ maxWidth: 720, margin: '0 auto' }}>
				<Card
					elevation="raised"
					padding="lg"
					style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
				>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-2)',
							color: 'var(--color-status-error-text)',
						}}
					>
						<Icon name="error" size="sm" />
						<span style={{ font: '700 var(--text-lg) var(--font-display)' }}>
							Scene unavailable
						</span>
					</div>
					<div
						style={{
							font: 'var(--text-sm) var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
					>
						{denied && 'kind' in summary
							? `Cannot open this scene: ${summary.reason}.`
							: 'This scene no longer exists.'}
					</div>
					<Button
						variant="secondary"
						icon="arrow-left"
						onClick={() => navigate('/scenes')}
						style={{ alignSelf: 'flex-start' }}
					>
						Back to scenes
					</Button>
				</Card>
			</div>
		);
	}

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-3)',
				height: 'calc(var(--app-viewport-height) - var(--space-8))',
			}}
		>
			{/* edit toolbar */}
			<div
				style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: '0 0 auto' }}
			>
				<IconButton
					icon="arrow-left"
					label="Back to scenes"
					variant="ghost"
					onClick={() => navigate('/scenes')}
				/>
				<div style={{ minWidth: 0 }}>
					<div
						style={{
							font: '700 var(--text-xl) var(--font-display)',
							color: 'var(--color-text-primary)',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{summary.name}
					</div>
					<div
						style={{
							font: 'var(--text-2xs) var(--font-sans)',
							color: 'var(--color-text-tertiary)',
						}}
					>
						{widgets.length} widget{widgets.length === 1 ? '' : 's'} · pan and zoom to explore
					</div>
				</div>
				<IconButton
					icon="edit"
					label="Edit scene name, description & tags"
					variant="ghost"
					size="sm"
					onClick={() => {
						setMetaOpen((v) => !v);
						setAddOpen(false);
					}}
				/>
				<div style={{ flex: 1 }} />
				{editing && (
					<>
						<Switch
							checked={snap}
							onChange={setSnap}
							label={
								<span
									style={{
										font: 'var(--text-2xs) var(--font-sans)',
										color: 'var(--color-text-secondary)',
									}}
								>
									Snap
								</span>
							}
						/>
						<Button
							variant="secondary"
							size="sm"
							icon="add"
							onClick={() => {
								setAddOpen((v) => !v);
								setMetaOpen(false);
							}}
						>
							Add
						</Button>
					</>
				)}
				<Button
					variant={editing ? 'primary' : 'secondary'}
					size="sm"
					icon={editing ? 'check' : 'edit'}
					onClick={() => {
						setEditing((v) => !v);
						setSelectedId(null);
						setAddOpen(false);
					}}
				>
					{editing ? 'Done' : 'Edit layout'}
				</Button>
			</div>

			{error && (
				<div
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 6,
						font: 'var(--text-xs) var(--font-sans)',
						color: 'var(--color-status-error-text)',
						flex: '0 0 auto',
					}}
				>
					<Icon name="error" size="sm" /> {error}
				</div>
			)}

			{/* canvas + side panels */}
			<div
				style={{
					flex: 1,
					minHeight: 0,
					display: 'flex',
					gap: 'var(--space-3)',
					position: 'relative',
				}}
			>
				<SceneBoardCanvas
					widgets={widgets}
					policy="canvas"
					editing={editing}
					snap={snap}
					selectedId={selectedId}
					onSelect={setSelectedId}
					onMove={move}
					onResize={resize}
					focusOrder={summary.focusOrder.map((entry) => entry.widgetInstanceId)}
					onRemove={destroy}
					onWidgetCommand={operateWidget}
					emptyHint={
						editing
							? 'Press Add to place your first widget.'
							: 'Press Edit layout, then Add to place a widget.'
					}
				/>

				{metaOpen && (
					<SceneMetaPanel
						name={summary.name}
						description={summary.description}
						tags={summary.tags}
						onSave={saveMetadata}
						onClose={() => setMetaOpen(false)}
					/>
				)}

				{addOpen && !metaOpen && (
					<AddWidgetPanel library={library} onAdd={addWidget} onClose={() => setAddOpen(false)} />
				)}

				{editing && selectedWidget && selectedInstance && !addOpen && !metaOpen && (
					<Inspector
						key={selectedInstance.id}
						widget={selectedWidget}
						focusOrder={selectedInstance.layout.focusOrder}
						onVisibility={setVisibility}
						onConfigure={setConfig}
						onResize={(w, h) => resize(selectedInstance.id, w, h)}
						onFocusOrder={(order) => setFocusOrder(selectedInstance.id, order)}
						onRemove={() => destroy(selectedInstance.id)}
						onClose={() => setSelectedId(null)}
					/>
				)}
			</div>
		</div>
	);
}

/**
 * SceneMetaPanel — rename / re-describe / re-tag the scene AFTER creation, round-tripped through
 * `scene.update-metadata`. A right-docked side panel like the add-widget panel; Escape closes it.
 */
function SceneMetaPanel({
	name,
	description,
	tags,
	onSave,
	onClose,
}: {
	name: string;
	description: string;
	tags: string[];
	onSave: (meta: { name: string; description: string; tags: string[] }) => void;
	onClose: () => void;
}) {
	const [draftName, setDraftName] = useState(name);
	const [draftDescription, setDraftDescription] = useState(description);
	const [draftTags, setDraftTags] = useState(tags.join(', '));
	return (
		<Card
			elevation="overlay"
			padding="md"
			data-testid="scene-meta-panel"
			onKeyDown={(e: React.KeyboardEvent) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					onClose();
				}
			}}
			style={{
				width: 300,
				flex: '0 0 auto',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-3)',
				maxHeight: '100%',
				overflow: 'auto',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span
					style={{
						flex: 1,
						font: '700 var(--text-md) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					Scene details
				</span>
				<IconButton
					icon="close"
					label="Close scene details"
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
			</div>
			<Field label="Name" htmlFor="scene-meta-name" required>
				<Input
					id="scene-meta-name"
					value={draftName}
					onChange={(e: { target: { value: string } }) => setDraftName(e.target.value)}
				/>
			</Field>
			<Field label="Description" htmlFor="scene-meta-description">
				<Textarea
					id="scene-meta-description"
					rows={3}
					value={draftDescription}
					onChange={(e: { target: { value: string } }) => setDraftDescription(e.target.value)}
				/>
			</Field>
			<Field label="Tags" htmlFor="scene-meta-tags" help="Comma-separated.">
				<Input
					id="scene-meta-tags"
					value={draftTags}
					onChange={(e: { target: { value: string } }) => setDraftTags(e.target.value)}
					placeholder="dungeon, combat"
				/>
			</Field>
			<Button
				variant="primary"
				size="sm"
				icon="check"
				disabled={!draftName.trim()}
				onClick={() =>
					onSave({
						name: draftName.trim(),
						description: draftDescription.trim(),
						tags: parseTags(draftTags),
					})
				}
				style={{ alignSelf: 'flex-start' }}
			>
				Save details
			</Button>
		</Card>
	);
}

function AddWidgetPanel({
	library,
	onAdd,
	onClose,
}: {
	library: WidgetLibraryEntry[];
	onAdd: (entry: WidgetLibraryEntry) => void;
	onClose: () => void;
}) {
	return (
		<Card
			elevation="overlay"
			padding="md"
			onKeyDown={(e: React.KeyboardEvent) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					onClose();
				}
			}}
			style={{
				width: 300,
				flex: '0 0 auto',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				maxHeight: '100%',
				overflow: 'auto',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span
					style={{
						flex: 1,
						font: '700 var(--text-md) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					Add widget
				</span>
				<IconButton icon="close" label="Close" variant="ghost" size="sm" onClick={onClose} />
			</div>
			{library.length === 0 ? (
				<div
					style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}
				>
					No widgets are available to add on this device.
				</div>
			) : (
				library.map((entry) => (
					<button
						key={`${entry.packageId}:${entry.type}`}
						type="button"
						onClick={() => onAdd(entry)}
						style={{
							display: 'flex',
							alignItems: 'flex-start',
							gap: 'var(--space-2)',
							padding: 'var(--space-2)',
							textAlign: 'left',
							border: '1px solid var(--color-border)',
							borderRadius: 'var(--radius-md)',
							background: 'var(--color-surface-alt)',
							cursor: 'pointer',
						}}
					>
						<WidgetGlyph icon={entry.icon ?? 'widget'} size="sm" />
						<div style={{ minWidth: 0 }}>
							<div
								style={{
									font: '600 var(--text-sm) var(--font-sans)',
									color: 'var(--color-text-primary)',
								}}
							>
								{entry.displayName}
							</div>
							{entry.description && (
								<div
									style={{
										font: 'var(--text-2xs)/1.4 var(--font-sans)',
										color: 'var(--color-text-tertiary)',
									}}
								>
									{entry.description}
								</div>
							)}
						</div>
					</button>
				))
			)}
		</Card>
	);
}

/**
 * Inspector — the right-docked editor for the selected widget, TIERED after the prototype's
 * `inspector.jsx`. Every widget exposes layout (size) + visibility + lifecycle (remove). On top of
 * that, the inspector renders the widget definition's OWN declared `configFields` (the core's
 * data-driven customization surface) as live controls — a Note's heading/body, a Dice widget's
 * formulas, a Timer's duration, an Initiative tracker's HP toggle — each round-tripped through
 * `scene.configure-widget`. Binding-backed content (a Map's map, a Character's sheet) is shown LOCKED:
 * it is managed by the widget's data binding, not free-form configuration.
 */
function Inspector({
	widget,
	focusOrder,
	onVisibility,
	onConfigure,
	onResize,
	onFocusOrder,
	onRemove,
	onClose,
}: {
	widget: BoardWidget;
	/** The instance's EXPLICIT keyboard traversal position (`layout.focusOrder`); null = derived. */
	focusOrder: number | null;
	onVisibility: (v: Visibility) => void;
	onConfigure: (key: string, value: unknown) => void;
	onResize: (w: number, h: number) => void;
	onFocusOrder: (order: number | null) => void;
	onRemove: () => void;
	onClose: () => void;
}) {
	// `visibility` has its own dedicated control; never surface it twice if a widget also declares it.
	const settingsFields = widget.configFields.filter((f) => f.key !== 'visibility');
	return (
		<Card
			elevation="overlay"
			padding="md"
			data-testid="widget-inspector"
			onKeyDown={(e: React.KeyboardEvent) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					onClose();
				}
			}}
			style={{
				width: 288,
				flex: '0 0 auto',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-1)',
				maxHeight: '100%',
				overflow: 'auto',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					paddingBottom: 'var(--space-2)',
				}}
			>
				<WidgetGlyph icon={widget.icon} size="sm" />
				<span
					style={{
						flex: 1,
						minWidth: 0,
						font: '700 var(--text-md) var(--font-display)',
						color: 'var(--color-text-primary)',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{widget.title}
				</span>
				<IconButton
					icon="close"
					label="Close inspector"
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
			</div>
			<Badge status={widget.tier === 'system' ? 'neutral' : 'accent'}>
				{TIER_LABEL[widget.tier]}
			</Badge>

			{(settingsFields.length > 0 || widget.requiresBinding) && (
				<Section label="Settings">
					{widget.requiresBinding && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								padding: 'var(--space-2)',
								borderRadius: 'var(--radius-sm)',
								background: 'var(--color-surface-sunken)',
								font: '500 var(--text-2xs)/1.4 var(--font-sans)',
								color: 'var(--color-text-tertiary)',
							}}
						>
							<Icon name="lock" size={12} />
							This widget’s {widget.type === 'map' ? 'map' : 'data'} source is fixed and can’t be
							changed here.
						</div>
					)}
					{settingsFields.map((field) => (
						<FieldControl
							key={field.key}
							field={field}
							value={widget.configuration[field.key]}
							onCommit={(value) => onConfigure(field.key, value)}
						/>
					))}
				</Section>
			)}

			<Section label="Visibility">
				<Select
					value={widget.visibility}
					onChange={(e: { target: { value: string } }) =>
						onVisibility(e.target.value as Visibility)
					}
					options={[
						{ value: 'dm-only', label: 'DM only' },
						{ value: 'shared', label: 'Shared' },
						{ value: 'player-visible', label: 'Player visible' },
					]}
				/>
			</Section>

			<Section label="Size">
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					{(
						[
							['S', 220, 140],
							['M', 300, 200],
							['L', 420, 280],
						] as const
					).map(([label, w, h]) => (
						<Button key={label} variant="secondary" size="sm" onClick={() => onResize(w, h)}>
							{label}
						</Button>
					))}
				</div>
				<div
					style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}
				>
					{widget.w} × {widget.h}
				</div>
			</Section>

			{/* CANVAS-016 — pin where this widget lands in the canvas's keyboard traversal
			    (`scene.set-focus-order`); "Auto" clears back to the core's derived order. */}
			<Section label="Keyboard order">
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => onFocusOrder(Math.max(0, (focusOrder ?? 0) - 1))}
						disabled={focusOrder === 0}
					>
						Earlier
					</Button>
					<Button variant="secondary" size="sm" onClick={() => onFocusOrder((focusOrder ?? 0) + 1)}>
						Later
					</Button>
					{focusOrder !== null && (
						<Button variant="ghost" size="sm" onClick={() => onFocusOrder(null)}>
							Auto
						</Button>
					)}
				</div>
				<div
					style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}
				>
					{focusOrder === null ? 'Auto (layout order)' : `Position ${focusOrder + 1}`}
				</div>
			</Section>

			<div style={{ paddingTop: 'var(--space-3)' }}>
				<Button
					variant="danger"
					size="sm"
					icon="delete"
					onClick={onRemove}
					style={{ alignSelf: 'flex-start' }}
				>
					Remove widget
				</Button>
			</div>
		</Card>
	);
}

/** A titled, top-bordered inspector section, matching the prototype's `Section`. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				padding: 'var(--space-3) 0',
				borderTop: '1px solid var(--color-border)',
			}}
		>
			<span
				style={{
					font: '600 var(--text-2xs) var(--font-sans)',
					letterSpacing: 'var(--tracking-wider)',
					textTransform: 'uppercase',
					color: 'var(--color-text-tertiary)',
				}}
			>
				{label}
			</span>
			{children}
		</div>
	);
}

/**
 * Render one declared `WidgetConfigField` as the right control. Text/textarea/number commit on BLUR
 * (and Enter for single-line text) so a configure-widget op — and an IndexedDB write — fires once per
 * edit, never per keystroke; toggles/selects/colors are discrete and commit immediately.
 */
function FieldControl({
	field,
	value,
	onCommit,
}: {
	field: WidgetConfigField;
	value: unknown;
	onCommit: (value: unknown) => void;
}) {
	const current = value ?? field.default;

	if (field.control === 'text' || field.control === 'textarea') {
		return (
			<TextFieldControl
				field={field}
				initial={current == null ? '' : String(current)}
				onCommit={onCommit}
			/>
		);
	}
	if (field.control === 'number') {
		return <NumberFieldControl field={field} initial={Number(current ?? 0)} onCommit={onCommit} />;
	}
	if (field.control === 'toggle') {
		return (
			<Switch
				checked={Boolean(current)}
				onChange={(v: boolean) => onCommit(v)}
				label={
					<span
						style={{
							font: 'var(--text-xs) var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
					>
						{field.label}
					</span>
				}
			/>
		);
	}
	if (field.control === 'select') {
		return (
			<Field label={field.label}>
				<Select
					value={String(current ?? '')}
					onChange={(e: { target: { value: string } }) => onCommit(e.target.value)}
					options={field.options ?? []}
				/>
			</Field>
		);
	}
	if (field.control === 'color') {
		return (
			<Field label={field.label}>
				<input
					type="color"
					value={String(current ?? '#000000')}
					onChange={(e) => onCommit(e.target.value)}
					style={{
						width: 44,
						height: 28,
						padding: 0,
						border: '1px solid var(--color-border)',
						borderRadius: 'var(--radius-sm)',
						background: 'transparent',
						cursor: 'pointer',
					}}
				/>
			</Field>
		);
	}
	return null;
}

function TextFieldControl({
	field,
	initial,
	onCommit,
}: {
	field: WidgetConfigField;
	initial: string;
	onCommit: (value: unknown) => void;
}) {
	const [draft, setDraft] = useState(initial);
	useEffect(() => setDraft(initial), [initial]);
	const commit = () => {
		if (draft !== initial) onCommit(draft);
	};
	const Comp = field.control === 'textarea' ? Textarea : Input;
	return (
		<Field label={field.label} help={field.help}>
			<Comp
				value={draft}
				placeholder={field.placeholder}
				{...(field.control === 'textarea' ? { rows: 3 } : {})}
				onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={
					field.control === 'text'
						? (e: React.KeyboardEvent) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									commit();
								}
							}
						: undefined
				}
			/>
		</Field>
	);
}

function NumberFieldControl({
	field,
	initial,
	onCommit,
}: {
	field: WidgetConfigField;
	initial: number;
	onCommit: (value: unknown) => void;
}) {
	const [draft, setDraft] = useState(String(initial));
	useEffect(() => setDraft(String(initial)), [initial]);
	const commit = () => {
		const n = Number(draft);
		if (!Number.isFinite(n) || n === initial) return;
		const clamped = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, n));
		onCommit(clamped);
	};
	return (
		<Field label={field.label} help={field.help}>
			<Input
				type="number"
				value={draft}
				min={field.min}
				max={field.max}
				step={field.step}
				onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e: React.KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						commit();
					}
				}}
			/>
		</Field>
	);
}
