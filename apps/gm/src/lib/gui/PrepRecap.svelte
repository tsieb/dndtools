<script lang="ts">
	import {
		actorCanAuthorContent,
		getCalendarContinuityForActor,
		getContentItemsForActor,
		getPrepRecapDigest,
		type DigestMode,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';

	// SES-009 / SES-012: the PREP / RECAP + CAMPAIGN CALENDAR CONTINUITY surface.
	//
	// SES-012 / UX-SES-015: the DM maintains a CAMPAIGN CALENDAR + current date (custom-time state) and
	// LINKS dates to notes/sessions/maps/events BY REFERENCE. The links resolve through the actor-
	// filtered read, so a link to a hidden/deleted target degrades to "unavailable" (no leak). The
	// current date renders in a stable canonical format (CONTENT-011 formatter), identical on every
	// client; an out-of-range date is rejected fail-closed in the core and surfaces as an inline error.
	//
	// SES-009 / UX-SES-014: the DM runs PREP (forward) / RECAP (backward) workflows that GATHER
	// unresolved threads, recent changes, handout outcomes, combat summaries, and continuity prompts —
	// a PURE DERIVATION over the existing durable sources, computed with NO AI. DM-FACING: a non-DM
	// sees ONLY the guard message (no headings, no empty lists — fail closed). "Create recap notes"
	// opens an EDITABLE note draft pre-populated from the recap digest; saving dispatches the ordinary
	// durable content-create command. The GUI never touches storage (Architecture Contract 1).
	const runtime = useRuntime();
	const announcer = useLiveAnnouncer();

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

	// UX-SES-014 AC1 — when the session reaches the RECAP state, the panel's mode automatically
	// shifts to recap (once per entry into recap; the DM may still switch back manually).
	const workflow = $derived(runtime.state.session.workflow);
	let autoAppliedRecap = $state(false);
	$effect(() => {
		if (workflow === 'recap') {
			if (!autoAppliedRecap) {
				mode = 'recap';
				autoAppliedRecap = true;
			}
		} else if (autoAppliedRecap) {
			autoAppliedRecap = false;
		}
	});

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

	// UX-SES-014 — at most 10 recent changes render; the rest are reachable via the full history.
	const MAX_RECENT_CHANGES = 10;
	const visibleRecentChanges = $derived(
		digest.dmOnly ? digest.recentChanges.slice(0, MAX_RECENT_CHANGES) : [],
	);

	let error = $state<string | null>(null);
	// UX-SES-015 AC3 — the set-date form gets its OWN inline error so an invalid day surfaces right
	// at the form (and the date is provably not set — the core rejected before any write).
	let dateError = $state<string | null>(null);

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
		dateError = null;
		if (!calendarId) {
			dateError = 'Define a campaign calendar first.';
			return;
		}
		const ok = await dispatch({
			type: 'session.set-campaign-date',
			actorId: runtime.activeActorId,
			payload: { date: { calendarId, year: dateYear, month: dateMonth, day: dateDay } },
		});
		if (!ok) {
			// Move the shared rejection message to the form-local inline error (UX-SES-015 AC3).
			dateError = error;
			error = null;
		}
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

	// UX-SES-014 AC3 — "Create recap notes" opens an EDITABLE draft pre-populated from the recap
	// digest (structured template, no AI); saving dispatches the ordinary durable content-create
	// command and announces the created draft politely.
	let recapDraftOpen = $state(false);
	let recapTitle = $state('Session recap');
	let recapBody = $state('');
	let recapNoteCreated = $state(false);

	function buildRecapTemplate(): string {
		const lines: string[] = ['# Session recap', ''];
		if (!digest.dmOnly) return lines.join('\n');
		lines.push('## Combat');
		lines.push(
			digest.combatSummary
				? `Combat ${digest.combatSummary.status}: ${digest.combatSummary.logEntryCount} log entries.`
				: 'No combat this session.',
			'',
			'## Handouts delivered',
		);
		if (digest.handoutOutcomes.length === 0) lines.push('None.');
		for (const outcome of digest.handoutOutcomes) {
			lines.push(`- ${outcome.handoutTitle} → ${outcome.recipientActorId}`);
		}
		lines.push('', '## Unresolved threads');
		if (digest.unresolvedThreads.length === 0) lines.push('None.');
		for (const thread of digest.unresolvedThreads) {
			lines.push(`- ${thread.label}${thread.available && thread.title ? `: ${thread.title}` : ''}`);
		}
		lines.push('', '## Continuity prompts');
		if (digest.continuityPrompts.length === 0) lines.push('None.');
		for (const prompt of digest.continuityPrompts) {
			lines.push(`- ${prompt.text}`);
		}
		return lines.join('\n');
	}

	function openRecapDraft(): void {
		recapTitle = 'Session recap';
		recapBody = buildRecapTemplate();
		recapDraftOpen = true;
	}

	async function saveRecapNote(): Promise<void> {
		const ok = await dispatch({
			type: 'content.create-item',
			actorId: runtime.activeActorId,
			payload: {
				kind: 'note',
				title: recapTitle.trim() || 'Session recap',
				body: recapBody,
				visibility: 'dm-only',
			},
		});
		if (ok) {
			recapNoteCreated = true;
			recapDraftOpen = false;
			announcer?.announce(`Recap draft created: ${recapTitle.trim() || 'Session recap'}`, 'polite');
		}
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
				<!-- UX-SES-015 — the DM-only "define calendar" path. -->
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
					<input
						id="cd-month"
						data-testid="campaign-date-month"
						type="number"
						min="1"
						aria-label="Month"
						bind:value={dateMonth}
					/>
					<input
						data-testid="campaign-date-day"
						type="number"
						min="1"
						aria-label="Day"
						bind:value={dateDay}
					/>
					<input data-testid="campaign-date-year" type="number" aria-label="Year" bind:value={dateYear} />
					<button type="submit" data-testid="set-campaign-date" aria-label="Set campaign date">
						Set date
					</button>
					{#if dateError}
						<!-- UX-SES-015 AC3 — invalid dates fail closed in the core; inline error, no write. -->
						<span class="error" role="alert" data-testid="campaign-date-error">{dateError}</span>
					{/if}
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
					<input data-testid="link-label" placeholder="Label" aria-label="Link label" bind:value={linkLabel} />
					<input data-testid="link-month" type="number" min="1" aria-label="Link month" bind:value={linkMonth} />
					<input data-testid="link-day" type="number" min="1" aria-label="Link day" bind:value={linkDay} />
					<input data-testid="link-year" type="number" aria-label="Link year" bind:value={linkYear} />
					<button type="submit" data-testid="link-calendar-date">Link</button>
				</form>
			{/if}
		</section>
	{/if}

	<!-- SES-012 / UX-SES-015: the actor-filtered calendar continuity view (current date + links).
	     The date string is the CONTENT-011 canonical format — identical on every client (AC1). -->
	<section class="block" data-testid="calendar-continuity-view" aria-label="Calendar continuity view">
		{#if !calendarId && !canAuthor}
			<p class="meta" data-testid="campaign-calendar-undefined">No campaign calendar defined.</p>
		{/if}
		{#if continuity.currentDate}
			<p data-testid="campaign-current-date">
				Current date:
				<time datetime={continuity.currentDate.isoLike}>{continuity.currentDate.display}</time>
			</p>
		{:else}
			<p class="meta" data-testid="campaign-current-date-empty">No campaign date set.</p>
		{/if}
		{#if continuity.links.length === 0}
			<p class="meta" data-testid="calendar-links-empty">No calendar links.</p>
		{:else}
			<ul data-testid="calendar-links" aria-label="Calendar links">
				{#each continuity.links as link (link.id)}
					<li
						data-testid={`calendar-link-${link.id}`}
						aria-label={link.status === 'available'
							? `${link.label}, ${link.date.display}`
							: `${link.label} — target unavailable`}
					>
						<strong>{link.label}</strong>
						<span class="meta"><time datetime={link.date.isoLike}>{link.date.display}</time></span>
						{#if link.status === 'available'}
							<span data-testid="calendar-link-title">{link.targetTitle ?? '(marker)'}</span>
						{:else}
							<span class="unavailable" data-testid="calendar-link-unavailable">
								(target unavailable — hidden or deleted)
							</span>
						{/if}
						{#if isDm}
							<button
								type="button"
								data-testid={`unlink-${link.id}`}
								aria-label={`Unlink ${link.label}`}
								onclick={() => void unlink(link.id)}
							>
								Unlink
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- SES-009 / UX-SES-014: the prep/recap digest (DM-only). A non-DM sees ONLY the guard message
	     — no mode selector, no section headings, no empty lists (fail closed). -->
	<section class="block" data-testid="prep-recap-digest" aria-label="Prep/recap digest">
		{#if !digest.dmOnly}
			<p class="meta" role="status" data-testid="digest-empty">
				The prep/recap digest is available to the DM only.
			</p>
		{:else}
			<div class="row">
				<!-- UX-SES-014 — the Prep | Recap segmented mode selector (radiogroup; arrows switch). -->
				<div
					class="mode-group"
					role="radiogroup"
					aria-label="Prep or recap workflow"
					data-testid="digest-mode-group"
				>
					{#each [{ value: 'prep', label: 'Prep' }, { value: 'recap', label: 'Recap' }] as option (option.value)}
						<button
							type="button"
							class="mode-option"
							class:selected={mode === option.value}
							role="radio"
							aria-checked={mode === option.value}
							tabindex={mode === option.value ? 0 : -1}
							data-testid={`digest-mode-${option.value}`}
							onclick={() => (mode = option.value as DigestMode)}
							onkeydown={(event) => {
								if (
									event.key === 'ArrowLeft' ||
									event.key === 'ArrowRight' ||
									event.key === 'ArrowUp' ||
									event.key === 'ArrowDown'
								) {
									event.preventDefault();
									mode = mode === 'prep' ? 'recap' : 'prep';
								}
							}}
						>
							{option.label}
						</button>
					{/each}
				</div>
				{#if workflow === 'recap' && canAuthor}
					<!-- UX-SES-014 AC3 — primary-visible "Create recap notes" CTA while in recap. -->
					<button
						type="button"
						class="button"
						data-testid="create-recap-notes"
						aria-label="Create recap notes from digest"
						onclick={() => openRecapDraft()}
					>
						Create recap notes
					</button>
					{#if recapNoteCreated}
						<span class="meta" role="status" data-testid="recap-notes-created">
							Recap note created in the vault.
						</span>
					{/if}
				{/if}
			</div>

			{#if recapDraftOpen}
				<!-- UX-SES-014 AC3 — the editable pre-populated recap draft (no further configuration). -->
				<form
					class="recap-draft"
					data-testid="recap-draft"
					onsubmit={(event) => {
						event.preventDefault();
						void saveRecapNote();
					}}
				>
					<label for="recap-draft-title">Recap title</label>
					<input id="recap-draft-title" data-testid="recap-draft-title" bind:value={recapTitle} />
					<label for="recap-draft-body">Recap notes</label>
					<textarea
						id="recap-draft-body"
						data-testid="recap-draft-body"
						rows="8"
						bind:value={recapBody}
					></textarea>
					<div class="row">
						<button type="submit" data-testid="save-recap-note">Save recap note</button>
						<button type="button" data-testid="cancel-recap-note" onclick={() => (recapDraftOpen = false)}>
							Cancel
						</button>
					</div>
				</form>
			{/if}

			<div data-testid="digest-content">
				<section aria-label="Unresolved threads">
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
				</section>

				<section aria-label="Handout outcomes">
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
				</section>

				<section aria-label="Combat summary">
					<h4>Combat summary</h4>
					{#if digest.combatSummary}
						<p data-testid="digest-combat">
							Combat {digest.combatSummary.status}: {digest.combatSummary.logEntryCount} log entries.
						</p>
					{:else}
						<p class="meta" data-testid="digest-combat-empty">No combat this session.</p>
					{/if}
				</section>

				<section aria-label="Recent changes">
					<h4>Recent changes</h4>
					<ul data-testid="digest-recent-changes">
						{#each visibleRecentChanges as change (change.operationId)}
							<li>{change.opType}</li>
						{/each}
					</ul>
					{#if digest.recentChanges.length > MAX_RECENT_CHANGES}
						<p class="meta" data-testid="digest-recent-changes-more">
							Showing {MAX_RECENT_CHANGES} of {digest.recentChanges.length} changes.
						</p>
					{/if}
				</section>

				<section aria-label="Continuity prompts">
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
				</section>
			</div>
		{/if}
	</section>
</section>

<style>
	.error {
		color: var(--color-status-error);
	}
	.meta {
		color: var(--color-text-secondary);
	}
	.unavailable {
		color: var(--color-text-secondary);
		font-style: italic;
	}
	.block {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		margin-bottom: var(--space-2);
	}
	.mode-group {
		display: inline-flex;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}
	.mode-option {
		border: 0;
		border-radius: 0;
		background: var(--color-surface);
		color: var(--color-text-primary);
	}
	.mode-option + .mode-option {
		border-left: 1px solid var(--color-border);
	}
	.mode-option.selected {
		background: var(--color-accent);
		color: var(--color-accent-foreground);
	}
	.recap-draft {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
	}
	.recap-draft textarea {
		font-family: var(--font-mono, monospace);
	}
	ul {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
</style>
