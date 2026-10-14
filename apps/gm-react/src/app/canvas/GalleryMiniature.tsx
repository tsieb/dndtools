import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { findWidgetDefinition, type WidgetLibraryEntry } from '@dndtools/core';
import type { WidgetTemplateKind } from '@dndtools/core';
import { Icon } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';
import { tierOf, type BoardWidget } from '../board-helpers';
import { WidgetRenderSlot, WidgetErrorBoundary } from '../widgets/WidgetRenderSlot';
import type { WidgetTemplateProps } from '../widgets/templates/shared';
import type { WidgetQueryResult } from '../widgets/dataEnvironment';
import { ActionPanelTemplate } from '../widgets/templates/ActionPanel';
import { ChartTemplate } from '../widgets/templates/Chart';
import { DataTableTemplate } from '../widgets/templates/DataTable';
import { FormPanelTemplate } from '../widgets/templates/FormPanel';
import { HUB_TEMPLATES } from '../widgets/templates/Hub';
import { SceneMessageTemplate } from '../widgets/templates/SceneMessage';
import { StatBlockTemplate } from '../widgets/templates/StatBlock';
import { StatusListTemplate } from '../widgets/templates/StatusList';
import { TrackerTemplate } from '../widgets/templates/Tracker';

// RC-POL-1.2 — the Add panel's hover miniature, out of `AddWidgetGallery.tsx`.

/** The miniature's box. The tile is scaled down into it at its own default aspect, never up. */
const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 128;
/** The popover around it: the box plus an 8px padding and a 1px border each side. */
const POPOVER = { w: PREVIEW_WIDTH + 18, h: PREVIEW_HEIGHT + 18, edge: 8 };

/**
 * The view-model a miniature renders: an unplaced, unbound instance of the entry holding only its
 * declared config defaults. No operate command is declared, so an action button in a preview is an
 * inert decoration even before `inert` takes it out of reach.
 */
function previewWidget(entry: WidgetLibraryEntry): BoardWidget {
	const requiresBinding = entry.requiredBindings.length > 0;
	return {
		id: `gallery-preview:${entry.packageId}:${entry.type}`,
		type: entry.type,
		title: entry.displayName,
		typeLabel: entry.category ?? entry.displayName,
		icon: entry.icon ?? 'widget',
		tier: tierOf(entry.author),
		description: entry.description ?? '',
		visibility: 'dm-only',
		x: 0,
		y: 0,
		w: entry.defaultSize.width,
		h: entry.defaultSize.height,
		status: requiresBinding ? 'unbound' : 'available',
		statusNote: null,
		configuration: { ...entry.defaultConfiguration },
		configFields: [],
		requiresBinding,
		commands: [],
		bindingRef: null,
	};
}

// Use the same pure template bodies as WidgetRenderSlot, with sample rows instead of campaign
// queries. Browsing never needs a binding, starts a sandbox, or dispatches a command.
const PREVIEW_TEMPLATES: Record<WidgetTemplateKind, React.ComponentType<WidgetTemplateProps>> = {
	'action-panel': ActionPanelTemplate,
	chart: ChartTemplate,
	'data-table': DataTableTemplate,
	'form-panel': FormPanelTemplate,
	...HUB_TEMPLATES,
	'scene-message': SceneMessageTemplate,
	'stat-block': StatBlockTemplate,
	'status-list': StatusListTemplate,
	tracker: TrackerTemplate,
};

