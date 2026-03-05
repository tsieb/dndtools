<script lang="ts">
	import { tick } from 'svelte';
	import type { PageData } from './$types';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { resolveDesktopMapAssetUrl } from '$lib/platform/desktop/bridge.js';
	import {
		collectMapPlacementsForNote,
		extractMapFrontmatterPlacement,
		type MapPlacementLink,
	} from '$lib/domain/map-pois.js';
	import NoteViewer from '$lib/ui/viewer/NoteViewer.svelte';
	import PlayerCharacterSheet from '$lib/ui/player/PlayerCharacterSheet.svelte';
	import ObjectRelationshipPanel from '$lib/ui/viewer/ObjectRelationshipPanel.svelte';
	import NoteHeader from '$lib/ui/viewer/NoteHeader.svelte';
	import BacklinksPanel from '$lib/ui/viewer/BacklinksPanel.svelte';
	import RelatedNoteJumps from '$lib/ui/viewer/RelatedNoteJumps.svelte';
	import TableOfContents from '$lib/ui/viewer/TableOfContents.svelte';
	import ConfirmDialog from '$lib/ui/common/ConfirmDialog.svelte';
	import { ui } from '$lib/state/ui.svelte.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { recordPerformanceMeasurement } from '$lib/runtime/diagnostics.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';

	let { data }: { data: PageData } = $props();
	let showDeleteConfirm = $state(false);
	let quickAdd = $state('');
	let minimapImageUrl = $state<string | null>(null);
	let noteOpenMeasured = $state(false);
	let noteOpenMeasurement = $state<{
		startMark: string;
		endMark: string;
		measureName: string;
		startedAt: number;
	} | null>(null);

	let rawNote = $derived(notesState.getNoteById(data.noteId));
	let note = $derived.by(() => {
		if (!rawNote) return null;
		if (!playerModeState.enabled) return rawNote;
		return isNoteVisibleInPlayerMode(rawNote) ? rawNote : null;
	});
	let hiddenByVisibility = $derived(
		playerModeState.enabled && !!rawNote && !isNoteVisibleInPlayerMode(rawNote),
	);
	let isLocationNote = $derived.by(() => {
		if (!note) return false;
		const frontmatterType =
			typeof note.frontmatter.type === 'string' ? note.frontmatter.type.toLowerCase() : '';
		if (frontmatterType === 'location') return true;
		if (note.tags.some((tag) => tag.toLowerCase() === 'location')) return true;
		return noteToVaultObject(note)?.type === 'location';
	});
	let mapPlacements = $derived.by(() => {
		if (!note) return [] as MapPlacementLink[];
		return collectMapPlacementsForNote(mapsState.maps, String(note.id), note.frontmatter);
	});
	let frontmatterMapPlacement = $derived.by(() => {
		if (!note) return null;
		if (!isLocationNote) return null;
		const placement = extractMapFrontmatterPlacement(note.frontmatter);
		if (!placement) return null;
		const map = mapsState.mapById[placement.mapId] ?? null;
		if (!map) return null;
		return {
			...placement,
			mapName: map.name,
			filePath: map.data.filePath,
		};
	});
	let playerCharacterObject = $derived.by(() => {
		if (!playerModeState.enabled || !note || note.visibility !== 'shared') return null;
		const object = noteToVaultObject(note);
		if (!object || object.type !== 'character') return null;
		return object;
	});

	function isAbsoluteUrl(value: string): boolean {
		return /^(https?:\/\/|file:\/\/|data:|blob:)/i.test(value.trim());
	}

	function mapPlacementHref(placement: {
		mapId: string;
		poiId: string | null;
		coordinates: { x: number; y: number };
	}): string {
		const params = [`map=${encodeURIComponent(placement.mapId)}`];
		if (placement.poiId) {
			params.push(`poi=${encodeURIComponent(placement.poiId)}`);
		} else {
			params.push(`x=${encodeURIComponent(String(placement.coordinates.x))}`);
			params.push(`y=${encodeURIComponent(String(placement.coordinates.y))}`);
		}
		return `${resolve('/maps')}?${params.join('&')}`;
	}

	$effect(() => {
		if (!data.noteId) return;
		const measureId = `note-open-${Date.now()}-${data.noteId}`;
		const startMark = `dndtools:${measureId}:start`;
		noteOpenMeasurement = {
			startMark,
			endMark: `dndtools:${measureId}:end`,
			measureName: `dndtools:${measureId}:measure`,
			startedAt: performance.now(),
		};
		noteOpenMeasured = false;
		performance.mark(startMark);
	});

	$effect(() => {
		if (data.noteId) {
			notesState.setActive(data.noteId);
		}
	});

	$effect(() => {
		if (!mapsState.loaded && !mapsState.loading) {
			void mapsState.loadAll();
		}
	});

	$effect(() => {
		const placement = frontmatterMapPlacement;
		if (!placement) {
			minimapImageUrl = null;
			return;
		}
		if (isAbsoluteUrl(placement.filePath)) {
			minimapImageUrl = placement.filePath;
			return;
		}
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) {
			minimapImageUrl = null;
			return;
		}
		let stale = false;
		void resolveDesktopMapAssetUrl(placement.filePath)
			.then((resolved) => {
				if (!stale) minimapImageUrl = resolved;
			})
			.catch(() => {
				if (!stale) minimapImageUrl = null;
			});
		return () => {
			stale = true;
		};
	});

	$effect(() => {
		if (!note || noteOpenMeasured || !noteOpenMeasurement) return;
		noteOpenMeasured = true;
		const measurement = noteOpenMeasurement;
		void tick().then(() => {
			const { startMark, endMark, measureName, startedAt } = measurement;
			performance.mark(endMark);
			performance.measure(measureName, startMark, endMark);
			const measured = performance.getEntriesByName(measureName, 'measure').at(-1);
			const durationMs = Number(
				((measured?.duration ?? performance.now() - startedAt) || 0).toFixed(2),
			);
			performance.clearMarks(startMark);
			performance.clearMarks(endMark);
			performance.clearMeasures(measureName);
			void recordPerformanceMeasurement({
				operation: 'note_open',
				durationMs,
				context: {
					noteId: note.id,
					contentLength: note.content.length,
					tagCount: note.tags.length,
				},
			});
		});
	});

	async function handleDelete(): Promise<void> {
		showDeleteConfirm = false;
		const title = note?.title ?? 'Note';
		await notesState.deleteNote(data.noteId);
		toastState.success(`"${title}" moved to trash`);
		goto(resolve('/notes'));
	}

	async function handleQuickAdd(): Promise<void> {
		const text = quickAdd.trim();
		if (!note || !text) return;
		const prefix = note.content.trim().length > 0 ? '\n' : '';
		await notesState.updateNote(note.id, {
			content: `${note.content}${prefix}- ${text}`,
		});
		quickAdd = '';
		toastState.success('Added to note');
	}
