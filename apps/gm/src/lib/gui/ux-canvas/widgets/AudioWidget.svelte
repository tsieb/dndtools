<script lang="ts">
	/**
	 * Audio widget (built-in renderer). A READ-ONLY ambience glance: it shows how this widget is
	 * configured (loop vs play-once) and points into the session audio tools, where playback is
	 * actually started and controlled. It deliberately renders no play/pause affordance and no
	 * "playing" animation — there is no on-canvas playback state here, so showing one would be
	 * dishonest feedback. Playback orchestration lives entirely on the session surface.
	 */
	import type { WidgetDefinition, WidgetInstance } from '@dndtools/core';

	interface Props {
		definition: WidgetDefinition;
		widget?: WidgetInstance | null;
		config: Record<string, unknown>;
	}
	const { config }: Props = $props();

	const loop = $derived(config.loop !== false);
</script>

<div class="audio-widget" data-widget-builtin="audio">
	<div class="audio-status" data-testid="widget-audio-toggle">
		<span class="audio-label">Ambience</span>
		<span class="audio-meta">{loop ? 'Set to loop' : 'Set to play once'}</span>
	</div>
	<p class="audio-note">Start and control playback in the session audio tools.</p>
	<a class="audio-launch" href="/session/" data-testid="widget-audio-launch">Audio tools →</a>
</div>

<style>
	.audio-widget {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		height: 100%;
		color: var(--widget-text, var(--color-text-primary));
	}
	.audio-status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		background: color-mix(in srgb, var(--widget-accent, var(--color-accent)) 10%, transparent);
		border-radius: var(--radius-sm);
	}
	.audio-label {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
	}
	.audio-meta {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.audio-note {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.audio-launch {
		margin-top: auto;
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		font-size: var(--text-sm);
		color: var(--widget-accent, var(--color-text-link));
		text-decoration: none;
	}
	.audio-launch:hover {
		text-decoration: underline;
	}
</style>
