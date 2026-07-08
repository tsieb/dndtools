<script lang="ts">
	import {
		getCalendarTimelineForActor,
		getContentItemsForActor,
		listCharactersForActor,
		listMapsForActor,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import Icon from '$lib/gui/Icon.svelte';

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
	<header class="campaign__head">
		<p class="campaign__eyebrow">World model · a lens, not a copy</p>
		<p class="campaign__lede">
			Your world at a glance — the cast, the places, the timeline, and the lore that ties it together.
			Campaign is a lens over your Knowledge, Characters, and Atlas, not a separate copy.
		</p>
	</header>

	<div class="campaign__grid">
		<!-- Timeline — the focal accent spine of the campaign -->
		<section class="card card--wide card--hero" data-testid="campaign-timeline" aria-labelledby="campaign-timeline-h">
			<header class="card__head">
				<div class="card__heading">
					<span class="card__icon" aria-hidden="true"><Icon name="recent" size="sm" /></span>
					<h2 id="campaign-timeline-h">Timeline</h2>
				</div>
				<span class="count">{timeline.length}</span>
			</header>
			{#if timeline.length === 0}
				<p class="empty" data-testid="campaign-timeline-empty">No dated events are visible to you yet. Add calendar dates to notes in Knowledge to build the timeline.</p>
			{:else}
				<ol class="tl">
					{#each timeline as row (row.itemId)}
						<li class="tl__row" data-testid={`campaign-timeline-${row.itemId}`}>
							<span class="tl__rail" aria-hidden="true"><span class="tl__dot"></span></span>
							<div class="tl__body">
								<span class="tl__date">{row.date.display}</span>
								<a class="tl__link" href={`/knowledge/?note=${encodeURIComponent(row.itemId)}`}>{row.title}</a>
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<!-- Cast / NPCs — cross-links into Characters -->
		<section class="card" data-testid="campaign-cast" aria-labelledby="campaign-cast-h">
			<header class="card__head">
				<div class="card__heading">
					<span class="card__icon" aria-hidden="true"><Icon name="characters-person" size="sm" /></span>
					<h2 id="campaign-cast-h">Cast</h2>
				</div>
				<span class="count">{npcs.length}</span>
			</header>
			{#if npcs.length === 0}
				<p class="empty" data-testid="campaign-cast-empty">No characters are visible to you.</p>
			{:else}
				<ul class="entity-list">
					{#each npcs as npc (npc.id)}
						<li class="entity" data-testid={`campaign-npc-${npc.id}`}>
							<span class="entity__icon" aria-hidden="true"><Icon name="characters-person" size="sm" /></span>
							<span class="entity__main">
								<a class="entity__link" href="/characters/">{npc.name}</a>
								<span class="entity__section">Characters · {npc.kind}</span>
							</span>
							<span class="entity__chev" aria-hidden="true"><Icon name="chevron-right" size="sm" /></span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Locations / Maps — cross-links into Atlas -->
		<section class="card" data-testid="campaign-locations" aria-labelledby="campaign-locations-h">
			<header class="card__head">
				<div class="card__heading">
					<span class="card__icon" aria-hidden="true"><Icon name="atlas-map" size="sm" /></span>
					<h2 id="campaign-locations-h">Locations</h2>
				</div>
				<span class="count">{locations.length}</span>
			</header>
			{#if locations.length === 0}
				<p class="empty" data-testid="campaign-locations-empty">No maps are visible to you.</p>
			{:else}
				<ul class="entity-list">
					{#each locations as map (map.id)}
						<li class="entity" data-testid={`campaign-location-${map.id}`}>
							<span class="entity__icon" aria-hidden="true"><Icon name="atlas-map" size="sm" /></span>
							<span class="entity__main">
								<a class="entity__link" href={`/atlas/?map=${map.id}`}>{map.name}</a>
								<span class="entity__section">Atlas{#if map.description} · {map.description}{/if}</span>
							</span>
							<span class="entity__chev" aria-hidden="true"><Icon name="chevron-right" size="sm" /></span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Lore / Notes — cross-links into Knowledge -->
		<section class="card card--wide" data-testid="campaign-lore" aria-labelledby="campaign-lore-h">
			<header class="card__head">
				<div class="card__heading">
					<span class="card__icon" aria-hidden="true"><Icon name="knowledge-book" size="sm" /></span>
					<h2 id="campaign-lore-h">Lore</h2>
				</div>
				<span class="count">{lore.length}</span>
			</header>
			{#if lore.length === 0}
				<p class="empty" data-testid="campaign-lore-empty">No notes are visible to you. Capture lore in Knowledge.</p>
			{:else}
				<ul class="entity-list entity-list--cols">
					{#each lore as note (note.id)}
						<li class="entity" data-testid={`campaign-lore-${note.id}`}>
							<span class="entity__icon" aria-hidden="true"><Icon name="knowledge-book" size="sm" /></span>
							<span class="entity__main">
								<a class="entity__link" href={`/knowledge/?note=${encodeURIComponent(note.id)}`}>{note.title}</a>
								<span class="entity__section">Knowledge</span>
							</span>
							<span class="entity__chev" aria-hidden="true"><Icon name="chevron-right" size="sm" /></span>
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
		gap: var(--space-5);
	}
	.campaign__head {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.campaign__eyebrow {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-wider);
		text-transform: uppercase;
		/* On the flat page bg — secondary, never tertiary (parchment axe gate, A11Y rule 1). */
		color: var(--color-text-secondary);
	}
	.campaign__lede {
		margin: 0;
		max-width: 72ch;
		color: var(--color-text-secondary);
		line-height: var(--leading-relaxed);
	}

	.campaign__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
	}

	/* Secondary card recipe (canonical). */
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		padding: var(--space-5);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.card--wide {
		grid-column: 1 / -1;
	}
	/* Primary / hero card recipe — the single focal accent surface (the campaign spine). */
	.card--hero {
		background: var(--color-accent-subtle);
		border-color: var(--color-accent-border);
		box-shadow: var(--shadow-md);
	}

	.card__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.card__heading {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.card__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--radius-sm);
		background: var(--color-accent-subtle);
		border: 1px solid var(--color-accent-border);
		color: var(--color-accent);
	}
	/* On the accent hero surface, lift the chip onto a raised fill so it still reads. */
	.card--hero .card__icon {
		background: var(--color-surface-raised);
	}
	.card__head h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-lg);
		color: var(--color-text-primary);
	}
	.count {
		flex: 0 0 auto;
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		font-variant-numeric: tabular-nums;
		color: var(--color-text-secondary);
		background: var(--color-surface-overlay);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-full);
		padding: var(--space-0-5) var(--space-2);
		line-height: 1.4;
	}
	.empty {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		line-height: var(--leading-body);
	}

	/* --- Timeline spine: dot + connector rail, date over a title cross-link --- */
	.tl {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.tl__row {
		display: flex;
		gap: var(--space-3);
		min-width: 0;
	}
	.tl__rail {
		position: relative;
		flex: 0 0 auto;
		display: flex;
		justify-content: center;
		width: 0.75rem;
	}
	.tl__dot {
		position: relative;
		z-index: 1;
		width: 0.625rem;
		height: 0.625rem;
		margin-top: 0.25rem;
		border-radius: var(--radius-full);
		background: var(--color-surface-raised);
		border: 2px solid var(--color-accent-border);
	}
	.tl__row:first-child .tl__dot {
		background: var(--color-accent);
		border-color: var(--color-accent);
	}
	/* The connector line links each dot to the next (extends into the row gap). */
	.tl__row:not(:last-child) .tl__rail::before {
		content: '';
		position: absolute;
		left: 50%;
		top: 0.5rem;
		bottom: calc(-1 * var(--space-3));
		width: 2px;
		transform: translateX(-50%);
		background: var(--color-accent-border);
	}
	.tl__body {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
		min-width: 0;
		padding-bottom: var(--space-1);
	}
	.tl__date {
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		font-variant-numeric: tabular-nums;
		color: var(--color-text-secondary);
	}
	.tl__link {
		color: var(--color-text-link);
		font-weight: var(--font-weight-medium);
		/* WCAG 2.5.8 target-size floor (a11y-target-size gate) — on a link, not a button, so
		   rule #2's density-floor ban does not apply (links carry their own size). */
		min-height: var(--touch-target-floor);
		display: inline-flex;
		align-items: center;
	}

	/* --- Cross-link entity rows (Cast / Locations / Lore) — the CrossLink vocabulary --- */
	.entity-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.entity-list--cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
	}
	.entity {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		transition: border-color var(--duration-fast) var(--easing-standard);
	}
	.entity:hover {
		border-color: var(--color-accent-border);
	}
	.entity__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--radius-sm);
		background: var(--color-accent-subtle);
		border: 1px solid var(--color-accent-border);
		color: var(--color-accent);
	}
	.entity__main {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1 1 auto;
	}
	.entity__link {
		color: var(--color-text-link);
		font-weight: var(--font-weight-semibold);
		/* WCAG 2.5.8 target-size floor (a11y-target-size gate) — preserved from the original; it
		   sits on a link, so rule #2's button/[role=button] density-floor ban does not apply. */
		min-height: var(--touch-target-floor);
		display: inline-flex;
		align-items: center;
	}
	.entity__section {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.entity__chev {
		display: inline-flex;
		flex: 0 0 auto;
		color: var(--color-text-secondary);
	}

	/* --- Calm tier-3 strip: the forward-looking note --- */
	.campaign__note {
		margin: 0;
		padding: var(--space-4);
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		line-height: var(--leading-body);
	}
	.campaign__note a {
		color: var(--color-text-link);
		font-weight: var(--font-weight-medium);
	}

	@media (max-width: 860px) {
		.campaign__grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
