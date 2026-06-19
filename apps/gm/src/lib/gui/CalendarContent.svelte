<script lang="ts">
	import {
		actorCanAuthorContent,
		getCalendarTimelineForActor,
		getContentItemsForActor,
		type ContentItemKind,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CONTENT-011: the CALENDAR/CUSTOM-TIME CONTENT surface. An authorized editor (DM) defines a
	// campaign calendar, then creates calendar-aware notes/objects with custom-date fields. The list,
	// the formatted dates, and the timeline ALL render from the actor-filtered content query, so a
	// player never sees a dm-only dated note (it is omitted from the timeline — CONTENT-011 AC2) and
	// every date renders identically/deterministically from the calendar definition (AC1). Every write
	// dispatches a durable command; the GUI never touches storage (Architecture Contract 1).
	const runtime = useRuntime();

	const calendars = $derived(Object.values(runtime.state.content.calendars));
	const selectedCalendarId = $derived(calendars[0]?.id ?? null);

	const items = $derived(
		getContentItemsForActor(
			runtime.state.content,
			runtime.state.permissions,
			runtime.activeActorId,
			'long',
		),
	);
	const timeline = $derived(
		selectedCalendarId
			? getCalendarTimelineForActor(
					runtime.state.content,
					runtime.state.permissions,
					runtime.activeActorId,
					selectedCalendarId,
					'long',
				)
			: [],
	);
	const canAuthor = $derived(
		actorCanAuthorContent(runtime.state.permissions, runtime.activeActorId),
	);

	let error = $state<string | null>(null);

	// New-item form state.
	let title = $state('');
	let kind = $state<ContentItemKind>('note');
	let visibility = $state<'dm-only' | 'player-visible' | 'shared'>('dm-only');
	let dateMonth = $state(1);
	let dateDay = $state(1);
	let dateYear = $state(1372);

	// UX-CONTENT-019 — make the date field calendar-aware: reflect the chosen month's name from the
	// active campaign calendar so the picker reads in-world ("Hammer 1"), not just a bare number.
	const selectedMonthName = $derived(calendars[0]?.months[dateMonth - 1]?.name ?? null);

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	async function defineDemoCalendar(): Promise<void> {
		await dispatch({
			type: 'content.define-calendar',
			actorId: runtime.activeActorId,
			payload: {
				id: 'cal-harptos',
				name: 'Calendar of Harptos',
				months: [
					{ id: 'm1', name: 'Hammer', days: 30 },
					{ id: 'm2', name: 'Alturiak', days: 28 },
					{ id: 'm3', name: 'Ches', days: 31 },
				],
				weekdays: ['First', 'Second', 'Third', 'Fourth', 'Fifth'],
				epochLabel: 'DR',
			},
		});
	}

	async function createItem(): Promise<void> {
		const trimmed = title.trim();
		if (trimmed === '') {
			error = 'Enter a content title.';
			return;
		}
		if (!selectedCalendarId) {
			error = 'Define a campaign calendar first.';
			return;
		}
		const ok = await dispatch({
			type: 'content.create-item',
			actorId: runtime.activeActorId,
			payload: {
				kind,
				title: trimmed,
				visibility,
				dateFields: {
					occursOn: {
						calendarId: selectedCalendarId,
						year: dateYear,
						month: dateMonth,
						day: dateDay,
					},
				},
			},
		});
		if (ok) title = '';
	}

	async function changeVisibility(
		itemId: string,
		next: 'dm-only' | 'player-visible' | 'shared',
	): Promise<void> {
		await dispatch({
			type: 'content.set-item-visibility',
			actorId: runtime.activeActorId,
			payload: { itemId, visibility: next },
		});
	}

	async function removeItem(itemId: string): Promise<void> {
		await dispatch({
			type: 'content.remove-item',
			actorId: runtime.activeActorId,
			payload: { itemId },
		});
	}
</script>

<section class="calendar" data-testid="calendar-content" aria-label="Calendar and custom-time content">
	<h2>Calendar &amp; custom-time content</h2>
	<p class="meta">
		Calendar-aware notes and structured objects. Dates are expressed in a custom campaign calendar
		and render identically on every device — no host locale, timezone, or clock is consulted.
	</p>

	{#if error}
		<p class="meta" role="alert" data-testid="content-error">{error}</p>
	{/if}

	{#if calendars.length === 0}
		<p class="meta" data-testid="content-no-calendar">No campaign calendar is defined yet.</p>
		{#if canAuthor}
			<button type="button" data-testid="content-define-calendar" onclick={defineDemoCalendar}>
				Define the demo calendar (Harptos)
			</button>
		{/if}
	{:else}
		<p class="meta" data-testid="content-calendar-name">
			Active calendar: {calendars[0]!.name}
		</p>

		<h3>Timeline</h3>
		{#if timeline.length === 0}
			<p class="meta" data-testid="content-timeline-empty">No dated events are visible to you.</p>
		{:else}
			<!-- A11Y-009: the timeline is an ordered list — deterministically chronological (AC1).
			     Each entry is actor-filtered (dm-only items are OMITTED entirely, never redacted).
			     The title is a keyboard-operable link so screen reader users can activate (navigate
			     to) each visible event without pointer positioning. -->
			<ol class="scene-list" data-testid="content-timeline">
				{#each timeline as row (row.itemId)}
					<li class="scene-card" data-testid={`content-timeline-${row.itemId}`}>
						<span data-testid={`content-timeline-date-${row.itemId}`}>{row.date.display}</span>
						<strong> — </strong>
						<a
							href={`/knowledge/?note=${encodeURIComponent(row.itemId)}`}
							data-testid={`content-timeline-open-${row.itemId}`}
						>
							{row.title}
						</a>
					</li>
				{/each}
			</ol>
		{/if}

		<h3>Content items</h3>
		{#if items.length === 0}
			<p class="meta" data-testid="content-items-empty">No content is visible to you.</p>
		{:else}
			<ul class="scene-list" data-testid="content-items">
				{#each items as item (item.id)}
					<li class="scene-card" data-testid={`content-item-${item.id}`}>
						<div>
							<strong>{item.title}</strong>
							<span class="meta"> • {item.kind} • {item.visibility}</span>
							{#if item.dateFields.occursOn}
								<div class="meta" data-testid={`content-item-date-${item.id}`}>
									{item.dateFields.occursOn.display}
								</div>
							{/if}
						</div>
						{#if canAuthor}
							<label class="meta">
								Visibility
								<select
									data-testid={`content-item-visibility-${item.id}`}
									value={item.visibility}
									onchange={(event) =>
										changeVisibility(
											item.id,
											event.currentTarget.value as 'dm-only' | 'player-visible' | 'shared',
										)}
								>
									<option value="dm-only">DM only</option>
									<option value="player-visible">Player visible</option>
									<option value="shared">Shared</option>
								</select>
							</label>
							<button
								type="button"
								data-testid={`content-item-remove-${item.id}`}
								onclick={() => removeItem(item.id)}
							>
								Remove
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if canAuthor}
			<form
				data-testid="content-create-form"
				onsubmit={(event) => {
					event.preventDefault();
					createItem();
				}}
			>
				<label>
					Title
					<input data-testid="content-title" bind:value={title} autocomplete="off" />
				</label>
				<label>
					Kind
					<select data-testid="content-kind" bind:value={kind}>
						<option value="note">Note</option>
						<option value="object">Structured object</option>
					</select>
				</label>
				<label>
					Visibility
					<select data-testid="content-visibility" bind:value={visibility}>
						<option value="dm-only">DM only</option>
						<option value="player-visible">Player visible</option>
						<option value="shared">Shared</option>
					</select>
				</label>
				<label>
					Month
					<input type="number" min="1" data-testid="content-date-month" bind:value={dateMonth} />
					{#if selectedMonthName}<span class="month-name" data-testid="content-date-month-name">{selectedMonthName}</span>{/if}
				</label>
				<label>
					Day
					<input type="number" min="1" data-testid="content-date-day" bind:value={dateDay} />
				</label>
				<label>
					Year
					<input type="number" data-testid="content-date-year" bind:value={dateYear} />
				</label>
				<button type="submit" data-testid="content-submit">Create item</button>
			</form>
		{/if}
	{/if}
</section>

<style>
	.calendar {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.calendar h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	.calendar h3 {
		margin: var(--space-2) 0 0;
		font-size: var(--text-md);
	}
	.calendar :global(.scene-list) {
		list-style: none;
		margin: var(--space-1) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.calendar :global(.scene-card) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.calendar :global([data-testid^='content-timeline-date-']) {
		font-variant-numeric: tabular-nums;
		font-weight: var(--font-weight-semibold);
		color: var(--color-accent);
	}
	.calendar :global(.meta) {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.calendar :global(form) {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
		gap: var(--space-2);
		align-items: end;
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.calendar :global(form label) {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.calendar :global(input),
	.calendar :global(select) {
		min-height: var(--touch-target-min);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font: inherit;
		font-weight: var(--font-weight-regular);
	}
	.month-name {
		font-size: var(--text-xs);
		font-weight: var(--font-weight-regular);
		color: var(--color-accent);
	}
	.calendar :global(button) {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.calendar :global([data-testid='content-submit']),
	.calendar :global([data-testid='content-define-calendar']) {
		background: var(--color-accent);
		color: var(--color-accent-foreground);
		border-color: var(--color-accent);
		font-weight: var(--font-weight-semibold);
	}
	.calendar :global(a) {
		color: var(--color-text-link);
	}
</style>
