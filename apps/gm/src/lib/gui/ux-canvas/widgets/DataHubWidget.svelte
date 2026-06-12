<script lang="ts">
	/**
	 * Data Hub widget (Command Center redesign §2): the tabbed Scenes / Parties / Campaign data
	 * tables — sortable, filterable, inline. Every list is the Processing Core's actor-filtered
	 * query (no GUI-side visibility decisions), so hidden DM entities are simply absent for a
	 * non-DM viewer. Rows are real links: a click opens the owning surface.
	 *
	 * Edit-mode configuration (via the Properties Panel, §5): `tabOrder` reorders the tab strip,
	 * `showUpdated` / `showVisibility` toggle the optional columns.
	 */
	import {
		getContentItemsForActor,
		getPartyOverviewForActor,
		listScenesForActor,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	interface Props {
		config: Record<string, unknown>;
	}

	const { config }: Props = $props();
	const runtime = useRuntime();

	type HubTab = 'scenes' | 'parties' | 'campaign';
	const TAB_LABELS: Record<HubTab, string> = {
		scenes: 'Scenes',
		parties: 'Parties',
		campaign: 'Campaign',
	};

	const tabOrder = $derived.by<HubTab[]>(() => {
		switch (config.tabOrder) {
			case 'parties-first':
				return ['parties', 'campaign', 'scenes'];
			case 'campaign-first':
				return ['campaign', 'scenes', 'parties'];
			default:
				return ['scenes', 'parties', 'campaign'];
		}
	});
	const showUpdated = $derived(config.showUpdated !== false);
	const showVisibility = $derived(config.showVisibility !== false);

	let activeTab = $state<HubTab | null>(null);
	const currentTab = $derived<HubTab>(activeTab ?? tabOrder[0] ?? 'scenes');

	let filter = $state('');
	let sortKey = $state<'name' | 'updated'>('name');
	let sortDir = $state<1 | -1>(1);

	function toggleSort(key: 'name' | 'updated') {
		if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1;
		else {
			sortKey = key;
			sortDir = 1;
		}
	}

	interface HubRow {
		id: string;
		name: string;
		href: string;
		updated: string;
		visibility: string;
	}

	function matches(row: HubRow): boolean {
		const needle = filter.trim().toLowerCase();
		return needle === '' || row.name.toLowerCase().includes(needle);
	}

	function sortRows(rows: HubRow[]): HubRow[] {
		return [...rows].sort((a, b) => {
			const cmp =
				sortKey === 'name' ? a.name.localeCompare(b.name) : a.updated.localeCompare(b.updated);
			return cmp * sortDir;
		});
	}

	const sceneRows = $derived<HubRow[]>(
		listScenesForActor(runtime.state.scenes, runtime.state.permissions, runtime.defaultActorId).map(
			(scene) => ({
				id: scene.id,
				name: scene.name,
				href: `/scene/${scene.id}/`,
				updated: scene.updatedAt,
				visibility: scene.visibility,
			}),
		),
	);

	const partyRows = $derived<HubRow[]>(
		getPartyOverviewForActor(
			runtime.state.characters,
			runtime.state.permissions,
			runtime.defaultActorId,
		).members.map((member) => ({
			id: member.characterId,
			name: member.name,
			href: '/characters/',
			updated: `HP ${member.hp}/${member.maxHp} · AC ${member.ac}`,
			visibility: member.visibility,
		})),
	);

	// "Campaign" = the calendar-aware content items (dated lore/events), most recently touched first.
	const campaignRows = $derived<HubRow[]>(
		getContentItemsForActor(runtime.state.content, runtime.state.permissions, runtime.defaultActorId)
			.filter((item) => item.timelineRefs.length > 0 || Object.keys(item.dateFields).length > 0)
			.map((item) => ({
				id: item.id,
				name: item.title,
				href: '/campaign/',
				updated: item.updatedAt,
				visibility: item.visibility,
			})),
	);

	const rows = $derived.by(() => {
		const source =
			currentTab === 'scenes' ? sceneRows : currentTab === 'parties' ? partyRows : campaignRows;
		return sortRows(source.filter(matches));
	});
</script>

<div class="data-hub">
	<div class="hub-controls">
		<div class="hub-tabs" role="tablist" aria-label="Data Hub collections">
			{#each tabOrder as tab (tab)}
				<button
					type="button"
					role="tab"
					aria-selected={currentTab === tab}
					class:selected={currentTab === tab}
					data-testid={`data-hub-tab-${tab}`}
					onclick={() => (activeTab = tab)}
				>
					{TAB_LABELS[tab]}
				</button>
			{/each}
		</div>
		<label class="hub-filter">
			<span class="visually-hidden">Filter {TAB_LABELS[currentTab]}</span>
			<input
				type="search"
				placeholder="Filter…"
				autocomplete="off"
				data-testid="data-hub-filter"
				bind:value={filter}
			/>
		</label>
	</div>

	<table class="hub-table" data-testid={`data-hub-table-${currentTab}`}>
		<thead>
			<tr>
				<th scope="col">
					<button
						type="button"
						class="hub-sort"
						aria-label={`Sort by name, ${sortKey === 'name' && sortDir === 1 ? 'descending' : 'ascending'}`}
						onclick={() => toggleSort('name')}
					>
						Name {sortKey === 'name' ? (sortDir === 1 ? '▲' : '▼') : ''}
					</button>
				</th>
				{#if showUpdated}
					<th scope="col">
						<button
							type="button"
							class="hub-sort"
							aria-label={`Sort by updated, ${sortKey === 'updated' && sortDir === 1 ? 'descending' : 'ascending'}`}
							onclick={() => toggleSort('updated')}
						>
							{currentTab === 'parties' ? 'Vitals' : 'Updated'}
							{sortKey === 'updated' ? (sortDir === 1 ? '▲' : '▼') : ''}
						</button>
					</th>
				{/if}
				{#if showVisibility}
					<th scope="col">Visibility</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.id)}
				<tr>
					<td><a href={row.href} data-testid={`data-hub-row-${row.id}`}>{row.name}</a></td>
					{#if showUpdated}
						<td class="hub-dim">{row.updated}</td>
					{/if}
					{#if showVisibility}
						<td class="hub-dim">{row.visibility}</td>
					{/if}
				</tr>
			{/each}
			{#if rows.length === 0}
				<tr>
					<td colspan={1 + (showUpdated ? 1 : 0) + (showVisibility ? 1 : 0)} class="hub-empty">
						{filter.trim() === '' ? 'Nothing here yet.' : `No matches for “${filter.trim()}”.`}
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>

<style>
	.data-hub {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-height: 0;
	}
	.hub-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.hub-tabs {
		display: inline-flex;
		gap: var(--space-1);
	}
	.hub-tabs button {
		min-height: var(--touch-target-min);
		padding: var(--space-0-5) var(--space-2);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		cursor: pointer;
	}
	.hub-tabs button.selected {
		color: var(--color-text-primary);
		background: var(--color-interactive-selected);
		border-color: var(--color-accent);
	}
	.hub-filter input {
		width: 9rem;
		min-height: var(--touch-target-min);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		color: var(--color-text-primary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.hub-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-xs);
	}
	.hub-table th {
		text-align: left;
		padding: var(--space-0-5) var(--space-1);
		color: var(--color-text-secondary);
		border-bottom: 1px solid var(--color-border);
	}
	.hub-sort {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		min-width: var(--touch-target-min);
		padding: 0;
		font: inherit;
		color: inherit;
		background: none;
		border: none;
		cursor: pointer;
	}
	.hub-table td {
		padding: var(--space-1);
		border-bottom: 1px solid var(--color-border);
	}
	.hub-table a {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		color: var(--color-text-link);
		text-decoration: none;
	}
	.hub-table a:hover {
		text-decoration: underline;
	}
	.hub-dim {
		color: var(--color-text-secondary);
	}
	.hub-empty {
		color: var(--color-text-secondary);
	}
</style>
