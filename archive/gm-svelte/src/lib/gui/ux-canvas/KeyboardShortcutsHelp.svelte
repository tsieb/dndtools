<script lang="ts">
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import { CANVAS_SHORTCUTS } from './canvas-shortcuts';

	/**
	 * Canvas keyboard shortcuts reference (UX-CANVAS-015 §Keyboard shortcuts reference). The `?` key opens
	 * this `role="dialog"` listing every canvas-level binding in a searchable table. Reuses the shared
	 * `Dialog` (focus trap + Escape) so the panel is itself fully keyboard-navigable.
	 */
	interface Props {
		open: boolean;
		onclose?: () => void;
	}

	let { open = $bindable(), onclose }: Props = $props();
	let filter = $state('');

	const rows = $derived(
		CANVAS_SHORTCUTS.filter((s) => {
			const q = filter.trim().toLowerCase();
			if (!q) return true;
			return `${s.keys} ${s.action}`.toLowerCase().includes(q);
		}),
	);
</script>

<Dialog bind:open title="Keyboard shortcuts" testid="canvas-shortcuts-help" {onclose}>
	<div class="shortcuts">
		<label class="shortcuts-filter">
			<span class="sr-only">Filter shortcuts</span>
			<input
				type="search"
				bind:value={filter}
				placeholder="Filter shortcuts"
				data-testid="canvas-shortcuts-filter"
				autocomplete="off"
			/>
		</label>
		<table class="shortcuts-table" data-testid="canvas-shortcuts-table">
			<thead>
				<tr>
					<th scope="col">Keys</th>
					<th scope="col">Action</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.keys)}
					<tr>
						<td><kbd>{row.keys}</kbd></td>
						<td>{row.action}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</Dialog>

<style>
	.shortcuts {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: min(420px, 80vw);
	}
	.shortcuts-filter input {
		width: 100%;
		min-height: var(--touch-target-min);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
	}
	.shortcuts-table {
		width: 100%;
		border-collapse: collapse;
		max-height: 50vh;
	}
	.shortcuts-table th {
		text-align: left;
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-tertiary);
		padding: var(--space-1);
	}
	.shortcuts-table td {
		padding: var(--space-1);
		border-top: 1px solid var(--color-border);
		font-size: var(--text-sm);
		color: var(--color-text-primary);
	}
	kbd {
		font-family: var(--font-mono, monospace);
		font-size: var(--text-xs);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
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
