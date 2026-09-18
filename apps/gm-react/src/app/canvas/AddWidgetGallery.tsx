import type React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { findWidgetDefinition, listWidgetLibrary, type WidgetLibraryEntry } from '@dndtools/core';
import { Button, Callout, Card, Icon, IconButton, Input, Sheet } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n, type MessageValues } from '../../i18n';
import { formatMessage } from '../../i18n/format';
import { widgetProfileForRuntime } from '../../platform/capabilities';
import {
	BOARD_RIGHT_BOUND,
	flowKeyBetween,
	flowOrder,
	tierOf,
	type BoardLayoutRect,
	type BoardWidget,
} from '../board-helpers';
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
import { SceneMessageTemplate } from '../widgets/templates/SceneMessage';
import { StatBlockTemplate } from '../widgets/templates/StatBlock';
import { StatusListTemplate } from '../widgets/templates/StatusList';
import { TrackerTemplate } from '../widgets/templates/Tracker';
import { WidgetLibraryCard } from './WidgetFrame';

// Feature-local translations keep this task within its owned paths.
const galleryMessages = {
	en: {
		'addGallery.search': 'Search widgets',
		'addGallery.searchPlaceholder': 'Search by name or purpose',
		'addGallery.categories': 'Filter by category',
		'addGallery.allCategories': 'All',
		'addGallery.resultCount': '{count, plural, one {# widget shown} other {# widgets shown}}',
		'addGallery.noMatches': 'No widgets match that search.',
		'addGallery.startTitle': 'Start from a template',
		'addGallery.startBody':
			'This scene is empty. Every card below is a ready-made tile: pick one and it lands in the first open spot.',
		'addGallery.createGroup': 'Make something new',
		'addGallery.generate': 'Generate with assistant',
		'addGallery.generateHint': 'Describe it, then review the draft before anything is installed.',
		'addGallery.build': 'Build your own',
		'addGallery.buildHint': 'Design a tile from scratch in the widget builder.',
		'addGallery.library': 'Widget library',
		'addGallery.customPreview': 'Runs its own code, so it previews once placed.',
	},
	es: {
		'addGallery.search': 'Buscar widgets',
		'addGallery.searchPlaceholder': 'Busca por nombre o propósito',
		'addGallery.categories': 'Filtrar por categoría',
		'addGallery.allCategories': 'Todas',
		'addGallery.resultCount':
			'{count, plural, one {# widget a la vista} other {# widgets a la vista}}',
		'addGallery.noMatches': 'Ningún widget coincide con esa búsqueda.',
		'addGallery.startTitle': 'Empieza con una plantilla',
		'addGallery.startBody':
			'Esta escena está vacía. Cada tarjeta es un widget listo para usar: elige una y se colocará en el primer hueco libre.',
		'addGallery.createGroup': 'Crea algo nuevo',
		'addGallery.generate': 'Generar con el asistente',
		'addGallery.generateHint': 'Descríbelo y revisa el borrador antes de que se instale nada.',
		'addGallery.build': 'Crea el tuyo',
		'addGallery.buildHint': 'Diseña un widget desde cero en el editor de widgets.',
		'addGallery.library': 'Biblioteca de widgets',
		'addGallery.customPreview': 'Ejecuta su propio código, así que se previsualiza al colocarlo.',
	},
} as const;

function useGalleryCopy() {
	const { locale } = useI18n();
	return (key: keyof typeof galleryMessages.en, values?: MessageValues) =>
		formatMessage(locale, galleryMessages[locale][key], values);
}

/**
 * AddWidgetGallery — the one "add a tile" surface for `/board` and `/scene/:id` (RC-CAN-4.1).
 *
 * It replaced two hand-rolled lists of names. Each library entry is now a card carrying the tile's
 * identity (the RC-CAN-2.2 accent rail and icon), its description, and a miniature drawn by the SAME
 * template bodies the canvas uses (RC-WID-1.1), with sample rows and declared config defaults.
 * Entries the current platform profile can't run stay
 * in the list, dimmed, with the core's reason — hiding them left a DM wondering where a widget went.
 *
 * Phone: a DS `Sheet`, because a side panel at 300px covered nearly the whole board. Wider: a
 * non-modal side panel in the slot the old panel used, so the canvas stays in view.
 *
 * Picking a card resolves the first open slot (`nextFreeSlot`) — never on top of an existing tile —
 * and, once the gallery has closed, moves focus onto the new tile so the next keystroke acts on it.
 */

