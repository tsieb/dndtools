<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SessionBoardTileCard from '$lib/ui/board/SessionBoardTile.svelte';
	import SessionBoardTimerTile from '$lib/ui/board/SessionBoardTimerTile.svelte';
	import CombatTrackerTile from '$lib/ui/board/CombatTrackerTile.svelte';
	import DiceTrayTile from '$lib/ui/board/DiceTrayTile.svelte';
	import GeneratorTile from '$lib/ui/board/GeneratorTile.svelte';
	import WorldCalendarReference from '$lib/ui/calendar/WorldCalendarReference.svelte';
	import { DEFAULT_SESSION_BOARD_LAYOUT } from '$lib/domain/session-board.js';
	import { renderMarkdown } from '$lib/markdown/pipeline.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import type { NoteId } from '$lib/types/note.js';
	import type {
		SessionBoard,
		SessionBoardNoteTile,
		SessionBoardCombatTile as SessionBoardCombatTileModel,
		SessionBoardDiceTile as SessionBoardDiceTileModel,
		SessionBoardGeneratorTile as SessionBoardGeneratorTileModel,
		SessionBoardTile,
		SessionBoardTimerTile as SessionBoardTimerTileModel,
	} from '$lib/types/session-board.js';

	const DEFAULT_LAYOUT = DEFAULT_SESSION_BOARD_LAYOUT;
	const CELL_WIDTH = 160;
	const MIN_ZOOM = 0.2;
	const MAX_ZOOM = 4;
	const DEFAULT_ZOOM = 1;

	let newBoardName = $state('Session Board');
	let newBoardDescription = $state('');
	let createTemplateId = $state('');
	let noteQuery = $state('');
	let boardNameDraft = $state('');
	let boardDescriptionDraft = $state('');
	let applyTemplateId = $state('');
	let saveTemplateName = $state('');
	let saveTemplateDescription = $state('');
	let mode = $state<'view' | 'edit'>('view');
	let selectedTileId = $state<string | null>(null);
	let overlayNoteId = $state<NoteId | null>(null);
	let overlayHtml = $state('');
	let overlayContentEl = $state<HTMLDivElement | null>(null);
	let boardViewportEl = $state<HTMLDivElement | null>(null);
	let draftPositions = $state<Record<string, { x: number; y: number }>>({});
	let drag = $state<{
		tileId: string;
		pointerId: number;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	} | null>(null);
	let pan = $state<{
		pointerId: number;
		startX: number;
		startY: number;
		scrollLeft: number;
		scrollTop: number;
		button: number;
		moved: boolean;
	} | null>(null);
	let zoom = $state(DEFAULT_ZOOM);
	let lastBoardId = $state<string | null>(null);
	let suggestionKey = $state('');

	type RenderedTileEntry =
		| { tile: SessionBoardTile; kind: 'calendar'; x: number; y: number }
		| { tile: SessionBoardTimerTileModel; kind: 'timer'; x: number; y: number }
		| { tile: SessionBoardCombatTileModel; kind: 'combat'; x: number; y: number }
		| { tile: SessionBoardDiceTileModel; kind: 'dice'; x: number; y: number }
		| { tile: SessionBoardGeneratorTileModel; kind: 'generator'; x: number; y: number }
		| { tile: SessionBoardNoteTile; kind: 'note_slot'; x: number; y: number }
		| {
				tile: SessionBoardNoteTile;
				kind: 'note';
				note: (typeof notesState.activeNotes)[number];
				x: number;
				y: number;
		  };

	let activeBoard = $derived(sessionBoardsState.activeBoard);
	let activeNotesById = $derived(notesState.activeNoteById);
	let boardTemplates = $derived(sessionBoardsState.templates);
	let layout = $derived.by(() => ({
		columns: activeBoard?.layout?.columns ?? DEFAULT_LAYOUT.columns,
		rowHeight: activeBoard?.layout?.rowHeight ?? DEFAULT_LAYOUT.rowHeight,
		minRows: activeBoard?.layout?.minRows ?? DEFAULT_LAYOUT.minRows,
		gap: activeBoard?.layout?.gap ?? DEFAULT_LAYOUT.gap,
	}));
	let selectedTile = $derived.by(
		() => activeBoard?.tiles.find((t) => t.id === selectedTileId) ?? null,
	);
	let selectedNoteTile = $derived.by(() =>
		selectedTile && (selectedTile.type ?? 'note') === 'note'
			? (selectedTile as SessionBoardNoteTile)
			: null,
	);
	let overlayNote = $derived(overlayNoteId ? (activeNotesById.get(overlayNoteId) ?? null) : null);
	let zoomPercent = $derived(Math.round(zoom * 100));

	let availableNotes = $derived.by(() => {
		const used = new Set(
			(activeBoard?.tiles ?? [])
				.filter((tile): tile is SessionBoardTile & { noteId: NoteId } => !!tile.noteId)
				.map((tile) => tile.noteId),
		);
		const q = noteQuery.trim().toLowerCase();
		const base = notesState.activeNotes.filter((n) => !used.has(n.id));
		if (!q) return base.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 40);
		return base
			.map((note) => {
				const title = note.title.toLowerCase();
				let score = -1;
				if (title === q) score = 500;
				else if (title.startsWith(q)) score = 400;
				else if (title.includes(q)) score = 300;
				else {
					const tagMatches = note.tags.filter((tag) => tag.toLowerCase().includes(q)).length;
					if (tagMatches > 0) score = 120 + tagMatches * 10;
				}
				return { note, score };
			})
			.filter((e) => e.score >= 0)
			.sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt))
			.slice(0, 40)
			.map((e) => e.note);
	});

	let renderedTiles = $derived.by(() => {
		if (!activeBoard) return [] as RenderedTileEntry[];
		const entries: RenderedTileEntry[] = [];
		for (const tile of activeBoard.tiles) {
			const draft = draftPositions[tile.id];
			if (tile.type === 'calendar') {
				entries.push({ tile, kind: 'calendar', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (tile.type === 'timer') {
				entries.push({ tile, kind: 'timer', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (tile.type === 'combat') {
				entries.push({ tile, kind: 'combat', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (tile.type === 'dice') {
				entries.push({ tile, kind: 'dice', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (tile.type === 'generator') {
				entries.push({ tile, kind: 'generator', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (!tile.noteId) {
				entries.push({ tile, kind: 'note_slot', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			const note = activeNotesById.get(tile.noteId);
			if (!note) {
				entries.push({ tile, kind: 'note_slot', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			entries.push({ tile, kind: 'note', note, x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
		}
		return entries;
	});

	let canvas = $derived.by(() => {
		const rows = Math.max(layout.minRows, ...renderedTiles.map((t) => t.y + t.tile.h));
		return {
			width: layout.columns * CELL_WIDTH + Math.max(0, layout.columns - 1) * layout.gap,
			height: rows * layout.rowHeight + Math.max(0, rows - 1) * layout.gap,
		};
	});

	$effect(() => {
		if (sessionBoardsState.boards.length === 0 && !sessionBoardsState.loading)
			void sessionBoardsState.loadAll();
	});

	$effect(() => {
		if (!activeBoard) {
			selectedTileId = null;
			lastBoardId = null;
			suggestionKey = '';
			return;
		}
		if (activeBoard.id !== lastBoardId) {
			boardNameDraft = activeBoard.name;
			boardDescriptionDraft = activeBoard.description;
			saveTemplateName = `${activeBoard.name} Layout`;
			saveTemplateDescription = activeBoard.description;
			applyTemplateId = '';
			selectedTileId = null;
			draftPositions = {};
			zoom = DEFAULT_ZOOM;
			lastBoardId = activeBoard.id;
		}
		if (selectedTileId && !activeBoard.tiles.some((tile) => tile.id === selectedTileId)) {
			selectedTileId = null;
		}
		const key = `${activeBoard.id}:${[...new Set(activeBoard.tiles.map((t) => t.noteId ?? t.type ?? 'none'))].sort().join('|')}`;
		if (key !== suggestionKey) {
			suggestionKey = key;
			void sessionBoardsState.suggestForBoard(activeBoard.id, 10);
		}
	});

	$effect(() => {
		if (mode === 'view') selectedTileId = null;
	});

	$effect(() => {
		if (!overlayNote) {
			overlayHtml = '';
			return;
		}
		let stale = false;
		void renderMarkdown(overlayNote.content, {
			resolveLink: (title) => {
				const id = notesState.resolveTitle(title);
				return id
					? { href: `/notes/${id}`, exists: true }
					: { href: `/notes?create=${encodeURIComponent(title)}`, exists: false };
			},
		}).then((result) => {
			if (!stale) overlayHtml = result;
		});
		return () => {
			stale = true;
		};
	});

	$effect(() => {
		if (!drag && !pan) return;
		function move(event: PointerEvent): void {
			if (drag && activeBoard && event.pointerId === drag.pointerId) {
				const activeDrag = drag;
				const dx = Math.round(
					(event.clientX - activeDrag.startX) / ((CELL_WIDTH + layout.gap) * zoom),
				);
				const dy = Math.round(
					(event.clientY - activeDrag.startY) / ((layout.rowHeight + layout.gap) * zoom),
				);
				const tile = activeBoard.tiles.find((t) => t.id === activeDrag.tileId);
				if (!tile) return;
				const w = Math.max(2, Math.min(layout.columns, tile.w));
				draftPositions = {
					...draftPositions,
					[activeDrag.tileId]: {
						x: Math.max(0, Math.min(layout.columns - w, activeDrag.originX + dx)),
						y: Math.max(0, activeDrag.originY + dy),
					},
				};
				return;
			}
			if (pan && boardViewportEl && event.pointerId === pan.pointerId) {
				boardViewportEl.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
				boardViewportEl.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
				if (
					!pan.moved &&
					(Math.abs(event.clientX - pan.startX) > 3 || Math.abs(event.clientY - pan.startY) > 3)
				) {
					pan = { ...pan, moved: true };
				}
			}
		}
		function up(event: PointerEvent): void {
			if (drag && activeBoard && event.pointerId === drag.pointerId) {
				const activeDrag = drag;
				const tile = activeBoard.tiles.find((t) => t.id === activeDrag.tileId);
				const next = draftPositions[activeDrag.tileId];
				if (tile && next && (tile.x !== next.x || tile.y !== next.y)) {
					void sessionBoardsState.updateTile(activeBoard.id, activeDrag.tileId, next);
				}
				const rem = { ...draftPositions };
				delete rem[activeDrag.tileId];
				draftPositions = rem;
				drag = null;
			}
			if (pan && event.pointerId === pan.pointerId) pan = null;
		}
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', up);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', up);
		};
	});

	function tileStyle(tile: SessionBoardTile, x: number, y: number): string {
		const left = x * (CELL_WIDTH + layout.gap);
		const top = y * (layout.rowHeight + layout.gap);
		const width = tile.w * CELL_WIDTH + Math.max(0, tile.w - 1) * layout.gap;
		const height = tile.h * layout.rowHeight + Math.max(0, tile.h - 1) * layout.gap;
		return `left:${left}px;top:${top}px;width:${width}px;height:${height}px;min-height:0;`;
	}

	function patternStyle(board: SessionBoard): string {
		if (board.style?.backgroundPattern === 'grid') {
			return `background-image: linear-gradient(to right, rgba(32,32,32,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(32,32,32,0.16) 1px, transparent 1px); background-size: ${CELL_WIDTH + layout.gap}px ${layout.rowHeight + layout.gap}px;`;
		}
		if (board.style?.backgroundPattern === 'dots') {
			return 'background-image: radial-gradient(rgba(32,32,32,0.28) 1.2px, transparent 1.2px); background-size: 22px 22px;';
		}
		return '';
	}

	function clampZoom(value: number): number {
		return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
	}

	function setZoom(nextZoom: number, anchor?: { clientX: number; clientY: number }): void {
		const clamped = clampZoom(nextZoom);
		if (clamped === zoom) return;
		if (!boardViewportEl) {
			zoom = clamped;
			return;
		}

		const viewport = boardViewportEl;
		const rect = viewport.getBoundingClientRect();
		const anchorX = anchor?.clientX ?? rect.left + viewport.clientWidth / 2;
		const anchorY = anchor?.clientY ?? rect.top + viewport.clientHeight / 2;
		const originX = anchorX - rect.left + viewport.scrollLeft;
		const originY = anchorY - rect.top + viewport.scrollTop;
		const boardX = originX / zoom;
		const boardY = originY / zoom;

		zoom = clamped;

		requestAnimationFrame(() => {
			if (!boardViewportEl) return;
			boardViewportEl.scrollLeft = boardX * clamped - (anchorX - rect.left);
			boardViewportEl.scrollTop = boardY * clamped - (anchorY - rect.top);
		});
	}

	function fitCanvasToViewport(): void {
		if (!boardViewportEl) return;
		const fitX = (boardViewportEl.clientWidth - 48) / Math.max(1, canvas.width);
		const fitY = (boardViewportEl.clientHeight - 48) / Math.max(1, canvas.height);
		setZoom(Math.min(1, fitX, fitY));
		boardViewportEl.scrollLeft = 0;
		boardViewportEl.scrollTop = 0;
	}

	function handleViewportWheel(event: WheelEvent): void {
		if (!(event.ctrlKey || event.metaKey)) return;
		event.preventDefault();
		const factor = Math.exp(-event.deltaY * 0.0022);
		setZoom(zoom * factor, { clientX: event.clientX, clientY: event.clientY });
	}

	function handleViewportKeydown(event: KeyboardEvent): void {
		if (!(event.ctrlKey || event.metaKey)) return;
		if (event.key === '=' || event.key === '+') {
			event.preventDefault();
			setZoom(zoom + 0.1);
			return;
		}
		if (event.key === '-' || event.key === '_') {
			event.preventDefault();
			setZoom(zoom - 0.1);
			return;
		}
		if (event.key === '0') {
			event.preventDefault();
			setZoom(DEFAULT_ZOOM);
		}
	}

	async function createBoard(): Promise<void> {
		await sessionBoardsState.createBoard(
			newBoardName,
			newBoardDescription,
			createTemplateId || undefined,
		);
		newBoardName = 'Session Board';
		newBoardDescription = '';
		createTemplateId = '';
	}
	async function saveBoard(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.updateBoard(activeBoard.id, {
			name: boardNameDraft,
			description: boardDescriptionDraft,
		});
	}
	async function updateLayout(updates: Partial<SessionBoard['layout']>): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.updateBoard(activeBoard.id, {
			layout: { ...(activeBoard.layout ?? DEFAULT_LAYOUT), ...updates },
		});
	}
	async function updateStyle(updates: Partial<SessionBoard['style']>): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.updateBoard(activeBoard.id, {
			style: { ...(activeBoard.style ?? {}), ...updates },
		});
	}
	async function addNote(noteId: NoteId): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addNoteToBoard(activeBoard.id, noteId);
	}
	async function addCalendarTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addCalendarTile(activeBoard.id);
	}
	async function addTimerTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addTimerTile(activeBoard.id);
	}
	async function addDiceTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addDiceTile(activeBoard.id);
	}
	async function addGeneratorTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addGeneratorTile(activeBoard.id);
	}
	async function addCombatTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addCombatTile(activeBoard.id);
	}
	async function applyTemplate(): Promise<void> {
		if (!activeBoard || !applyTemplateId) return;
		await sessionBoardsState.applyTemplateToBoard(activeBoard.id, applyTemplateId);
	}
	async function saveCurrentLayoutAsTemplate(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.saveTemplateFromBoard(
			activeBoard.id,
			saveTemplateName,
			saveTemplateDescription,
		);
	}
	async function deleteTemplate(templateId: string): Promise<void> {
		if (!templateId) return;
		await sessionBoardsState.deleteTemplate(templateId);
		if (createTemplateId === templateId) createTemplateId = '';
		if (applyTemplateId === templateId) applyTemplateId = '';
	}
	async function removeTile(tileId: string): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.removeTile(activeBoard.id, tileId);
		if (selectedTileId === tileId) selectedTileId = null;
	}
	async function updateSelected(updates: Partial<SessionBoardTile>): Promise<void> {
		if (!activeBoard || !selectedTileId) return;
		await sessionBoardsState.updateTile(activeBoard.id, selectedTileId, updates);
	}

	function startTileDrag(
		tileId: string,
		event: PointerEvent,
		options?: { ignoreInteractiveTarget?: boolean },
	): void {
		if (mode !== 'edit' || !activeBoard || event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (!options?.ignoreInteractiveTarget && target.closest('a,button,input,textarea,select,label'))
			return;
		event.preventDefault();
		event.stopPropagation();
		const tile = activeBoard.tiles.find((t) => t.id === tileId);
		if (!tile) return;
		const p = draftPositions[tile.id] ?? { x: tile.x, y: tile.y };
		drag = {
			tileId,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			originX: p.x,
			originY: p.y,
		};
	}

	function startPan(event: PointerEvent): void {
		if (!boardViewportEl || (event.button !== 0 && event.button !== 2)) return;
		const target = event.target as HTMLElement;
		const isTileTarget = target.closest('[data-board-tile="true"]');
		if (event.button === 0 && isTileTarget) return;
		if (event.button === 0) selectedTileId = null;
		event.preventDefault();
		pan = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			scrollLeft: boardViewportEl.scrollLeft,
			scrollTop: boardViewportEl.scrollTop,
			button: event.button,
			moved: false,
		};
	}

	function handleViewportContextMenu(event: MouseEvent): void {
		if (pan?.button === 2 || event.button === 2) {
			event.preventDefault();
		}
	}

	function handleBoardSelectChange(event: Event): void {
		const boardId = (event.currentTarget as HTMLSelectElement).value;
		if (!boardId) return;
		sessionBoardsState.setActiveBoard(boardId as SessionBoard['id']);
	}

	function onNumberChange(event: Event, fallback: number, cb: (v: number) => void): void {
		const v = Number((event.currentTarget as HTMLInputElement).value);
		cb(Number.isFinite(v) ? v : fallback);
	}

	function handleOverlayClick(event: MouseEvent): void {
		const link = (event.target as HTMLElement).closest('a');
		const href = link?.getAttribute('href');
		if (!href?.startsWith('/')) return;
		event.preventDefault();
		overlayNoteId = null;
		void goto(href);
	}

	$effect(() => {
		if (!overlayContentEl) return;
		overlayContentEl.addEventListener('click', handleOverlayClick);
		return () => overlayContentEl?.removeEventListener('click', handleOverlayClick);
	});
</script>

<div class="h-full min-h-0 box-border overflow-hidden p-4">
	<div
		class="grid h-full min-h-0 gap-4 overflow-hidden {mode === 'edit'
			? 'xl:grid-cols-[330px_minmax(0,1fr)]'
			: 'grid-cols-1'}"
	>
		{#if mode === 'edit'}
			<aside
				class="h-full min-h-0 rounded-xl border border-border-strong/60 dark:border-tavern-border-strong/60 bg-surface/98 dark:bg-tavern-surface/96 shadow-sm overflow-hidden flex flex-col"
			>
				<div class="px-4 py-3 border-b border-border dark:border-tavern-border">
					<h1
						class="text-xl font-bold text-ink dark:text-tavern-text"
						style="font-family: var(--font-serif)"
					>
						Session Board
					</h1>
					<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1">
						Keep your most useful session notes in one quickly readable workspace.
					</p>
				</div>

				<div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
					<section
						class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-3"
					>
						<h2 class="text-sm font-semibold text-ink dark:text-tavern-text mb-2">Create Board</h2>
						<input
							type="text"
							bind:value={newBoardName}
							class="w-full mb-2 px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-sm"
							placeholder="Board name"
						/>
						<textarea
							bind:value={newBoardDescription}
							rows="2"
							class="w-full mb-2 px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-sm"
							placeholder="Short purpose"
						></textarea>
						<label class="block text-xs text-ink-muted dark:text-tavern-muted mb-2">
							Template
							<select
								bind:value={createTemplateId}
								class="mt-1 w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-sm"
							>
								<option value="">Blank board</option>
								{#each boardTemplates as template (template.id)}
									<option value={template.id}>{template.name}</option>
								{/each}
							</select>
						</label>
						<button
							class="w-full px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover dark:bg-tavern-accent dark:hover:bg-tavern-accent-hover dark:text-tavern-bg text-white text-sm transition-colors"
							onclick={createBoard}>Create Session Board</button
						>
					</section>

					<section
						class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-3"
					>
						<h2 class="text-sm font-semibold text-ink dark:text-tavern-text mb-2">Boards</h2>
						<div class="space-y-1 max-h-56 overflow-y-auto pr-1">
							{#if sessionBoardsState.boards.length === 0}
								<p class="text-xs text-ink-faint dark:text-tavern-faint">No boards yet.</p>
							{:else}
								{#each sessionBoardsState.boards as board (board.id)}
									<button
										class="w-full text-left px-2.5 py-1.5 rounded-md border text-sm transition-colors {activeBoard?.id ===
										board.id
											? 'border-accent/45 dark:border-tavern-accent/45 bg-accent-subtle dark:bg-tavern-accent-subtle text-ink dark:text-tavern-text'
											: 'border-border/45 dark:border-tavern-border/45 text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text hover:bg-surface-alt/70 dark:hover:bg-tavern-surface-alt/70'}"
										onclick={() => sessionBoardsState.setActiveBoard(board.id)}
									>
										<div class="truncate">{board.name}</div>
										<div class="text-[11px] opacity-70">{board.tiles.length} tiles</div>
									</button>
								{/each}
							{/if}
						</div>
					</section>

					<section
						class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-3 space-y-2"
					>
						<h2 class="text-sm font-semibold text-ink dark:text-tavern-text">Board Templates</h2>
						<p class="text-[11px] text-ink-muted dark:text-tavern-muted">
							Use built-in layouts for common scenes or save your own reusable board setup.
						</p>
						{#if activeBoard}
							<label class="block text-xs text-ink-muted dark:text-tavern-muted">
								Apply template
								<select
									bind:value={applyTemplateId}
									class="mt-1 w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-sm"
								>
									<option value="">Select template</option>
									{#each boardTemplates as template (template.id)}
										<option value={template.id}>{template.name}</option>
									{/each}
								</select>
							</label>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors disabled:opacity-60"
								onclick={applyTemplate}
								disabled={!applyTemplateId}
							>
								Apply Template To Current Board
							</button>

							<div class="pt-2 border-t border-border/70 dark:border-tavern-border/70 space-y-2">
								<input
									type="text"
									bind:value={saveTemplateName}
									class="w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-sm"
									placeholder="Template name"
								/>
								<textarea
									bind:value={saveTemplateDescription}
									rows="2"
									class="w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-sm"
									placeholder="Template description"
								></textarea>
								<button
									class="w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
									onclick={saveCurrentLayoutAsTemplate}
								>
									Save Current Layout As Template
								</button>
							</div>
						{/if}

						<div class="max-h-36 overflow-y-auto pr-1 space-y-1">
							{#if boardTemplates.length === 0}
								<p class="text-xs text-ink-faint dark:text-tavern-faint">No templates available.</p>
							{:else}
								{#each boardTemplates as template (template.id)}
									<div
										class="rounded border border-border/60 dark:border-tavern-border/60 px-2 py-1.5"
									>
										<div class="flex items-center justify-between gap-2">
											<div class="truncate text-xs font-medium text-ink dark:text-tavern-text">
												{template.name}
											</div>
											{#if !template.builtIn}
												<button
													class="text-[11px] px-1.5 py-0.5 rounded border border-error/40 text-error hover:bg-error/5 transition-colors"
													onclick={() => void deleteTemplate(template.id)}
												>
													Delete
												</button>
											{/if}
										</div>
										<div class="text-[11px] text-ink-faint dark:text-tavern-faint truncate">
											{template.description || `${template.tiles.length} tiles`}
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</section>

					{#if activeBoard}
						<section
							class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-3 space-y-2"
						>
							<h2 class="text-sm font-semibold text-ink dark:text-tavern-text">
								Add Tiles and Notes
							</h2>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-xs text-ink dark:text-tavern-text hover:bg-surface dark:hover:bg-tavern-surface transition-colors"
								onclick={addCalendarTile}
							>
								Add Calendar Tile
							</button>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-xs text-ink dark:text-tavern-text hover:bg-surface dark:hover:bg-tavern-surface transition-colors"
								onclick={addTimerTile}
							>
								Add Timer Tile
							</button>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-xs text-ink dark:text-tavern-text hover:bg-surface dark:hover:bg-tavern-surface transition-colors"
								onclick={addCombatTile}
							>
								Add Combat Tracker Tile
							</button>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-xs text-ink dark:text-tavern-text hover:bg-surface dark:hover:bg-tavern-surface transition-colors"
								onclick={addDiceTile}
							>
								Add Dice Tray Tile
							</button>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-xs text-ink dark:text-tavern-text hover:bg-surface dark:hover:bg-tavern-surface transition-colors"
								onclick={addGeneratorTile}
							>
								Add Generator Tile
							</button>
							<input
								type="text"
								bind:value={noteQuery}
								class="w-full px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-sm"
								placeholder="Search notes (titles first, tags second)"
							/>
							<div class="space-y-1 max-h-44 overflow-y-auto pr-1">
								{#if availableNotes.length === 0}
									<p class="text-xs text-ink-faint dark:text-tavern-faint">No matching notes.</p>
								{:else}
									{#each availableNotes as note (note.id)}
										<button
											class="w-full text-left px-2 py-1.5 rounded-md text-sm border border-transparent hover:border-border dark:hover:border-tavern-border hover:bg-surface-alt/70 dark:hover:bg-tavern-surface-alt/70 transition-colors"
											onclick={() => addNote(note.id)}
										>
											<div class="truncate">{note.title}</div>
											{#if note.tags.length > 0}
												<div class="text-[11px] text-ink-faint truncate">
													#{note.tags.slice(0, 3).join(' #')}
												</div>
											{/if}
										</button>
									{/each}
								{/if}
							</div>
						</section>

						<section
							class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-3"
						>
							<div class="flex items-center justify-between mb-2">
								<h2 class="text-sm font-semibold text-ink dark:text-tavern-text">
									Related Suggestions
								</h2>
								<button
									class="text-xs px-2 py-1 rounded border border-border dark:border-tavern-border hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
									onclick={() => void sessionBoardsState.suggestForBoard(activeBoard.id, 10)}
									>Refresh</button
								>
							</div>
							<div class="space-y-1 max-h-44 overflow-y-auto pr-1">
								{#if sessionBoardsState.suggestionsLoading}
									<p class="text-xs text-ink-faint dark:text-tavern-faint">
										Finding related notes...
									</p>
								{:else if sessionBoardsState.suggestions.length === 0}
									<p class="text-xs text-ink-faint dark:text-tavern-faint">
										Add notes to get suggestions.
									</p>
								{:else}
									{#each sessionBoardsState.suggestions as suggestion (suggestion.noteId)}
										{@const note = activeNotesById.get(suggestion.noteId)}
										{#if note}
											<button
												class="w-full text-left px-2 py-1.5 rounded-md text-sm border border-transparent hover:border-border dark:hover:border-tavern-border hover:bg-surface-alt/70 dark:hover:bg-tavern-surface-alt/70 transition-colors"
												onclick={() => addNote(note.id)}
											>
												<div class="flex items-center justify-between gap-2">
													<span class="truncate">{note.title}</span>
													<span class="text-[11px]">score {suggestion.score}</span>
												</div>
											</button>
										{/if}
									{/each}
								{/if}
							</div>
						</section>

						<section
							class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-3"
						>
							<h2 class="text-sm font-semibold text-ink dark:text-tavern-text mb-2">Interaction</h2>
							<ul class="space-y-1 text-xs text-ink-muted dark:text-tavern-muted">
								<li>Left drag empty canvas to pan quickly.</li>
								<li>Right drag anywhere to pan without selecting.</li>
								<li>
									Use <span class="font-mono">Ctrl/Cmd + scroll</span> or zoom buttons to scale the board.
								</li>
							</ul>
						</section>
					{/if}
				</div>
			</aside>
		{/if}

		<section
			class="h-full min-h-0 rounded-xl border border-border-strong/60 dark:border-tavern-border-strong/60 bg-surface/95 dark:bg-tavern-surface/95 shadow-sm overflow-hidden flex flex-col"
		>
			{#if !activeBoard}
				<div class="h-full flex items-center justify-center text-center px-6">
					<div class="max-w-md">
						<p class="text-base font-semibold text-ink dark:text-tavern-text">
							Create or select a board to begin.
						</p>
						<p class="text-sm text-ink-muted dark:text-tavern-muted mt-1">
							Session boards are designed for quick reference during sessions.
						</p>
						{#if mode === 'view'}
							<button
								class="mt-3 px-3 py-1.5 rounded-md text-sm border border-border dark:border-tavern-border hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
								onclick={() => (mode = 'edit')}>Enter Edit Mode</button
							>
						{/if}
					</div>
				</div>
			{:else}
				<div
					class="shrink-0 border-b border-border dark:border-tavern-border bg-surface/97 dark:bg-tavern-surface/96 backdrop-blur px-3 py-3 {mode ===
					'edit'
						? 'space-y-3'
						: ''}"
				>
					{#if mode === 'edit'}
						<div class="flex flex-wrap items-start gap-2">
							<input
								type="text"
								bind:value={boardNameDraft}
								class="min-w-[220px] flex-1 px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-sm"
							/>
							<input
								type="text"
								bind:value={boardDescriptionDraft}
								class="min-w-[220px] flex-[2] px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-sm"
								placeholder="Board description"
							/>
							<button
								class="px-3 py-1.5 rounded-md text-sm border border-border dark:border-tavern-border hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
								onclick={saveBoard}>Save</button
							>
						</div>
					{/if}

					<div class="flex flex-wrap items-center gap-2">
						{#if mode === 'view'}
							<select
								class="min-w-[220px] max-w-[420px] truncate px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-sm"
								value={activeBoard.id}
								onchange={handleBoardSelectChange}
							>
								{#each sessionBoardsState.boards as board (board.id)}
									<option value={board.id}>{board.name}</option>
								{/each}
							</select>
						{/if}
						<div class="flex items-center gap-1">
							<button
								class="px-3 py-1.5 text-xs rounded border transition-colors {mode === 'view'
									? 'bg-accent dark:bg-tavern-accent text-white dark:text-tavern-bg border-transparent'
									: 'border-border dark:border-tavern-border hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
								onclick={() => (mode = 'view')}>View</button
							>
							<button
								class="px-3 py-1.5 text-xs rounded border transition-colors {mode === 'edit'
									? 'bg-accent dark:bg-tavern-accent text-white dark:text-tavern-bg border-transparent'
									: 'border-border dark:border-tavern-border hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
								onclick={() => (mode = 'edit')}>Edit</button
							>
						</div>
						{#if mode === 'edit'}
							<span class="text-xs text-ink-muted dark:text-tavern-muted hidden lg:inline"
								>Edit mode: drag, resize, style, and position tiles.</span
							>
						{/if}

						<div
							class="ml-auto flex items-center gap-1 rounded-md border border-border dark:border-tavern-border bg-surface-alt/80 dark:bg-tavern-surface-alt/80 px-1.5 py-1"
						>
							<button
								class="h-7 w-7 rounded border border-border dark:border-tavern-border text-sm hover:bg-surface dark:hover:bg-tavern-surface transition-colors"
								onclick={() => setZoom(zoom - 0.12)}
								aria-label="Zoom out">-</button
							>
							<div
								class="min-w-14 text-center text-xs font-semibold text-ink dark:text-tavern-text"
							>
								{zoomPercent}%
							</div>
							<button
								class="h-7 w-7 rounded border border-border dark:border-tavern-border text-sm hover:bg-surface dark:hover:bg-tavern-surface transition-colors"
								onclick={() => setZoom(zoom + 0.12)}
								aria-label="Zoom in">+</button
							>
							<button
								class="h-7 px-2 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface dark:hover:bg-tavern-surface transition-colors"
								onclick={() => setZoom(DEFAULT_ZOOM)}>100%</button
							>
							<button
								class="h-7 px-2 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface dark:hover:bg-tavern-surface transition-colors"
								onclick={fitCanvasToViewport}>Fit</button
							>
						</div>
					</div>

					{#if mode === 'edit'}
						<details
							class="rounded-md border border-border dark:border-tavern-border bg-surface-alt/60 dark:bg-tavern-surface-alt/60 p-2.5"
						>
							<summary
								class="cursor-pointer list-none select-none text-xs font-semibold text-ink dark:text-tavern-text"
							>
								Advanced board and tile options
							</summary>
							<div class="mt-2 space-y-2">
								<div class="grid gap-2 md:grid-cols-4">
									<label class="text-xs"
										>Columns<input
											type="number"
											min="8"
											max="32"
											value={layout.columns}
											onchange={(e) =>
												onNumberChange(e, layout.columns, (v) => void updateLayout({ columns: v }))}
											class="mt-1 w-full px-2 py-1 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
										/></label
									>
									<label class="text-xs"
										>Row Height<input
											type="number"
											min="70"
											max="220"
											value={layout.rowHeight}
											onchange={(e) =>
												onNumberChange(
													e,
													layout.rowHeight,
													(v) => void updateLayout({ rowHeight: v }),
												)}
											class="mt-1 w-full px-2 py-1 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
										/></label
									>
									<label class="text-xs"
										>Min Rows<input
											type="number"
											min="6"
											max="240"
											value={layout.minRows}
											onchange={(e) =>
												onNumberChange(e, layout.minRows, (v) => void updateLayout({ minRows: v }))}
											class="mt-1 w-full px-2 py-1 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
										/></label
									>
									<label class="text-xs"
										>Gap<input
											type="number"
											min="0"
											max="28"
											value={layout.gap}
											onchange={(e) =>
												onNumberChange(e, layout.gap, (v) => void updateLayout({ gap: v }))}
											class="mt-1 w-full px-2 py-1 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
										/></label
									>
								</div>

								<div class="grid gap-2 md:grid-cols-4">
									<label class="text-xs"
										>Board Color<input
											type="color"
											value={activeBoard.style?.backgroundColor ?? '#f5f5f5'}
											onchange={(e) =>
												void updateStyle({
													backgroundColor: (e.currentTarget as HTMLInputElement).value,
												})}
											class="mt-1 h-9 w-full rounded border border-border dark:border-tavern-border"
										/></label
									>
									<label class="text-xs"
										>Pattern<select
											value={activeBoard.style?.backgroundPattern ?? 'none'}
											onchange={(e) =>
												void updateStyle({
													backgroundPattern: (e.currentTarget as HTMLSelectElement).value as
														| 'none'
														| 'grid'
														| 'dots',
												})}
											class="mt-1 h-9 w-full rounded border border-border dark:border-tavern-border px-2 bg-surface dark:bg-tavern-surface"
											><option value="none">None</option><option value="grid">Grid</option><option
												value="dots">Dots</option
											></select
										></label
									>
									<label class="text-xs"
										>Section Tint<input
											type="color"
											value={activeBoard.style?.sectionTintColor ?? '#7c3aed'}
											onchange={(e) =>
												void updateStyle({
													sectionTintColor: (e.currentTarget as HTMLInputElement).value,
												})}
											class="mt-1 h-9 w-full rounded border border-border dark:border-tavern-border"
										/></label
									>
									<label class="text-xs"
										>Section Opacity<input
											type="range"
											min="0"
											max="0.75"
											step="0.05"
											value={activeBoard.style?.sectionTintOpacity ?? 0}
											oninput={(e) =>
												void updateStyle({
													sectionTintOpacity: Number((e.currentTarget as HTMLInputElement).value),
												})}
											class="mt-2 w-full"
										/></label
									>
								</div>

								<div
									class="rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-2"
								>
									{#if selectedTile}
										<div class="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
											<label class="text-xs"
												>X<input
													type="number"
													value={selectedTile.x}
													onchange={(e) =>
														onNumberChange(e, selectedTile.x, (v) => void updateSelected({ x: v }))}
													class="mt-1 w-full px-2 py-1 rounded border border-border dark:border-tavern-border"
												/></label
											>
											<label class="text-xs"
												>Y<input
													type="number"
													value={selectedTile.y}
													onchange={(e) =>
														onNumberChange(e, selectedTile.y, (v) => void updateSelected({ y: v }))}
													class="mt-1 w-full px-2 py-1 rounded border border-border dark:border-tavern-border"
												/></label
											>
											<label class="text-xs"
												>W<input
													type="number"
													min="2"
													max={layout.columns}
													value={selectedTile.w}
													onchange={(e) =>
														onNumberChange(e, selectedTile.w, (v) => void updateSelected({ w: v }))}
													class="mt-1 w-full px-2 py-1 rounded border border-border dark:border-tavern-border"
												/></label
											>
											<label class="text-xs"
												>H<input
													type="number"
													min="2"
													max="8"
													value={selectedTile.h}
													onchange={(e) =>
														onNumberChange(e, selectedTile.h, (v) => void updateSelected({ h: v }))}
													class="mt-1 w-full px-2 py-1 rounded border border-border dark:border-tavern-border"
												/></label
											>
											{#if selectedNoteTile}
												<label class="text-xs"
													>Preview<select
														value={selectedNoteTile.previewDepth ?? 'summary'}
														onchange={(e) =>
															void updateSelected({
																previewDepth: (e.currentTarget as HTMLSelectElement).value as
																	| 'title'
																	| 'summary'
																	| 'full',
															})}
														class="mt-1 h-9 w-full rounded border border-border dark:border-tavern-border px-2 bg-surface dark:bg-tavern-surface"
														><option value="title">Title only</option><option value="summary"
															>Summary</option
														><option value="full">Full</option></select
													></label
												>
												<label class="text-xs"
													>Summary Lines<input
														type="number"
														min="1"
														max="40"
														value={selectedNoteTile.previewLineCount ?? 8}
														onchange={(e) =>
															onNumberChange(
																e,
																selectedNoteTile.previewLineCount ?? 8,
																(v) => void updateSelected({ previewLineCount: v }),
															)}
														class="mt-1 w-full px-2 py-1 rounded border border-border dark:border-tavern-border"
													/></label
												>
											{/if}
											<label class="text-xs"
												>Tile Bg<input
													type="color"
													value={selectedTile.style?.backgroundColor ?? '#ffffff'}
													onchange={(e) =>
														void updateSelected({
															style: {
																...(selectedTile.style ?? {}),
																backgroundColor: (e.currentTarget as HTMLInputElement).value,
															},
														})}
													class="mt-1 h-9 w-full rounded border border-border dark:border-tavern-border"
												/></label
											>
											<label class="text-xs"
												>Border<input
													type="color"
													value={selectedTile.style?.borderColor ?? '#7f8c8d'}
													onchange={(e) =>
														void updateSelected({
															style: {
																...(selectedTile.style ?? {}),
																borderColor: (e.currentTarget as HTMLInputElement).value,
															},
														})}
													class="mt-1 h-9 w-full rounded border border-border dark:border-tavern-border"
												/></label
											>
											<label class="text-xs"
												>Width<input
													type="number"
													min="0"
													max="8"
													value={selectedTile.style?.borderWidth ?? 1}
													onchange={(e) =>
														onNumberChange(
															e,
															selectedTile.style?.borderWidth ?? 1,
															(v) =>
																void updateSelected({
																	style: { ...(selectedTile.style ?? {}), borderWidth: v },
																}),
														)}
													class="mt-1 w-full px-2 py-1 rounded border border-border dark:border-tavern-border"
												/></label
											>
											<label class="text-xs"
												>Scale<input
													type="number"
													min="0.5"
													max="2.5"
													step="0.05"
													value={selectedTile.style?.scale ?? 1}
													onchange={(e) =>
														onNumberChange(
															e,
															selectedTile.style?.scale ?? 1,
															(v) =>
																void updateSelected({
																	style: { ...(selectedTile.style ?? {}), scale: v },
																}),
														)}
													class="mt-1 w-full px-2 py-1 rounded border border-border dark:border-tavern-border"
												/></label
											>
											<button
												class="h-9 mt-5 px-2 rounded border border-error/40 text-error hover:bg-error/5 transition-colors"
												onclick={() => void removeTile(selectedTile.id)}>Remove Tile</button
											>
										</div>
									{:else}
										<p class="text-xs text-ink-faint dark:text-tavern-faint">
											Select a tile to edit it.
										</p>
									{/if}
								</div>
							</div>
						</details>
					{/if}
				</div>

				{#if renderedTiles.length === 0}
					<div
						class="h-full flex items-center justify-center text-sm text-ink-muted dark:text-tavern-muted"
					>
						{mode === 'edit'
							? 'Add notes from the left panel to populate this board.'
							: 'This board has no tiles yet.'}
					</div>
				{:else}
					<div class="flex-1 min-h-0 p-3">
						<div
							class="h-full min-h-0 rounded-lg border border-border/70 dark:border-tavern-border/70 bg-surface-alt/70 dark:bg-tavern-surface-alt/65 overflow-hidden flex flex-col"
						>
							{#if mode === 'edit'}
								<div
									class="px-3 py-2 border-b border-border/80 dark:border-tavern-border/80 text-xs text-ink-muted dark:text-tavern-muted flex items-center justify-between gap-2"
								>
									<span>Left drag empty space or right drag anywhere to pan.</span>
									<span class="hidden md:inline">Ctrl/Cmd + scroll to zoom.</span>
								</div>
							{/if}
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
							<div
								class="relative flex-1 min-h-0 overflow-auto cursor-grab active:cursor-grabbing"
								role="application"
								aria-label="Session board canvas"
								onpointerdown={startPan}
								oncontextmenu={handleViewportContextMenu}
								onwheel={handleViewportWheel}
								onkeydown={handleViewportKeydown}
								bind:this={boardViewportEl}
								tabindex="0"
							>
								<div
									class="relative m-3"
									style="width: {canvas.width * zoom}px; height: {canvas.height * zoom}px;"
								>
									<div
										class="absolute left-0 top-0 origin-top-left"
										style="width: {canvas.width}px; height: {canvas.height}px; transform: scale({zoom}); background-color: {activeBoard
											.style?.backgroundColor ?? ''};"
									>
										<div
											class="absolute inset-0 pointer-events-none"
											style={patternStyle(activeBoard)}
										></div>
										{#each renderedTiles as entry (entry.tile.id)}
											{@const tile = entry.tile}
											<div class="absolute" style={tileStyle(tile, entry.x, entry.y)}>
												{#if entry.kind === 'note' && entry.note}
													{@const note = entry.note}
													<SessionBoardTileCard
														{tile}
														{note}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														scrollable={mode === 'view' || selectedTileId === tile.id}
														tintColor={activeBoard.style?.sectionTintColor ?? '#7c3aed'}
														tintOpacity={activeBoard.style?.sectionTintOpacity ?? 0}
														onopen={() => (overlayNoteId = note.id)}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
															else overlayNoteId = note.id;
														}}
														ondragstart={(event) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'timer'}
													<SessionBoardTimerTile
														tile={entry.tile}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														onupdate={(timer) => {
															if (!activeBoard) return;
															void sessionBoardsState.updateTile(activeBoard.id, tile.id, {
																timer,
															});
														}}
														ondragstart={(event) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'combat'}
													<CombatTrackerTile
														tile={entry.tile}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														onupdate={(combat) => {
															if (!activeBoard) return;
															void sessionBoardsState.updateTile(activeBoard.id, tile.id, {
																combat,
															});
														}}
														ondragstart={(event) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'dice'}
													<DiceTrayTile
														tile={entry.tile}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														ondragstart={(event) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'generator'}
													<GeneratorTile
														tile={entry.tile}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														ondragstart={(event) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'note_slot'}
													<div
														class="relative h-full rounded-lg border border-dashed border-border bg-surface/90 p-3 dark:border-tavern-border dark:bg-tavern-surface/90"
														data-board-tile="true"
													>
														{#if mode === 'edit'}
															<button
																type="button"
																class="absolute inset-0 z-10 cursor-move bg-transparent"
																aria-label="Drag note slot tile"
																onpointerdown={(event) => {
																	selectedTileId = tile.id;
																	startTileDrag(tile.id, event, {
																		ignoreInteractiveTarget: true,
																	});
																}}
															></button>
														{/if}
														<div
															class="relative z-20 h-full flex flex-col justify-center gap-2 text-center"
														>
															<div class="text-xs font-semibold text-ink dark:text-tavern-text">
																Empty note slot
															</div>
															<div class="text-[11px] text-ink-muted dark:text-tavern-muted">
																Use Add Notes to assign a note to this tile.
															</div>
														</div>
													</div>
												{:else}
													<div
														class="relative h-full rounded-lg border border-border bg-surface p-2 dark:border-tavern-border dark:bg-tavern-surface"
														data-board-tile="true"
													>
														{#if mode === 'edit'}
															<button
																type="button"
																class="absolute inset-0 z-10 cursor-move bg-transparent"
																aria-label="Drag calendar tile"
																onpointerdown={(event) => {
																	selectedTileId = tile.id;
																	startTileDrag(tile.id, event, {
																		ignoreInteractiveTarget: true,
																	});
																}}
															></button>
														{/if}
														<WorldCalendarReference
															notes={notesState.activeNotes}
															title="Calendar Reference"
														/>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		</section>
	</div>
</div>

{#if overlayNote}
	<div
		class="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="w-full max-w-5xl max-h-[85vh] rounded-lg border border-border bg-surface shadow-xl flex flex-col"
		>
			<div class="px-4 py-3 border-b border-border flex items-center gap-2">
				<h2 class="text-base font-semibold truncate flex-1">{overlayNote.title}</h2>
				<button
					class="px-2.5 py-1 rounded text-xs border border-border"
					onclick={() => {
						overlayNoteId = null;
						void goto(resolve(`/notes/${overlayNote.id}`));
					}}>Open Note</button
				>
				<button
					class="px-2.5 py-1 rounded text-xs border border-border"
					onclick={() => (overlayNoteId = null)}>Close</button
				>
			</div>
			<div class="p-4 overflow-y-auto min-h-0">
				<div class="markdown-content" role="document" bind:this={overlayContentEl}>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html overlayHtml}
				</div>
			</div>
		</div>
	</div>
{/if}
