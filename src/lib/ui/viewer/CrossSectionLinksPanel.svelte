<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteSet } from 'svelte/reactivity';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import type { Note } from '$lib/types/note.js';
	import type { MapPlacementLink } from '$lib/domain/map-pois.js';

	interface Props {
		note: Note;
		mapPlacements?: readonly MapPlacementLink[];
	}

	interface CrossLink {
		id: string;
		label: string;
		href: string;
		details: string;
	}

	const ENTITY_TAGS = new Set([
		'npc',
		'character',
		'faction',
		'quest',
		'item',
		'location',
		'encounter',
		'timeline_event',
	]);

	let { note, mapPlacements = [] }: Props = $props();

	const noteObject = $derived(noteToVaultObject(note));

	const mapObjectIds = $derived.by(() => {
		const ids = new SvelteSet<string>();
		for (const candidate of notesState.activeNotes) {
			const object = noteToVaultObject(candidate);
			if (!object || object.type !== 'map') continue;
			ids.add(String(object.id));
		}
		return ids;
	});

	const links = $derived.by<CrossLink[]>(() => {
		const crossLinks: CrossLink[] = [];
		const seen = new SvelteSet<string>();
		const noteTags = note.tags.map((tag) => tag.trim().toLowerCase());
		const entityByTag = noteTags.some((tag) => ENTITY_TAGS.has(tag));
		const entityByObject =
			noteObject !== null &&
			noteObject.type !== 'map' &&
			noteObject.type !== 'image' &&
			noteObject.type !== 'handout';
		if (entityByTag || entityByObject) {
			crossLinks.push({
				id: 'campaign-entity',
				label: 'View entity',
				href: resolve('/campaign/timeline'),
				details: 'Open this entity context in the Campaign section.',
			});
			seen.add('campaign-entity');
		}

		const placement = mapPlacements[0];
		if (placement && !seen.has(`atlas:${placement.mapId}`)) {
			const params = [`map=${encodeURIComponent(placement.mapId)}`];
			if (placement.poiId) {
				params.push(`poi=${encodeURIComponent(placement.poiId)}`);
			}
			crossLinks.push({
				id: `atlas:${placement.mapId}`,
				label: 'View on Atlas',
				href: `${resolve('/atlas/maps')}?${params.join('&')}`,
				details: placement.poiLabel
					? `Open ${placement.mapName} at ${placement.poiLabel}.`
					: `Open ${placement.mapName}.`,
			});
			seen.add(`atlas:${placement.mapId}`);
		}

		if (noteObject) {
			for (const relationship of noteObject.relationships) {
				const targetId = relationship.targetId ? String(relationship.targetId) : '';
				if (!targetId) continue;
				if (!mapObjectIds.has(targetId)) continue;
				const key = `atlas:${targetId}`;
				if (seen.has(key)) continue;
				crossLinks.push({
					id: key,
					label: 'View on Atlas',
					href: `${resolve('/atlas/maps')}?map=${encodeURIComponent(targetId)}`,
					details: 'Open the linked map in Atlas.',
				});
				seen.add(key);
			}
		}

		const activeBoard = sessionBoardsState.activeBoard;
		if (
			activeBoard &&
			activeBoard.tiles.some(
				(tile) => (tile.type ?? 'note') === 'note' && String(tile.noteId ?? '') === String(note.id),
			)
		) {
			crossLinks.push({
				id: 'session-board',
				label: 'View in Session',
				href: resolve('/session/boards'),
				details: `Open ${activeBoard.name} in the Session section.`,
			});
		}

		return crossLinks;
	});
</script>

{#if links.length > 0}
	<section class="rounded-lg border border-border bg-surface p-3">
		<h2 class="text-sm font-semibold text-ink">Cross-section links</h2>
		<ul class="mt-2 space-y-2">
			{#each links as link (link.id)}
				<li class="rounded border border-border/70 bg-surface-alt/60 px-2 py-1.5">
					<a
						href={link.href}
						class="text-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
					>
						{link.label}
					</a>
					<p class="mt-0.5 text-xs text-ink-muted">{link.details}</p>
				</li>
			{/each}
		</ul>
	</section>
{/if}
