import type React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
	findWidgetDefinition,
	listWidgetLibrary,
	type WidgetLibraryEntry,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Button, Callout, Card, Icon, IconButton, Input, Sheet } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';
import { widgetProfileForRuntime } from '../../platform/capabilities';
import { defaultTileSize, tierOf, type BoardLayoutRect, type BoardWidget } from '../board-helpers';
import { placeNewTile } from '../../screens/screen/paletteRows';
import { srOnly } from '../screen-kit';
import type { Viewport } from '../useViewport';
import { WidgetRenderSlot, WidgetErrorBoundary } from '../widgets/WidgetRenderSlot';
import type { WidgetTemplateKind } from '@dndtools/core';
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
import { WidgetLibraryCard } from './WidgetFrame';
import { InPlaceEnable } from '../../screens/extensions/WidgetBuilder';
import { CreateEntry, GenerateGateNote, useGenerateGate } from '../widgetBuilder/GenerateDialog';

// The free-slot search moved beside the palette rows that share it (RC-CAN-8.5), and the "More ways
// to add" card beside the Generate gate that can turn it into a note (RC-WID-6.7).
export { nextFreeSlot } from '../../screens/screen/paletteRows';
export { CreateEntry };

/**
 * AddWidgetGallery — the one "add a tile" surface for `/board` and `/scene/:id` (RC-CAN-4.1).
 *
 * RC-CAN-8.5 made it a list a GM can read: one short row per library entry (glyph, title,
 * category, a one-line purpose) inside one button named "Add <widget>", and "Generate with
 * assistant" / "Build your own" after the library under "More ways to add". The miniature, drawn
 * by the SAME template bodies the canvas uses (RC-WID-1.1) with sample rows, appears beside a row
 * only on mouse hover or keyboard focus, `aria-hidden` and `inert`. Entries the current platform
 * profile can't run stay in the list, dimmed, with the core's reason — hiding them left a GM
 * wondering where a widget went.
 *
 * Phone: a DS `Sheet` with the same rows, because a side panel at 300px covered nearly the whole
 * board. Wider: a non-modal side panel, so the canvas stays in view.
 *
 * A pick closes the panel and places the tile through `placeNewTile` (the first free slot in view,
 * or the end of the reading order on a flow screen), then selects it (`onPlaced`), focuses it and
 * announces "Added <widget>".
 *
 * RC-WID-6.2 — a package the builder installed enabled comes back as `placePackage` and is placed
 * through that same pick; a row dimmed only because its package is off gets `InPlaceEnable`.
 *
 * RC-WID-6.7 — "Generate with assistant" says on the card what is missing, with a link to the
 * Settings tab, instead of opening a dialog that only says so ("Generate (local)" on a local model).
 * Every string here, sample rows included, comes from the message catalogs.
 */

/** The miniature's box. The tile is scaled down into it at its own default aspect, never up. */
const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 128;
/** The popover around it: the box plus an 8px padding and a 1px border each side. */
const POPOVER = { w: PREVIEW_WIDTH + 18, h: PREVIEW_HEIGHT + 18, edge: 8 };
const PANEL_WIDTH = 320;

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

