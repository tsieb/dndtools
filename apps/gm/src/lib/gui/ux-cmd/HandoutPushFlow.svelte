<script lang="ts">
	import {
		listPushableContent,
		resolvePushHandoutCommand,
		type PushableContentItem,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';

	/**
	 * UX-CMD-006 — the "Push handout to players" flow: content → recipients → CONFIRMATION → deliver.
	 *
	 * Safety properties, all decided in the Processing Core:
	 *   - The content selector lists ONLY {@link listPushableContent} (player-visible items;
	 *     a dm-only note is structurally absent — AC4, never a cosmetic filter).
	 *   - Nothing is delivered before the explicit confirmation step that names the content and every
	 *     recipient (AC2/AC3 + §10 "the confirmation is a safety gate, not UX comfort"). Cancel at any
	 *     step delivers nothing.
	 *   - The confirmed push dispatches the exact `session.deliver-handout` command from
	 *     {@link resolvePushHandoutCommand} — the same validated path the handout surface and the
	 *     command palette use (UX-CMD-011 parity).
	 */
	interface Props {
		open: boolean;
		/** Pre-selected recipient (the participant row's push button); `null` starts unselected. */
		initialRecipientId?: string | null;
		onclose?: () => void;
	}

	let { open = $bindable(), initialRecipientId = null, onclose }: Props = $props();

	const runtime = useRuntime();
	const announcer = useLiveAnnouncer();

	let step = $state<'content' | 'recipients' | 'confirm'>('content');
	let search = $state('');
	let selectedItem = $state<PushableContentItem | null>(null);
	let selectedRecipientIds = $state<string[]>([]);
	let pushing = $state(false);
	let status = $state<string | null>(null);

	// Default-deny: only the Core-cleared pushable items ever reach this list (AC4).
	const pushable = $derived(listPushableContent(runtime.state, runtime.activeActorId));
	const filtered = $derived(
		pushable.filter((item) => item.title.toLowerCase().includes(search.trim().toLowerCase())),
	);
	const recipients = $derived(runtime.actors.filter((actor) => actor.role !== 'dm'));
	const allSelected = $derived(
		recipients.length > 0 && recipients.every((r) => selectedRecipientIds.includes(r.id)),
	);
	const selectedNames = $derived(
		recipients
			.filter((r) => selectedRecipientIds.includes(r.id))
			.map((r) => r.displayName)
			.join(', '),
	);
	const sessionActive = $derived(runtime.state.session.workflow === 'active');
	const deliverySceneId = $derived(
		runtime.state.session.activeSceneId ?? runtime.state.commandCenter.homeSceneId,
	);

	// Reset to a clean step-1 every time the flow opens (a stale selection must never be pushable).
	$effect(() => {
		if (!open) return;
		step = 'content';
		search = '';
		selectedItem = null;
		selectedRecipientIds = initialRecipientId ? [initialRecipientId] : [];
		status = null;
	});

	function chooseItem(item: PushableContentItem): void {
		selectedItem = item;
		step = 'recipients';
	}

	function toggleRecipient(id: string): void {
		selectedRecipientIds = selectedRecipientIds.includes(id)
			? selectedRecipientIds.filter((r) => r !== id)
			: [...selectedRecipientIds, id];
	}

	function toggleAll(): void {
		selectedRecipientIds = allSelected ? [] : recipients.map((r) => r.id);
	}

	function cancel(): void {
		// AC3: cancelling at ANY step delivers nothing — the dialog just closes.
		open = false;
		onclose?.();
	}

	async function pushNow(): Promise<void> {
		const item = selectedItem;
		if (!item || pushing) return;
		const command = resolvePushHandoutCommand(item, selectedRecipientIds, deliverySceneId ?? '');
		if (!command) return;
		pushing = true;
		try {
			const result = await runtime.dispatch({ ...command, actorId: runtime.activeActorId });
			if (result.status === 'accepted') {
				const count = selectedRecipientIds.length;
				const message = `Handout delivered to ${count} player${count === 1 ? '' : 's'}.`;
				status = message;
				announcer?.announce(message, 'polite');
				open = false;
				onclose?.();
			} else {
				status = result.rejection.message;
				announcer?.announce('Delivery failed — try again.', 'assertive');
			}
		} finally {
			pushing = false;
		}
	}
</script>

<Dialog bind:open title="Push handout to players" testid="cc-push-dialog" {onclose}>
	<div class="push-flow">
		{#if step === 'content'}
			<section aria-label="Choose content to push">
				<label class="push-search">
					<span class="visually-hidden">Search pushable content</span>
					<input
						data-testid="cc-push-search"
						bind:value={search}
						placeholder="Search content…"
						autocomplete="off"
					/>
				</label>
				<ul class="push-content-list" data-testid="cc-push-content-list">
					{#each filtered as item (item.id)}
						<li>
							<button
								type="button"
								data-testid={`cc-push-content-${item.id}`}
								onclick={() => chooseItem(item)}
							>
								<strong>{item.title}</strong>
								<span class="meta">{item.kind}</span>
							</button>
						</li>
					{/each}
					{#if filtered.length === 0}
						<li class="meta" data-testid="cc-push-content-empty">
							No player-visible content to push. Hidden (DM-only) content is never pushable.
						</li>
					{/if}
				</ul>
			</section>
		{:else if step === 'recipients' && selectedItem}
			<section aria-label="Choose recipients">
				<p class="meta">Pushing <strong>{selectedItem.title}</strong> ({selectedItem.kind})</p>
				<label class="push-recipient">
					<input
						type="checkbox"
						data-testid="cc-push-all-players"
						checked={allSelected}
						onchange={toggleAll}
					/>
					<span>All players</span>
				</label>
				<ul class="push-recipient-list" data-testid="cc-push-recipient-list">
					{#each recipients as recipient (recipient.id)}
						<li>
							<label class="push-recipient">
								<input
									type="checkbox"
									data-testid={`cc-push-recipient-${recipient.id}`}
									checked={selectedRecipientIds.includes(recipient.id)}
									onchange={() => toggleRecipient(recipient.id)}
								/>
								<span>{recipient.displayName} <span class="meta">{recipient.role}</span></span>
							</label>
						</li>
					{/each}
				</ul>
				<div class="push-actions">
					<button type="button" data-testid="cc-push-back" onclick={() => (step = 'content')}>
						Back
					</button>
					<button
						type="button"
						class="button"
						data-testid="cc-push-review"
						disabled={selectedRecipientIds.length === 0}
						onclick={() => (step = 'confirm')}
					>
						Review push
					</button>
				</div>
			</section>
		{:else if step === 'confirm' && selectedItem}
			<!-- The safety gate (AC2/AC3): names the content AND the recipients before anything moves. -->
			<section aria-label="Confirm push" data-testid="cc-push-confirm">
				<p>
					<strong data-testid="cc-push-confirm-content">{selectedItem.title}</strong>
					({selectedItem.kind}) will appear on
					<strong data-testid="cc-push-confirm-recipients">{selectedNames}</strong>'s canvas. They
					will see it immediately.
				</p>
				{#if !sessionActive}
					<p class="meta" role="status" data-testid="cc-push-inactive">
						The session is not active — start the session to deliver handouts.
					</p>
				{/if}
				<div class="push-actions">
					<button type="button" data-testid="cc-push-cancel" onclick={cancel}>Cancel</button>
					<button
						type="button"
						class="button"
						data-testid="cc-push-now"
						disabled={pushing || !sessionActive || !deliverySceneId}
						onclick={pushNow}
					>
						Push now
					</button>
				</div>
			</section>
		{/if}

		{#if status}
			<p class="meta" role="status" data-testid="cc-push-status">{status}</p>
		{/if}
	</div>
</Dialog>

<style>
	.push-flow {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: min(80vw, 420px);
	}

	.push-search input {
		width: 100%;
	}

	.push-content-list,
	.push-recipient-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: var(--space-2) 0 0;
		padding: 0;
		list-style: none;
		max-height: 40vh;
		overflow: auto;
	}

	.push-content-list button {
		display: flex;
		width: 100%;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
		text-align: left;
	}

	.push-recipient {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) 0;
	}

	.push-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
</style>
