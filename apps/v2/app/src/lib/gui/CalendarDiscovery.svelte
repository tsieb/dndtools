<script lang="ts">
	import { searchCalendarTimeForActor } from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// SRCH-010: the CALENDAR / CUSTOM-TIME DISCOVERY surface. The user searches and filters VISIBLE
	// dated content by a custom-calendar date RANGE and an optional text query, across three sources:
	// dated notes/objects (CONTENT-011), campaign timeline links (SES-012), and — for the DM only —
	// session chronology. The list, the formatted dates, and the counts ALL render from the single
	// actor-filtered discovery query, so a player never sees a dm-only dated event NOR a count that
	// reveals one (SRCH-010 AC2), and every date renders identically/deterministically from the calendar
	// definition (AC1). This surface dispatches NO commands — it is read-only discovery (Contract 1).
	const runtime = useRuntime();

	const calendars = $derived(Object.values(runtime.state.content.calendars));
	const selectedCalendarId = $derived(calendars[0]?.id ?? null);

	// Range + text filter (local UI state only). Blank bounds ⇒ an open range over the whole calendar.
	let query = $state('');
	let fromMonth = $state<number | null>(null);
	let fromDay = $state<number | null>(null);
	let fromYear = $state<number | null>(null);
	let toMonth = $state<number | null>(null);
	let toDay = $state<number | null>(null);
	let toYear = $state<number | null>(null);

	function boundFrom(): { calendarId: string; year: number; month: number; day: number } | null {
		if (!selectedCalendarId) return null;
		if (fromYear === null || fromMonth === null || fromDay === null) return null;
		return { calendarId: selectedCalendarId, year: fromYear, month: fromMonth, day: fromDay };
	}

	function boundTo(): { calendarId: string; year: number; month: number; day: number } | null {
		if (!selectedCalendarId) return null;
		if (toYear === null || toMonth === null || toDay === null) return null;
		return { calendarId: selectedCalendarId, year: toYear, month: toMonth, day: toDay };
	}

	const result = $derived(
		selectedCalendarId
			? searchCalendarTimeForActor(
					runtime.state.session,
					runtime.state.content,
					runtime.state.maps,
					runtime.state.permissions,
					runtime.activeActorId,
					{
						calendarId: selectedCalendarId,
						query,
						range: { from: boundFrom(), to: boundTo() },
					},
					'long',
				)
			: null,
	);

	const sourceLabels: Record<string, string> = {
		content: 'Note',
		'timeline-link': 'Timeline',
		session: 'Session',
	};
</script>

<section data-testid="calendar-discovery" aria-label="Calendar and custom-time discovery">
	<h2>Calendar &amp; custom-time discovery</h2>
	<p class="meta">
		Search and filter visible dated content by a custom-calendar date range. Hidden events — and any
		count that would reveal them — are omitted; you see only what your visibility permits.
	</p>

	{#if calendars.length === 0}
		<p class="meta" data-testid="discovery-no-calendar">No campaign calendar is defined yet.</p>
	{:else if result}
		<form
			data-testid="discovery-filter-form"
			onsubmit={(event) => {
				event.preventDefault();
			}}
		>
			<label>
				Search text
				<input data-testid="discovery-query" bind:value={query} autocomplete="off" />
			</label>
			<fieldset>
				<legend class="meta">From (inclusive)</legend>
				<label>
					Month
					<input
						type="number"
						min="1"
						data-testid="discovery-from-month"
						bind:value={fromMonth}
					/>
				</label>
				<label>
					Day
					<input type="number" min="1" data-testid="discovery-from-day" bind:value={fromDay} />
				</label>
				<label>
					Year
					<input type="number" data-testid="discovery-from-year" bind:value={fromYear} />
				</label>
			</fieldset>
			<fieldset>
				<legend class="meta">To (inclusive)</legend>
				<label>
					Month
					<input type="number" min="1" data-testid="discovery-to-month" bind:value={toMonth} />
				</label>
				<label>
					Day
					<input type="number" min="1" data-testid="discovery-to-day" bind:value={toDay} />
				</label>
				<label>
					Year
					<input type="number" data-testid="discovery-to-year" bind:value={toYear} />
				</label>
			</fieldset>
		</form>

		<p class="meta" data-testid="discovery-count">
			{result.totalCount} matching event{result.totalCount === 1 ? '' : 's'}
		</p>

		{#if result.events.length === 0}
			<p class="meta" data-testid="discovery-empty">No visible dated events match your filter.</p>
		{:else}
			<ol class="scene-list" data-testid="discovery-results">
				{#each result.events as event (`${event.source}:${event.id}`)}
					<li class="scene-card" data-testid={`discovery-result-${event.source}-${event.id}`}>
						<span class="meta">{sourceLabels[event.source] ?? event.source}</span>
						<span data-testid={`discovery-result-date-${event.source}-${event.id}`}>
							{event.date.display}
						</span>
						<strong> — {event.title}</strong>
					</li>
				{/each}
			</ol>
		{/if}
	{/if}
</section>
