<script lang="ts">
	import { getHandoutForActor, getHandoutDeliveryHistory } from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// SES-004: the DM delivers a HANDOUT as a Scene widget to SELECTED recipients with delivery history,
	// visibility enforcement (non-recipients receive nothing), and optional/progressive reveal. The GUI
	// only dispatches command intents and renders the actor-filtered handout read model — visibility and
	// the non-recipient non-leak are enforced in the Processing Core (Contract 1 / Contract 3). The "view
	// as" header control re-renders the read against another actor, proving a non-recipient sees nothing.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');
	const activeSceneId = $derived(runtime.state.session.activeSceneId);

	// The recipients available to deliver to: every non-DM participant.
	const recipients = $derived(runtime.actors.filter((a) => a.role !== 'dm'));

	// Every handout the ACTIVE actor may see, resolved through the actor-filtered read.
	const handoutIds = $derived(Object.keys(runtime.state.session.handouts));
	const visibleHandouts = $derived(
		handoutIds
			.map((id) => getHandoutForActor(runtime.state.session, runtime.state.permissions, runtime.activeActorId, id))
			.filter((result) => result.kind === 'available'),
	);
	const deliveryHistory = $derived(
		getHandoutDeliveryHistory(runtime.state.session, runtime.state.permissions, runtime.activeActorId),
	);

	let error = $state<string | null>(null);
	let title = $state('The cryptic letter');
	let openingBody = $state('You find a sealed letter on the dead courier.');
	let cipherBody = $state('XJQ ZTP RVL — the cipher is unsolved.');
	let selectedRecipients = $state<string[]>([]);
	let revealCipher = $state(false);

	const OPENING_SECTION = 'handout-section-opening';
	const CIPHER_SECTION = 'handout-section-cipher';

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	function toggleRecipient(id: string): void {
		selectedRecipients = selectedRecipients.includes(id)
			? selectedRecipients.filter((r) => r !== id)
			: [...selectedRecipients, id];
	}

	async function deliver(): Promise<void> {
		if (!activeSceneId) {
			error = 'No active Scene to deliver onto.';
			return;
		}
		if (selectedRecipients.length === 0) {
			error = 'Select at least one recipient.';
			return;
		}
		await dispatch({
			type: 'session.deliver-handout',
			actorId: runtime.activeActorId,
			payload: {
				title: title.trim() || 'Handout',
				sceneId: activeSceneId,
				recipientActorIds: selectedRecipients,
				sections: [
					{ id: OPENING_SECTION, heading: 'Opening', body: openingBody, visibility: 'player-visible' },
					{ id: CIPHER_SECTION, heading: 'Cipher', body: cipherBody, visibility: 'shared' },
				],
				revealedSectionIds: revealCipher ? [CIPHER_SECTION] : [],
			},
		});
	}

	async function reveal(handoutId: string, sectionId: string, revealed: boolean): Promise<void> {
		await dispatch({
			type: 'session.reveal-handout-section',
			actorId: runtime.activeActorId,
			payload: { handoutId, sectionId, revealed },
		});
	}
</script>

<section data-testid="handout-delivery" aria-label="Handout delivery">
	<h2>Handouts</h2>

	{#if error}
		<p class="error" role="alert" data-testid="handout-error">{error}</p>
	{/if}

	{#if !sessionActive}
		<p class="meta" data-testid="handout-needs-active-session">
			Handouts are delivered while the session is active. Start the session from the Command Center
			first.
		</p>
	{/if}

	{#if isDm}
		<form
			class="deliver-form"
			data-testid="handout-deliver-form"
			onsubmit={(event) => {
				event.preventDefault();
				void deliver();
			}}
		>
			<label for="handout-title">Title</label>
			<input id="handout-title" data-testid="handout-title" bind:value={title} />

			<label for="handout-opening">Opening (player-visible)</label>
			<textarea id="handout-opening" data-testid="handout-opening" bind:value={openingBody}></textarea>

			<label for="handout-cipher">Cipher (shared, optional reveal)</label>
			<textarea id="handout-cipher" data-testid="handout-cipher" bind:value={cipherBody}></textarea>

			<fieldset data-testid="handout-recipients">
				<legend>Recipients</legend>
				{#each recipients as recipient (recipient.id)}
					<label class="recipient">
						<input
							type="checkbox"
							data-testid={`handout-recipient-${recipient.id}`}
							checked={selectedRecipients.includes(recipient.id)}
							onchange={() => toggleRecipient(recipient.id)}
						/>
						{recipient.displayName}
					</label>
				{/each}
			</fieldset>

			<label class="reveal">
				<input type="checkbox" data-testid="handout-reveal-cipher" bind:checked={revealCipher} />
				Reveal the cipher section on delivery
			</label>

			<button type="submit" data-testid="deliver-handout" disabled={!sessionActive}>
				Deliver handout
			</button>
		</form>

		<section class="delivery-history" data-testid="handout-delivery-history" aria-label="Delivery history">
			<h3>Delivery history</h3>
			{#if deliveryHistory.length === 0}
				<p class="meta" data-testid="handout-history-empty">No handouts delivered yet.</p>
			{:else}
				<ul>
					{#each deliveryHistory as row (row.delivery.id)}
						<li data-testid="handout-history-row">
							{row.handoutTitle} → {row.delivery.recipientActorId} ({row.delivery.deliveryStatus})
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<section class="received" data-testid="handouts-received" aria-label="Received handouts">
		<h3>Received handouts</h3>
		{#if visibleHandouts.length === 0}
			<p class="meta" data-testid="handouts-received-empty">No handouts for this participant.</p>
		{:else}
			<ul>
				{#each visibleHandouts as handout (handout.id)}
					{#if handout.kind === 'available'}
						<li class="handout" data-testid={`handout-${handout.id}`}>
							<h4 data-testid="handout-card-title">{handout.title}</h4>
							{#each handout.sections as section (section.id)}
								<div class="section" data-testid={`handout-section-${section.id}`}>
									<strong>{section.heading}</strong>
									<p data-testid="handout-section-body">{section.body}</p>
									{#if isDm}
										<button
											type="button"
											data-testid={`reveal-${handout.id}-${section.id}`}
											onclick={() => void reveal(handout.id, section.id, !section.revealed)}
										>
											{section.revealed ? 'Conceal' : 'Reveal'}
										</button>
									{/if}
								</div>
							{/each}
						</li>
					{/if}
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
	.deliver-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
		margin-bottom: var(--space-2, 0.5rem);
	}
	.recipient,
	.reveal {
		display: flex;
		gap: var(--space-1, 0.25rem);
		align-items: center;
	}
	.handout {
		border: 1px solid var(--color-border, #ddd);
		border-radius: var(--radius-1, 0.25rem);
		padding: var(--space-2, 0.5rem);
		margin-bottom: var(--space-1, 0.25rem);
	}
	.received ul,
	.delivery-history ul {
		list-style: none;
		padding: 0;
	}
</style>