// The board's column geometry (board-helpers.ts: 24px margin and gutter, 240px widgets on a 264px
// step, mirroring the core's Command Center `defaultLayout`), so a placed tile lines up with the
// seeded ones instead of starting a ragged fourth column.
const SLOT_MARGIN = 24;
const SLOT_GUTTER = 24;
const SLOT_COLUMN_STEP = 264;

/** The miniature's box. The tile is scaled down into it at its own default aspect, never up. */
const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 128;
const PANEL_WIDTH = 320;

type SlotRect = Pick<BoardLayoutRect, 'x' | 'y' | 'w' | 'h'>;

/**
 * The first open spot for a `size` tile: the top-most row, then the left-most column, where it
 * clears every existing tile by a gutter and stays inside `bound`. Candidates are the margin, the
 * board's column starts and the gutter past every existing tile's right and bottom edge — the only
 * places an open spot can begin. Pure and deterministic.
 */
export function nextFreeSlot(
	existing: readonly SlotRect[],
	size: { w: number; h: number },
	bound: number = BOARD_RIGHT_BOUND,
): { x: number; y: number } {
	// A tile wider than the board still gets the margin column rather than no slot at all.
	const right = Math.max(bound, SLOT_MARGIN + size.w);
	const xs = new Set<number>();
	for (let x = SLOT_MARGIN; x + size.w <= right; x += SLOT_COLUMN_STEP) xs.add(x);
	const ys = new Set<number>([SLOT_MARGIN]);
	for (const r of existing) {
		xs.add(r.x + r.w + SLOT_GUTTER);
		ys.add(r.y + r.h + SLOT_GUTTER);
	}
	const columns = [...xs].filter((x) => x >= 0 && x + size.w <= right).sort((a, b) => a - b);
	const rows = [...ys].sort((a, b) => a - b);
	const clear = (x: number, y: number) =>
		existing.every(
			(r) =>
				x >= r.x + r.w + SLOT_GUTTER ||
				x + size.w + SLOT_GUTTER <= r.x ||
				y >= r.y + r.h + SLOT_GUTTER ||
				y + size.h + SLOT_GUTTER <= r.y,
		);
	for (const y of rows) {
		for (const x of columns) {
			if (clear(x, y)) return { x, y };
		}
	}
	// Unreachable while the row below every tile is a candidate; kept so the type needs no assertion.
	const bottom = existing.reduce((max, r) => Math.max(max, r.y + r.h), 0);
	return { x: SLOT_MARGIN, y: bottom + SLOT_GUTTER };
}

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
	'scene-message': SceneMessageTemplate,
	'stat-block': StatBlockTemplate,
	'status-list': StatusListTemplate,
	tracker: TrackerTemplate,
};

