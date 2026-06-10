import type { WidgetBindingPayload } from '@dndtools/core';

/**
 * A11Y-007 AC1 — Derive a visibility-safe accessible name for a widget control.
 *
 * The name is built from the widget's TYPE and, ONLY for payloads whose binding
 * has already been resolved as VISIBLE to the actor (`available` or `degraded`),
 * the bound entity's id. For every other payload kind the entity id is withheld —
 * the binding is either hidden, missing, unbound, or conflicted — so the name
 * falls back to a generic "unavailable" suffix.
 *
 * Visibility guarantee: `getSceneForActor` (Processing Core) resolves bindings
 * fail-closed before any payload reaches the GUI. A payload with `kind ===
 * 'available'` or `kind === 'degraded'` means the actor already holds visibility
 * on that entity; no additional check is required here. All other kinds MUST NOT
 * include the entity id in any user-visible or assistive-technology surface.
 */
export function widgetAccessibleName(payload: WidgetBindingPayload): string {
	if (payload.kind === 'available' || payload.kind === 'degraded') {
		const binding = payload.widget.binding;
		const boundTo = binding ? ` bound to ${binding.source.entityId}` : '';
		return `${payload.widget.type} widget${boundTo}`;
	}
	// Hidden, missing, unbound, disabled, or conflicted — no entity identity exposed.
	return `${payload.type} widget (unavailable)`;
}
