<script lang="ts">
	import { onMount } from 'svelte';
	import type { Note } from '$lib/types/note.js';
	import {
		buildWorldCalendarMonthGrid,
		formatWorldDate,
		getMoonPhaseStatuses,
	} from '$lib/domain/world-calendar.js';
	import {
		buildCalendarEventCountMap,
		collectCalendarEventEntries,
	} from '$lib/domain/world-calendar-events.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import { resolve } from '$app/paths';

	interface Props {
		notes: Note[];
		title?: string;
		collapsible?: boolean;
		compact?: boolean;
	}

	let { notes, title = 'World Calendar', collapsible = false, compact = false }: Props = $props();

	let manualCollapsed = $state(false);
	let collapsed = $derived(collapsible ? manualCollapsed : compact);
	let selectedDayOffset = $state<number | null>(null);

	onMount(() => {
		if (collapsible) manualCollapsed = compact;
		if (!worldCalendarState.loaded && !worldCalendarState.loading) {
			void worldCalendarState.load();
		}
	});

	const events = $derived.by(() => collectCalendarEventEntries(notes, worldCalendarState.calendar));
	const eventCounts = $derived(buildCalendarEventCountMap(events));
	const monthGrid = $derived(
		buildWorldCalendarMonthGrid(
			worldCalendarState.calendar,
			worldCalendarState.calendar.currentDayOffset,
			eventCounts,
		),
	);
	const moonStatuses = $derived(
		getMoonPhaseStatuses(worldCalendarState.calendar, worldCalendarState.calendar.currentDayOffset),
	);
	const currentShort = $derived(
		formatWorldDate(
			worldCalendarState.calendar,
			worldCalendarState.calendar.currentDayOffset,
			'short',
		),
	);
	const currentIso = $derived(
		formatWorldDate(
			worldCalendarState.calendar,
			worldCalendarState.calendar.currentDayOffset,
			'iso',
		),
	);
	const effectiveSelectedOffset = $derived(
		selectedDayOffset ?? worldCalendarState.calendar.currentDayOffset,
	);
	const selectedEvents = $derived.by(() =>
		events.filter((event) => event.dayOffset === effectiveSelectedOffset),
	);

	function isSelected(offset: number): boolean {
		return offset === effectiveSelectedOffset;
	}
</script>

<section class="rounded-lg border border-border bg-surface">
	<div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
		<h2 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
			{title}
		</h2>
		{#if collapsible}
			<button
				type="button"
				class="text-xs px-2 py-0.5 rounded border border-border hover:bg-surface-alt"
				onclick={() => (manualCollapsed = !manualCollapsed)}
				aria-expanded={!collapsed}
			>
				{collapsed ? 'Open' : 'Collapse'}
			</button>
		{/if}
	</div>

	{#if !collapsed}
		<div class="p-3 space-y-3">
			<div class="flex items-center justify-between gap-2">
				<div>
					<p class="text-sm font-medium text-ink">{currentShort}</p>
					<p class="text-xs text-ink-muted">{currentIso}</p>
				</div>
				<div class="flex items-center gap-1">
					<button
						type="button"
						class="px-2 py-1 text-xs rounded border border-border hover:bg-surface-alt"
						onclick={() => void worldCalendarState.advance(-1)}
					>
						-1d
					</button>
					<button
						type="button"
						class="px-2 py-1 text-xs rounded border border-border hover:bg-surface-alt"
						onclick={() => void worldCalendarState.advance(1)}
					>
						+1d
					</button>
					<button
						type="button"
						class="px-2 py-1 text-xs rounded border border-border hover:bg-surface-alt"
						onclick={() => void worldCalendarState.advance(7)}
					>
						+7d
					</button>
					<button
						type="button"
						class="px-2 py-1 text-xs rounded border border-border hover:bg-surface-alt"
						onclick={() => void worldCalendarState.advance(1)}
					>
						Start Session
					</button>
				</div>
			</div>

			<div>
				<p class="text-xs font-medium text-ink mb-1">
					{monthGrid.monthName}, Year {monthGrid.year}
				</p>
				<div
					class="grid gap-1"
					style={`grid-template-columns: repeat(${monthGrid.dayNames.length}, minmax(0, 1fr));`}
				>
					{#each monthGrid.dayNames as dayName (dayName)}
						<div class="text-2xs text-center text-ink-faint">
							{dayName.slice(0, 2)}
						</div>
					{/each}
					{#each monthGrid.weeks as week, weekIndex (`week-${weekIndex}`)}
						{#each week as cell, cellIndex (`cell-${weekIndex}-${cellIndex}`)}
							{#if cell}
								<button
									type="button"
									class="h-7 rounded text-xs border transition-colors {isSelected(cell.dayOffset)
										? 'border-accent bg-accent-subtle text-accent'
										: cell.isToday
											? 'border-emerald-300 dark:border-emerald-700 text-ink'
											: 'border-border text-ink hover:bg-surface-alt'}"
									onclick={() => (selectedDayOffset = cell.dayOffset)}
									title={formatWorldDate(worldCalendarState.calendar, cell.dayOffset, 'long')}
								>
									<span>{cell.dayOfMonth}</span>
									{#if cell.eventCount > 0}
										<span class="ml-1 text-2xs text-accent">{cell.eventCount}</span>
									{/if}
								</button>
							{:else}
								<div class="h-7"></div>
							{/if}
						{/each}
					{/each}
				</div>
			</div>

			{#if moonStatuses.length > 0}
				<div class="space-y-1">
					<p class="text-xs font-medium text-ink">Moon Phases</p>
					{#each moonStatuses as moon (moon.name)}
						<p class="text-xs text-ink-muted">
							<span class="font-medium text-ink">{moon.name}:</span>
							{moon.phaseName} (day {moon.dayInCycle + 1}/{moon.periodDays})
						</p>
					{/each}
				</div>
			{/if}

			<div class="space-y-1">
				<p class="text-xs font-medium text-ink">
					Events on {formatWorldDate(worldCalendarState.calendar, effectiveSelectedOffset, 'short')}
				</p>
				{#if selectedEvents.length === 0}
					<p class="text-xs text-ink-muted">No events.</p>
				{:else}
					<ul class="space-y-1">
						{#each selectedEvents as event (`${event.kind}:${event.noteId}`)}
							<li class="text-xs text-ink-muted">
								<a
									href={resolve(`/knowledge/notes/${event.noteId}`)}
									class="text-accent hover:underline"
								>
									{event.title}
								</a>
								<span class="ml-1 text-ink-faint">({event.kind})</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</section>
