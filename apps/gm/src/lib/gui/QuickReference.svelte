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
			<button type="submit" data-testid="pin-quick-reference">Pin</button>
		</form>
	{/if}

	<section class="panels" data-testid="quick-reference-panels" aria-label="Pinned panels">
		{#if panels.length === 0}
			<p class="meta" data-testid="quick-reference-empty">No pinned panels.</p>
		{:else}
			<ul>
				{#each panels as panel (panel.id)}
					<li class="panel" data-testid={`qr-panel-${panel.id}`}>
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
							<button
								type="button"
								data-testid={`unpin-${panel.id}`}
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
	.error {
		color: var(--color-danger, #b00020);
	}
	.meta {
		color: var(--color-text-muted, #666);
	}
	.pin-form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: center;
		margin-bottom: var(--space-2, 0.5rem);
	}
	.panels ul {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
	}
	.panel {
		border: 1px solid var(--color-border, #ddd);
		border-radius: var(--radius-1, 0.25rem);
		padding: var(--space-2, 0.5rem);
	}
	.kind {
		font-size: 0.75rem;
		color: var(--color-text-muted, #666);
		margin-left: var(--space-1, 0.25rem);
	}
	.unavailable {
		color: var(--color-text-muted, #666);
		font-style: italic;
	}
</style>
