<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import {
		buildCampaignTimeline,
		type CampaignTimelineEntry,
	} from '$lib/domain/campaign-timeline.js';

	let selectedArc = $state('');
	let selectedParticipant = $state('');
	let pendingOnly = $state(false);

	$effect(() => {
		if (!worldCalendarState.loaded && !worldCalendarState.loading) {
			void worldCalendarState.load();
		}
	});

	let allEntries = $derived.by(() =>
		buildCampaignTimeline(notesState.activeNotes, worldCalendarState.calendar),
	);

	let arcOptions = $derived.by(() =>
		[
			...new Set(
				allEntries.map((entry) => entry.arcTag).filter((entry): entry is string => !!entry),
			),
		]
			.map((arc) => arc.trim())
			.filter((arc) => arc.length > 0)
			.sort((a, b) => a.localeCompare(b)),
	);

	let participantOptions = $derived.by(() => {
		const map = new SvelteMap<string, string>();
		for (const entry of allEntries) {
			entry.participantObjectIds.forEach((id, index) => {
				if (!id.trim()) return;
				const name = entry.participantNames[index] ?? id;
				if (!map.has(id)) map.set(id, name);
			});
		}
		return [...map.entries()]
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	let filteredEntries = $derived.by(() => {
		const entries = buildCampaignTimeline(notesState.activeNotes, worldCalendarState.calendar, {
			arcTag: selectedArc || null,
			participantObjectId: selectedParticipant || null,
		});
		return pendingOnly
			? entries.filter((entry) => entry.pendingResolution || entry.linkedTimelineEventId !== null)
			: entries;
	});

	let groupedEntries = $derived.by(() => {
		const groups = new SvelteMap<
			number,
			{
				dayOffset: number;
				dateShort: string;
				dateIso: string;
				worldEvents: CampaignTimelineEntry[];
				sessionLogs: CampaignTimelineEntry[];
			}
		>();
		for (const entry of filteredEntries) {
			const existing = groups.get(entry.dayOffset);
			const group = existing ?? {
				dayOffset: entry.dayOffset,
				dateShort: entry.dateShort,
				dateIso: entry.dateIso,
				worldEvents: [],
				sessionLogs: [],
			};
			if (entry.kind === 'timeline_event') {
				group.worldEvents.push(entry);
			} else {
				group.sessionLogs.push(entry);
			}
			if (!existing) groups.set(entry.dayOffset, group);
		}
		return [...groups.values()].sort((a, b) => a.dayOffset - b.dayOffset);
	});

	function resetFilters(): void {
		selectedArc = '';
		selectedParticipant = '';
		pendingOnly = false;
	}
</script>

<div class="mx-auto max-w-[1200px] p-6">
	<header class="mb-5">
		<h1 class="text-2xl font-bold text-ink dark:text-tavern-text">Campaign Timeline</h1>
		<p class="mt-1 text-sm text-ink-muted dark:text-tavern-muted">
			Chronological campaign ledger showing world events and session discoveries on one track.
		</p>
	</header>

	<section
		class="mb-4 grid gap-2 rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface md:grid-cols-4"
	>
		<label class="text-xs text-ink-muted dark:text-tavern-muted">
			Arc
			<select
				bind:value={selectedArc}
				class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
			>
				<option value="">All arcs</option>
				{#each arcOptions as arc (arc)}
					<option value={arc}>{arc}</option>
				{/each}
			</select>
		</label>
		<label class="text-xs text-ink-muted dark:text-tavern-muted">
			Participant
			<select
				bind:value={selectedParticipant}
				class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
			>
				<option value="">All participants</option>
				{#each participantOptions as participant (participant.id)}
					<option value={participant.id}>{participant.name}</option>
				{/each}
			</select>
		</label>
		<label
			class="flex items-center gap-2 rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
		>
			<input type="checkbox" bind:checked={pendingOnly} />
			Linked or pending only
		</label>
		<div class="flex items-end">
			<button
				type="button"
				class="w-full rounded border border-border px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
				onclick={resetFilters}
			>
				Reset filters
			</button>
		</div>
	</section>

	<div class="mb-3 flex items-center gap-3 text-xs text-ink-faint dark:text-tavern-faint">
		<span>{filteredEntries.length} timeline entries</span>
		<span
			>{filteredEntries.filter((entry) => entry.kind === 'timeline_event').length} world events</span
		>
		<span
			>{filteredEntries.filter((entry) => entry.kind === 'session_note').length} session logs</span
		>
	</div>

	{#if groupedEntries.length === 0}
		<div
			class="rounded-lg border border-border bg-surface p-6 text-sm text-ink-muted dark:border-tavern-border dark:bg-tavern-surface dark:text-tavern-muted"
		>
			No timeline entries match the active filters.
		</div>
	{:else}
		<div class="space-y-4">
			{#each groupedEntries as group (group.dayOffset)}
				<section
					class="rounded-lg border border-border bg-surface p-4 dark:border-tavern-border dark:bg-tavern-surface"
				>
					<div class="mb-3 flex items-baseline justify-between gap-2">
						<h2 class="text-sm font-semibold text-ink dark:text-tavern-text">{group.dateShort}</h2>
						<span class="text-xs text-ink-faint dark:text-tavern-faint">{group.dateIso}</span>
					</div>
					<div class="grid gap-3 md:grid-cols-2">
						<div>
							<p
								class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-tavern-faint"
							>
								World Events
							</p>
							{#if group.worldEvents.length === 0}
								<p class="text-xs text-ink-muted dark:text-tavern-muted">No world events.</p>
							{:else}
								<ul class="space-y-2">
									{#each group.worldEvents as entry (entry.id)}
										<li
											class="rounded border border-border bg-surface-alt p-2 dark:border-tavern-border dark:bg-tavern-surface-alt"
										>
											<div class="flex items-center justify-between gap-2">
												<a
													href={resolve(`/knowledge/notes/${entry.noteId}`)}
													class="text-sm font-medium text-accent hover:underline dark:text-tavern-accent"
												>
													{entry.title}
												</a>
												{#if entry.pendingResolution}
													<span
														class="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning"
													>
														Pending
													</span>
												{/if}
											</div>
											<p class="mt-1 text-xs text-ink-muted dark:text-tavern-muted">
												{entry.summary}
											</p>
											{#if entry.arcTag}
												<p class="mt-1 text-[11px] text-ink-faint dark:text-tavern-faint">
													Arc: {entry.arcTag}
												</p>
											{/if}
											{#if entry.linkedSessionNoteId}
												<a
													href={resolve(`/knowledge/notes/${entry.linkedSessionNoteId}`)}
													class="mt-1 inline-block text-[11px] text-accent hover:underline dark:text-tavern-accent"
												>
													Linked session log
												</a>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
						<div>
							<p
								class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-tavern-faint"
							>
								Session Logs
							</p>
							{#if group.sessionLogs.length === 0}
								<p class="text-xs text-ink-muted dark:text-tavern-muted">No session notes.</p>
							{:else}
								<ul class="space-y-2">
									{#each group.sessionLogs as entry (entry.id)}
										<li
											class="rounded border border-border bg-surface-alt p-2 dark:border-tavern-border dark:bg-tavern-surface-alt"
										>
											<a
												href={resolve(`/knowledge/notes/${entry.noteId}`)}
												class="text-sm font-medium text-accent hover:underline dark:text-tavern-accent"
											>
												{entry.title}
											</a>
											<p class="mt-1 text-xs text-ink-muted dark:text-tavern-muted">
												{entry.summary}
											</p>
											{#if entry.linkedTimelineEventId}
												<a
													href={resolve(`/knowledge/notes/${entry.linkedTimelineEventId}`)}
													class="mt-1 inline-block text-[11px] text-accent hover:underline dark:text-tavern-accent"
												>
													Linked world event
												</a>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>
