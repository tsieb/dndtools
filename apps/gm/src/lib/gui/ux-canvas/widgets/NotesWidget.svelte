<script lang="ts">
	/**
	 * Notes shortcut tile (Command Center redesign §2): the most recently touched notes, each a
	 * direct link into Knowledge. Actor-filtered core query — a hidden DM-only note is absent for
	 * any other viewer (no GUI-side filtering).
	 */
	import { getContentItemsForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	interface Props {
		config: Record<string, unknown>;
	}

	const { config }: Props = $props();
	const runtime = useRuntime();

	const count = $derived.by(() => {
		const parsed = Number.parseInt(String(config.count ?? '5'), 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
	});

	const recent = $derived(
		getContentItemsForActor(runtime.state.content, runtime.state.permissions, runtime.defaultActorId)
			.slice()
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, count),
	);
</script>

<div class="notes-tile">
	{#if recent.length === 0}
		<p class="notes-empty">No notes yet — capture your first one in Knowledge.</p>
	{:else}
		<ul class="notes-list" data-testid="notes-widget-list">
			{#each recent as note (note.id)}
				<li>
					<a href="/knowledge/" data-testid={`notes-widget-item-${note.id}`}>
						<span class="notes-title">{note.title}</span>
						<span class="notes-kind">{note.kind}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
	<a class="notes-launch" href="/knowledge/" data-testid="notes-widget-launch">Open Knowledge →</a>
</div>

<style>
	.notes-tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		height: 100%;
	}
	.notes-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}
	.notes-list a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: var(--touch-target-min);
		padding: var(--space-0-5) var(--space-1);
		color: var(--color-text-primary);
		text-decoration: none;
		border-radius: var(--radius-sm);
	}
	.notes-list a:hover {
		background: var(--color-interactive-hover);
	}
	.notes-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-sm);
	}
	.notes-kind {
		flex: 0 0 auto;
		font-size: var(--text-2xs);
		color: var(--color-text-secondary);
	}
	.notes-empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.notes-launch {
		margin-top: auto;
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		font-size: var(--text-sm);
		color: var(--color-text-link);
		text-decoration: none;
	}
	.notes-launch:hover {
		text-decoration: underline;
	}
</style>
