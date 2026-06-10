<script lang="ts">
	import {
		EMPTY_WIDGET_DATA_ENVIRONMENT,
		getPlayerViewForActor,
		observerAccessSummary,
		playerCanEditPlayerView,
		type WidgetBindingPayload,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// COLLAB-005 / COLLAB-011: the PARTICIPANT-facing PLAYER VIEW + OBSERVER ACCESS surface. The DM controls
	// DIFFERENT player-view assignments for different players during one session (COLLAB-005); each
	// participant sees ONLY their own assigned subset, computed by the Processing Core actor-filtered read.
	// Observers join as READ-ONLY participants with access only to explicitly shared scenes/maps/placeholders,
	// no character data, and no write controls (COLLAB-011) — so for an observer this surface renders the
	// read-only visible scene list and never any write affordance. All filtering happens in the core; the GUI
	// renders the computed view models only (Contract 1). This surface is PARTICIPANT-ONLY (a player/observer
	// surface) — the DM controls player views from the Scene editor, not here.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isPlayer = $derived(actor?.role === 'player');
	const isObserver = $derived(actor?.role === 'observer');
	const isParticipant = $derived(isPlayer || isObserver);

	// COLLAB-005: the participant's OWN filtered player view (assigned subset only, hidden bindings omitted).
	const playerView = $derived(
		actor
			? getPlayerViewForActor(
					runtime.state.scenes,
					runtime.state.permissions,
					runtime.state.session,
					actor.id,
					{ widgetPackages: runtime.state.widgets, dataEnvironment: EMPTY_WIDGET_DATA_ENVIRONMENT },
				)
			: null,
	);

	// COLLAB-005 AC2: whether this participant may edit widgets on their player view (scene `co-editor`).
	// For a player without the grant — and for an observer always — this is false, so the GUI shows the
	// view as read-only. The Processing Core remains the enforcement point.
	const canEdit = $derived(
		actor && playerView && playerView.kind === 'assigned'
			? playerCanEditPlayerView(runtime.state.permissions, actor.id, playerView.id)
			: false,
	);

	// COLLAB-011: the observer's READ-ONLY access summary (visible scene list, no character data).
	const observerAccess = $derived(
		isObserver && actor
			? observerAccessSummary(
					runtime.state.scenes,
					runtime.state.permissions,
					runtime.state.session,
					actor.id,
				)
			: null,
	);

	function widgetLabel(payload: WidgetBindingPayload): string {
		if (payload.kind === 'available' || payload.kind === 'degraded') return payload.widget.type;
		return `${payload.type}: ${payload.kind}`;
	}
</script>

{#if isParticipant && actor}
	<section data-testid="player-view-access" aria-label="Your player view and access">
		<h2>Your view</h2>

		{#if isObserver}
			<p class="meta" data-testid="observer-readonly-note">
				You are an observer: read-only access to shared scenes only. No character data and no controls.
			</p>
		{:else}
			<p class="meta">
				The DM controls what you see. You see only the scenes and widgets projected to you.
			</p>
		{/if}

		<!-- COLLAB-005: the participant's own projected player view (assigned subset only). -->
		{#if playerView}
			{#if playerView.kind === 'unassigned'}
				<p class="meta" data-testid="player-view-none">No active player view.</p>
			{:else if playerView.kind === 'denied'}
				<p class="error" role="alert" data-testid="player-view-denied">
					Player view unavailable: {playerView.reason}
				</p>
			{:else}
				<div class="view-card" data-testid="player-view-assigned">
					<div class="meta">
						{playerView.projectionKind} • {playerView.deliveryStatus}
						{#if playerView.deliveryReason === 'offline'}• offline{/if}
						• {playerView.widgets.length} widget{playerView.widgets.length === 1 ? '' : 's'}
						• {canEdit ? 'editable' : 'read-only'}
					</div>
					<ul class="widget-list" data-testid="player-view-widgets">
						{#each playerView.widgets as payload (payload.kind === 'available' || payload.kind === 'degraded' ? payload.widget.id : payload.widgetInstanceId)}
							<li data-testid={`player-view-widget-${payload.kind}`}>{widgetLabel(payload)}</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}

		<!-- COLLAB-011: the observer's read-only visible scene list (excludes dm-only / private / character). -->
		{#if observerAccess && observerAccess.kind === 'available'}
			<section aria-label="Shared scenes you can view">
				<h3>Shared scenes ({observerAccess.visibleScenes.length})</h3>
				{#if observerAccess.visibleScenes.length === 0}
					<p class="meta" data-testid="observer-scenes-empty">No scenes have been shared with you.</p>
				{:else}
					<ul class="scene-list" data-testid="observer-visible-scenes">
						{#each observerAccess.visibleScenes as scene (scene.id)}
							<li data-testid={`observer-scene-${scene.id}`}>
								{scene.name}
								<span class="meta">· {scene.visibility} · {scene.widgetCount} widget(s)</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	</section>
{/if}

<style>
	.error {
		color: var(--color-danger, #b00020);
	}
	.meta {
		color: var(--color-text-muted, #666);
	}
	.view-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
		border: 1px solid var(--color-border, #ddd);
		border-radius: var(--radius-1, 0.25rem);
		padding: var(--space-2, 0.5rem);
		margin: var(--space-1, 0.25rem) 0;
	}
	.widget-list,
	.scene-list {
		margin: 0;
		padding-left: var(--space-3, 1rem);
	}
</style>
