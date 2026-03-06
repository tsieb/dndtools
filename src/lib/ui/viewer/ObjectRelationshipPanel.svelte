<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import type { Note } from '$lib/types/note.js';
	import type { ObjectGraphEdge, VaultObject } from '$lib/types/object.js';

	interface Props {
		note: Note;
	}

	type RelationshipRow = {
		id: string;
		direction: 'outbound' | 'inbound';
		label: string;
		targetId?: string;
		targetName?: string;
		sessionId?: string;
		unresolved: boolean;
	};

	let { note }: Props = $props();
	const object = $derived(noteToVaultObject(note));
	let loading = $state(false);
	let error = $state<string | null>(null);
	let rows = $state<RelationshipRow[]>([]);

	function relationshipLabel(edge: ObjectGraphEdge): string {
		return edge.type === 'custom' ? (edge.label ?? 'custom') : edge.type;
	}

	function buildRows(
		edges: ObjectGraphEdge[],
		objects: VaultObject[],
		currentId: string,
	): RelationshipRow[] {
		const names = new Map(objects.map((entry) => [String(entry.id), entry.name]));
		const rows: RelationshipRow[] = [];
		for (const [index, edge] of edges.entries()) {
			const fromId = String(edge.fromId);
			const toId = edge.toId ? String(edge.toId) : undefined;
			if (fromId !== currentId && toId !== currentId) continue;

			if (fromId === currentId) {
				rows.push({
					id: `${fromId}:${relationshipLabel(edge)}:${toId ?? edge.sessionId ?? index}:out`,
					direction: 'outbound',
					label: relationshipLabel(edge),
					targetId: toId,
					targetName: toId ? names.get(toId) : undefined,
					sessionId: edge.sessionId,
					unresolved: edge.unresolved,
				});
				continue;
			}

			rows.push({
				id: `${fromId}:${relationshipLabel(edge)}:${toId ?? edge.sessionId ?? index}:in`,
				direction: 'inbound',
				label: relationshipLabel(edge),
				targetId: fromId,
				targetName: names.get(fromId),
				sessionId: undefined,
				unresolved: edge.unresolved,
			});
		}
		rows.sort((a, b) => {
			if (a.unresolved !== b.unresolved) return a.unresolved ? -1 : 1;
			return `${a.direction}:${a.targetName ?? a.sessionId ?? a.targetId ?? ''}`.localeCompare(
				`${b.direction}:${b.targetName ?? b.sessionId ?? b.targetId ?? ''}`,
			);
		});
		return rows;
	}

	$effect(() => {
		if (!object) {
			rows = [];
			error = null;
			return;
		}

		loading = true;
		error = null;
		const currentId = String(object.id);
		void Promise.all([getStorage().getObjectRelationshipGraph(), getStorage().getAllObjects()])
			.then(([graph, objects]) => {
				rows = buildRows(graph.edges, objects, currentId);
			})
			.catch((err) => {
				error = String(err);
				rows = [];
			})
			.finally(() => {
				loading = false;
			});
	});
</script>

{#if object}
	<section
		class="max-w-content mx-auto mb-4 rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
	>
		<h2
			class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
		>
			Relationship Graph
		</h2>
		{#if loading}
			<p class="mt-2 text-xs text-ink-muted dark:text-tavern-muted">
				Loading relationship graph...
			</p>
		{:else if error}
			<p class="mt-2 text-xs text-error dark:text-tavern-error">{error}</p>
		{:else if rows.length === 0}
			<p class="mt-2 text-xs text-ink-muted dark:text-tavern-muted">
				No relationship edges for this object.
			</p>
		{:else}
			<ul class="mt-2 space-y-1 text-xs text-ink dark:text-tavern-text">
				{#each rows as row (row.id)}
					<li class="flex items-center gap-2">
						<span
							class="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] uppercase tracking-wide dark:bg-tavern-surface-alt"
						>
							{row.direction}
						</span>
						<span class="font-semibold">{row.label}</span>
						{#if row.sessionId}
							<span class="text-ink-muted dark:text-tavern-muted">session:{row.sessionId}</span>
						{:else if row.targetId}
							<button
								type="button"
								class="rounded bg-surface-alt px-2 py-0.5 text-left text-[11px] hover:bg-surface dark:bg-tavern-surface-alt dark:hover:bg-tavern-surface"
								onclick={() => row.targetId && goto(resolve(`/knowledge/notes/${row.targetId}`))}
							>
								{row.targetName ?? row.targetId}
							</button>
						{/if}
						{#if row.unresolved}
							<span class="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning"
								>missing</span
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}
