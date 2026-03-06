<script lang="ts">
	import type { Note } from '$lib/types/note.js';
	import type { VaultObject } from '$lib/types/object.js';
	import { SvelteMap } from 'svelte/reactivity';
	import { renderMarkdown } from '$lib/markdown/pipeline.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import { formatWorldDate } from '$lib/domain/world-calendar.js';
	import { describeQuickReferenceNote } from '$lib/domain/quick-reference.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import {
		RandomTableError,
		buildRandomTableIndex,
		replaceRollBlockAtIndex,
		rollRandomTable,
	} from '$lib/domain/random-tables.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { goto } from '$app/navigation';

	interface Props {
		note: Note;
	}

	let { note }: Props = $props();
	let html = $state('');
	let contentEl = $state<HTMLDivElement | null>(null);
	let wikilinkCard = $state<{
		title: string;
		noteTitle: string;
		exists: boolean;
		keyStats: string[];
		previewLines: string[];
		left: number;
		top: number;
	} | null>(null);
	let activeWikilinkEl = $state<HTMLAnchorElement | null>(null);
	const wikilinkCardId = 'note-viewer-wikilink-card';
	let openCardTimer: ReturnType<typeof setTimeout> | null = null;
	let closeCardTimer: ReturnType<typeof setTimeout> | null = null;
	let modeScopedActiveNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((entry) => isNoteVisibleInPlayerMode(entry))
			: notesState.activeNotes,
	);

	interface ObjectIndex {
		byKey: Map<string, VaultObject>;
		byId: Map<string, VaultObject>;
	}

	const OBJECT_CACHE_TTL_MS = 10_000;
	const OBJECT_EMBED_MARKER = '[[obj:';
	let objectCache: { index: ObjectIndex; loadedAt: number } | null = null;
	let objectCachePromise: Promise<ObjectIndex> | null = null;

	function createObjectIndex(objects: VaultObject[]): ObjectIndex {
		const byKey = new SvelteMap<string, VaultObject>();
		const byId = new SvelteMap<string, VaultObject>();
		for (const object of objects) {
			byKey.set(`${object.type}:${object.id}`, object);
			byId.set(String(object.id), object);
		}
		return { byKey, byId };
	}

	async function getCachedStorageObjectIndex(): Promise<ObjectIndex> {
		const now = Date.now();
		if (objectCache && now - objectCache.loadedAt < OBJECT_CACHE_TTL_MS) {
			return objectCache.index;
		}

		if (!objectCachePromise) {
			objectCachePromise = (async () => {
				const storage = getStorage();
				const objects = await storage.getAllObjects();
				const index = createObjectIndex(objects);
				objectCache = { index, loadedAt: Date.now() };
				objectCachePromise = null;
				return index;
			})().catch((error) => {
				objectCachePromise = null;
				throw error;
			});
		}

		return objectCachePromise;
	}

	$effect(() => {
		let cancelled = false;

		const run = async (): Promise<void> => {
			const activeNotes = modeScopedActiveNotes;
			const notesById = new SvelteMap(activeNotes.map((entry) => [String(entry.id), entry]));
			const notesByTitle = new SvelteMap(
				activeNotes.map((entry) => [entry.title.toLowerCase(), entry]),
			);
			const noteObjects = activeNotes
				.map((entry) => noteToVaultObject(entry))
				.filter((object): object is VaultObject => !!object);
			const noteObjectIndex = createObjectIndex(noteObjects);
			const storageObjectIndex = note.content.includes(OBJECT_EMBED_MARKER)
				? await getCachedStorageObjectIndex()
				: {
						byKey: new SvelteMap<string, VaultObject>(),
						byId: new SvelteMap<string, VaultObject>(),
					};

			const result = await renderMarkdown(note.content, {
				resolveLink: (title) => {
					const targetId = notesState.resolveTitleStrict(title);
					if (targetId && playerModeState.enabled) {
						const target = notesState.getActiveNoteById(targetId);
						if (!target || !isNoteVisibleInPlayerMode(target)) {
							return {
								href: `/knowledge/notes?create=${encodeURIComponent(title)}`,
								exists: false,
							};
						}
					}
					return targetId
						? { href: `/knowledge/notes/${targetId}`, exists: true }
						: { href: `/knowledge/notes?create=${encodeURIComponent(title)}`, exists: false };
				},
				resolveObject: ({ type, id }) => {
					const resolved =
						(type
							? (noteObjectIndex.byKey.get(`${type}:${id}`) ??
								storageObjectIndex.byKey.get(`${type}:${id}`))
							: (noteObjectIndex.byId.get(String(id)) ??
								storageObjectIndex.byId.get(String(id)))) ?? null;
					if (
						resolved &&
						resolved.type === 'timeline_event' &&
						typeof resolved.data.worldDateOffset === 'number' &&
						Number.isFinite(resolved.data.worldDateOffset)
					) {
						return {
							...resolved,
							data: {
								...resolved.data,
								date: formatWorldDate(
									worldCalendarState.calendar,
									resolved.data.worldDateOffset,
									'short',
								),
							},
						};
					}
					return resolved;
				},
				resolveNote: ({ target, targetBy }) => {
					const resolved =
						targetBy === 'id' ? notesById.get(target) : notesByTitle.get(target.toLowerCase());
					if (!resolved) return null;

					const summary =
						typeof resolved.frontmatter['summary'] === 'string'
							? resolved.frontmatter['summary']
							: undefined;
					const preview = resolved.content
						.split('\n')
						.map((line) => line.trim())
						.filter(Boolean)
						.slice(0, 3)
						.join(' ')
						.slice(0, 320);

					return {
						id: String(resolved.id),
						title: resolved.title,
						kind:
							typeof resolved.frontmatter['type'] === 'string'
								? resolved.frontmatter['type']
								: 'note',
						summary,
						preview,
						updatedAt: resolved.updatedAt,
						object:
							noteObjectIndex.byId.get(String(resolved.id)) ??
							storageObjectIndex.byId.get(String(resolved.id)) ??
							null,
						cycleDetected: String(resolved.id) === String(note.id),
					};
				},
				currentNoteId: String(note.id),
			});

			if (!cancelled) {
				html = result;
			}
		};

		void run().catch((error) => {
			console.error('Failed to render note markdown:', error);
			if (!cancelled) {
				html = '<p>Unable to render note content.</p>';
			}
		});

		return () => {
			cancelled = true;
		};
	});

	function handleClick(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		const rollAction = target.closest('button[data-roll-action]') as HTMLButtonElement | null;
		if (rollAction) {
			event.preventDefault();
			const action = rollAction.dataset.rollAction;
			if (action === 'roll') {
				void handleRollBlockRoll(rollAction);
				return;
			}
			if (action === 'accept') {
				void handleRollBlockAccept(rollAction);
				return;
			}
		}

		const toggle = target.closest('[data-object-action="toggle"]') as HTMLElement | null;
		if (toggle) {
			event.preventDefault();
			const card = toggle.closest('[data-object-card="true"]') as HTMLElement | null;
			const details = card?.querySelector('.object-embed__details') as HTMLElement | null;
			if (!card || !details) return;

			const isExpanded = card.classList.contains('object-embed--expanded');
			card.classList.toggle('object-embed--expanded', !isExpanded);
			details.toggleAttribute('hidden', isExpanded);
			toggle.textContent = isExpanded ? 'Details' : 'Hide';
			return;
		}

		const link = target.closest('a');
		if (!link) return;

		const href = link.getAttribute('href');
		if (href && href.startsWith('/')) {
			event.preventDefault();
			goto(href);
		}
	}

	function buildRollTableLookup() {
		return buildRandomTableIndex({
			vaultNotes: modeScopedActiveNotes.map((entry) => ({
				id: String(entry.id),
				title: entry.title,
				content: entry.content,
				tags: entry.tags,
				folder: String(entry.folder),
				updatedAt: entry.updatedAt,
			})),
		});
	}

	async function handleRollBlockRoll(button: HTMLButtonElement): Promise<void> {
		const tableName =
			button.dataset.rollTable?.trim() ??
			button.closest<HTMLElement>('[data-roll-table]')?.dataset.rollTable?.trim() ??
			'';
		const rollIndexRaw =
			button.dataset.rollIndex ??
			button.closest<HTMLElement>('[data-roll-index]')?.dataset.rollIndex ??
			'-1';
		const rollIndex = Number.parseInt(rollIndexRaw, 10);
		if (!tableName || !Number.isFinite(rollIndex) || rollIndex < 0) return;

		try {
			const index = buildRollTableLookup();
			const roll = rollRandomTable(index, tableName);
			const container = button.closest<HTMLElement>('[data-roll-index]');
			if (!container) return;
			const historyList = container.querySelector<HTMLElement>('[data-roll-history]');
			if (historyList) {
				const item = document.createElement('li');
				item.className = 'roll-block__history-item';
				item.textContent = roll.result;
				historyList.prepend(item);
				historyList.hidden = false;
			}
			const acceptButton = container.querySelector<HTMLButtonElement>(
				'button[data-roll-action="accept"]',
			);
			if (acceptButton) {
				if (playerModeState.enabled) {
					acceptButton.hidden = true;
				} else {
					acceptButton.dataset.rollResult = roll.result;
					acceptButton.hidden = false;
				}
			}
		} catch (error) {
			if (error instanceof RandomTableError) {
				toastState.error(error.message);
				return;
			}
			toastState.error(`Failed to roll table: ${String(error)}`);
		}
	}

	async function handleRollBlockAccept(button: HTMLButtonElement): Promise<void> {
		if (playerModeState.enabled) return;
		const rollIndexRaw =
			button.dataset.rollIndex ??
			button.closest<HTMLElement>('[data-roll-index]')?.dataset.rollIndex ??
			'-1';
		const rollIndex = Number.parseInt(rollIndexRaw, 10);
		const rollResult = button.dataset.rollResult?.trim() ?? '';
		if (!rollResult || !Number.isFinite(rollIndex) || rollIndex < 0) return;
		const nextContent = replaceRollBlockAtIndex(note.content, rollIndex, rollResult);
		if (nextContent === note.content) {
			toastState.error('Unable to replace roll block in note content.');
			return;
		}
		await notesState.updateNote(note.id, { content: nextContent });
		toastState.success('Inserted rolled text into note.');
	}

	function isWikilinkAnchor(value: EventTarget | null): HTMLAnchorElement | null {
		if (!(value instanceof HTMLElement)) return null;
		const link = value.closest('a.wikilink') as HTMLAnchorElement | null;
		if (!link) return null;
		return link.dataset.wikilink ? link : null;
	}

	function clearHoverTimers(): void {
		if (openCardTimer !== null) {
			clearTimeout(openCardTimer);
			openCardTimer = null;
		}
		if (closeCardTimer !== null) {
			clearTimeout(closeCardTimer);
			closeCardTimer = null;
		}
	}

	function hideWikilinkCard(): void {
		if (activeWikilinkEl) {
			activeWikilinkEl.removeAttribute('aria-describedby');
			activeWikilinkEl = null;
		}
		wikilinkCard = null;
	}

	function showWikilinkCard(link: HTMLAnchorElement): void {
		const title = link.dataset.wikilink?.trim();
		if (!title) return;
		const resolvedId = notesState.resolveTitle(title);
		const targetNote = resolvedId ? notesState.getActiveNoteById(resolvedId) : null;
		if (targetNote && playerModeState.enabled && !isNoteVisibleInPlayerMode(targetNote)) {
			return;
		}
		const meta = targetNote ? describeQuickReferenceNote(targetNote) : null;

		const rect = link.getBoundingClientRect();
		const cardWidth = 320;
		const cardHeight = 190;
		const left = Math.max(8, Math.min(window.innerWidth - cardWidth - 8, rect.left));
		const defaultTop = rect.bottom + 10;
		const top =
			defaultTop + cardHeight > window.innerHeight
				? Math.max(8, rect.top - cardHeight - 10)
				: defaultTop;

		if (activeWikilinkEl && activeWikilinkEl !== link) {
			activeWikilinkEl.removeAttribute('aria-describedby');
		}
		activeWikilinkEl = link;
		activeWikilinkEl.setAttribute('aria-describedby', wikilinkCardId);

		wikilinkCard = {
			title,
			noteTitle: targetNote?.title ?? title,
			exists: !!targetNote,
			keyStats: meta?.keyStats ?? [],
			previewLines: meta?.previewLines ?? [],
			left,
			top,
		};
	}

	function scheduleShow(link: HTMLAnchorElement): void {
		if (closeCardTimer !== null) {
			clearTimeout(closeCardTimer);
			closeCardTimer = null;
		}
		if (openCardTimer !== null) clearTimeout(openCardTimer);
		openCardTimer = setTimeout(() => {
			openCardTimer = null;
			showWikilinkCard(link);
		}, 130);
	}

	function scheduleHide(): void {
		if (openCardTimer !== null) {
			clearTimeout(openCardTimer);
			openCardTimer = null;
		}
		if (closeCardTimer !== null) clearTimeout(closeCardTimer);
		closeCardTimer = setTimeout(() => {
			closeCardTimer = null;
			hideWikilinkCard();
		}, 120);
	}

	function handleMouseOver(event: MouseEvent): void {
		const link = isWikilinkAnchor(event.target);
		if (!link) return;
		scheduleShow(link);
	}

	function handleMouseOut(event: MouseEvent): void {
		const link = isWikilinkAnchor(event.target);
		if (!link) return;
		const related = event.relatedTarget;
		if (related instanceof Node && link.contains(related)) return;
		scheduleHide();
	}

	function handleFocusIn(event: FocusEvent): void {
		const link = isWikilinkAnchor(event.target);
		if (!link) return;
		scheduleShow(link);
	}

	function handleFocusOut(event: FocusEvent): void {
		const link = isWikilinkAnchor(event.target);
		if (!link) return;
		const related = event.relatedTarget;
		if (related instanceof Node && link.contains(related)) return;
		scheduleHide();
	}

	function handleKeyInteraction(event: KeyboardEvent): void {
		if (event.key !== ' ' && event.key !== 'Spacebar') return;
		const link = isWikilinkAnchor(event.target);
		if (!link) return;
		event.preventDefault();
		clearHoverTimers();
		if (activeWikilinkEl === link && wikilinkCard) {
			hideWikilinkCard();
			return;
		}
		showWikilinkCard(link);
	}

	$effect(() => {
		if (!contentEl) return;
		const element = contentEl;
		element.addEventListener('click', handleClick);
		element.addEventListener('mouseover', handleMouseOver);
		element.addEventListener('mouseout', handleMouseOut);
		element.addEventListener('focusin', handleFocusIn);
		element.addEventListener('focusout', handleFocusOut);
		element.addEventListener('keydown', handleKeyInteraction);
		return () => {
			element.removeEventListener('click', handleClick);
			element.removeEventListener('mouseover', handleMouseOver);
			element.removeEventListener('mouseout', handleMouseOut);
			element.removeEventListener('focusin', handleFocusIn);
			element.removeEventListener('focusout', handleFocusOut);
			element.removeEventListener('keydown', handleKeyInteraction);
		};
	});

	$effect(() => {
		return () => {
			clearHoverTimers();
		};
	});
</script>

<div class="markdown-content max-w-content mx-auto" role="document" bind:this={contentEl}>
	<!-- Content is sanitized by renderMarkdown before injecting HTML. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
</div>

{#if wikilinkCard}
	<div
		id={wikilinkCardId}
		role="tooltip"
		class="fixed z-30 w-80 rounded-lg border border-border bg-surface shadow-xl p-3 pointer-events-none"
		style={`left:${wikilinkCard.left}px; top:${wikilinkCard.top}px;`}
	>
		<p class="text-sm font-semibold text-ink truncate">
			{wikilinkCard.noteTitle}
		</p>
		{#if wikilinkCard.keyStats.length > 0}
			<p class="mt-1 text-[11px] text-ink-muted">
				{wikilinkCard.keyStats.join(' | ')}
			</p>
		{/if}
		{#if wikilinkCard.previewLines.length > 0}
			<p class="mt-2 text-xs text-ink-muted">
				{wikilinkCard.previewLines.slice(0, 3).join(' ')}
			</p>
		{:else if !wikilinkCard.exists}
			<p class="mt-2 text-xs text-ink-faint">
				No note currently resolves for [[{wikilinkCard.title}]].
			</p>
		{/if}
	</div>
{/if}