function TemplateMiniature({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const { locale } = useI18n();
	const definition = findWidgetDefinition(runtime.state.widgets, widget.type) ?? null;
	const entrypoint = definition?.renderEntrypoint;
	if (entrypoint?.runtime !== 'template' || !entrypoint.template)
		return <WidgetRenderSlot widget={widget} />;
	const Template = PREVIEW_TEMPLATES[entrypoint.template];
	const sampleLabel = locale === 'es' ? 'Datos de ejemplo' : 'Sample data';
	const primary: WidgetQueryResult = {
		id: 'gallery-sample',
		label: sampleLabel,
		source: 'binding',
		header: null,
		emptyLabel: '',
		withheld: null,
		rows: [
			{
				id: 'sample-1',
				primary: locale === 'es' ? 'Exploradora' : 'Scout',
				secondary: '18 / 24',
				value: 18,
				max: 24,
				active: true,
			},
			{
				id: 'sample-2',
				primary: locale === 'es' ? 'Guardián' : 'Guardian',
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
						message:
							locale === 'es'
								? 'Una luz brilla bajo la puerta.'
								: 'A light shines beneath the door.',
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

/** Mount a miniature only once its card nears the viewport: a long library is dozens of live bodies. */
function useNearViewport(ref: React.RefObject<HTMLElement>): boolean {
	const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
	useEffect(() => {
		const el = ref.current;
		if (near || !el) return undefined;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setNear(true);
					observer.disconnect();
				}
			},
			{ rootMargin: '200px' },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [near, ref]);
	return near;
}

function Miniature({
	entry,
	custom,
	dimmed,
}: {
	entry: WidgetLibraryEntry;
	custom: boolean;
	dimmed: boolean;
}) {
	const copy = useGalleryCopy();
	const hostRef = useRef<HTMLDivElement>(null);
	const near = useNearViewport(hostRef);
	// React 18 has no `inert` prop. A body's own buttons and fields must never take focus from inside
	// a card — they would be a tab stop per preview that does nothing, hidden from assistive tech.
	useEffect(() => {
		hostRef.current?.setAttribute('inert', '');
	}, []);
	const widget = useMemo(() => previewWidget(entry), [entry]);
	const { width, height } = entry.defaultSize;
	const scale = Math.min(PREVIEW_WIDTH / width, PREVIEW_HEIGHT / height, 1);
	return (
		<div
			ref={hostRef}
			aria-hidden
			data-preview={custom ? 'custom' : 'live'}
			style={{
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'flex-start',
				height: PREVIEW_HEIGHT,
				overflow: 'hidden',
				borderRadius: 'var(--radius-sm)',
				background: 'var(--color-surface-sunken)',
				pointerEvents: 'none',
				opacity: dimmed ? 0.45 : 1,
				filter: dimmed ? 'grayscale(1)' : undefined,
			}}
		>
			{custom ? (
				// A custom-code widget previews as its silhouette: the gallery does not boot a package's
				// sandboxed code just because the DM is browsing — it runs once the tile is placed.
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
					{copy('addGallery.customPreview')}
				</div>
			) : near ? (
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
			) : null}
		</div>
	);
}

function CreateEntry({
	icon,
	label,
	hint,
	onClick,
}: {
	icon: string;
	label: string;
	hint: string;
	onClick: () => void;
}) {
	const hintId = useId();
	return (
		<button
			type="button"
			aria-label={label}
			aria-describedby={hintId}
			onClick={onClick}
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'flex-start',
				gap: 'var(--space-1)',
				padding: 'var(--space-2)',
				textAlign: 'left',
				border: '1px dashed var(--color-border-strong)',
				borderRadius: 'var(--radius-md)',
				background: 'var(--color-surface-alt)',
				color: 'var(--color-text-primary)',
				cursor: 'pointer',
			}}
		>
			<span
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-1)',
					font: '600 var(--text-xs) var(--font-sans)',
				}}
			>
				<Icon name={icon} size="sm" />
				{label}
			</span>
			<span
				id={hintId}
				style={{
					font: 'var(--text-2xs)/1.4 var(--font-sans)',
					color: 'var(--color-text-tertiary)',
				}}
			>
				{hint}
			</span>
		</button>
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
	/** The host's current error. Repeated inside the phone sheet, whose scrim hides the page's alert. */
	error?: string | null;
	/** "Generate with assistant" (RC-WID-3.2). The entry is omitted when absent. */
	onGenerate?: () => void;
	/** "Build your own" (RC-WID-2.1). The entry is omitted when absent. */
	onBuild?: () => void;
}

