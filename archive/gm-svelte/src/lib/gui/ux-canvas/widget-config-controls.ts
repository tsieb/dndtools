/**
 * Shared field-control behaviour for the two widget customization surfaces — the scene editor's
 * `WidgetCustomizePanel` and the Command Center's `CanvasPropertiesPanel`. Both render the SAME
 * declarative `WidgetConfigField` model but with surface-specific DOM/testids, so they keep their own
 * markup; the value-reading + numeric-commit invariants (which must stay identical, and where a bug
 * once lived in both copies) live here so there is one source of truth.
 */
import type { WidgetConfigField } from '@dndtools/core';

/** Swatch fallback for a color control with no value (an un-set style token reads as theme default). */
export const WIDGET_COLOR_FALLBACK = '#888888';

/** The current value of a config field: the instance/block value, else the field's declared default. */
export function configFieldValue(config: Record<string, unknown>, field: WidgetConfigField): unknown {
	return config[field.key] ?? field.default;
}

/**
 * Clamp a raw numeric-input string to the field's declared `[min, max]` and return the value to
 * commit, or `null` when the entry must be IGNORED so the control snaps back to its last committed
 * value. A blank entry is rejected explicitly: `Number('')` is `0` (finite), which would otherwise
 * clamp to the field minimum and silently overwrite the prior value when a user clears the input.
 */
export function clampConfigNumber(field: WidgetConfigField, raw: string): number | null {
	if (raw.trim() === '') return null;
	const value = Number(raw);
	if (!Number.isFinite(value)) return null;
	let clamped = value;
	if (field.min !== undefined) clamped = Math.max(field.min, clamped);
	if (field.max !== undefined) clamped = Math.min(field.max, clamped);
	return clamped;
}
