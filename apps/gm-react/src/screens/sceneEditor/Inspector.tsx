import type React from 'react';
import { Badge, Button, Card, Icon, IconButton, Select } from '../../ds';
import { WidgetGlyph } from '../../app/SceneBoardCanvas';
import { isWidgetResizable, TIER_LABEL, type BoardWidget } from '../../app/board-helpers';
import { PHONE_PANEL_OVERLAY, type Visibility } from './shared';
import { FieldControl, Section } from './fields';
import { useI18n } from '../../i18n';

/**
 * Inspector — the right-docked editor for the selected widget, TIERED after the prototype's
 * `inspector.jsx`. Every widget exposes layout (size) + visibility + lifecycle (remove). On top of
 * that, the inspector renders the widget definition's OWN declared `configFields` (the core's
 * data-driven customization surface) as live controls — a Note's heading/body, a Dice widget's
 * formulas, a Timer's duration, an Initiative tracker's HP toggle — each round-tripped through
 * `scene.configure-widget`. Binding-backed content (a Map's map, a Character's sheet) is shown LOCKED:
 * it is managed by the widget's data binding, not free-form configuration.
 */
export function Inspector({
	widget,
	phone,
	focusOrder,
	onVisibility,
	onConfigure,
	onResize,
	onFocusOrder,
	onRemove,
	onClose,
}: {
	widget: BoardWidget;
	phone: boolean;
	/** The instance's EXPLICIT keyboard traversal position (`layout.focusOrder`); null = derived. */
	focusOrder: number | null;
	onVisibility: (v: Visibility) => void;
	onConfigure: (key: string, value: unknown) => void;
	onResize: (w: number, h: number) => void;
	onFocusOrder: (order: number | null) => void;
	onRemove: () => void;
	onClose: () => void;
}) {
	const { t } = useI18n();
	// `visibility` has its own dedicated control; never surface it twice if a widget also declares it.
	const settingsFields = widget.configFields.filter((f) => f.key !== 'visibility');
	const resizable = isWidgetResizable(widget);
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
				...(phone ? PHONE_PANEL_OVERLAY : {}),
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
					label={t('sceneEditor.closeInspector')}
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
			</div>
			<Badge status={widget.tier === 'system' ? 'neutral' : 'accent'}>
				{TIER_LABEL[widget.tier]}
			</Badge>

			{(settingsFields.length > 0 || widget.requiresBinding) && (
				<Section label={t('sceneEditor.settings')}>
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
							{t(
								widget.type === 'map'
									? 'sceneEditor.fixedMapSource'
									: 'sceneEditor.fixedDataSource',
							)}
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

			<Section label={t('sceneEditor.visibility')}>
				{/* `Section`'s label is an unassociated <span> and DS `Select` renders a bare <select>
				    (only `Field` wires a label up), so the ONE control that decides whether a widget
				    is DM-only or on the players' screen announced nothing but its current value —
				    axe `select-name`, WCAG 4.1.2. `/scene/:id` is not in the axe gate's route list,
				    so nothing was ever going to catch it. */}
				<Select
					aria-label={t('sceneEditor.widgetVisibility')}
					value={widget.visibility}
					onChange={(e: { target: { value: string } }) =>
						onVisibility(e.target.value as Visibility)
					}
					options={[
						{ value: 'dm-only', label: t('common.visibility.dmOnly') },
						{ value: 'shared', label: t('common.visibility.shared') },
						{ value: 'player-visible', label: t('common.visibility.playerVisible') },
					]}
				/>
			</Section>

			<Section label={t('sceneEditor.size')}>
				{/* The canvas paints a padlock, renders no resize handle and swallows Shift+Arrow for
				    every `system`-tier widget — which today is EVERY widget that ships. The three size
				    buttons had no such gate and `widget.handleResizeWidget` has no tier check either,
				    so the two affordances flatly contradicted each other: the DM is told the widget
				    cannot be resized and then discovers by accident that it can. Agree with the
				    canvas, which is the surface that also owns the drag and keyboard paths. */}
				{resizable ? (
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
				) : (
					<div
						style={{
							font: 'var(--text-2xs) var(--font-sans)',
							color: 'var(--color-text-tertiary)',
						}}
					>
						{t('sceneEditor.sizeLocked')}
					</div>
				)}
				<div
					style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}
				>
					{widget.w} × {widget.h}
				</div>
			</Section>

			{/* CANVAS-016 — pin where this widget lands in the canvas's keyboard traversal
			    (`scene.set-focus-order`); "Auto" clears back to the core's derived order. */}
			<Section label={t('sceneEditor.keyboardOrder')}>
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					<Button
						variant="secondary"
						size="sm"
						// Soft, not native: pressing Earlier until the widget reaches Position 1 natively
						// disabled the very button the user was standing on, and the browser dropped focus
						// to `<body>` — so the last press of the sequence always cost the keyboard cursor.
						// DS Button swallows the click on a truthy `aria-disabled` and keeps the tab stop,
						// which is also the only channel this control has for saying why it is unavailable.
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
				<div
					style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}
				>
					{focusOrder === null
						? t('sceneEditor.autoLayoutOrder')
						: t('sceneEditor.position', { index: focusOrder + 1 })}
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
					{t('sceneEditor.removeWidget')}
				</Button>
			</div>
		</Card>
	);
}
