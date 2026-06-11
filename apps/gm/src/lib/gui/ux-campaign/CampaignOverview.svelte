<script lang="ts">
	import {
		getCalendarTimelineForActor,
		getContentItemsForActor,
		listCharactersForActor,
		listMapsForActor,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// UX-CAMPAIGN — the Campaign world-model route shell (doc 16 §campaign architecture). Rather than a
	// parallel data store, Campaign is a CROSS-CUTTING VIEW over the existing actor-filtered models —
	// the cast (characters), locations (maps), the timeline (calendar-dated content), and lore (notes) —
	// each entity cross-linked to the surface that owns it (Characters / Atlas / Knowledge). Every list
	// is the Processing Core's actor-filtered query, so a player only ever sees the campaign entities
	// their visibility permits (a dm-only NPC, hidden map, or private note is omitted, never redacted).
	const runtime = useRuntime();

	const npcs = $derived(
		listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);
	const locations = $derived(
		listMapsForActor(runtime.state.maps, runtime.state.permissions, runtime.activeActorId),
	);
	const lore = $derived(
		getContentItemsForActor(runtime.state.content, runtime.state.permissions, runtime.activeActorId).filter(
			(item) => item.kind === 'note',
		),
	);
	const calendarId = $derived(Object.values(runtime.state.content.calendars)[0]?.id ?? null);
	const timeline = $derived(
		calendarId
			? getCalendarTimelineForActor(runtime.state.content, runtime.state.permissions, runtime.activeActorId, calendarId, 'long')
			: [],
	);
</script>

<section class="campaign" data-testid="campaign-view" aria-label="Campaign">
	<p class="campaign__lede">
		Your world at a glance — the cast, the places, the timeline, and the lore that ties it together.
		Campaign is a lens over your Knowledge, Characters, and Atlas, not a separate copy.
	</p>

	<div class="campaign__grid">
		<!-- Timeline -->
		<section class="card card--wide" data-testid="campaign-timeline" aria-labelledby="campaign-timeline-h">
			<header class="card__head">
				<h2 id="campaign-timeline-h">Timeline</h2>
				<span class="count">{timeline.length}</span>
			</header>
			{#if timeline.length === 0}
				<p class="empty" data-testid="campaign-timeline-empty">No dated events are visible to you yet. Add calendar dates to notes in Knowledge to build the timeline.</p>
			{:else}
				<ol class="entity-list">
					{#each timeline as row (row.itemId)}
						<li class="entity" data-testid={`campaign-timeline-${row.itemId}`}>
							<span class="entity__date">{row.date.display}</span>
							<a class="entity__link" href={`/knowledge/?note=${encodeURIComponent(row.itemId)}`}>{row.title}</a>
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<!-- Cast / NPCs -->
		<section class="card" data-testid="campaign-cast" aria-labelledby="campaign-cast-h">
			<header class="card__head">
				<h2 id="campaign-cast-h">Cast</h2>
				<span class="count">{npcs.length}</span>
			</header>
			{#if npcs.length === 0}
				<p class="empty" data-testid="campaign-cast-empty">No characters are visible to you.</p>
			{:else}
				<ul class="entity-list">
					{#each npcs as npc (npc.id)}
						<li class="entity" data-testid={`campaign-npc-${npc.id}`}>
							<a class="entity__link" href="/characters/">{npc.name}</a>
							<span class="entity__kind">{npc.kind}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Locations / Maps -->
		<section class="card" data-testid="campaign-locations" aria-labelledby="campaign-locations-h">
			<header class="card__head">
				<h2 id="campaign-locations-h">Locations</h2>
				<span class="count">{locations.length}</span>
			</header>
			{#if locations.length === 0}
				<p class="empty" data-testid="campaign-locations-empty">No maps are visible to you.</p>
			{:else}
				<ul class="entity-list">
					{#each locations as map (map.id)}
						<li class="entity" data-testid={`campaign-location-${map.id}`}>
							<a class="entity__link" href={`/atlas/?map=${map.id}`}>{map.name}</a>
							{#if map.description}<span class="entity__meta">{map.description}</span>{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Lore / Notes -->
		<section class="card card--wide" data-testid="campaign-lore" aria-labelledby="campaign-lore-h">
			<header class="card__head">
				<h2 id="campaign-lore-h">Lore</h2>
				<span class="count">{lore.length}</span>
			</header>
			{#if lore.length === 0}
				<p class="empty" data-testid="campaign-lore-empty">No notes are visible to you. Capture lore in Knowledge.</p>
			{:else}
				<ul class="entity-list entity-list--cols">
					{#each lore as note (note.id)}
						<li class="entity" data-testid={`campaign-lore-${note.id}`}>
							<a class="entity__link" href={`/knowledge/?note=${encodeURIComponent(note.id)}`}>{note.title}</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<p class="campaign__note" data-testid="campaign-future-note">
		Arcs, quests, and factions arrive with a future world-model schema; for now, structure them as
		linked notes in <a href="/knowledge/">Knowledge</a>.
	</p>
</section>

<style>
	.campaign {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.campaign__lede {
		margin: 0;
		color: var(--color-text-secondary);
	}
	.campaign__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		min-width: 0;
	}
	.card--wide {
		grid-column: 1 / -1;
	}
	.card__head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.card__head h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
	}
	.count {
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		color: var(--color-text-secondary);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		padding: 0 var(--space-2);
	}
	.empty {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.entity-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.entity-list--cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
	}
	.entity {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-1-5) var(--space-2);
		border-radius: var(--radius-sm);
	}
	.entity:hover {
		background: var(--color-interactive-hover);
	}
	.entity__link {
		color: var(--color-text-link);
		font-weight: var(--font-weight-medium);
		min-height: var(--touch-target-floor);
		display: inline-flex;
		align-items: center;
	}
	.entity__date {
		font-variant-numeric: tabular-nums;
		font-weight: var(--font-weight-semibold);
		color: var(--color-accent);
		min-width: 7rem;
	}
	.entity__kind,
	.entity__meta {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.campaign__note {
		margin: 0;
		padding: var(--space-3);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	@media (max-width: 860px) {
		.campaign__grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
