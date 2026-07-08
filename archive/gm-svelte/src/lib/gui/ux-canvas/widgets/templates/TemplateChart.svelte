<script lang="ts">
	/**
	 * Chart template — a simple horizontal bar chart over the widget's first data query, using each
	 * row's numeric `secondary` value (or row count fallback). Not used by a system widget today; it
	 * is available for user-authored widgets that declare `renderEntrypoint.template = 'chart'`.
	 */
	import type { WidgetDefinition, WidgetInstance } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { resolveWidgetData } from '../widget-data';

	interface Props {
		definition: WidgetDefinition;
		widget?: WidgetInstance | null;
		config: Record<string, unknown>;
	}
	const { definition, widget = null }: Props = $props();
	const runtime = useRuntime();

	const query = $derived(definition.dataQueries?.[0] ?? null);
	const data = $derived(
		query
			? resolveWidgetData(runtime, runtime.defaultActorId, query, widget?.binding)
			: { rows: [], emptyLabel: 'No data to chart.' },
	);
	const rows = $derived(data.rows);
	const bars = $derived.by(() => {
		const parsed = rows.map((row) => {
			const num = Number.parseFloat((row.secondary ?? '').replace(/[^0-9.-]/g, ''));
			return { id: row.id, label: row.primary, value: Number.isFinite(num) ? num : 1 };
		});
		const max = Math.max(1, ...parsed.map((b) => b.value));
		return parsed.map((b) => ({ ...b, pct: Math.round((b.value / max) * 100) }));
	});
</script>

<div class="tpl-chart" data-widget-template="chart">
	{#if bars.length === 0}
		<p class="tpl-empty">{data.emptyLabel}</p>
	{:else}
		<ul class="tpl-bars">
			{#each bars as bar (bar.id)}
				<li>
					<span class="tpl-bar-label">{bar.label}</span>
					<span class="tpl-bar-track"
						><span class="tpl-bar-fill" style={`width: ${bar.pct}%`}></span></span
					>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.tpl-chart {
		color: var(--widget-text, var(--color-text-primary));
	}
	.tpl-bars {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.tpl-bars li {
		display: grid;
		grid-template-columns: minmax(4rem, 30%) 1fr;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}
	.tpl-bar-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tpl-bar-track {
		height: var(--space-2);
		background: var(--color-surface-sunken, var(--color-border));
		border-radius: var(--radius-full);
		overflow: hidden;
	}
	.tpl-bar-fill {
		display: block;
		height: 100%;
		background: var(--widget-accent, var(--color-accent));
	}
	.tpl-empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
</style>
