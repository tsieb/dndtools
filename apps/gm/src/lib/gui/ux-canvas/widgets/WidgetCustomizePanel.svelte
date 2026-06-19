<script lang="ts" module>
	// Per-instance base id for help-text association (aria-describedby).
	let customizeSeq = 0;
	function nextCustomizeId(): string {
		customizeSeq += 1;
		return `customize-${customizeSeq}`;
	}
</script>

<script lang="ts">
	/**
	 * The scene editor's data-driven widget Customize panel: declarative config fields, style tokens
	 * (as CSS variables), and size. It renders purely from the `WidgetDefinition` (`configFields`,
	 * `style`, `minSize`/`resizePolicy`) and emits changes through callbacks, so it doesn't know where
	 * the values are persisted.
	 *
	 * This is NOT the only customization surface: the Command Center board has its own docked
	 * `CanvasPropertiesPanel`, which renders the SAME `WidgetConfigField` + style-token model but with
	 * surface-specific affordances (tabbed groups, position/size/z-order) and its own DOM/testids. The
	 * two panels keep their own markup because their per-surface DOM contracts differ, but the shared
	 * value-reading + numeric-commit invariants live in `../widget-config-controls` so they cannot drift.
	 */
	import type { WidgetConfigField, WidgetDefinition } from '@dndtools/core';
	import {
		WIDGET_COLOR_FALLBACK,
		clampConfigNumber,
		configFieldValue,
	} from '../widget-config-controls';

	interface Props {
		definition: WidgetDefinition;
		/** Current configuration (raw instance/block config). */
		config: Record<string, unknown>;
		/** Current per-instance style-token overrides (token name → value). */
		styleTokens?: Record<string, string>;
		/** Current size, when the surface supports resizing through this panel. */
		size?: { w: number; h: number } | null;
		onConfig: (key: string, value: unknown) => void;
		onStyleToken: (name: string, value: string) => void;
		onSize?: (w: number, h: number) => void;
	}
	const { definition, config, styleTokens = {}, size = null, onConfig, onStyleToken, onSize }: Props =
		$props();

	const baseId = nextCustomizeId();
	const fields = $derived(definition.configFields ?? []);
	const styleFields = $derived(fields.filter((f) => f.group === 'style'));
	const contentFields = $derived(fields.filter((f) => (f.group ?? 'content') === 'content'));
	const displayFields = $derived(fields.filter((f) => f.group === 'display'));
	const tokens = $derived(definition.style?.tokens ?? []);
	const canResize = $derived(!!onSize && definition.resizePolicy !== 'fixed');

	function valueOf(field: WidgetConfigField): unknown {
		return configFieldValue(config, field);
	}
	function numberValue(field: WidgetConfigField): number {
		const v = Number(valueOf(field));
		return Number.isFinite(v) ? v : 0;
	}
	// Commit a numeric value clamped to [min, max] via the shared helper; a blank/non-numeric entry is
	// ignored (returns null) so the control snaps back to its last committed value instead of writing 0.
	function commitNumber(field: WidgetConfigField, raw: string) {
		const clamped = clampConfigNumber(field, raw);
		if (clamped !== null) onConfig(field.key, clamped);
	}
	// Commit a size dimension clamped to the definition's minimum; a non-numeric/empty entry (which
	// would otherwise collapse the widget via Number('')===0) snaps back to the current size. Mirrors
	// the CC panel's validated rect inputs so the two panels stay behaviour-consistent.
	function commitWidth(raw: string) {
		if (!size) return;
		const v = Number(raw);
		const w = Number.isFinite(v) && raw.trim() !== '' ? Math.max(definition.minSize.width, v) : size.w;
		onSize?.(w, size.h);
	}
	function commitHeight(raw: string) {
		if (!size) return;
		const v = Number(raw);
		const h = Number.isFinite(v) && raw.trim() !== '' ? Math.max(definition.minSize.height, v) : size.h;
		onSize?.(size.w, h);
	}
</script>

