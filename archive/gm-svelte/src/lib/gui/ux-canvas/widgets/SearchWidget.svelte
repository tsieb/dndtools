<script lang="ts">
	/**
	 * Global-search trigger tile (Command Center redesign §2). The search dialog itself is the
	 * shell-owned GlobalSearch (one instance, one focus model, actor-filtered results); this tile is
	 * an on-board launcher for it, so search is reachable without leaving the canvas. The tile
	 * forwards activation to the shell trigger rather than mounting a second dialog.
	 */
	function openGlobalSearch(): void {
		document
			.querySelector<HTMLButtonElement>('[data-testid="open-global-search"]')
			?.click();
	}
</script>

<button
	type="button"
	class="search-tile"
	data-testid="search-widget-open"
	onclick={openGlobalSearch}
>
	<span class="search-glyph" aria-hidden="true">⌕</span>
	<span class="search-label">Search everything</span>
	<span class="search-hint">Scenes, notes, maps, characters</span>
</button>

<style>
	.search-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		width: 100%;
		height: 100%;
		min-height: var(--touch-target-min);
		padding: var(--space-2);
		background: var(--color-surface);
		border: 1px dashed var(--color-border-strong);
		border-radius: var(--radius-md);
		cursor: pointer;
		color: var(--color-text-primary);
	}
	.search-tile:hover {
		background: var(--color-interactive-hover);
	}
	.search-glyph {
		font-size: var(--text-xl);
		color: var(--color-text-secondary);
	}
	.search-label {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
	}
	.search-hint {
		font-size: var(--text-2xs);
		color: var(--color-text-secondary);
	}
</style>