export function AddWidgetGallery({
	open,
	onClose,
	viewport,
	policy,
	widgets,
	onAdd,
	error,
	onGenerate,
	onBuild,
	onDone,
}: AddWidgetGalleryProps) {
	const { t } = useI18n();
	const copy = useGalleryCopy();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const titleId = useId();
	const bodyRef = useRef<HTMLDivElement>(null);
	const [query, setQuery] = useState('');
	const [category, setCategory] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	// The tile ids that existed when an add was accepted; cleared once the new tile has focus.
	const pendingRef = useRef<Set<string> | null>(null);
	const phone = viewport === 'phone';

	// Unavailable entries are listed on purpose (dimmed, with the reason), after the addable ones so
	// the first card is always one the DM can pick. `sort` is stable, so the core's name order holds.
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
		if (!open) return undefined;
		setQuery('');
		setCategory(null);
		if (phone) return undefined;
		const timer = window.setTimeout(() => {
			bodyRef.current?.querySelector<HTMLElement>('input')?.focus();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [open, phone]);

	// Focus the tile an accepted add created, once the gallery is gone. It waits for BOTH the new id
	// and the close, whichever arrives last, and then a tick more, so the Sheet's and the host's
	// focus-return (which put the cursor back on Add) run first and this has the last word.
	useEffect(() => {
		const before = pendingRef.current;
		if (!before || open) return;
		const added = widgets.find((widget) => !before.has(widget.id));
		if (!added) return;
		pendingRef.current = null;
		window.setTimeout(() => {
			document.querySelector<HTMLElement>(`[data-testid="widget-${added.id}"]`)?.focus();
		}, 0);
	}, [open, widgets]);

	async function pick(entry: WidgetLibraryEntry) {
		if (busy || !entry.availability.available) return;
		const bound =
			policy === 'bounded'
				? BOARD_RIGHT_BOUND
				: widgets.reduce((max, w) => Math.max(max, w.x + w.w), BOARD_RIGHT_BOUND);
		// Flow has no free coordinates to search: its next slot is the end of the reading order.
		const ordered = policy === 'flow' ? flowOrder(widgets) : [];
		const position =
			policy === 'flow'
				? (flowKeyBetween(ordered[ordered.length - 1] ?? null, null) ?? { x: 0, y: 0 })
				: nextFreeSlot(widgets, { w: entry.defaultSize.width, h: entry.defaultSize.height }, bound);
		const before = new Set(widgets.map((widget) => widget.id));
		setBusy(true);
		try {
			const ok = await onAdd(entry, position);
			if (!ok) return;
			pendingRef.current = before;
			onClose();
		} finally {
			setBusy(false);
		}
	}

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
						{copy('addGallery.startTitle')}
					</h3>
					<div
						style={{
							font: 'var(--text-xs)/1.45 var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
					>
						{copy('addGallery.startBody')}
					</div>
				</div>
			)}
			<Input
				type="search"
				icon="search"
				value={query}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
				aria-label={copy('addGallery.search')}
				placeholder={copy('addGallery.searchPlaceholder')}
			/>
			{categories.length > 0 && (
				<div
					role="group"
					aria-label={copy('addGallery.categories')}
					style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}
				>
					<Button
						size="sm"
						variant={category === null ? 'accent' : 'ghost'}
						aria-pressed={category === null}
						onClick={() => setCategory(null)}
					>
						{copy('addGallery.allCategories')}
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
			{(onGenerate || onBuild) && (
				<div
					role="group"
					aria-label={copy('addGallery.createGroup')}
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
						gap: 'var(--space-2)',
					}}
				>
					{onGenerate && (
						<CreateEntry
							icon="sparkle"
							label={copy('addGallery.generate')}
							hint={copy('addGallery.generateHint')}
							onClick={() => {
								onClose();
								onGenerate();
							}}
						/>
					)}
					{onBuild && (
						<CreateEntry
							icon="wand"
							label={copy('addGallery.build')}
							hint={copy('addGallery.buildHint')}
							onClick={() => {
								onClose();
								onBuild();
							}}
						/>
					)}
				</div>
			)}
			{/* Permanent while open, so a filter change is announced as a change, not an insertion. */}
			<div role="status" aria-live="polite" style={srOnly}>
				{copy('addGallery.resultCount', { count: shown.length })}
			</div>
			{library.length === 0 ? (
				<div style={note}>
					{policy === 'bounded' ? t('board.noWidgets') : t('sceneEditor.noWidgetsAvailable')}
				</div>
			) : shown.length === 0 ? (
				<div style={note}>{copy('addGallery.noMatches')}</div>
			) : (
				<ul
					data-testid={policy === 'bounded' ? undefined : 'scene-add-widget-panel'}
					aria-label={copy('addGallery.library')}
					aria-busy={busy || undefined}
					style={{
						listStyle: 'none',
						margin: 'var(--space-0)',
						padding: 'var(--space-0)',
						display: 'grid',
						gridTemplateColumns: `repeat(auto-fill, minmax(${PREVIEW_WIDTH}px, 1fr))`,
						gap: 'var(--space-2)',
					}}
				>
					{shown.map((entry) => (
						<WidgetLibraryCard
							key={`${entry.packageId}:${entry.type}`}
							entry={entry}
							onPick={(picked) => void pick(picked)}
						>
							<Miniature
								entry={entry}
								custom={isCustom(entry.type)}
								dimmed={!entry.availability.available}
							/>
						</WidgetLibraryCard>
					))}
				</ul>
			)}
		</div>
	);

	if (phone) {
		return (
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
		);
	}

	if (!open) return null;
	return (
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
	);
}
