/**
 * Widget data-binding inspector model (UX-CANVAS-008). Pure, no DOM.
 *
 * Backs the discrete "Bind to entity…" surface that is the WCAG 2.2 §2.5.7-compliant alternative to the
 * proximity-anchor drag: search a list of bindable entities (already DM-scoped by the host), pick a
 * binding type the widget package declares, and build the SAME `scene.configure-widget` binding command
 * a drag-from-anchor would dispatch. Also classifies a widget's current binding for the panel's status
 * row and the chain-link indicator.
 *
 * The entity catalogue is supplied by the host (the route assembles it from the Processing Core for the
 * DM); this model only filters/sorts it, so it stays unit-testable and never reaches the data model.
 */

import type { WidgetBinding } from '@dndtools/v2-core';

/** One entity a widget may be bound to (host-supplied, DM-scoped). */
export interface BindableEntity {
	entityType: string;
	entityId: string;
	/** Human label shown in the search list. */
	label: string;
}

/** A binding type a widget package exposes (e.g. `character.hp`). */
export interface BindingTypeOption {
	/** The selector stored on the binding source (UX-CANVAS-008 §Binding types). */
	selector: string;
	label: string;
}

/**
 * The binding types offered for a widget type. Declared per widget package in the full system; here a
 * compact built-in map keeps the inspector functional for the system widgets, with a sensible default.
 */
export const BINDING_TYPES_BY_WIDGET: Readonly<Record<string, readonly BindingTypeOption[]>> = {
	character: [
		{ selector: 'character.hp', label: 'Hit points' },
		{ selector: 'character.conditions', label: 'Conditions' },
		{ selector: 'character.name', label: 'Name' },
	],
	initiative: [{ selector: 'encounter.order', label: 'Initiative order' }],
	map: [{ selector: 'map.region', label: 'Map region' }],
	note: [{ selector: 'note.content', label: 'Note content' }],
	timer: [{ selector: 'timer.state', label: 'Timer state' }],
};

const DEFAULT_BINDING_TYPES: readonly BindingTypeOption[] = [{ selector: 'entity.summary', label: 'Summary' }];

/** Binding types available for a widget type, falling back to a generic summary binding. */
export function bindingTypesFor(widgetType: string): readonly BindingTypeOption[] {
	return BINDING_TYPES_BY_WIDGET[widgetType] ?? DEFAULT_BINDING_TYPES;
}

/** Case-insensitive search over entity label + id + type (UX-CANVAS-008 §Discrete binding menu). */
export function filterEntities(
	entities: readonly BindableEntity[],
	search: string,
): BindableEntity[] {
	const q = search.trim().toLowerCase();
	const matched = q
		? entities.filter((e) => `${e.label} ${e.entityId} ${e.entityType}`.toLowerCase().includes(q))
		: [...entities];
	return matched.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Build the `WidgetBinding` for a chosen entity + selector. Read-only viewer binding: the DM binds the
 * widget to render the entity's data; player visibility of that data is enforced at read time by the
 * Processing Core (it is never widened by the binding itself).
 */
export function buildBinding(entity: BindableEntity, selector: string): WidgetBinding {
	const trimmed = selector.trim();
	return {
		source: {
			entityType: entity.entityType,
			entityId: entity.entityId,
			...(trimmed ? { selector: trimmed } : {}),
		},
		mode: 'read',
		requiredCapability: 'viewer',
	};
}

export interface CurrentBindingSummary {
	entityType: string;
	entityId: string;
	selector: string | null;
}

/** Summarise an existing binding for the panel's "current bindings" list (DM-facing). */
export function currentBindingSummary(binding: WidgetBinding | null): CurrentBindingSummary | null {
	if (!binding) return null;
	return {
		entityType: binding.source.entityType,
		entityId: binding.source.entityId,
		selector: binding.source.selector ?? null,
	};
}

/** Polite announcement when a binding is created/removed (DM-facing; entity id is safe for the DM). */
export function boundAnnouncement(entityLabel: string): string {
	return `Widget bound to ${entityLabel}.`;
}
export const UNBOUND_ANNOUNCEMENT = 'Widget binding removed.';
