import type React from 'react';
import type { CSSProperties } from 'react';
import type { LayoutHistory } from '../../app/canvas/useLayoutHistory';
import { useId, useState } from 'react';
import { permissionsWithPreviewActors, PREVIEW_PLAYER_ACTOR_ID } from '@dndtools/core';
import { Badge, Button, Card, Icon, IconButton, Select, Tabs, tabPanelProps } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { WidgetGlyph } from '../../app/SceneBoardCanvas';
import { isWidgetResizable, TIER_LABEL, type BoardWidget } from '../../app/board-helpers';
import { PHONE_PANEL_OVERLAY, usePhonePanelBack, type Visibility } from './shared';
import { FieldControl, Section } from './fields';
import { bindingSlot } from '../../app/canvas/TileDialogs';
import { BindingInspector } from './BindingInspector';
import { InspectorTransform } from './InspectorTransform';
import { StyleTokenList } from './StyleTokenList';
import { readPlayerPreview } from './playerPreview';
import { useI18n, type MessageKey } from '../../i18n';
import { useEditWidget } from '../extensions/WidgetBuilder';

const TABS = ['content', 'display', 'style', 'binding', 'transform', 'visibility'] as const;
const TAB_LABEL: Record<(typeof TABS)[number], MessageKey> = {
	content: 'sceneEditor.tab.content',
	display: 'sceneEditor.tab.display',
	style: 'sceneEditor.tab.style',
	binding: 'sceneEditor.tab.binding',
	transform: 'sceneEditor.tab.transform',
	visibility: 'sceneEditor.tab.visibility',
};
const NOTE: CSSProperties = {
	margin: 'var(--space-0)',
	padding: 'var(--space-2) var(--space-0)',
	font: 'var(--text-sm)/1.5 var(--font-sans)',
	color: 'var(--color-text-secondary)',
};

/**
 * Inspector — the right-docked editor for the selected widget, TIERED after the prototype's
 * `inspector.jsx`. Every widget exposes layout (size) + visibility + lifecycle (remove). On top of
 * that, the inspector renders the widget definition's OWN declared `configFields` (the core's
 * data-driven customization surface) as live controls — a Note's heading/body, a Dice widget's
 * formulas, a Timer's duration, an Initiative tracker's HP toggle — each round-tripped through
 * `scene.configure-widget`. Binding-backed content (a Map's map, a Character's sheet) is shown LOCKED:
 * it is managed by the widget's data binding, not free-form configuration — which the Binding section
 * (RC-WID-4.3, `BindingInspector`) edits, for any widget whose definition declares a binding slot.
 */
