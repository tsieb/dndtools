<script lang="ts">
	import type { Actor, PreviewSelection } from '@dndtools/core';

	/**
	 * UX-PERM-006 — the "Preview as…" launcher in the shared top bar (the session-menu entry point).
	 * A single role/player picker: "Player" (the generic zero-grant player), each connected player
	 * by name (their exact grants are emulated — AC3), and "Observer". DM-only chrome: the parent
	 * mounts it only for a DM actor and unmounts it while a preview is active (the banner owns the
	 * exit affordance). Selecting an option starts the preview through the runtime + URL.
	 */
	interface Props {
		/** The real actors of the session (used to offer specific players). */
		actors: Actor[];
		onstart: (selection: PreviewSelection) => void;
	}

	let { actors, onstart }: Props = $props();

	const players = $derived(actors.filter((actor) => actor.role === 'player'));

	function onchange(event: Event & { currentTarget: HTMLSelectElement }): void {
		const value = event.currentTarget.value;
		// Reset the select so the same option can be chosen again after exiting a preview.
		event.currentTarget.value = '';
		if (value === 'player') onstart({ role: 'player' });
		else if (value === 'observer') onstart({ role: 'observer' });
		else if (value.startsWith('player:')) {
			onstart({ role: 'player', playerActorId: value.slice('player:'.length) });
		}
	}
</script>

<label class="preview-launcher">
	<span class="visually-hidden">Preview as</span>
	<select data-testid="preview-as-select" value="" {onchange}>
		<option value="" disabled>Preview as…</option>
		<option value="player">Player (no grants)</option>
		{#each players as player (player.id)}
			<option value={`player:${player.id}`}>Player: {player.displayName}</option>
		{/each}
		<option value="observer">Observer</option>
	</select>
</label>
