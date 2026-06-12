<script lang="ts">
	/**
	 * Docked widget Properties Panel (Command Center redesign §5).
	 *
	 * A side OVERLAY, not a modal and not a sidebar: it appears only while a widget is selected in
	 * Edit Mode, docks to the right edge above the canvas (no content reflow), and dismisses on
	 * deselect or mode exit. Fixed ~280px wide, fills the viewport height between the chrome-group
	 * clearances, and NEVER scrolls — properties are structured into Layout / Content / Display tab
	 * groups inside the fixed height instead (§6 no-scroll principle).
	 *
	 * It is a `role="complementary"` landmark with its own accessible name, does not trap focus
	 * (the floating chrome stays reachable), and slides in/out on the fast motion token (collapses
	 * under reduced motion via the global duration tokens).
	 */
	import type { DashboardBlock, BlockPropertyField } from './dashboard/dashboard-layout.svelte';
	import { blockTitle, BLOCK_PROPERTY_SCHEMAS, MIN_BLOCK_W, MIN_BLOCK_H } from './dashboard/dashboard-layout.svelte';

	interface Props {
		block: DashboardBlock;
		/** True when the surface's widget set is locked (Command Center: no remove). */
		locked: boolean;
		onRect: (id: string, rect: Partial<{ x: number; y: number; w: number; h: number }>) => void;
		onConfigure: (id: string, key: string, value: unknown) => void;
		onBringToFront: (id: string) => void;
		onRemove?: (id: string) => void;
		onClose: () => void;
	}

	const { block, locked, onRect, onConfigure, onBringToFront, onRemove, onClose }: Props = $props();

	type PanelTab = 'layout' | 'content' | 'display';
	let activeTab = $state<PanelTab>('layout');

	const schema = $derived<BlockPropertyField[]>(BLOCK_PROPERTY_SCHEMAS[block.type] ?? []);
	const contentFields = $derived(schema.filter((field) => field.group === 'content'));
	const displayFields = $derived(schema.filter((field) => field.group === 'display'));

	const tabs = $derived.by<Array<{ id: PanelTab; label: string }>>(() => {
		const out: Array<{ id: PanelTab; label: string }> = [{ id: 'layout', label: 'Layout' }];
		if (contentFields.length > 0) out.push({ id: 'content', label: 'Content' });
		if (displayFields.length > 0) out.push({ id: 'display', label: 'Display' });
		return out;
	});
	// A block with no fields in the active group falls back to Layout (tab list is derived above).
	const currentTab = $derived<PanelTab>(
		tabs.some((tab) => tab.id === activeTab) ? activeTab : 'layout',
	);

	// Inline validation (§5): out-of-range numbers are reported and not committed.
	let rectErrors = $state<Record<string, string | null>>({});

	function commitRect(key: 'x' | 'y' | 'w' | 'h', raw: string) {
		const value = Number.parseInt(raw, 10);
		const min = key === 'w' ? MIN_BLOCK_W : key === 'h' ? MIN_BLOCK_H : 0;
		if (!Number.isFinite(value) || value < min) {
			rectErrors = { ...rectErrors, [key]: `Min ${min}` };
			return;
		}
		rectErrors = { ...rectErrors, [key]: null };
		onRect(block.id, { [key]: value });
	}

	function fieldValue(field: BlockPropertyField): unknown {
		return block.config[field.key];
	}

	function onPanelKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onClose();
		}
	}

	const RECT_FIELDS: ReadonlyArray<{ key: 'x' | 'y' | 'w' | 'h'; label: string }> = [
		{ key: 'x', label: 'X' },
		{ key: 'y', label: 'Y' },
		{ key: 'w', label: 'Width' },
		{ key: 'h', label: 'Height' },
	];
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- <aside> is the complementary landmark (§ a11y): no explicit role needed. -->
<aside
	class="props-panel"
	aria-label={`Widget properties — ${blockTitle(block)}`}
	data-testid="canvas-properties-panel"
	onkeydown={onPanelKeydown}
