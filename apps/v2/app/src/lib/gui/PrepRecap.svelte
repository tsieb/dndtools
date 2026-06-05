<script lang="ts">
	import {
		actorCanAuthorContent,
		getCalendarContinuityForActor,
		getContentItemsForActor,
		getPrepRecapDigest,
		type DigestMode,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// SES-009 / SES-012: the PREP / RECAP + CAMPAIGN CALENDAR CONTINUITY surface.
	//
	// SES-012: the DM maintains a CAMPAIGN CALENDAR + current date (custom-time state) and LINKS dates to
	// notes/sessions/maps/events/handouts BY REFERENCE. The links resolve through the actor-filtered read,
	// so a link to a hidden/deleted target degrades to "unavailable" (no leak). The current date renders in
	// a stable canonical format (CONTENT-011 formatter), identical on every device.
	//
	// SES-009: the DM runs PREP (forward) / RECAP (backward) workflows that GATHER unresolved threads,
	// recent changes, handout outcomes, combat summaries, and continuity prompts — a PURE DERIVATION over
	// the existing durable sources, computed with NO AI. DM-FACING: a non-DM sees nothing (fail closed).
	// Every write dispatches a durable command; the GUI never touches storage (Architecture Contract 1).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const canAuthor = $derived(actorCanAuthorContent(runtime.state.permissions, runtime.activeActorId));

	const calendars = $derived(Object.values(runtime.state.content.calendars));
	const calendarId = $derived(calendars[0]?.id ?? null);

	// The DM's visible notes (the linkable/threadable targets).
	const notes = $derived(
		getContentItemsForActor(
			runtime.state.content,
			runtime.state.permissions,
			runtime.activeActorId,
		).filter((item) => item.kind === 'note'),
	);

	const continuity = $derived(
		getCalendarContinuityForActor(
			runtime.state.session,
			runtime.state.content,
			runtime.state.maps,
			runtime.state.permissions,
			runtime.activeActorId,
		),
	);

	let mode = $state<DigestMode>('prep');
	const digest = $derived(
		getPrepRecapDigest(
			runtime.state.session,
			runtime.state.content,
			runtime.state.maps,
			runtime.state.characters,
			runtime.state.permissions,
			runtime.state.sync,
			runtime.activeActorId,
			mode,
		),
	);

	let error = $state<string | null>(null);

	// Campaign-date form.
	let dateMonth = $state(1);
	let dateDay = $state(1);
	let dateYear = $state(1372);

	// Link form.
	let linkLabel = $state('');
	let linkTarget = $state('');
	let linkMonth = $state(1);
	let linkDay = $state(1);
	let linkYear = $state(1372);

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

	async function setCampaignDate(): Promise<void> {
		if (!calendarId) {
			error = 'Define a campaign calendar first.';
			return;
		}
		await dispatch({
			type: 'session.set-campaign-date',
			actorId: runtime.activeActorId,
			payload: { date: { calendarId, year: dateYear, month: dateMonth, day: dateDay } },
		});
	}

	async function linkDate(): Promise<void> {
		if (!calendarId) {
			error = 'Define a campaign calendar first.';
			return;
		}
		if (!linkTarget) {
			error = 'Select a note to link.';
			return;
		}
		const ok = await dispatch({
			type: 'session.link-calendar-date',
			actorId: runtime.activeActorId,
			payload: {
				kind: 'note',
				label: linkLabel.trim() || 'Linked event',
				date: { calendarId, year: linkYear, month: linkMonth, day: linkDay },
				targetId: linkTarget,
			},
		});
		if (ok) {
			linkLabel = '';
			linkTarget = '';
		}
	}

	async function unlink(linkId: string): Promise<void> {
		await dispatch({
			type: 'session.unlink-calendar-date',
			actorId: runtime.activeActorId,
			payload: { linkId },
		});
	}
</script>

<section data-testid="prep-recap" aria-label="Prep, recap, and calendar continuity">
	<h2>Prep, recap & calendar</h2>

	{#if error}
		<p class="error" role="alert" data-testid="prep-recap-error">{error}</p>
	{/if}

	<!-- SES-012: campaign calendar continuity authoring (DM-only). -->
	{#if canAuthor}
		<section class="block" data-testid="calendar-continuity-author" aria-label="Calendar continuity">
			<h3>Campaign calendar</h3>
			{#if !calendarId}
				<button type="button" data-testid="prep-define-calendar" onclick={defineDemoCalendar}>
					Define demo calendar
				</button>
			{:else}
				<form
					class="row"
					data-testid="campaign-date-form"
					onsubmit={(event) => {
						event.preventDefault();
						void setCampaignDate();
					}}
				>
					<label for="cd-month">Current date</label>
					<input id="cd-month" data-testid="campaign-date-month" type="number" min="1" bind:value={dateMonth} />
					<input data-testid="campaign-date-day" type="number" min="1" bind:value={dateDay} />
					<input data-testid="campaign-date-year" type="number" bind:value={dateYear} />
					<button type="submit" data-testid="set-campaign-date">Set date</button>
				</form>

				<form
					class="row"
					data-testid="calendar-link-form"
					onsubmit={(event) => {
						event.preventDefault();
						void linkDate();
					}}
				>
					<label for="link-target">Link note</label>
					<select id="link-target" data-testid="link-target-select" bind:value={linkTarget}>
						<option value="">Select a note…</option>
						{#each notes as note (note.id)}
							<option value={note.id}>{note.title}</option>
						{/each}
					</select>
					<input data-testid="link-label" placeholder="Label" bind:value={linkLabel} />
					<input data-testid="link-month" type="number" min="1" bind:value={linkMonth} />
					<input data-testid="link-day" type="number" min="1" bind:value={linkDay} />
					<input data-testid="link-year" type="number" bind:value={linkYear} />
					<button type="submit" data-testid="link-calendar-date">Link</button>
				</form>
			{/if}
		</section>
	{/if}

	<!-- SES-012: the actor-filtered calendar continuity view (current date + resolved links). -->
	<section class="block" data-testid="calendar-continuity-view" aria-label="Calendar continuity view">
		{#if continuity.currentDate}
			<p data-testid="campaign-current-date">Current date: {continuity.currentDate.display}</p>
		{:else}
			<p class="meta" data-testid="campaign-current-date-empty">No campaign date set.</p>
		{/if}
		{#if continuity.links.length === 0}
			<p class="meta" data-testid="calendar-links-empty">No calendar links.</p>
		{:else}
			<ul data-testid="calendar-links">
				{#each continuity.links as link (link.id)}
					<li data-testid={`calendar-link-${link.id}`}>
						<strong>{link.label}</strong>
						<span class="meta">{link.date.display}</span>
						{#if link.status === 'available'}
							<span data-testid="calendar-link-title">{link.targetTitle ?? '(marker)'}</span>
						{:else}
							<span class="unavailable" data-testid="calendar-link-unavailable">
								(target unavailable — hidden or deleted)
							</span>
						{/if}
						{#if isDm}
							<button type="button" data-testid={`unlink-${link.id}`} onclick={() => void unlink(link.id)}>
								Unlink
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- SES-009: the prep/recap digest (DM-only). A non-DM sees the empty fail-closed state. -->
	<section class="block" data-testid="prep-recap-digest" aria-label="Prep/recap digest">
		<div class="row">
			<label for="digest-mode">Workflow</label>
			<select id="digest-mode" data-testid="digest-mode-select" bind:value={mode}>
				<option value="prep">Prep (pre-session)</option>
				<option value="recap">Recap (post-session)</option>
			</select>
		</div>

		{#if !digest.dmOnly}
			<p class="meta" data-testid="digest-empty">The prep/recap digest is available to the DM only.</p>
		{:else}
			<div data-testid="digest-content">
				<h4>Unresolved threads</h4>
				{#if digest.unresolvedThreads.length === 0}
					<p class="meta" data-testid="digest-threads-empty">No open threads.</p>
				{:else}
					<ul data-testid="digest-threads">
						{#each digest.unresolvedThreads as thread (thread.panelId)}
							<li>
								<strong>{thread.label}</strong>
								{#if thread.available}
									<span data-testid="digest-thread-title">{thread.title}</span>
								{:else}
									<span class="unavailable">(reference unavailable)</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				<h4>Handout outcomes</h4>
				{#if digest.handoutOutcomes.length === 0}
					<p class="meta" data-testid="digest-handouts-empty">No handouts delivered.</p>
				{:else}
					<ul data-testid="digest-handouts">
						{#each digest.handoutOutcomes as outcome (outcome.handoutId + outcome.recipientActorId)}
							<li>{outcome.handoutTitle} → {outcome.recipientActorId}</li>
						{/each}
					</ul>
				{/if}

				<h4>Combat summary</h4>
				{#if digest.combatSummary}
					<p data-testid="digest-combat">
						Combat {digest.combatSummary.status}: {digest.combatSummary.logEntryCount} log entries.
					</p>
				{:else}
					<p class="meta" data-testid="digest-combat-empty">No combat this session.</p>
				{/if}

				<h4>Recent changes</h4>
				<ul data-testid="digest-recent-changes">
					{#each digest.recentChanges as change (change.operationId)}
						<li>{change.opType}</li>
					{/each}
				</ul>

				<h4>Continuity prompts</h4>
				{#if digest.continuityPrompts.length === 0}
					<p class="meta" data-testid="digest-prompts-empty">No continuity prompts.</p>
				{:else}
					<ul data-testid="digest-prompts">
						{#each digest.continuityPrompts as prompt (prompt.id)}
							<li data-testid={`digest-prompt-${prompt.source}`}>{prompt.text}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</section>
</section>

<style>
	.error {
		color: var(--color-danger, #b00020);
	}
	.meta {
		color: var(--color-text-muted, #666);
	}
	.unavailable {
		color: var(--color-text-muted, #666);
		font-style: italic;
	}
	.block {
		border: 1px solid var(--color-border, #ddd);
		border-radius: var(--radius-1, 0.25rem);
		padding: var(--space-2, 0.5rem);
		margin-bottom: var(--space-2, 0.5rem);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: center;
		margin-bottom: var(--space-2, 0.5rem);
	}
	ul {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
	}
</style>
