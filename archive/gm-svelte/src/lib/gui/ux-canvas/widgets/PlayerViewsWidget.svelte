<script lang="ts">
	/**
	 * Player Views Command Center widget: per-participant Player View assignment, projection, revoke,
	 * preview, and push-handout. Self-contained for data (the DM-only player-view controller read
	 * model) and dispatch; the preview + push flows are route-owned modals reached via context.
	 */
	import { getPlayerViewController } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useCommandCenter } from './command-center-context';

	const runtime = useRuntime();
	const { openPush, openPreview } = useCommandCenter();

	const playerViewController = $derived(
		getPlayerViewController(runtime.state, runtime.defaultActorId),
	);
	const playerViewSceneOptions = $derived(
		playerViewController.kind === 'available' ? playerViewController.sceneOptions : [],
	);

	let playerViewSceneSelections = $state<Record<string, string>>({});
	let playerViewStatus = $state<string | null>(null);

	function selectedPlayerViewSceneId(actorId: string, assignedSceneId: string | null): string {
		return (
			playerViewSceneSelections[actorId] ?? assignedSceneId ?? playerViewSceneOptions[0]?.id ?? ''
		);
	}
	function selectPlayerViewScene(actorId: string, sceneId: string) {
		playerViewSceneSelections = { ...playerViewSceneSelections, [actorId]: sceneId };
	}

	async function assignPlayerView(actorId: string, connectionState: 'connected' | 'offline') {
		const participant =
			playerViewController.kind === 'available'
				? playerViewController.participants.find((entry) => entry.actorId === actorId)
				: null;
		const sceneId = selectedPlayerViewSceneId(actorId, participant?.assignment?.sceneId ?? null);
		if (!sceneId) return;
		const result = await runtime.dispatch({
			type: 'session.project-player-view',
			actorId: runtime.defaultActorId,
			payload: {
				playerActorIds: [actorId],
				connectionState,
				target: {
					kind: 'scene',
					sceneId,
					sectionIds: null,
					widgetInstanceIds: null,
					displayState: null,
					mapRegion: null,
				},
			},
		});
		playerViewStatus =
			result.status === 'accepted'
				? connectionState === 'offline'
					? 'Player View assignment queued.'
					: 'Player View assignment delivered.'
				: result.rejection.message;
	}

	async function revokeCommandCenterPlayerView(actorId: string) {
		const result = await runtime.dispatch({
			type: 'session.revoke-player-view',
			actorId: runtime.defaultActorId,
			payload: { playerActorIds: [actorId] },
		});
		playerViewStatus =
			result.status === 'accepted' ? 'Player View assignment revoked.' : result.rejection.message;
	}
</script>

<section aria-label="Player View controller" data-testid="cc-player-view-controller">
	<h3>Player views</h3>
	<div class="row-actions">
		<button type="button" class="secondary" data-testid="cc-push-open" onclick={() => openPush(null)}>
			Push handout…
		</button>
	</div>
	{#if playerViewController.kind === 'denied'}
		<p class="error" role="alert" data-testid="cc-player-view-denied">
			Player View controller unavailable: {playerViewController.reason}
		</p>
	{:else}
		<div class="player-view-controller">
			{#each playerViewController.participants as participant (participant.actorId)}
				{@const assignment = participant.assignment}
				{@const selectedSceneId = selectedPlayerViewSceneId(
					participant.actorId,
					assignment?.sceneId ?? null,
				)}
				<article class="player-view-row" data-testid={`cc-player-view-row-${participant.actorId}`}>
					<div>
						<strong>{participant.displayName}</strong>
						<span class="meta"> {participant.role}</span>
						<div class="meta" data-testid={`cc-player-view-assignment-${participant.actorId}`}>
							{#if assignment}
								{#if assignment.kind === 'missing-scene'}
									Missing Scene {assignment.sceneId} • {assignment.deliveryStatus}
								{:else}
									{assignment.sceneName} • {assignment.projectionKind} •
									{assignment.deliveryStatus}
									{#if assignment.deliveryReason === 'offline'}• offline{/if}
									• {assignment.projectedWidgetCount ?? 0} widget{assignment.projectedWidgetCount ===
									1
										? ''
										: 's'}
								{/if}
							{:else}
								No assignment
							{/if}
						</div>
					</div>
					<div class="player-view-actions">
						<label>
							<span>Scene</span>
							<select
								data-testid={`cc-player-view-scene-${participant.actorId}`}
								value={selectedSceneId}
								disabled={playerViewSceneOptions.length === 0}
								onchange={(event) =>
									selectPlayerViewScene(participant.actorId, event.currentTarget.value)}
							>
								{#each playerViewSceneOptions as scene (scene.id)}
									<option value={scene.id}>
										{scene.name} ({scene.widgetCount})
									</option>
								{/each}
							</select>
						</label>
						<div class="row-actions">
							<button
								type="button"
								data-testid={`cc-player-view-deliver-${participant.actorId}`}
								disabled={!selectedSceneId}
								onclick={() => assignPlayerView(participant.actorId, 'connected')}
							>
								Deliver
							</button>
							<button
								type="button"
								data-testid={`cc-player-view-queue-${participant.actorId}`}
								disabled={!selectedSceneId}
								onclick={() => assignPlayerView(participant.actorId, 'offline')}
							>
								Queue
							</button>
							<button
								type="button"
								data-testid={`cc-player-view-revoke-${participant.actorId}`}
								disabled={!assignment}
								onclick={() => revokeCommandCenterPlayerView(participant.actorId)}
							>
								Revoke
							</button>
							<button
								type="button"
								data-testid={`cc-player-view-preview-${participant.actorId}`}
								aria-label={`Preview ${participant.displayName}'s view`}
								onclick={() => openPreview(participant.actorId, participant.displayName)}
							>
								Preview
							</button>
							<button
								type="button"
								data-testid={`cc-player-view-push-${participant.actorId}`}
								aria-label={`Push handout to ${participant.displayName}`}
								onclick={() => openPush(participant.actorId)}
							>
								Push handout
							</button>
						</div>
					</div>
				</article>
			{/each}
			{#if playerViewController.participants.length === 0}
				<p class="meta" data-testid="cc-player-view-empty">No session participants.</p>
			{/if}
			{#if playerViewSceneOptions.length === 0}
				<p class="meta" data-testid="cc-player-view-no-scenes">No Scenes available.</p>
			{/if}
		</div>
		{#if playerViewStatus}
			<p class="meta" role="status" data-testid="cc-player-view-status">
				{playerViewStatus}
			</p>
		{/if}
	{/if}
</section>
