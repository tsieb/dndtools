<script lang="ts">
	import type { Note } from '$lib/types/note.js';
	import type { VaultObject } from '$lib/types/object.js';
	import { SvelteMap } from 'svelte/reactivity';
	import { renderMarkdown } from '$lib/markdown/pipeline.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import { formatWorldDate } from '$lib/domain/world-calendar.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import { goto } from '$app/navigation';

	interface Props {
		note: Note;
	}

	let { note }: Props = $props();
	let html = $state('');
	let contentEl = $state<HTMLDivElement | null>(null);

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
			const activeNotes = notesState.activeNotes;
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
					return targetId
						? { href: `/notes/${targetId}`, exists: true }
						: { href: `/notes?create=${encodeURIComponent(title)}`, exists: false };
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

	$effect(() => {
		if (!contentEl) return;
		const element = contentEl;
		element.addEventListener('click', handleClick);
		return () => {
			element.removeEventListener('click', handleClick);
		};
	});
</script>

<div class="markdown-content max-w-content mx-auto" role="document" bind:this={contentEl}>
	<!-- Content is sanitized by renderMarkdown before injecting HTML. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
</div>
