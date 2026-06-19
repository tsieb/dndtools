<script lang="ts">
	import { getContentItemsForActor, getQuickReferencePanelsForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// SES-007: the DM CREATES, PINS, and uses quick-reference panels for visible notes, stat blocks, rules
	// snippets, open threads, and session context. Panels reference content BY REFERENCE — the actor-
	// filtered read resolves each against the LIVE target, so a pinned reference to a now-hidden/deleted
	// target degrades to an unavailable state (no leak, no crash). Pins are DURABLE (session state), so the
	// quick reference remains available across route changes. DM-only (a non-DM sees no panels).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');

	// The DM's visible notes (the pinnable targets). Quick reference is dm-only, so this uses the DM view.
	const notes = $derived(
		getContentItemsForActor(
			runtime.state.content,
			runtime.state.permissions,
			runtime.activeActorId,
		).filter((item) => item.kind === 'note'),
	);

	const panels = $derived(
		getQuickReferencePanelsForActor(
			runtime.state.session,
			runtime.state.content,
			runtime.state.characters,
			runtime.state.permissions,
			runtime.activeActorId,
		),
	);

	let error = $state<string | null>(null);
	// `open-thread` is included because UNRESOLVED THREADS are the prep/recap digest source (SES-009): the
	// DM pins a note as an open thread, which the prep digest gathers. It references a note by id.
	let pinKind = $state<'note' | 'open-thread' | 'session-context'>('note');
	let pinTarget = $state('');
	let pinLabel = $state('');

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	async function pin(): Promise<void> {
		if (pinKind !== 'session-context' && !pinTarget) {
			error = 'Select a note to pin.';
			return;
		}
		const ok = await dispatch({
			type: 'session.pin-quick-reference',
			actorId: runtime.activeActorId,
			payload: {
				kind: pinKind,
				label: pinLabel.trim() || (pinKind === 'session-context' ? 'Session context' : 'Reference'),
				targetId: pinKind === 'session-context' ? null : pinTarget,
			},
		});
		if (ok) {
			pinTarget = '';
			pinLabel = '';
		}
	}

	async function unpin(panelId: string): Promise<void> {
		await dispatch({
			type: 'session.unpin-quick-reference',
			actorId: runtime.activeActorId,
			payload: { panelId },
		});
	}
</script>

<section data-testid="quick-reference" aria-label="Quick reference">
	<h2>Quick reference</h2>

	{#if error}
		<p class="error" role="alert" data-testid="quick-reference-error">{error}</p>
	{/if}

	{#if isDm}
		<form
			class="pin-form"
			data-testid="quick-reference-pin-form"
			onsubmit={(event) => {
				event.preventDefault();
				void pin();
			}}
		>
			<label for="qr-kind">Pin</label>
			<select id="qr-kind" data-testid="qr-kind-select" bind:value={pinKind}>
				<option value="note">Note</option>
				<option value="open-thread">Open thread</option>
				<option value="session-context">Session context</option>
			</select>
			{#if pinKind !== 'session-context'}
				<select data-testid="qr-target-select" aria-label="Pin target" bind:value={pinTarget}>
					<option value="">Select a note…</option>
					{#each notes as note (note.id)}
						<option value={note.id}>{note.title}</option>
					{/each}
				</select>
			{/if}
			<input data-testid="qr-label" placeholder="Label" bind:value={pinLabel} />
			<button type="submit" class="button" data-testid="pin-quick-reference">Pin</button>
		</form>
	{/if}

	<section class="panels" data-testid="quick-reference-panels" aria-label="Pinned panels">
		{#if panels.length === 0}
			<!-- UX-SES-013 — the guided empty state. -->
			<p class="meta" data-testid="quick-reference-empty">
				No pinned panels. Use the form above to pin a note.
			</p>
		{:else}
			<ul aria-label="Quick reference panels">
				{#each panels as panel (panel.id)}
					<!-- UX-SES-013 — an unavailable panel's accessible name carries NO target content. -->
					<li
						class="panel"
						data-testid={`qr-panel-${panel.id}`}
						aria-label={panel.status === 'available'
							? `${panel.label}, ${panel.kind}`
							: `${panel.label} — reference unavailable`}
					>
						<strong>{panel.label}</strong>
						<span class="kind">{panel.kind}</span>
						{#if panel.status === 'available' && panel.content}
							<p data-testid="qr-panel-title">{panel.content.title}</p>
							<p class="snippet" data-testid="qr-panel-snippet">{panel.content.snippet}</p>
						{:else}
							<p class="unavailable" data-testid="qr-panel-unavailable">
								Reference unavailable (the target is hidden or deleted).
							</p>
						{/if}
						{#if isDm}
							{#if panel.status === 'available' && panel.content}
								<a
									href="/knowledge/"
									class="open-link"
									data-testid={`qr-open-${panel.id}`}
									aria-label={`Open full note for ${panel.label} in the Knowledge workbench`}
								>
									Open full note
								</a>
							{/if}
							<button
								type="button"
								data-testid={`unpin-${panel.id}`}
								aria-label={`Unpin ${panel.label}`}
								onclick={() => void unpin(panel.id)}
							>
								Unpin
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</section>

<style>
	/* Secondary "tool" card (package Panel anatomy). */
	[data-testid='quick-reference'] {
		display: block;
		padding: var(--space-5);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	[data-testid='quick-reference'] > h2 {
		margin: 0 0 var(--space-4);
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	.panel strong {
		color: var(--color-text-primary);
	}

	.error {
		color: var(--color-status-error);
	}
	.meta {
		color: var(--color-text-secondary);
	}
	.pin-form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		margin-bottom: var(--space-2);
	}
	.panels ul {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.panel {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-2);
	}
	.kind {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		margin-left: var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
	}
	.open-link {
		margin-right: var(--space-2);
	}
	.unavailable {
		color: var(--color-text-secondary);
		font-style: italic;
	}
</style>
