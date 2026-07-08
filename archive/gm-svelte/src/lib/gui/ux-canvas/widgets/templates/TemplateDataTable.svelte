<script lang="ts">
	/**
	 * Generic data-table template. Renders the widget's first data query as a filterable, sortable
	 * table of navigable rows. Adaptive visuals come from the `--widget-*` CSS variables WidgetView
	 * applies; all data is an actor-filtered core query (no GUI visibility decisions).
	 */
	import type { WidgetDefinition, WidgetInstance } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { resolveWidgetData, type WidgetDataRow } from '../widget-data';

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

	let filter = $state('');
	let sortDir = $state<1 | -1>(1);

	const data = $derived(
		query
			? resolveWidgetData(runtime, runtime.defaultActorId, query, widget?.binding)
			: { rows: [] as WidgetDataRow[], emptyLabel: 'Nothing here yet.' },
	);
	const allRows = $derived(data.rows);
	const rows = $derived.by<WidgetDataRow[]>(() => {
		const needle = filter.trim().toLowerCase();
		const filtered = allRows.filter(
			(row) => needle === '' || row.primary.toLowerCase().includes(needle),
		);
		filtered.sort((a, b) => a.primary.localeCompare(b.primary) * sortDir);
		return filtered.slice(0, limit);
	});
	// Distinguish "no data yet" (use the resolver's context-specific empty label) from
	// "filter matched nothing" (a filter-specific hint that keeps the existing data visible intent).
	const emptyMessage = $derived(
		allRows.length === 0 ? data.emptyLabel : 'No rows match your filter.',
	);
</script>

<div class="tpl-data-table" data-widget-template="data-table">
	<label class="tpl-filter">
		<span class="visually-hidden">Filter {definition.displayName}</span>
		<input
			type="search"
			placeholder="Filter…"
			autocomplete="off"
			data-testid="widget-table-filter"
			bind:value={filter}
		/>
	</label>
	<table class="tpl-table">
		<thead>
			<tr>
				<th scope="col" aria-sort={sortDir === 1 ? 'ascending' : 'descending'}>
					<button
						type="button"
						class="tpl-sort"
						aria-label={`Sort by name, ${sortDir === 1 ? 'descending' : 'ascending'}`}
						onclick={() => (sortDir = sortDir === 1 ? -1 : 1)}
					>
						Name {sortDir === 1 ? '▲' : '▼'}
					</button>
				</th>
				<th scope="col">Detail</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.id)}
				<tr>
					<td>
						{#if row.href}
							<a href={row.href} data-testid={`widget-row-${row.id}`}>{row.primary}</a>
						{:else}
							<span data-testid={`widget-row-${row.id}`}>{row.primary}</span>
						{/if}
					</td>
					<td class="tpl-dim">{row.secondary ?? row.meta ?? ''}</td>
				</tr>
			{/each}
			{#if rows.length === 0}
				<tr><td colspan="2" class="tpl-empty">{emptyMessage}</td></tr>
			{/if}
		</tbody>
	</table>
</div>

<style>
	.tpl-data-table {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-height: 0;
		color: var(--widget-text, var(--color-text-primary));
	}
	.tpl-filter input {
		width: 100%;
		box-sizing: border-box;
		min-height: var(--touch-target-min);
		padding: 0 var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-primary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.tpl-table {
		width: 100%;
		table-layout: fixed;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	.tpl-table th {
		text-align: left;
		padding: var(--space-0-5) var(--space-1);
		color: var(--color-text-secondary);
		border-bottom: 1px solid var(--widget-border, var(--color-border));
	}
	/* Cells must truncate, never force horizontal scroll on a narrow/mobile widget. */
	.tpl-table td {
		padding: var(--space-1);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border-bottom: 1px solid var(--widget-border, var(--color-border));
	}
	.tpl-sort {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		padding: 0;
		font: inherit;
		color: inherit;
		background: none;
		border: none;
		cursor: pointer;
	}
	.tpl-table a {
		display: block;
		max-width: 100%;
		min-height: var(--touch-target-min);
		line-height: var(--touch-target-min);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--widget-accent, var(--color-text-link));
		text-decoration: none;
	}
	.tpl-table a:hover {
		text-decoration: underline;
	}
	.tpl-dim {
		color: var(--color-text-secondary);
	}
	.tpl-empty {
		color: var(--color-text-secondary);
	}
</style>