</script>

{#if note}
	<div class="p-6">
		<div class="mx-auto mb-3 flex max-w-content justify-end">
			<button
				type="button"
				class="rounded-md px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
				onclick={() => void ui.setFocusReading(!ui.focusReading)}
				aria-pressed={ui.focusReading}
			>
				{ui.focusReading ? 'Exit Focus Reading' : 'Focus Reading'}
			</button>
		</div>
		<NoteHeader
			{note}
			{mapPlacements}
			readonly={playerModeState.enabled}
			onedit={() => goto(resolve(`/notes/${data.noteId}/edit`))}
			ondelete={() => (showDeleteConfirm = true)}
		/>
		{#if frontmatterMapPlacement}
			<div
				class="max-w-content mx-auto mb-4 rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
			>
				<div class="mb-2 flex items-center justify-between gap-2">
					<p class="text-xs font-semibold text-ink dark:text-tavern-text">Map Minimap</p>
					<a
						href={mapPlacementHref(frontmatterMapPlacement)}
						class="text-xs text-accent underline underline-offset-2 hover:text-accent-hover dark:text-tavern-accent dark:hover:text-tavern-accent-hover"
					>
						Open {frontmatterMapPlacement.mapName}
					</a>
				</div>
				{#if minimapImageUrl}
					<div
						class="relative h-40 overflow-hidden rounded border border-border dark:border-tavern-border"
					>
						<img
							src={minimapImageUrl}
							alt={`${frontmatterMapPlacement.mapName} minimap`}
							class="h-full w-full object-cover"
						/>
						<div
							class="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-accent shadow"
							style={`left:${frontmatterMapPlacement.coordinates.x * 100}%;top:${frontmatterMapPlacement.coordinates.y * 100}%;`}
						></div>
					</div>
				{:else}
					<p class="text-xs text-ink-muted dark:text-tavern-muted">
						Minimap preview unavailable in this runtime.
					</p>
				{/if}
			</div>
		{/if}
		<TableOfContents content={note.content} />
		{#if !playerModeState.enabled}
			<div
				class="max-w-content mx-auto mb-4 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-3"
			>
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={quickAdd}
						placeholder="Quick add to this note..."
						class="flex-1 bg-transparent text-sm text-ink dark:text-tavern-text placeholder:text-ink-faint dark:placeholder:text-tavern-faint outline-none"
						onkeydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								void handleQuickAdd();
							}
						}}
					/>
					<button
						class="px-2.5 py-1.5 text-xs rounded-md bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent hover:bg-accent/20 dark:hover:bg-tavern-accent/20"
						onclick={handleQuickAdd}
					>
						Add
					</button>
				</div>
			</div>
		{/if}
		{#if playerCharacterObject}
			<PlayerCharacterSheet object={playerCharacterObject} />
		{:else}
			<NoteViewer {note} />
		{/if}
		{#if !playerModeState.enabled}
			<ObjectRelationshipPanel {note} />
		{/if}
		<RelatedNoteJumps noteId={data.noteId} />
		<BacklinksPanel noteId={data.noteId} />
	</div>

	{#if !playerModeState.enabled}
		<ConfirmDialog
			open={showDeleteConfirm}
			title="Delete Note"
			message={'Are you sure you want to delete "' + note.title + '"? It will be moved to trash.'}
			onconfirm={handleDelete}
			oncancel={() => (showDeleteConfirm = false)}
		/>
	{/if}
{:else if hiddenByVisibility}
	<div class="flex items-center justify-center h-full">
		<div class="text-center py-16">
			<p class="text-lg text-ink-muted dark:text-tavern-muted mb-2">
				This note is not visible in player mode.
			</p>
			<a
				href={resolve('/player')}
				class="text-accent dark:text-tavern-accent hover:text-accent-hover dark:hover:text-tavern-accent-hover text-sm"
			>
				Back to player view
			</a>
		</div>
	</div>
{:else}
	<div class="flex items-center justify-center h-full">
		<div class="text-center py-16">
			<p class="text-lg text-ink-muted dark:text-tavern-muted mb-2">Note not found</p>
			<a
				href={resolve('/notes')}
				class="text-accent dark:text-tavern-accent hover:text-accent-hover dark:hover:text-tavern-accent-hover text-sm"
			>
				Back to notes
			</a>
		</div>
	</div>
{/if}