function Miniature({
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

export interface AddWidgetGalleryProps {
	open: boolean;
	onClose: () => void;
	viewport: Viewport;
	/** `bounded` keeps new tiles inside the GM Screen's columns; `canvas` may use the scene's width;
	 *  `flow` (ADR-041) appends after the last tile in reading order. */
	policy: 'bounded' | 'canvas' | 'flow';
	/** Finish layout editing from the phone sheet while the toolbar is covered. */
	onDone?: () => void;
	/** The tiles already on the surface: where the free slot is, whether it is empty, what is new. */
	widgets: readonly BoardLayoutRect[];
	/** Dispatch the add at `position`; resolves true once the core accepted it. */
	onAdd: (entry: WidgetLibraryEntry, position: { x: number; y: number }) => Promise<boolean>;
	/** The tile an accepted add created, once it is on the surface — the host selects it. */
	onPlaced?: (widgetInstanceId: string) => void;
	/** The host's current error. Repeated inside the phone sheet, whose scrim hides the page's alert. */
	error?: string | null;
	/** "Generate with assistant" (RC-WID-3.2). The entry is omitted when absent. */
	onGenerate?: () => void;
	/** "Build your own" (RC-WID-2.1). The entry is omitted when absent. */
	onBuild?: () => void;
	/** RC-WID-6.2 — a package "Build your own" installed enabled: place it, then `onPlacePackageDone`. */
	placePackage?: WidgetPackageDefinition | null;
	onPlacePackageDone?: () => void;
	/** Extra header action while the scene is empty (RC-CAN-4.4: the scene-template entry). */
	startAction?: React.ReactNode;
}

export function AddWidgetGallery({
	open,
	onClose,
	viewport,
	policy,
	widgets,
	onAdd,
	onPlaced,
	error,
	onGenerate,
	onBuild,
	placePackage,
	onPlacePackageDone,
	onDone,
	startAction,
}: AddWidgetGalleryProps) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const titleId = useId();
	const moreId = useId();
	const bodyRef = useRef<HTMLDivElement>(null);
	const [query, setQuery] = useState('');
	const [category, setCategory] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	// The row under the mouse or keyboard focus, whose miniature shows beside it.
	const [preview, setPreview] = useState<{ entry: WidgetLibraryEntry; row: Element } | null>(null);
	const [, reposition] = useState(0);
	// Permanent, so "Added Dice" is announced by its text changing; `seq` re-keys a repeat.
	const [announcement, setAnnouncement] = useState<{ text: string; seq: number } | null>(null);
	// The tile ids that existed when an add was accepted, and its name; cleared once it has focus.
	const pendingRef = useRef<{ before: Set<string>; name: string } | null>(null);
	const phone = viewport === 'phone';
	const generate = useGenerateGate();
	const location = useLocation();
	const createIntent = (location.state as { addWidget?: boolean } | null)?.addWidget === true;
	const seenIntent = useRef<string | null>(null);
	const pendingBuild = useRef(false);
	// Board consumes the route state to open this gallery. Capture that same request before it is
	// cleared, then hand off through the gallery's existing builder callback once the board is ready.
	useEffect(() => {
		if (createIntent && seenIntent.current !== location.key) {
			seenIntent.current = location.key;
			pendingBuild.current = true;
		}
		if (!open || !pendingBuild.current || !onBuild) return;
		pendingBuild.current = false;
		onClose();
		onBuild();
	}, [createIntent, location.key, open, onBuild, onClose]);

	// Unavailable entries are listed on purpose (dimmed, with the reason), after the addable ones so
	// the first row is always one the GM can pick. `sort` is stable, so the core's name order holds.
	const library = useMemo(() => {
		if (!open) return [];
		const entries = listWidgetLibrary(runtime.state.widgets, runtime.state.permissions, actorId, {
			profileId: widgetProfileForRuntime(),
			includeUnavailable: true,
		});
		return entries.sort(
			(a, b) => Number(!a.availability.available) - Number(!b.availability.available),
		);
	}, [open, runtime.state.widgets, runtime.state.permissions, actorId]);

	const categories = useMemo(
		() =>
			[...new Set(library.map((entry) => entry.category).filter((c): c is string => !!c))].sort(
				(a, b) => a.localeCompare(b),
			),
		[library],
	);

	const needle = query.trim().toLowerCase();
	const shown = library.filter(
		(entry) =>
			(!category || entry.category === category) &&
			(!needle ||
				[
					entry.displayName,
					entry.description ?? '',
					entry.category ?? '',
					entry.type,
					entry.packageDisplayName,
				]
					.join(' ')
					.toLowerCase()
					.includes(needle)),
	);

	// Every opening starts unfiltered. The side panel puts the cursor in the search field a tick
	// late, so the host's usePanelFocusReturn has already recorded the Add button as the place to
	// come back to; the phone Sheet sends focus in by itself.
	useEffect(() => {
		setPreview(null);
		if (!open) return undefined;
		setQuery('');
		setCategory(null);
		if (phone) return undefined;
		const timer = window.setTimeout(() => {
			bodyRef.current?.querySelector<HTMLElement>('input')?.focus();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [open, phone]);

	// The miniature follows its row while the list or the page scrolls.
	useEffect(() => {
		if (!preview) return undefined;
		const update = () => reposition((n) => n + 1);
		window.addEventListener('scroll', update, true);
		window.addEventListener('resize', update);
		return () => {
			window.removeEventListener('scroll', update, true);
			window.removeEventListener('resize', update);
		};
	}, [preview]);

	// Select, announce and focus the tile an accepted add created, once the gallery is gone. It waits
	// for BOTH the new id and the close, whichever arrives last, and then a tick more, so the Sheet's
	// and the host's focus-return (which put the cursor back on Add) run first and this has the last
	// word.
	useEffect(() => {
		const pending = pendingRef.current;
		if (!pending || open) return;
		const added = widgets.find((widget) => !pending.before.has(widget.id));
		if (!added) return;
		pendingRef.current = null;
		onPlaced?.(added.id);
		const text = t('boardCanvas.add.added', { name: pending.name });
		setAnnouncement((last) => ({ text, seq: (last?.seq ?? 0) + 1 }));
		window.setTimeout(() => {
			const frame = document.querySelector<HTMLElement>(`[data-testid="widget-${added.id}"]`);
			frame?.focus();
			// Focus alone scrolls only as far as the frame's corner on a phone's sideways-scrolling board.
			frame?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}, 0);
	}, [open, widgets, onPlaced, t]);

	// Place a built package once the library lists it; a package that never lists (not a scene widget)
	// is let go. The pick runs on the next tick, so `widgets` is the surface the builder closed onto.
	const pickRef = useRef<(entry: WidgetLibraryEntry) => Promise<void>>(async () => {});
	useEffect(() => {
		if (!placePackage || !runtime.state.widgets.packages[placePackage.id]) return;
		onPlacePackageDone?.();
		const entry = listWidgetLibrary(runtime.state.widgets, runtime.state.permissions, actorId, {
			profileId: widgetProfileForRuntime(),
		}).find((item) => item.packageId === placePackage.id);
		if (entry) window.setTimeout(() => void pickRef.current(entry), 0);
	}, [placePackage, onPlacePackageDone, runtime.state, actorId]);

	// An in-place Enable succeeded: say so, and put the cursor on the row it made addable.
	function enabled(entry: WidgetLibraryEntry) {
		const text = t('boardCanvas.add.enabled', { name: entry.displayName });
		setAnnouncement((last) => ({ text, seq: (last?.seq ?? 0) + 1 }));
		const row = `[data-testid="gallery-entry-${entry.type}"]`;
		window.setTimeout(() => bodyRef.current?.querySelector<HTMLElement>(row)?.focus(), 0);
	}

	async function pick(entry: WidgetLibraryEntry) {
		if (busy || !entry.availability.available) return;
		const size = defaultTileSize(entry.defaultSize, policy, entry.minSize);
		const position = placeNewTile(widgets, size, policy);
		const before = new Set(widgets.map((widget) => widget.id));
		setBusy(true);
		try {
			const ok = await onAdd(entry, position);
			if (!ok) return;
			pendingRef.current = { before, name: entry.displayName };
			onClose();
		} finally {
			setBusy(false);
		}
	}
	pickRef.current = pick;

	const isCustom = (type: string) =>
		findWidgetDefinition(runtime.state.widgets, type)?.renderEntrypoint?.runtime ===
		'custom-html-js';

	const note: React.CSSProperties = {
		font: 'var(--text-xs) var(--font-sans)',
		color: 'var(--color-text-tertiary)',
	};

	const body = (
		<div
			ref={bodyRef}
			style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minHeight: 0 }}
		>
			{phone && error && (
				<Callout tone="error" role="alert">
					{error}
				</Callout>
			)}
			{widgets.length === 0 && (
				<div
					data-testid="gallery-start-header"
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-1)',
						padding: 'var(--space-3)',
						borderRadius: 'var(--radius-md)',
						border: '1px solid var(--color-accent-border)',
						background: 'var(--color-accent-subtle)',
					}}
				>
					<h3
						style={{
							margin: 'var(--space-0)',
							font: '700 var(--text-sm) var(--font-sans)',
							color: 'var(--color-text-primary)',
						}}
					>
						{t('boardCanvas.add.startTitle')}
					</h3>
					<div
						style={{
							font: 'var(--text-xs)/1.45 var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
					>
						{t('boardCanvas.add.startBody')}
					</div>
					{startAction}
				</div>
			)}
			<Input
				type="search"
				icon="search"
				value={query}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
				aria-label={t('boardCanvas.add.search')}
				placeholder={t('boardCanvas.add.searchPlaceholder')}
			/>
			{categories.length > 0 && (
				<div
					role="group"
					aria-label={t('boardCanvas.add.categories')}
					style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}
				>
					<Button
						size="sm"
						variant={category === null ? 'accent' : 'ghost'}
						aria-pressed={category === null}
						onClick={() => setCategory(null)}
					>
						{t('boardCanvas.add.allCategories')}
					</Button>
					{categories.map((name) => (
						<Button
							key={name}
							size="sm"
							variant={category === name ? 'accent' : 'ghost'}
							aria-pressed={category === name}
							onClick={() => setCategory(name)}
						>
							{name}
						</Button>
					))}
				</div>
			)}
			{/* Permanent while open, so a filter change is announced as a change, not an insertion. */}
			<div role="status" aria-live="polite" style={srOnly}>
				{t('boardCanvas.add.resultCount', { count: shown.length })}
			</div>
			{library.length === 0 ? (
				<div style={note}>
					{policy === 'bounded' ? t('board.noWidgets') : t('sceneEditor.noWidgetsAvailable')}
				</div>
			) : shown.length === 0 ? (
				<div style={note}>{t('boardCanvas.add.noMatches')}</div>
			) : (
				<ul
					data-testid={policy === 'bounded' ? undefined : 'scene-add-widget-panel'}
					aria-label={t('boardCanvas.add.library')}
					aria-busy={busy || undefined}
					style={{
						listStyle: 'none',
						margin: 'var(--space-0)',
						padding: 'var(--space-0)',
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-1)',
					}}
				>
					{shown.flatMap((entry) => [
						<WidgetLibraryCard
							key={`${entry.packageId}:${entry.type}`}
							entry={entry}
							label={t('boardCanvas.add.pick', { name: entry.displayName })}
							onPick={() => void pick(entry)}
							onPreview={(row) => setPreview(row ? { entry, row } : null)}
						/>,
						// Its own row under the dimmed one: a button can't sit inside the row's button.
						<InPlaceEnable
							key={`${entry.packageId}:${entry.type}:on`}
							entry={entry}
							onEnabled={enabled}
						/>,
					])}
				</ul>
			)}
			{(onGenerate || onBuild) && (
				<div
					role="group"
					aria-labelledby={moreId}
					style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
				>
					<div id={moreId} style={{ font: '600 var(--text-xs) var(--font-sans)' }}>
						{t('boardCanvas.add.moreWays')}
					</div>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
							gap: 'var(--space-2)',
						}}
					>
						{onGenerate && (
							<CreateEntry
								icon="sparkle"
								label={t(
									generate.ready && generate.local
										? 'boardCanvas.add.generateLocal'
										: 'boardCanvas.add.generate',
								)}
								hint={t('boardCanvas.add.generateHint')}
								blocked={
									generate.ready ? undefined : (
										<GenerateGateNote gate={generate} onFollow={onClose} />
									)
								}
								onClick={() => {
									onClose();
									onGenerate();
								}}
							/>
						)}
						{onBuild && (
							<CreateEntry
								icon="wand"
								label={t('boardCanvas.add.build')}
								hint={t('boardCanvas.add.buildHint')}
								onClick={() => {
									onClose();
									onBuild();
								}}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);

	const extras = (
		<>
			<div
				aria-live="polite"
				aria-atomic="true"
				data-testid="add-widget-announcement"
				style={srOnly}
			>
				{announcement && <span key={announcement.seq}>{announcement.text}</span>}
			</div>
			{open && preview?.row.isConnected && (
				<Miniature entry={preview.entry} custom={isCustom(preview.entry.type)} row={preview.row} />
			)}
		</>
	);

	if (phone) {
		return (
			<>
				<Sheet
					open={open}
					onClose={onClose}
					side="bottom"
					footer={
						onDone ? (
							<Button
								icon="check"
								onClick={() => {
									onClose();
									onDone();
								}}
							>
								{t('common.action.done')}
							</Button>
						) : undefined
					}
					title={policy === 'bounded' ? t('board.addWidget') : t('sceneEditor.addWidget')}
					data-testid="add-widget-gallery"
				>
					{body}
				</Sheet>
				{extras}
			</>
		);
	}

	if (!open) return extras;
	return (
		<>
			<Card
				data-testid="add-widget-gallery"
				role="region"
				aria-labelledby={titleId}
				elevation="overlay"
				padding="md"
				onKeyDown={(e: React.KeyboardEvent) => {
					if (e.key === 'Escape') {
						e.stopPropagation();
						onClose();
					}
				}}
				style={{
					width: PANEL_WIDTH,
					flex: '0 0 auto',
					// Size containment: the list's height must not size the row. The board's root grows
					// with its content (index.css, RC-UX-2.4), so an uncontained panel grew the page and
					// `<main>` scrolled the canvas's top row away. Contained, the panel stretches to the
					// row and scrolls inside itself.
					contain: 'size',
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-3)',
					maxHeight: '100%',
					overflow: 'auto',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
					<h3
						id={titleId}
						style={{
							flex: 1,
							margin: 'var(--space-0)',
							font: '700 var(--text-md) var(--font-sans)',
							color: 'var(--color-text-primary)',
						}}
					>
						{policy === 'bounded' ? t('board.addWidget') : t('sceneEditor.addWidget')}
					</h3>
					<IconButton
						icon="close"
						label={t('common.action.close')}
						variant="ghost"
						size="sm"
						onClick={onClose}
					/>
				</div>
				{body}
			</Card>
			{extras}
		</>
	);
}
