<script lang="ts">
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import {
		bindingTypesFor,
		buildBinding,
		currentBindingSummary,
		filterEntities,
		type BindableEntity,
	} from './binding-inspector';
	import type { ManipWidget } from './manipulation-controller.svelte';
	import type { WidgetBinding } from '@dndtools/core';

	/**
	 * Widget data-binding inspector (UX-CANVAS-008). The discrete, keyboard-operable "Bind to entity…"
	 * surface — the WCAG 2.2 §2.5.7 alternative to the proximity-anchor drag, and the only binding path on
	 * Mobile. Search a DM-scoped entity list, pick a binding type the widget declares, and confirm; the
	 * current binding (if any) is listed with a Remove action. All bindings flow through the same
	 * `scene.configure-widget` command, so the Processing Core stays the source of truth.
	 *
	 * This panel is DM-only (the host renders it only for an editing viewer), so listing entity ids here
	 * is safe; the no-leak boundary protects the PLAYER view, never the DM's own binding UI.
	 */
	interface Props {
		open: boolean;
		widget: ManipWidget | null;
		/** DM-scoped bindable entities (host-supplied). */
		entities: readonly BindableEntity[];
		onbind: (binding: WidgetBinding, entityLabel: string) => void;
		onunbind: () => void;
		onclose?: () => void;
	}

	let { open = $bindable(), widget, entities, onbind, onunbind, onclose }: Props = $props();

	let search = $state('');
	let selectedEntityId = $state('');
	let selectedSelector = $state('');

	const types = $derived(widget ? bindingTypesFor(widget.type) : []);
	const matches = $derived(filterEntities(entities, search));
	const current = $derived(widget ? currentBindingSummary(widget.binding) : null);

	// Seed the binding-type selector to the widget's first declared type when the panel opens.
	$effect(() => {
		if (open && !selectedSelector && types.length > 0) selectedSelector = types[0]!.selector;
	});

	function confirm() {
		if (!widget) return;
		const entity = entities.find((e) => e.entityId === selectedEntityId);
		if (!entity) return;
		onbind(buildBinding(entity, selectedSelector), entity.label);
		open = false;
		onclose?.();
	}

	function remove() {
		onunbind();
		open = false;
		onclose?.();
	}
</script>

<Dialog bind:open title="Widget data bindings" testid="binding-inspector" {onclose}>
	<div class="bindings">
		{#if !widget}
			<p class="meta" data-testid="binding-inspector-empty">Select a widget to manage its data bindings.</p>
		{:else}
			<p class="bindings-target">{widget.label}</p>

			{#if current}
				<div class="bindings-current" data-testid="binding-current">
					<span class="meta">Currently bound to</span>
					<strong>{current.entityType}: {current.entityId}{current.selector ? ` · ${current.selector}` : ''}</strong>
					<button type="button" class="button secondary" data-testid="binding-remove" onclick={remove}>
						Remove binding
					</button>
				</div>
			{:else}
				<p class="meta" data-testid="binding-none">No data binding yet.</p>
			{/if}

			<label class="bindings-search">
				<span>Search entities</span>
				<input
					type="search"
					bind:value={search}
					placeholder="Search by name or id"
					data-testid="binding-search"
					autocomplete="off"
				/>
			</label>

			{#if matches.length === 0}
				<p class="meta" data-testid="binding-no-entities">No entities match "{search}".</p>
			{:else}
				<ul class="bindings-list" role="listbox" aria-label="Bindable entities">
					{#each matches as entity (entity.entityId)}
						<li>
							<label class="bindings-option">
								<input
									type="radio"
									name="binding-entity"
									value={entity.entityId}
									bind:group={selectedEntityId}
									data-testid={`binding-entity-${entity.entityId}`}
								/>
								<span><strong>{entity.label}</strong> <span class="meta">{entity.entityType}</span></span>
							</label>
						</li>
					{/each}
				</ul>
			{/if}

			<label class="bindings-type">
				<span>Binding type</span>
				<select bind:value={selectedSelector} data-testid="binding-type">
					{#each types as type (type.selector)}
						<option value={type.selector}>{type.label}</option>
					{/each}
				</select>
			</label>

			<div class="bindings-actions">
				<button
					type="button"
					class="button"
					data-testid="binding-confirm"
					disabled={!selectedEntityId}
					onclick={confirm}
				>
					Bind to entity
				</button>
			</div>
		{/if}
	</div>
</Dialog>

<style>
	.bindings {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: min(360px, 80vw);
	}
	.bindings-target {
		margin: 0;
		font-weight: var(--font-weight-semibold);
	}
	.bindings-current {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-sunken);
	}
	.bindings-search input,
	.bindings-type select {
		width: 100%;
		min-height: var(--touch-target-min);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
	}
	.bindings-search,
	.bindings-type {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.bindings-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: 32vh;
		overflow-y: auto;
	}
	.bindings-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-target-min);
		padding: 0 var(--space-1);
		cursor: pointer;
	}
	.bindings-actions {
		display: flex;
		justify-content: flex-end;
	}
	.meta {
		margin: 0;
		color: var(--color-text-secondary);
	}
</style>
