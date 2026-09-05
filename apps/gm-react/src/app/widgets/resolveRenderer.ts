import type { WidgetRenderEntrypoint, WidgetTemplateKind } from '@dndtools/core';
import type { WidgetStatus } from '../board-helpers';

/**
 * resolveRenderer — the ONE decision that says how a placed widget draws itself, on every surface
 * (RC-WID-1.1).
 *
 * Before this, `/board` and `/scene/:id` both went straight to `WidgetBody`, so the only widgets
 * that could ever render were the ten hard-coded builtin bodies; a `template` package widget drew a
 * blank box and a `custom-html-js` one drew nothing at all, with no explanation either way. The
 * resolver replaces that with four named branches — `builtin` | `template` | `custom` |
 * `placeholder` — and a rule that the last one is always reachable: this function NEVER throws, and
 * `WidgetRenderSlot` turns a renderer that throws at draw time into the same placeholder. A widget
 * whose renderer is unavailable or broken is a widget the DM can still see, move, configure and
 * export, which is what `coreStateAvailable` records.
 *
 * It is deliberately pure and framework-free: the capabilities (which builtin bodies exist, which
 * template kinds have a renderer, whether the sandbox host is present) come IN as predicates, so
 * WID-1.2 (template renderers) and WID-1.3 (the iframe host) light up their branch by registering a
 * renderer, without touching this decision.
 */

/** The four render paths. Adding a fifth means adding a branch here, not a branch in a screen. */
export type WidgetRenderKind = 'builtin' | 'template' | 'custom' | 'placeholder';

export type WidgetRenderPlan =
	| { kind: 'builtin'; coreStateAvailable: true }
	| { kind: 'template'; template: WidgetTemplateKind; coreStateAvailable: true }
	| { kind: 'custom'; entrypoint: WidgetRenderEntrypoint; coreStateAvailable: true }
	| {
			kind: 'placeholder';
			/** Why nothing is drawn, in the DM's words. Shown verbatim under the placeholder label. */
			diagnostic: string;
			/**
			 * Whether the widget's durable state (configuration, binding, layout) is still intact in the
			 * core despite nothing rendering. True for every placeholder this resolver produces and for
			 * a renderer that crashed — the widget is disabled, not lost, and that is what the surface
			 * promises the DM (ADR-031 §"Technical rollback steps").
			 */
			coreStateAvailable: boolean;
	  };

/** What the host can actually draw right now. Supplied by the render slot, not decided here. */
export interface WidgetRendererCapabilities {
	/** A hand-written React body exists for this widget type (`widget-bodies.tsx`). */
	hasBuiltinBody: (widgetType: string) => boolean;
	/** A declarative renderer exists for this template kind (WID-1.2). */
	hasTemplateRenderer: (template: WidgetTemplateKind) => boolean;
	/** The sandboxed `custom-html-js` host is available (WID-1.3). */
	hasCustomHost: boolean;
}

export interface ResolveRendererInput {
	/** The widget instance's type, used to find a builtin body. */
	widgetType: string;
	/** The actor-scoped binding availability from the scene summary (CANVAS-009). */
	status: WidgetStatus;
	/** The human note the board already derives for a non-available status, when there is one. */
	statusNote: string | null;
	/** `WidgetDefinition.renderEntrypoint`; absent for a definition that predates the field. */
	entrypoint: WidgetRenderEntrypoint | null | undefined;
}

/**
 * Placeholder copy. Sentence case, verbs first, no engine jargon — and every string says both what
 * is missing AND that nothing was lost, because "disabled, preserved" is the whole promise the
 * placeholder makes (ADR-031:255).
 */
export const WIDGET_PLACEHOLDER_COPY = {
	/** The label above every placeholder, whatever the reason underneath. */
	label: 'Disabled, preserved',
	/** The line that keeps the promise: nothing about the widget was thrown away. */
	reassurance: 'Its settings, binding and place on the board are kept.',
	packageDisabled: 'Its widget package is turned off.',
	customHostUnavailable: 'Custom widgets do not run on this build yet.',
	templateUnavailable: 'This widget layout has no renderer yet.',
	noRenderer: 'Nothing here knows how to draw this widget.',
	crashed: 'This widget stopped while drawing.',
} as const;

/** The placeholder a renderer that threw collapses to. Kept here so both paths read alike. */
export function widgetCrashPlaceholder(detail?: string): WidgetRenderPlan {
	const base = WIDGET_PLACEHOLDER_COPY.crashed;
	return {
		kind: 'placeholder',
		diagnostic: detail ? `${base} ${detail}` : base,
		coreStateAvailable: true,
	};
}

function placeholder(diagnostic: string): WidgetRenderPlan {
	return { kind: 'placeholder', diagnostic, coreStateAvailable: true };
}

/**
 * Decide how one widget draws. Order matters:
 *
 * 1. A DISABLED package never renders, whatever it declares — the DM turned it off, and the
 *    placeholder is the honest answer (the other non-available statuses stay renderable, because
 *    their bodies are what explain the degradation, e.g. a map widget saying its map is not shared).
 * 2. `custom-html-js` goes to the sandbox host, or to the placeholder while there is none.
 * 3. A declared `template` kind goes to its renderer when one is registered.
 * 4. Otherwise a builtin body draws it. This is what keeps every shipped system widget working:
 *    most of them declare `runtime: 'template'` while their real body is still hand-written, so the
 *    template branch degrades to the builtin body rather than to a blank frame. As WID-1.2
 *    registers renderers, step 3 starts winning, one template kind at a time.
 * 5. Nothing can draw it — say so.
 */
export function resolveWidgetRenderer(
	input: ResolveRendererInput,
	capabilities: WidgetRendererCapabilities,
): WidgetRenderPlan {
	if (input.status === 'disabled') {
		return placeholder(input.statusNote || WIDGET_PLACEHOLDER_COPY.packageDisabled);
	}

	const runtime = input.entrypoint?.runtime;

	if (runtime === 'custom-html-js') {
		if (capabilities.hasCustomHost && input.entrypoint) {
			return { kind: 'custom', entrypoint: input.entrypoint, coreStateAvailable: true };
		}
		return placeholder(WIDGET_PLACEHOLDER_COPY.customHostUnavailable);
	}

	const template = runtime === 'template' ? input.entrypoint?.template : undefined;
	if (template && capabilities.hasTemplateRenderer(template)) {
		return { kind: 'template', template, coreStateAvailable: true };
	}

	if (capabilities.hasBuiltinBody(input.widgetType)) {
		return { kind: 'builtin', coreStateAvailable: true };
	}

	if (template) return placeholder(WIDGET_PLACEHOLDER_COPY.templateUnavailable);
	return placeholder(WIDGET_PLACEHOLDER_COPY.noRenderer);
}
