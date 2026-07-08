<script lang="ts">
	import type { CommandCenterHomeView, WidgetBindingPayload } from '@dndtools/core';
	import SessionStatusStrip from './SessionStatusStrip.svelte';

	/**
	 * UX-CMD-012 — the role-appropriate controlled home for a player or observer. The `/` route renders
	 * THIS instead of the DM dashboard whenever the active actor is not a DM.
	 *
	 * It is built ENTIRELY from the viewer-gated {@link CommandCenterHomeView} participant payload: the
	 * player-safe status strip + the participant's OWN assigned scene (already visibility-filtered by the
	 * Processing Core). No DM dashboard, no presets, no widget library, no player-view controller, and no
	 * DM-only content/title/count is ever in this tree — the DM dashboard is a different component
	 * entirely (anti-pattern 10.7). An Observer additionally renders read-only with an "Observer mode"
	 * label and no personal toolbar.
	 */
	interface Props {
		view: Extract<CommandCenterHomeView, { kind: 'participant' }>;
	}

	let { view }: Props = $props();

	const roleLabel = $derived(view.role === 'observer' ? 'Observer' : 'Player');

	type LiveWidget = Extract<WidgetBindingPayload, { kind: 'available' | 'degraded' }>;
	// Render only the widgets the Processing Core delivered to this participant (player-view filtered).
	const widgets = $derived<LiveWidget[]>(
		view.playerView.kind === 'assigned'
			? view.playerView.widgets.filter(
					(widget): widget is LiveWidget =>
						widget.kind === 'available' || widget.kind === 'degraded',
				)
			: [],
	);

	function widgetLabel(type: string): string {
		return type.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
	}
</script>

<section
	class="cc-participant-home"
	data-testid="cc-participant-home"
	data-role={view.role}
	aria-label={view.observerMode ? 'Observer home' : 'Player home'}
>
	<header class="cc-participant-header">
		<div class="cc-participant-identity">
			<strong>{view.displayName}</strong>
			<span class="cc-participant-role" data-testid="cc-participant-role">{roleLabel}</span>
			{#if view.observerMode}
				<span class="cc-observer-badge" data-testid="cc-observer-badge">Observer mode</span>
			{/if}
		</div>
		<p class="meta">
			{view.observerMode
				? 'A read-only view of what the Dungeon Master is sharing.'
				: 'Your personal table view, shared by the Dungeon Master.'}
		</p>
	</header>

	<SessionStatusStrip strip={view.statusStrip} />

	{#if !view.observerMode}
		<!-- UX-CMD-012: a slim personal toolbar for players (never DM controls). Observers get none. -->
		<nav class="cc-participant-toolbar" data-testid="cc-participant-toolbar" aria-label="Player tools">
			<a class="button secondary" href="characters/" data-testid="cc-participant-characters">
				My characters
			</a>
		</nav>
	{/if}

	<section
		class="cc-player-canvas"
		data-testid="cc-player-canvas"
		aria-label={view.observerMode ? 'Observer canvas (read-only)' : 'Player canvas'}
		data-readonly={view.readOnly ? 'true' : undefined}
	>
		{#if view.playerView.kind === 'assigned'}
			<h2 class="cc-player-scene-name" data-testid="cc-player-scene-name">
				{view.playerView.name}
			</h2>
			<p class="meta">
				{view.playerView.deliveryStatus}
				{#if view.playerView.deliveryReason === 'offline'}• offline{/if}
			</p>
			{#if widgets.length > 0}
				<ul class="cc-player-widgets" data-testid="cc-player-widgets">
					{#each widgets as payload (payload.widget.id)}
						<li class="cc-player-widget" data-testid={`cc-player-widget-${payload.widget.type}`}>
							<strong>{widgetLabel(payload.widget.type)}</strong>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="meta" data-testid="cc-player-empty">
					The Dungeon Master has not shared any tools on this view yet.
				</p>
			{/if}
		{:else if view.playerView.kind === 'unassigned'}
			<div class="cc-player-waiting" data-testid="cc-player-waiting">
				<strong>Waiting for the Dungeon Master</strong>
				<p class="meta">You will see the shared scene here as soon as it is assigned to you.</p>
			</div>
		{:else}
			<p class="meta" role="status" data-testid="cc-player-unavailable">
				No shared view is available right now.
			</p>
		{/if}
	</section>
</section>

<style>
	.cc-participant-home {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.cc-participant-identity {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.cc-participant-role {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.cc-observer-badge {
		display: inline-flex;
		align-items: center;
		padding: var(--space-0-5) var(--space-2);
		border-radius: var(--radius-full, 999px);
		font-size: var(--text-xs);
		font-weight: 600;
		background: var(--color-status-info-subtle);
		color: var(--color-status-info-text);
		border: 1px solid var(--color-status-info);
	}

	.cc-participant-toolbar {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.cc-player-canvas {
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		min-height: 160px;
	}

	.cc-player-scene-name {
		margin: 0 0 var(--space-1);
		font-size: var(--text-lg);
	}

	.cc-player-widgets {
		list-style: none;
		margin: var(--space-3) 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: var(--space-2);
	}

	.cc-player-widget {
		padding: var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.cc-player-waiting {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: flex-start;
	}
</style>
