<script lang="ts">
	import { previewBannerText } from './player-view-preview';

	/**
	 * Player-view preview banner (UX-CANVAS-011 §Player-view preview). A persistent, high-visibility
	 * `role="alert"` banner shown while the DM previews the canvas as a player would see it: it names the
	 * previewed player, lets the DM switch which player to preview, and offers an explicit exit (Shift+P or
	 * Esc also exit, handled by the canvas key model). Preview is read-only and renders only the
	 * already-loaded, actor-filtered widgets — it is the SAME boundary the real player canvas uses.
	 */
	interface Props {
		playerLabel: string;
		players: ReadonlyArray<{ id: string; label: string }>;
		selectedPlayerId: string;
		onselect: (id: string) => void;
		onexit: () => void;
	}

	let { playerLabel, players, selectedPlayerId, onselect, onexit }: Props = $props();
</script>

<div class="preview-banner" role="alert" data-testid="player-view-preview-banner">
	<span class="preview-text">{previewBannerText(playerLabel)}</span>
	<label class="preview-player">
		<span class="sr-only">Preview as player</span>
		<select
			data-testid="preview-player-select"
			value={selectedPlayerId}
			onchange={(e) => onselect(e.currentTarget.value)}
		>
			{#each players as player (player.id)}
				<option value={player.id}>{player.label}</option>
			{/each}
		</select>
	</label>
	<button type="button" class="preview-exit" data-testid="preview-exit" onclick={onexit}>
		Exit preview
	</button>
</div>

<style>
	.preview-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		margin-bottom: var(--space-2);
		background: var(--color-status-warning-subtle);
		border: 2px solid var(--color-status-warning);
		border-radius: var(--radius-md);
		color: var(--color-status-warning-text);
		font-weight: var(--font-weight-semibold);
	}
	.preview-text {
		flex: 1;
		font-size: var(--text-sm);
		letter-spacing: var(--tracking-wide);
	}
	.preview-player select {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-1);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
	}
	.preview-exit {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-2);
		border: 1px solid var(--color-status-warning);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
		cursor: pointer;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
