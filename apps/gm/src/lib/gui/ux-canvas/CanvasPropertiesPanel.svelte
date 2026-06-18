<script lang="ts" module>
	// Per-instance base id for tab↔panel ARIA wiring (UX-A11Y-012). Mirrors the shared Tabs primitive.
	let panelGroupSeq = 0;
	function nextPanelGroupId(): string {
		panelGroupSeq += 1;
		return `props-group-${panelGroupSeq}`;
	}
</script>

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
	import { readStyleTokenOverrides, type WidgetConfigField, type WidgetDefinition } from '@dndtools/core';
	import { nextRovingIndex } from '$lib/gui/a11y/roving-tabindex';
	import type { DashboardBlock } from './dashboard/dashboard-layout.svelte';
	import { blockTitle, MIN_BLOCK_W, MIN_BLOCK_H } from './dashboard/dashboard-layout.svelte';

	interface Props {
		block: DashboardBlock;
		/** True when the surface's widget set is locked (Command Center: no remove). */
		locked: boolean;
		/** The widget definition backing this block — supplies the customizable style tokens. */
		definition?: WidgetDefinition | null;
		onRect: (id: string, rect: Partial<{ x: number; y: number; w: number; h: number }>) => void;
		onConfigure: (id: string, key: string, value: unknown) => void;
		onBringToFront: (id: string) => void;
		onRemove?: (id: string) => void;
		onClose: () => void;
	}

	const { block, locked, definition = null, onRect, onConfigure, onBringToFront, onRemove, onClose }: Props =
		$props();

	const COLOR_FALLBACK = '#888888';
	type PanelTab = 'layout' | 'content' | 'display' | 'style';
	let activeTab = $state<PanelTab>('layout');

	// The panel renders directly from the widget definition's declarative config fields (the single
	// source of truth shared with the scene Customize panel) — no parallel GUI schema table.
	const schema = $derived<WidgetConfigField[]>(definition?.configFields ?? []);
	const contentFields = $derived(schema.filter((field) => (field.group ?? 'content') === 'content'));
	const displayFields = $derived(schema.filter((field) => field.group === 'display'));
	const styleFields = $derived(schema.filter((field) => field.group === 'style'));
	const styleTokens = $derived(definition?.style?.tokens ?? []);
	const defaultTitle = $derived(definition?.displayName ?? block.type);

	const currentTokens = $derived(readStyleTokenOverrides(block.config));
	function setToken(name: string, value: string) {
		const tokens = { ...currentTokens };
		if (value) tokens[name] = value;
		else delete tokens[name];
		onConfigure(block.id, 'styleTokens', tokens);
	}

	const tabs = $derived.by<Array<{ id: PanelTab; label: string }>>(() => {
		const out: Array<{ id: PanelTab; label: string }> = [{ id: 'layout', label: 'Layout' }];
		if (contentFields.length > 0) out.push({ id: 'content', label: 'Content' });
		if (displayFields.length > 0) out.push({ id: 'display', label: 'Display' });
		if (styleTokens.length > 0 || styleFields.length > 0) out.push({ id: 'style', label: 'Style' });
		return out;
	});
	// A block with no fields in the active group falls back to Layout (tab list is derived above).
	const currentTab = $derived<PanelTab>(
		tabs.some((tab) => tab.id === activeTab) ? activeTab : 'layout',
	);

	// Tab↔panel ARIA wiring + roving tabindex (UX-A11Y-012). Only shown when >1 group exists; the
	// single-group case renders the body as a plain region (no tablist to label it).
	const isTabbed = $derived(tabs.length > 1);
	const baseId = nextPanelGroupId();
	const tabDomId = (id: PanelTab) => `${baseId}-tab-${id}`;
	const panelDomId = (id: PanelTab) => `${baseId}-panel-${id}`;
	const currentIndex = $derived(Math.max(0, tabs.findIndex((tab) => tab.id === currentTab)));
	let tabEls = $state<HTMLButtonElement[]>([]);

	function onTabKeydown(event: KeyboardEvent) {
		const next = nextRovingIndex({
			key: event.key,
			currentIndex,
			count: tabs.length,
			orientation: 'horizontal',
			wrap: true,
		});
		if (next === null) return;
		event.preventDefault();
		activeTab = tabs[next]!.id;
		tabEls[next]?.focus();
	}

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

	function fieldValue(field: WidgetConfigField): unknown {
		return block.config[field.key] ?? field.default;
	}

	// Commit a numeric config value clamped to the field's declared [min, max]. A non-numeric entry
	// (e.g. a cleared field on blur) is ignored so we never write NaN — the control snaps back on
	// re-render to the last committed value.
	function commitNumber(field: WidgetConfigField, raw: string) {
		const value = Number(raw);
		if (!Number.isFinite(value)) return;
		let clamped = value;
		if (field.min !== undefined) clamped = Math.max(field.min, clamped);
		if (field.max !== undefined) clamped = Math.min(field.max, clamped);
		onConfigure(block.id, field.key, clamped);
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
	aria-label={`Widget properties — ${blockTitle(block, defaultTitle)}`}
	data-testid="canvas-properties-panel"
	onkeydown={onPanelKeydown}
>
	<header class="props-head">
		<div class="props-name">
			<span class="props-kicker">Widget properties</span>
			<strong data-testid="props-panel-title">{blockTitle(block, defaultTitle)}</strong>
			{#if definition?.description}
				<span class="props-subtitle" data-testid="props-panel-description">{definition.description}</span>
			{/if}
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

	{#if isTabbed}
		<div class="props-tabs" role="tablist" aria-label="Property groups">
			{#each tabs as tab, i (tab.id)}
				<button
					bind:this={tabEls[i]}
					type="button"
					role="tab"
					id={tabDomId(tab.id)}
					aria-selected={currentTab === tab.id}
					aria-controls={panelDomId(tab.id)}
					tabindex={currentTab === tab.id ? 0 : -1}
					class:selected={currentTab === tab.id}
					data-testid={`props-tab-${tab.id}`}
					onkeydown={onTabKeydown}
					onclick={() => (activeTab = tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</div>
	{/if}

	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- The body IS the tabpanel when tabbed; per WAI-ARIA APG a tabpanel takes tabindex=0 so keyboard
	     users can reach a panel with no focusable content. svelte-check can't see the dynamic role is
	     'tabpanel' so it flags the tabindex — the shared Tabs primitive sets the same tabindex=0. -->
	<div
		class="props-body"
		role={isTabbed ? 'tabpanel' : undefined}
		id={isTabbed ? panelDomId(currentTab) : undefined}
		aria-labelledby={isTabbed ? tabDomId(currentTab) : undefined}
		tabindex={isTabbed ? 0 : undefined}
	>
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
		{:else if currentTab === 'style'}
			<section class="props-group" aria-label="Style options">
				{#each styleFields as field (field.key)}
					{@render propertyField(field)}
				{/each}
				{#each styleTokens as token (token.name)}
					{@const overridden = !!currentTokens[token.name]}
					<label class="props-field is-toggle" data-testid={`props-token-${token.name}`}>
						<input
							type="color"
							value={currentTokens[token.name] ?? COLOR_FALLBACK}
							aria-label={`${token.name} color`}
							onchange={(event) => setToken(token.name, event.currentTarget.value)}
						/>
						<span class="props-token-label">
							{token.description ?? token.name}
							<!-- An un-overridden token resolves to a theme CSS var the swatch can't display, so
							     the gray swatch would lie — label the real state instead (principle 7). -->
							<span class="props-token-state" data-testid={`props-token-state-${token.name}`}>
								{overridden ? 'Custom' : 'Theme default'}
							</span>
						</span>
						<button
							type="button"
							class="props-action"
							data-testid={`props-token-reset-${token.name}`}
							aria-label={`Reset ${token.name} to theme default`}
							disabled={!overridden}
							onclick={() => setToken(token.name, '')}
						>
							Reset
						</button>
					</label>
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

{#snippet propertyField(field: WidgetConfigField)}
	<!-- field.help is rendered OUTSIDE the <label> and linked via aria-describedby so it never pollutes
	     the control's accessible name (B5 / a11y). -->
	{@const helpId = field.help ? `${baseId}-help-${field.key}` : undefined}
	{#if field.control === 'toggle'}
		<label class="props-field is-toggle">
			<input
				type="checkbox"
				checked={fieldValue(field) !== false}
				aria-describedby={helpId}
				data-testid={`props-field-${field.key}`}
				onchange={(event) => onConfigure(block.id, field.key, event.currentTarget.checked)}
			/>
			<span>{field.label}</span>
		</label>
	{:else if field.control === 'select'}
		<label class="props-field">
			<span>{field.label}</span>
			<select
				value={typeof fieldValue(field) === 'string'
					? (fieldValue(field) as string)
					: (field.options?.[0]?.value ?? '')}
				aria-describedby={helpId}
				data-testid={`props-field-${field.key}`}
				onchange={(event) => onConfigure(block.id, field.key, event.currentTarget.value)}
			>
				{#each field.options ?? [] as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>
	{:else if field.control === 'number'}
		<label class="props-field">
			<span>{field.label}</span>
			<input
				type="number"
				value={Number.isFinite(Number(fieldValue(field))) ? Number(fieldValue(field)) : ''}
				min={field.min}
				max={field.max}
				step={field.step ?? 1}
				aria-describedby={helpId}
				data-testid={`props-field-${field.key}`}
				onchange={(event) => commitNumber(field, event.currentTarget.value)}
			/>
		</label>
	{:else if field.control === 'textarea'}
		<label class="props-field">
			<span>{field.label}</span>
			<textarea
				rows="3"
				value={typeof fieldValue(field) === 'string' ? (fieldValue(field) as string) : ''}
				placeholder={field.placeholder ?? ''}
				aria-describedby={helpId}
				data-testid={`props-field-${field.key}`}
				onchange={(event) => onConfigure(block.id, field.key, event.currentTarget.value)}
			></textarea>
		</label>
	{:else if field.control === 'color'}
		<label class="props-field is-toggle">
			<input
				type="color"
				value={typeof fieldValue(field) === 'string' ? (fieldValue(field) as string) : COLOR_FALLBACK}
				aria-describedby={helpId}
				data-testid={`props-field-${field.key}`}
				onchange={(event) => onConfigure(block.id, field.key, event.currentTarget.value)}
			/>
			<span>{field.label}</span>
		</label>
	{:else}
		<label class="props-field">
			<span>{field.label}</span>
			<input
				type="text"
				value={typeof fieldValue(field) === 'string' ? (fieldValue(field) as string) : ''}
				placeholder={field.placeholder ?? ''}
				aria-describedby={helpId}
				data-testid={`props-field-${field.key}`}
				onchange={(event) => onConfigure(block.id, field.key, event.currentTarget.value)}
			/>
		</label>
	{/if}
	{#if field.help}
		<span class="props-help" id={helpId}>{field.help}</span>
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
	.props-subtitle {
		font-size: var(--text-2xs);
		color: var(--color-text-tertiary);
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
		/* Fields come from arbitrary definition.configFields, so a field-rich/custom widget can exceed
		   the fixed panel height — the body scrolls (header + tabs stay fixed) instead of clipping (B6). */
		overflow-y: auto;
	}
	.props-body:focus-visible {
		outline: 2px solid var(--color-interactive-focus-ring);
		outline-offset: -2px;
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
	.props-help {
		font-size: var(--text-2xs);
		color: var(--color-text-tertiary);
	}
	.props-token-label {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
	}
	.props-token-state {
		font-size: var(--text-2xs);
		color: var(--color-text-secondary);
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