>
	<header class="props-head">
		<div class="props-name">
			<span class="props-kicker">Widget properties</span>
			<strong data-testid="props-panel-title">{blockTitle(block)}</strong>
		</div>
		<button
			type="button"
			class="props-close"
			aria-label="Close properties panel"
			data-testid="props-panel-close"
			onclick={onClose}
		>
			×
		</button>
	</header>

	{#if tabs.length > 1}
		<div class="props-tabs" role="tablist" aria-label="Property groups">
			{#each tabs as tab (tab.id)}
				<button
					type="button"
					role="tab"
					aria-selected={currentTab === tab.id}
					class:selected={currentTab === tab.id}
					data-testid={`props-tab-${tab.id}`}
					onclick={() => (activeTab = tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</div>
	{/if}

	<div class="props-body">
		{#if currentTab === 'layout'}
			<section class="props-group" aria-label="Position and size">
				<div class="props-rect">
					{#each RECT_FIELDS as field (field.key)}
						<label class="props-field">
							<span>{field.label}</span>
							<input
								type="number"
								inputmode="numeric"
								value={block.rect[field.key]}
								min={field.key === 'w' ? MIN_BLOCK_W : field.key === 'h' ? MIN_BLOCK_H : 0}
								aria-invalid={rectErrors[field.key] ? 'true' : undefined}
								data-testid={`props-rect-${field.key}`}
								onchange={(event) => commitRect(field.key, event.currentTarget.value)}
							/>
							{#if rectErrors[field.key]}
								<span class="props-error" role="alert">{rectErrors[field.key]}</span>
							{/if}
						</label>
					{/each}
				</div>
				<button
					type="button"
					class="props-action"
					data-testid="props-bring-front"
					onclick={() => onBringToFront(block.id)}
				>
					Bring to front
				</button>
				{#if !locked && onRemove}
					<button
						type="button"
						class="props-action is-danger"
						data-testid="props-remove"
						onclick={() => onRemove(block.id)}
					>
						Remove widget
					</button>
				{/if}
			</section>
		{:else if currentTab === 'content'}
			<section class="props-group" aria-label="Content options">
				{#each contentFields as field (field.key)}
					{@render propertyField(field)}
				{/each}
			</section>
		{:else}
			<section class="props-group" aria-label="Display options">
				{#each displayFields as field (field.key)}
					{@render propertyField(field)}
				{/each}
			</section>
		{/if}
	</div>
</aside>

{#snippet propertyField(field: BlockPropertyField)}
	{#if field.kind === 'text'}
		<label class="props-field">
			<span>{field.label}</span>
			<input
				type="text"
				value={typeof fieldValue(field) === 'string' ? (fieldValue(field) as string) : ''}
				placeholder={field.placeholder ?? ''}
				data-testid={`props-field-${field.key}`}
				onchange={(event) => onConfigure(block.id, field.key, event.currentTarget.value)}
			/>
		</label>
	{:else if field.kind === 'select'}
		<label class="props-field">
			<span>{field.label}</span>
			<select
				value={typeof fieldValue(field) === 'string'
					? (fieldValue(field) as string)
					: (field.options?.[0]?.value ?? '')}
				data-testid={`props-field-${field.key}`}
				onchange={(event) => onConfigure(block.id, field.key, event.currentTarget.value)}
			>
				{#each field.options ?? [] as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>
	{:else}
		<label class="props-field is-toggle">
			<input
				type="checkbox"
				checked={fieldValue(field) !== false}
				data-testid={`props-field-${field.key}`}
				onchange={(event) => onConfigure(block.id, field.key, event.currentTarget.checked)}
			/>
			<span>{field.label}</span>
		</label>
	{/if}
{/snippet}

<style>
	.props-panel {
		/* Docked to the canvas edge as an overlay (§5): absolute within the board host, which is
		   position:relative — it floats over the canvas without reflowing it, and stays clear of
		   the shell header. Top/bottom clearances keep the floating chrome groups reachable. */
		position: absolute;
		top: calc(var(--space-8) + var(--space-6));
		bottom: calc(var(--space-8) + var(--space-6));
		right: var(--space-3);
		width: 280px;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--color-surface-overlay);
		backdrop-filter: blur(8px);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		z-index: var(--z-overlay);
		overflow: hidden; /* §6: the panel itself NEVER scrolls — groups must fit. */
		animation: props-slide-in var(--duration-fast) var(--easing-decelerate);
	}
	@keyframes props-slide-in {
		from {
			transform: translateX(calc(100% + var(--space-3)));
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.props-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.props-name {
		display: flex;
		flex-direction: column;
	}
	.props-kicker {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
	}
	.props-name strong {
		font-size: var(--text-md);
		color: var(--color-text-primary);
	}
	.props-close {
		min-width: var(--touch-target-min);
		min-height: var(--touch-target-min);
		font-size: var(--text-lg);
		color: var(--color-text-secondary);
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.props-close:hover {
		background: var(--color-interactive-hover);
	}

	.props-tabs {
		display: flex;
		gap: var(--space-1);
	}
	.props-tabs button {
		flex: 1 1 0;
		min-height: var(--touch-target-floor);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.props-tabs button.selected {
		color: var(--color-text-primary);
		background: var(--color-interactive-selected);
		border-color: var(--color-accent);
	}

	.props-body {
		flex: 1 1 auto;
		min-height: 0;
	}
	.props-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.props-rect {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}
	.props-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.props-field input[type='text'],
	.props-field input[type='number'],
	.props-field select {
		min-height: var(--touch-target-floor);
		padding: 0 var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-primary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.props-field input:focus-visible,
	.props-field select:focus-visible {
		outline: 2px solid var(--color-interactive-focus-ring);
		outline-offset: 1px;
	}
	.props-field.is-toggle {
		flex-direction: row;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-target-floor);
		color: var(--color-text-primary);
	}
	.props-error {
		color: var(--color-status-error-text);
		font-size: var(--text-2xs);
	}
	.props-action {
		min-height: var(--touch-target-floor);
		font-size: var(--text-sm);
		color: var(--color-text-primary);
		background: var(--color-surface);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.props-action:hover {
		background: var(--color-interactive-hover);
	}
	.props-action.is-danger {
		color: var(--color-status-error-text);
		border-color: var(--color-status-error);
	}
</style>
