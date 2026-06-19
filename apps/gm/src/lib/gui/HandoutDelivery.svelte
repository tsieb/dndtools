<script lang="ts">
	import {
		getHandoutForActor,
		getHandoutDeliveryHistory,
		getHandoutStatusForDm,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// SES-004 / COLLAB-007: the DM delivers a HANDOUT as a Scene widget to SELECTED recipients with delivery
	// history, visibility enforcement (non-recipients receive nothing), optional/progressive reveal, delivery
	// ACKNOWLEDGEMENT (the recipient confirms receipt), and REVOCATION (the DM revokes → the recipient is
	// SEALED/unavailable unless persistent). The GUI only dispatches command intents and renders the
	// actor-filtered handout read model — visibility, the non-recipient non-leak, and the revoke seal are
	// enforced in the Processing Core (Contract 1 / Contract 3). The "view as" header control re-renders the
	// read against another actor, proving a non-recipient (and a sealed recipient) sees nothing.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');
	const activeSceneId = $derived(runtime.state.session.activeSceneId);

	// The recipients available to deliver to: every non-DM participant.
	const recipients = $derived(runtime.actors.filter((a) => a.role !== 'dm'));
	// COLLAB-012 — the DM-authored PLAYER GROUPS usable as delivery targets. Delivering to a group resolves
	// to its CURRENT members in the Processing Core (delivery-only; membership confers no permission).
	const groups = $derived(Object.values(runtime.state.session.playerGroups));

	// A stable, lowercased slug of a group name for test/automation hooks (display uses the real name).
	function slug(value: string): string {
		return value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

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
	// COLLAB-007 — the DM-only per-recipient delivered/opened/revoked status surface.
	const handoutStatus = $derived(
		getHandoutStatusForDm(runtime.state.session, runtime.state.permissions, runtime.activeActorId),
	);

	let error = $state<string | null>(null);
	let title = $state('The cryptic letter');
	let openingBody = $state('You find a sealed letter on the dead courier.');
	let cipherBody = $state('XJQ ZTP RVL — the cipher is unsolved.');
	let selectedRecipients = $state<string[]>([]);
	let selectedGroupIds = $state<string[]>([]);
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

	function toggleGroup(id: string): void {
		selectedGroupIds = selectedGroupIds.includes(id)
			? selectedGroupIds.filter((g) => g !== id)
			: [...selectedGroupIds, id];
	}

	async function deliver(): Promise<void> {
		if (!activeSceneId) {
			error = 'No active Scene to deliver onto.';
			return;
		}
		if (selectedRecipients.length === 0 && selectedGroupIds.length === 0) {
			error = 'Select at least one recipient or player group.';
			return;
		}
		await dispatch({
			type: 'session.deliver-handout',
			actorId: runtime.activeActorId,
			payload: {
				title: title.trim() || 'Handout',
				sceneId: activeSceneId,
				recipientActorIds: selectedRecipients,
				groupIds: selectedGroupIds,
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

	// COLLAB-007 — the RECIPIENT acknowledges receipt (the "opened" confirmation).
	async function acknowledge(handoutId: string): Promise<void> {
		await dispatch({
			type: 'session.acknowledge-handout',
			actorId: runtime.activeActorId,
			payload: { handoutId },
		});
	}

	// COLLAB-007 — the DM revokes a recipient (sealed/unavailable unless persistent).
	async function revoke(handoutId: string, recipientActorId: string): Promise<void> {
		await dispatch({
			type: 'session.revoke-handout',
			actorId: runtime.activeActorId,
			payload: { handoutId, recipientActorIds: [recipientActorId] },
		});
	}
</script>

<section class="cwrap" data-testid="handout-delivery" aria-label="Handout delivery">
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

			{#if groups.length > 0}
				<fieldset data-testid="handout-groups">
					<legend>Player groups (delivery target)</legend>
					{#each groups as group (group.id)}
						<label class="recipient">
							<input
								type="checkbox"
								data-testid={`handout-group-${slug(group.name)}`}
								checked={selectedGroupIds.includes(group.id)}
								onchange={() => toggleGroup(group.id)}
							/>
							{group.name} ({group.memberActorIds.length} member(s))
						</label>
					{/each}
				</fieldset>
			{/if}

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

		<section class="handout-status" data-testid="handout-status" aria-label="Handout recipient status">
			<h3>Recipient status</h3>
			{#if handoutStatus.length === 0}
				<p class="meta" data-testid="handout-status-empty">No handouts to track yet.</p>
			{:else}
				{#each handoutStatus as status (status.handoutId)}
					<div data-testid={`handout-status-${status.handoutId}`}>
						<strong>{status.title}</strong> <span class="meta">({status.handoutKind})</span>
						<ul>
							{#each status.recipients as recipient (recipient.recipientActorId)}
								<li data-testid={`handout-status-row-${status.handoutId}-${recipient.recipientActorId}`}>
									{recipient.recipientActorId}:
									<span data-testid="handout-status-ack"
										>{recipient.acknowledged ? 'opened' : 'delivered'}</span
									>
									{#if recipient.sealed}
										<span class="meta" data-testid="handout-status-sealed">sealed</span>
									{:else if recipient.persistent}
										<span class="meta" data-testid="handout-status-persistent">persistent</span>
									{/if}
									{#if !recipient.revoked}
										<button
											type="button"
											data-testid={`revoke-${status.handoutId}-${recipient.recipientActorId}`}
											onclick={() => void revoke(status.handoutId, recipient.recipientActorId)}
										>
											Revoke
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/each}
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
							<span class="meta" data-testid="handout-card-kind">{handout.handoutKind}</span>
							{#if !isDm && handout.isRecipient}
								{#if handout.acknowledged}
									<span class="meta" data-testid={`handout-acknowledged-${handout.id}`}>Receipt confirmed</span>
								{:else}
									<button
										type="button"
										data-testid={`acknowledge-${handout.id}`}
										onclick={() => void acknowledge(handout.id)}
									>
										Confirm receipt
									</button>
								{/if}
							{/if}
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
		color: var(--color-status-error-text);
	}
	.meta {
		color: var(--color-text-secondary);
	}
	.deliver-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
	}
	.recipient,
	.reveal {
		display: flex;
		gap: var(--space-1);
		align-items: center;
	}
	.handout {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-2);
		margin-bottom: var(--space-1);
	}
	.received ul,
	.delivery-history ul {
		list-style: none;
		padding: 0;
		margin: var(--space-1) 0 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
	}
	/* Secondary "tool" card (package Panel anatomy): one titled card; the deliver form sits inside it
	   as a sunken sub-well rather than a competing second card. */
	.cwrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.cwrap :global(h2) {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	.cwrap :global(h3) {
		margin: 0;
		font-size: var(--text-md);
	}
	.cwrap :global(form) {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: none;
	}
	.cwrap :global(label) {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.cwrap :global(input),
	.cwrap :global(select),
	.cwrap :global(textarea) {
		min-height: var(--touch-target-min);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font: inherit;
		font-weight: var(--font-weight-regular);
	}
	.cwrap :global(.received ul li),
	.cwrap :global(.delivery-history ul li),
	.cwrap :global(.handout-status ul li) {
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.cwrap :global(button) {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.cwrap :global(button[type='submit']) {
		background: var(--color-accent);
		color: var(--color-accent-foreground);
		border-color: var(--color-accent);
		font-weight: var(--font-weight-semibold);
	}
</style>