<div class="customize-panel" data-testid="widget-customize-panel">
	<p class="customize-title">{definition.displayName}</p>
	{#if definition.description}
		<p class="customize-subtitle" data-testid="customize-description">{definition.description}</p>
	{/if}

	{#snippet fieldControl(field: WidgetConfigField)}
		<!-- help lives OUTSIDE the <label> and is linked via aria-describedby so it doesn't pollute the
		     control's accessible name (B5). Text/textarea commit on change (not per keystroke) to match
		     the CC panel and avoid command/undo/persistence churn while typing (B4). -->
		{@const helpId = field.help ? `${baseId}-help-${field.key}` : undefined}
		<label class="customize-field" data-testid={`customize-field-${field.key}`}>
			<span>{field.label}</span>
			{#if field.control === 'toggle'}
				<input
					type="checkbox"
					checked={valueOf(field) !== false}
					aria-describedby={helpId}
					onchange={(e) => onConfig(field.key, e.currentTarget.checked)}
				/>
			{:else if field.control === 'select'}
				<select
					value={String(valueOf(field) ?? field.options?.[0]?.value ?? '')}
					aria-describedby={helpId}
					onchange={(e) => onConfig(field.key, e.currentTarget.value)}
				>
					{#each field.options ?? [] as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			{:else if field.control === 'number'}
				<input
					type="number"
					value={numberValue(field)}
					min={field.min}
					max={field.max}
					step={field.step ?? 1}
					aria-describedby={helpId}
					onchange={(e) => commitNumber(field, e.currentTarget.value)}
				/>
			{:else if field.control === 'textarea'}
				<textarea
					rows="3"
					value={String(valueOf(field) ?? '')}
					placeholder={field.placeholder}
					aria-describedby={helpId}
					onchange={(e) => onConfig(field.key, e.currentTarget.value)}
				></textarea>
			{:else if field.control === 'color'}
				<input
					type="color"
					value={String(valueOf(field) ?? WIDGET_COLOR_FALLBACK)}
					aria-describedby={helpId}
					onchange={(e) => onConfig(field.key, e.currentTarget.value)}
				/>
			{:else}
				<input
					type="text"
					value={String(valueOf(field) ?? '')}
					placeholder={field.placeholder}
					aria-describedby={helpId}
					onchange={(e) => onConfig(field.key, e.currentTarget.value)}
				/>
			{/if}
		</label>
		{#if field.help}<span class="customize-help" id={helpId}>{field.help}</span>{/if}
	{/snippet}

	{#if contentFields.length > 0}
		<fieldset class="customize-group">
			<legend>Content</legend>
			{#each contentFields as field (field.key)}{@render fieldControl(field)}{/each}
		</fieldset>
	{/if}
	{#if displayFields.length > 0}
		<fieldset class="customize-group">
			<legend>Display</legend>
			{#each displayFields as field (field.key)}{@render fieldControl(field)}{/each}
		</fieldset>
	{/if}

	{#if tokens.length > 0 || styleFields.length > 0}
		<fieldset class="customize-group">
			<legend>Style</legend>
			{#each styleFields as field (field.key)}{@render fieldControl(field)}{/each}
			{#each tokens as token (token.name)}
				{@const overridden = !!styleTokens[token.name]}
				<label class="customize-field" data-testid={`customize-token-${token.name}`}>
					<span>{token.description ?? token.name}</span>
					<span class="customize-token-row">
						<input
							type="color"
							value={styleTokens[token.name] ?? WIDGET_COLOR_FALLBACK}
							aria-label={`${token.name} color`}
							onchange={(e) => onStyleToken(token.name, e.currentTarget.value)}
						/>
						<!-- An un-overridden token resolves to a theme CSS var the swatch can't display, so
						     the gray swatch would lie — label the real state instead (principle 7). -->
						<span class="customize-token-state" data-testid={`customize-token-state-${token.name}`}>
							{overridden ? 'Custom' : 'Theme default'}
						</span>
						<button
							type="button"
							class="customize-reset"
							data-testid={`customize-token-reset-${token.name}`}
							aria-label={`Reset ${token.name} to theme default`}
							disabled={!overridden}
							onclick={() => onStyleToken(token.name, '')}
						>
							Reset
						</button>
					</span>
				</label>
			{/each}
		</fieldset>
	{/if}

	{#if canResize && size}
		<fieldset class="customize-group">
			<legend>Size</legend>
			<label class="customize-field">
				<span>Width</span>
				<input
					type="number"
					data-testid="customize-size-w"
					value={size.w}
					min={definition.minSize.width}
					onchange={(e) => commitWidth(e.currentTarget.value)}
				/>
			</label>
			<label class="customize-field">
				<span>Height</span>
				<input
					type="number"
					data-testid="customize-size-h"
					value={size.h}
					min={definition.minSize.height}
					onchange={(e) => commitHeight(e.currentTarget.value)}
				/>
			</label>
		</fieldset>
	{/if}
</div>

<style>
	.customize-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.customize-title {
		margin: 0;
		font-weight: var(--font-weight-semibold);
		font-size: var(--text-sm);
	}
	.customize-subtitle {
		margin: 0;
		font-size: var(--text-2xs);
		color: var(--color-text-tertiary);
	}
	.customize-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.customize-group legend {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
		padding: 0 var(--space-1);
	}
	.customize-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.customize-field input,
	.customize-field select,
	.customize-field textarea {
		min-height: var(--touch-target-min);
		padding: var(--space-0-5) var(--space-1);
		font: inherit;
		color: var(--color-text-primary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.customize-field input[type='checkbox'] {
		min-height: 0;
		align-self: flex-start;
	}
	.customize-field input[type='color'] {
		padding: 0;
		width: 3rem;
	}
	.customize-token-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.customize-token-state {
		flex: 1 1 auto;
		font-size: var(--text-2xs);
		color: var(--color-text-secondary);
	}
	.customize-reset {
		min-height: var(--touch-target-min);
		font-size: var(--text-xs);
		padding: var(--space-0-5) var(--space-1);
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.customize-reset:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.customize-help {
		font-size: var(--text-2xs);
		color: var(--color-text-tertiary);
	}
</style>
