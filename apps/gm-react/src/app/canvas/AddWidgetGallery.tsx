import type React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useLocation } from 'react-router-dom';
import {
	findWidgetDefinition,
	listWidgetLibrary,
	type WidgetLibraryEntry,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Button, Callout, Card, IconButton, Input, Sheet } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';
import { widgetProfileForRuntime } from '../../platform/capabilities';
import { defaultTileSize, type BoardLayoutRect } from '../board-helpers';
import { placeNewTile } from '../../screens/screen/paletteRows';
import { srOnly } from '../screen-kit';
import type { Viewport } from '../useViewport';

import { WidgetLibraryCard } from './WidgetLibraryCard';
import { Miniature } from './GalleryMiniature';
import { InPlaceEnable } from '../../screens/extensions/WidgetBuilder';
import { GalleryMoreWays, GalleryStartHeader } from './GalleryParts';

// The free-slot search moved beside the palette rows that share it (RC-CAN-8.5).
export { nextFreeSlot } from '../../screens/screen/paletteRows';

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

const PANEL_WIDTH = 320;

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
		color: 'var(--color-text-secondary)',
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
			{widgets.length === 0 && <GalleryStartHeader action={startAction} />}
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
				<GalleryMoreWays onClose={onClose} onGenerate={onGenerate} onBuild={onBuild} />
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
