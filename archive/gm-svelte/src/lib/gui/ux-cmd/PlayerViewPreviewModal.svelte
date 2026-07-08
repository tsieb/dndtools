<script lang="ts">
	import { untrack } from 'svelte';
	import { getPlayerViewForActor, type WidgetBindingPayload } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';

	/**
	 * UX-CMD-005 — the DM-only player-view preview modal. Renders exactly what the selected
	 * participant currently sees by querying {@link getPlayerViewForActor} with the PARTICIPANT'S
	 * actor id — the SAME actor-filtered Processing-Core read model the real player home renders from
	 * (never a cosmetic filter), so a hidden layer/widget/scene that the Core withholds from the
	 * player is structurally absent from this preview too (AC1). An unassigned participant shows
	 * "No scene assigned", never a blank frame (AC3). The shared Dialog primitive provides the focus
	 * trap, Escape-to-close, and focus restoration to the eye button that opened it (AC2).
	 */
	interface Props {
		open: boolean;
		actorId: string;
		displayName: string;
		onclose?: () => void;
	}

	let { open = $bindable(), actorId, displayName, onclose }: Props = $props();

	const runtime = useRuntime();
	const announcer = useLiveAnnouncer();

	// The participant's OWN view, via the identical core query the participant home uses (no-leak by
	// construction: only content the Core already cleared for THIS participant can appear here).
	const playerView = $derived(
		getPlayerViewForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			runtime.state.session,
			actorId,
			{ widgetPackages: runtime.state.widgets },
		),
	);

	type LiveWidget = Extract<WidgetBindingPayload, { kind: 'available' | 'degraded' }>;
	const widgets = $derived.by<LiveWidget[]>(() => {
		const view = playerView;
		if (view.kind !== 'assigned') return [];
		return view.widgets.filter(
			(widget): widget is LiveWidget => widget.kind === 'available' || widget.kind === 'degraded',
		);
	});

	function widgetLabel(type: string): string {
		return type.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
	}

	// Announce the DM-only framing when the preview opens (UX-CMD-005 §accessibility). `untrack`
	// the call: announce() reads its own live-region state, and tracking that read would re-run
	// (and loop) this effect on every announcement.
	$effect(() => {
		if (!open) return;
		const message = `Preview of ${displayName}'s view. This is not visible to the player.`;
		untrack(() => announcer?.announce(message, 'assertive'));
	});
</script>

<Dialog bind:open title={`Preview: ${displayName}'s view`} testid="cc-preview-modal" {onclose}>
	<div class="preview-body">
		<p class="preview-banner" data-testid="cc-preview-banner">
			DM preview — players cannot see this preview.
		</p>

		{#if playerView.kind === 'assigned'}
			<h3 class="preview-scene-name" data-testid="cc-preview-scene-name">{playerView.name}</h3>
			<p class="meta" data-testid="cc-preview-delivery">
				{playerView.deliveryStatus}
				{#if playerView.deliveryReason === 'offline'}• offline — showing the queued assignment{/if}
			</p>
			{#if widgets.length > 0}
				<ul class="preview-widgets" data-testid="cc-preview-widgets">
					{#each widgets as payload (payload.widget.id)}
						<li data-testid={`cc-preview-widget-${payload.widget.type}`}>
							{widgetLabel(payload.widget.type)}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="meta" data-testid="cc-preview-no-widgets">
					No tools are shared on this view yet.
				</p>
			{/if}
		{:else if playerView.kind === 'unassigned'}
			<!-- AC3: never a blank frame. -->
			<div class="preview-unassigned" data-testid="cc-preview-unassigned">
				<strong>No scene assigned</strong>
				<p class="meta">{displayName} sees the waiting screen.</p>
			</div>
		{:else}
			<p class="meta" role="status" data-testid="cc-preview-unavailable">
				This participant's view is unavailable.
			</p>
		{/if}
	</div>
</Dialog>

<style>
	.preview-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: min(60vw, 480px);
	}

	.preview-banner {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 600;
		/* DM-only marker tokens: this surface exists only in the DM's shell. */
		background: var(--color-dm-only-subtle);
		color: var(--color-dm-only-badge);
		border: 1px solid var(--color-dm-only-badge);
	}

	.preview-scene-name {
		margin: 0;
	}

	.preview-widgets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.preview-widgets li {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.preview-unassigned {
		padding: var(--space-4);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
	}
</style>