function TemplateMiniature({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const definition = findWidgetDefinition(runtime.state.widgets, widget.type) ?? null;
	const entrypoint = definition?.renderEntrypoint;
	if (entrypoint?.runtime !== 'template' || !entrypoint.template)
		return <WidgetRenderSlot widget={widget} />;
	const Template = PREVIEW_TEMPLATES[entrypoint.template];
	const primary: WidgetQueryResult = {
		id: 'gallery-sample',
		label: t('boardCanvas.add.sampleLabel'),
		source: 'binding',
		header: null,
		emptyLabel: '',
		withheld: null,
		rows: [
			{
				id: 'sample-1',
				primary: t('boardCanvas.add.sampleScout'),
				secondary: '18 / 24',
				value: 18,
				max: 24,
				active: true,
			},
			{
				id: 'sample-2',
				primary: t('boardCanvas.add.sampleGuardian'),
				secondary: '12 / 20',
				value: 12,
				max: 20,
			},
		],
	};
	const sampleWidget =
		entrypoint.template === 'scene-message'
			? {
					...widget,
					configuration: {
						message: t('boardCanvas.add.sampleMessage'),
						...widget.configuration,
					},
				}
			: widget;
	return (
		<WidgetErrorBoundary widgetId={widget.id}>
			<Template
				widget={sampleWidget}
				definition={definition}
				data={{ primary, queries: [primary], computed: [], isDm: true }}
			/>
		</WidgetErrorBoundary>
	);
}

/**
 * Where the miniature sits: left of the row when the side panel leaves room (over the canvas),
 * else above it, else below — kept on screen either way.
 */
function popoverPosition(row: DOMRect): { left: number; top: number } {
	const { w, h, edge } = POPOVER;
	const clamp = (v: number, max: number) => Math.max(edge, Math.min(v, max - edge));
	if (row.left - w - edge >= edge) {
		return {
			left: row.left - w - edge,
			top: clamp(row.top, document.documentElement.clientHeight - h),
		};
	}
	const above = row.top - h - edge;
	return {
		left: clamp(row.left, document.documentElement.clientWidth - w),
		top: above >= edge ? above : row.bottom + edge,
	};
}

export function Miniature({
	entry,
	custom,
	row,
}: {
	entry: WidgetLibraryEntry;
	custom: boolean;
	row: Element;
}) {
	const { t } = useI18n();
	const hostRef = useRef<HTMLDivElement>(null);
	// React 18 has no `inert` prop. A body's own buttons and fields must never take focus from a
	// preview — they would be a tab stop that does nothing, hidden from assistive tech.
	useEffect(() => {
		hostRef.current?.setAttribute('inert', '');
	}, []);
	const widget = useMemo(() => previewWidget(entry), [entry]);
	const { width, height } = entry.defaultSize;
	const scale = Math.min(PREVIEW_WIDTH / width, PREVIEW_HEIGHT / height, 1);
	const dimmed = !entry.availability.available;
	return createPortal(
		<div
			ref={hostRef}
			aria-hidden
			data-testid="gallery-preview"
			data-preview={custom ? 'custom' : 'live'}
			style={{
				position: 'fixed',
				...popoverPosition(row.getBoundingClientRect()),
				zIndex: 'var(--z-tooltip)',
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'flex-start',
				width: PREVIEW_WIDTH,
				height: PREVIEW_HEIGHT,
				padding: 'var(--space-2)',
				overflow: 'hidden',
				border: '1px solid var(--color-border)',
				borderRadius: 'var(--radius-md)',
				background: 'var(--color-surface-sunken)',
				boxShadow: 'var(--shadow-md)',
				pointerEvents: 'none',
				opacity: dimmed ? 0.45 : 1,
				filter: dimmed ? 'grayscale(1)' : undefined,
			}}
		>
			{custom ? (
				// A custom-code widget previews as its silhouette: the gallery does not boot a package's
				// sandboxed code just because the GM is browsing — it runs once the tile is placed.
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 'var(--space-2)',
						height: '100%',
						paddingInline: 'var(--space-3)',
						textAlign: 'center',
						font: 'var(--text-2xs)/1.4 var(--font-sans)',
						color: 'var(--color-text-tertiary)',
					}}
				>
					<Icon name="widget" size="md" />
					{t('boardCanvas.add.customPreview')}
				</div>
			) : (
				<div style={{ position: 'relative', width: width * scale, height: height * scale }}>
					<div
						style={{
							position: 'absolute',
							left: 0,
							top: 0,
							width,
							height,
							transform: `scale(${scale})`,
							transformOrigin: '0 0',
							display: 'flex',
							flexDirection: 'column',
							gap: 'var(--space-2)',
							padding: 'var(--space-3)',
							boxSizing: 'border-box',
							overflow: 'hidden',
							background: 'var(--color-surface-raised)',
						}}
					>
						<TemplateMiniature widget={widget} />
					</div>
				</div>
			)}
		</div>,
		document.body,
	);
}
