<script lang="ts">
	/**
	 * Generic status-list template. Renders the widget's first data query as a list of status rows,
	 * highlighting an active row and showing an optional summary header (e.g. the initiative tracker's
	 * round/turn). Used by `prep` (notes checklist) and `initiative-tracker` (combatant order).
	 */
	import type { WidgetDefinition, WidgetInstance } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { resolveWidgetData } from '../widget-data';

	interface Props {
		definition: WidgetDefinition;
		widget?: WidgetInstance | null;
		config: Record<string, unknown>;
	}
	const { definition, widget = null, config }: Props = $props();
	const runtime = useRuntime();

	const query = $derived(definition.dataQueries?.[0] ?? null);
	const limit = $derived.by(() => {
		const n = Number.parseInt(String(config.count ?? ''), 10);
		return Number.isFinite(n) && n > 0 ? n : Infinity;
	});
	const data = $derived(
		query
			? resolveWidgetData(runtime, runtime.defaultActorId, query, widget?.binding)
			: { rows: [], emptyLabel: 'Nothing here yet.', header: undefined },
	);
	const rows = $derived(data.rows.slice(0, limit));
</script>

<div class="tpl-status-list" data-widget-template="status-list">
	{#if data.header}
		<p class="tpl-header" data-testid="widget-list-header">{data.header}</p>
	{/if}
	{#if rows.length === 0}
		<p class="tpl-empty">{data.emptyLabel}</p>
	{:else}
		<ul class="tpl-list" data-testid="widget-status-list">
			{#each rows as row (row.id)}
				<li class:active={row.active} data-testid={`widget-status-${row.id}`}>
					{#if row.href}
						<a href={row.href}>
							<span class="tpl-primary">{row.primary}</span>
							{#if row.secondary}<span class="tpl-secondary">{row.secondary}</span>{/if}
						</a>
					{:else}
						<span class="tpl-primary">{row.primary}</span>
						{#if row.secondary}<span class="tpl-secondary">{row.secondary}</span>{/if}
					{/if}
					{#if row.active}<span class="tpl-badge" role="img" aria-label="Active">●</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.tpl-status-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-height: 0;
		color: var(--widget-text, var(--color-text-primary));
	}
	.tpl-header {
		margin: 0 0 var(--space-1);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.tpl-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}
	.tpl-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: var(--touch-target-min);
		padding: var(--space-0-5) var(--space-1);
		border-bottom: 1px solid var(--widget-border, var(--color-border));
		font-size: var(--text-sm);
	}
	.tpl-list li.active {
		background: color-mix(in srgb, var(--widget-accent, var(--color-accent)) 16%, transparent);
		border-radius: var(--radius-sm);
	}
	.tpl-list a {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex: 1 1 auto;
		color: inherit;
		text-decoration: none;
	}
	.tpl-list a:hover .tpl-primary {
		text-decoration: underline;
	}
	.tpl-secondary {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.tpl-badge {
		color: var(--widget-accent, var(--color-accent));
		font-size: var(--text-xs);
	}
	.tpl-empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
</style>
