/**
 * Shared render-layer types for the unified widget view. Kept separate from the component registry
 * so templates and WidgetView can import them without a circular dependency on the registry.
 */
import type { WidgetDefinition, WidgetInstance, WidgetSurface } from '@dndtools/core';

/**
 * Dispatch a widget command (e.g. `timer.start`, `dice.roll`). The owning surface wires this to the
 * Processing Core with the scene/instance context the template does not have (sceneId, revision).
 * Absent ⇒ the template renders its action affordances disabled (read-only / no scene context).
 */
export type WidgetCommandDispatcher = (
	commandType: string,
	payload: Record<string, unknown>,
) => void | Promise<void>;

/** The common prop contract every widget renderer (template or builtin) receives from WidgetView. */
export interface WidgetRenderProps {
	definition: WidgetDefinition;
	/** The scene widget instance, or null on surfaces (e.g. the Command Center board) without one. */
	widget: WidgetInstance | null;
	/** Configuration with the definition's `configField` defaults already merged in. */
	config: Record<string, unknown>;
	surface: WidgetSurface;
	onCommand?: WidgetCommandDispatcher;
}