export function Inspector({
	widget,
	history,
	phone,
	focusOrder,
	onVisibility,
	onConfigure,
	onResize,
	onMove,
	onFocusOrder,
	onRemove,
	onClose,
}: {
	widget: BoardWidget;
	history: LayoutHistory;
	phone: boolean;
	/** The instance's EXPLICIT keyboard traversal position (`layout.focusOrder`); null = derived. */
	focusOrder: number | null;
	onVisibility: (v: Visibility) => void;
	onConfigure: (key: string, value: unknown) => void;
	onResize: (w: number, h: number) => void;
	/** RC-CAN-3.6 — the numeric X/Y fields. A host that routes moves through its undo stack passes
	 *  its own; otherwise the panel dispatches `scene.move-widget` directly (not undoable). */
	onMove?: (x: number, y: number) => void;
	onFocusOrder: (order: number | null) => void;
	onRemove: () => void;
	onClose: () => void;
}) {
	const { t } = useI18n();
	usePhonePanelBack(phone, onClose);
	// Open at the tile's primary controls: binding source, note depth, or editable content.
	const [tab, setTab] = useState<string>(
		widget.requiresBinding ? 'binding' : widget.type === 'note' ? 'display' : 'content',
	);
	const tabId = useId();
	// `visibility` has its own dedicated control; never surface it twice if a widget also declares it.
	const settingsFields = widget.configFields.filter((f) => f.key !== 'visibility');
	const resizable = isWidgetResizable(widget);
	const runtime = useRuntime();
	// RC-WID-6.6 — the same "Edit widget" as the tile menu: any template or custom-code widget, copied
	// into a package of the GM's own first when it is a starter, a bundle's or anyone else's.
	const edit = useEditWidget(widget.id, widget.type);
	const scene = Object.values(runtime.state.scenes.scenes).find((candidate) =>
		candidate.widgets.some((instance) => instance.id === widget.id),
	);
	const playerVerdict = scene
		? readPlayerPreview(
				{ ...runtime.state, permissions: permissionsWithPreviewActors(runtime.state.permissions) },
				PREVIEW_PLAYER_ACTOR_ID,
				scene.id,
			).tiles[widget.id]
		: undefined;
	const tabs = TABS.map((id) => ({ id, label: t(TAB_LABEL[id]) }));
	return (
		<>
			{edit.editor}
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
					{/* A heading, not a span: the panel is a region of its own under the scene's <h2>.
					    Cinzel starts at --text-xl, so a panel title stays in the sans face. */}
					<h3
						style={{
							flex: 1,
							minWidth: 0,
							margin: 'var(--space-0)',
							font: '700 var(--text-md) var(--font-sans)',
							color: 'var(--color-text-primary)',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{widget.title}
					</h3>
					<IconButton
						icon="close"
						label={t('sceneEditor.closeInspector')}
						variant="ghost"
						size={phone ? 'lg' : 'sm'}
						onClick={onClose}
					/>
				</div>
				<Badge status={widget.tier === 'system' ? 'neutral' : 'accent'}>
					{TIER_LABEL[widget.tier]}
				</Badge>

				{edit.available && (
					<Button variant="secondary" size="sm" onClick={() => void edit.open()}>
						{t('sceneEditor.editWidgetDefinition')}
					</Button>
				)}

				<Section label={t('sceneEditor.visibility')}>
					{/* `Section`'s label is an unassociated <span> and DS `Select` renders a bare <select>,
					    so the one control that decides whether a widget is DM-only or on the players'
					    screen needs its own name (axe `select-name`, WCAG 4.1.2). */}
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

				<Tabs
					tabs={tabs}
					value={tab}
					onChange={(next: string) => {
						// Touch activation can hide a focused input without firing blur. Commit its draft first.
						const active = document.activeElement;
						if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
							active.blur();
						setTab(next);
					}}
					idBase={tabId}
					aria-label={t('sceneEditor.properties')}
				/>
				{(['content', 'display', 'style'] as const).map((group) => (
					<div key={group} {...tabPanelProps(tabId, group)} hidden={tab !== group}>
						{settingsFields.some((field) => (field.group ?? 'content') === group) ||
						(group === 'content' && widget.requiresBinding) ? (
							<Section label={t('sceneEditor.settings')}>
								{group === 'content' && widget.requiresBinding && (
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 'var(--space-1-5)',
											padding: 'var(--space-2)',
											borderRadius: 'var(--radius-sm)',
											background: 'var(--color-surface-sunken)',
											font: '500 var(--text-xs)/1.4 var(--font-sans)',
											color: 'var(--color-text-secondary)',
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
								{settingsFields
									.filter((field) => (field.group ?? 'content') === group)
									.map((field) => (
										<FieldControl
											key={field.key}
											field={field}
											value={widget.configuration[field.key]}
											onCommit={(value) => onConfigure(field.key, value)}
										/>
									))}
							</Section>
						) : (
							<p style={NOTE}>{t('sceneEditor.noFields')}</p>
						)}
						{group === 'style' && <StyleTokenList widget={widget} />}
					</div>
				))}
				<div {...tabPanelProps(tabId, 'binding')} hidden={tab !== 'binding'}>
					{bindingSlot(runtime.state.widgets, widget.type) ? (
						<BindingInspector widget={widget} />
					) : (
						<p style={NOTE}>{t('sceneEditor.noBinding')}</p>
					)}
				</div>

				<div {...tabPanelProps(tabId, 'visibility')} hidden={tab !== 'visibility'}>
					<p data-testid="widget-inspector-audience" aria-live="polite" style={NOTE}>
						{t('sceneEditor.whoSees')}: {t('sceneEditor.anyPlayer')} —{' '}
						{playerVerdict
							? t(`sceneEditor.preview.reason.${playerVerdict.reason}`)
							: t('sceneEditor.notAvailable')}
					</p>
				</div>
				<div {...tabPanelProps(tabId, 'transform')} hidden={tab !== 'transform'}>
					<InspectorTransform
						widget={widget}
						history={history}
						resizable={resizable}
						focusOrder={focusOrder}
						onResize={onResize}
						onMove={onMove}
						onFocusOrder={onFocusOrder}
					/>
				</div>
				<div style={{ paddingTop: 'var(--space-3)' }}>
					<Button
						variant="danger"
						size="sm"
						icon="delete"
						title={t('sceneEditor.removeShortcut')}
						onClick={onRemove}
					>
						{t('sceneEditor.removeWidget')}
					</Button>
				</div>
			</Card>
		</>
	);
}
