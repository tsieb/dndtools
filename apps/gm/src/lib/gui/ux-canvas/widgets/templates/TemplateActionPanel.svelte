<script lang="ts" module>
	// A per-component-instance id so the freeform input's <label for> is unique. This template is
	// rendered TWICE for the same scene widget (the inert canvas tile body + the interactive card),
	// so a static id would produce duplicate ids and mis-associate the label with the first match.
	let actionPanelSeq = 0;
	function nextActionPanelId(): string {
		actionPanelSeq += 1;
		return `widget-roll-custom-${actionPanelSeq}`;
	}
</script>

<script lang="ts">
	/**
	 * Action-panel template (the Dice widget). Renders quick-roll buttons from the `formulas` config
	 * plus a freeform expression, dispatching `dice.roll` through the surface. The roll itself is a
	 * Processing-Core command (recorded to the session); this panel only triggers it.
	 */
	import type { WidgetDefinition, WidgetInstance } from '@dndtools/core';
	import type { WidgetCommandDispatcher } from '../widget-render-types';

	interface Props {
		definition: WidgetDefinition;
		widget?: WidgetInstance | null;
		config: Record<string, unknown>;
		onCommand?: WidgetCommandDispatcher;
	}
	const { config, onCommand }: Props = $props();

	const customInputId = nextActionPanelId();

	const formulas = $derived.by<string[]>(() => {
		const raw = typeof config.formulas === 'string' ? config.formulas : 'd20,2d6,d100';
		// De-duplicate: the list is keyed by formula in the {#each}, and a duplicate free-text entry
		// (e.g. "d20, d20") would otherwise collide on the key and break keyed reconciliation.
		return [
			...new Set(
				raw
					.split(',')
					.map((f) => f.trim())
					.filter(Boolean),
			),
		];
	});

	let custom = $state('');
	let lastRolled = $state<string | null>(null);
	const interactive = $derived(!!onCommand);

	async function roll(expression: string) {
		if (!onCommand || !expression.trim()) return;
		await onCommand('dice.roll', { expression: expression.trim() });
		lastRolled = expression.trim();
	}
</script>

<div class="tpl-action-panel" data-widget-template="action-panel">
	<div class="tpl-buttons" role="group" aria-label="Quick rolls">
		{#each formulas as formula (formula)}
			<button
				type="button"
				disabled={!interactive}
				data-testid={`widget-roll-${formula}`}
				onclick={() => roll(formula)}
			>
				{formula}
			</button>
		{/each}
	</div>
	<form
		class="tpl-custom"
		onsubmit={(e) => {
			e.preventDefault();
			void roll(custom);
		}}
	>
		<label class="visually-hidden" for={customInputId}>Custom dice expression</label>
		<input
			id={customInputId}
			placeholder="e.g. 1d20+5"
			autocomplete="off"
			data-testid="widget-roll-custom"
			bind:value={custom}
		/>
		<button type="submit" class="tpl-primary-action" disabled={!interactive || !custom.trim()}
			>Roll</button
		>
	</form>
	{#if lastRolled}
		<p class="tpl-last" role="status" data-testid="widget-roll-last">Rolled {lastRolled}</p>
	{/if}
</div>

<style>
	.tpl-action-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		color: var(--widget-text, var(--color-text-primary));
	}
	.tpl-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	/* Quick-roll chips are the SECONDARY action grammar (outlined, surface fill); the freeform
	   "Roll" submit below is the single PRIMARY action (filled accent). UX-VIS-013. */
	.tpl-buttons button {
		min-height: var(--touch-target-min);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-primary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.tpl-buttons button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.tpl-custom {
		display: flex;
		gap: var(--space-1);
	}
	.tpl-custom input {
		flex: 1 1 auto;
		min-width: 0;
		min-height: var(--touch-target-min);
		padding: 0 var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-primary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.tpl-primary-action {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--widget-accent-foreground, var(--color-accent-foreground));
		background: var(--widget-accent, var(--color-accent));
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.tpl-primary-action:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.tpl-last {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
</style>
