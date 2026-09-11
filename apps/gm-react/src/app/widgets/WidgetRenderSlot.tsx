import {
	Component,
	useSyncExternalStore,
	type ComponentType,
	type CSSProperties,
	type ReactNode,
} from 'react';
import {
	findWidgetDefinition,
	resolveWidgetStyleVariables,
	type WidgetTemplateKind,
} from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import { WidgetBody, hasBuiltinBody, type WidgetCommandHandler } from '../widget-bodies';
import type { BoardWidget } from '../board-helpers';
import { TEMPLATE_RENDERER_ENTRIES } from './templates';
import { SandboxHost } from './SandboxHost';
import { WorkerHost } from './WorkerHost';
import { WidgetPlaceholder } from './WidgetPlaceholder';
import {
	resolveWidgetRenderer,
	widgetCrashPlaceholder,
	WIDGET_PLACEHOLDER_COPY,
	type WidgetRenderPlan,
} from './resolveRenderer';

/**
 * WidgetRenderSlot — the single component every surface puts inside a widget frame (RC-WID-1.1).
 *
 * It asks `resolveWidgetRenderer` which of the four branches applies, draws that branch, and wraps
 * the whole thing in an error boundary so a renderer that throws collapses to the SAME placeholder
 * as one that was never available. One widget can therefore never take the board down with it: the
 * frame, its neighbours and the core state all survive, which is the "disabled, preserved" promise
 * the placeholder prints (ADR-031).
 *
 * The template and custom branches are registries on purpose. WID-1.2 filled `TEMPLATE_RENDERERS`
 * with a renderer for all eight template kinds and WID-1.3 filled the custom branch with `SandboxHost`.
 * Either can be dropped back to null and every affected widget degrades to the placeholder instead of
 * disappearing, which is what the rollback plan in ADR-031 relies on.
 */

/** Props a template or custom renderer receives. One shape for both, so registries stay uniform. */
/** Re-exported so a surface needs ONE import to render a widget frame's contents. */
export type { WidgetCommandHandler };

export interface WidgetRendererProps {
	widget: BoardWidget;
	onCommand?: WidgetCommandHandler;
}

type WidgetRenderer = ComponentType<WidgetRendererProps>;

/**
 * Declarative renderers by template kind, seeded by RC-WID-1.2 from `widgets/templates`. Kept
 * mutable so a later story (or a test) can register or drop one; `renderPlan` re-checks it.
 */
export const TEMPLATE_RENDERERS = new Map<WidgetTemplateKind, WidgetRenderer>(
	TEMPLATE_RENDERER_ENTRIES,
);

/** The sandboxed `custom-html-js` host, landed by RC-WID-1.3 (`SandboxHost`, ADR-031 §1). */
export const CUSTOM_WIDGET_HOST: WidgetRenderer | null = SandboxHost;

/**
 * The DATA-ONLY host for the same runtime, landed by RC-WID-1.4. A package that pairs
 * `custom-html-js` with `sandbox: 'worker'` ships code but no interface: it runs off the main thread
 * with no DOM at all and its result is drawn by one of the eight templates. Same branch of the
 * resolver, same protocol, same policy — a different place for the code to run.
 */
export const WORKER_WIDGET_HOST: WidgetRenderer | null = WorkerHost;

/**
 * Re-exported from its own module so the sandbox host can render the SAME "disabled, preserved" card
 * without an import cycle back through this registry. Every caller keeps importing it from here.
 */
export { WidgetPlaceholder };

/**
 * Isolates ONE widget's render failure. Resets on `widgetId` so re-placing or swapping a widget in
 * the same slot gets a fresh attempt rather than inheriting the previous occupant's crash.
 */
export class WidgetErrorBoundary extends Component<
	{ widgetId: string; children: ReactNode },
	{ error: Error | null; forId: string | null }
> {
	state: { error: Error | null; forId: string | null } = { error: null, forId: null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	static getDerivedStateFromProps(
		props: { widgetId: string },
		state: { error: Error | null; forId: string | null },
	) {
		if (state.forId === props.widgetId) return null;
		return { error: null, forId: props.widgetId };
	}

	render() {
		if (this.state.error) {
			const plan = widgetCrashPlaceholder();
			return <WidgetPlaceholder diagnostic={plan.kind === 'placeholder' ? plan.diagnostic : ''} />;
		}
		return this.props.children;
	}
}

/**
 * The widget's declared `--widget-*` custom properties (RC-WID-2.4), set on a wrapper that draws no
 * box, so every branch's body inherits them without the frame's layout changing. Values stay the
 * `var()` references the package declared, so they re-resolve under whichever `data-theme` encloses
 * the frame instead of freezing the palette of the theme that was active when it was placed.
 *
 * Always rendered, even with no variables, so a package that gains or loses tokens does not remount
 * the body under it — a sandboxed widget would reload its frame.
 */
export function WidgetStyleScope({
	variables,
	children,
}: {
	variables: Record<string, string>;
	children: ReactNode;
}) {
	return (
		<div data-widget-style-scope="" style={{ display: 'contents', ...variables } as CSSProperties}>
			{children}
		</div>
	);
}

function subscribeToTheme(onChange: () => void) {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	return () => observer.disconnect();
}

const readTheme = () => document.documentElement.getAttribute('data-theme') ?? '';
const serverTheme = () => '';
const ignoreTheme = () => () => {};

/**
 * The sandbox protocol only installs theme variables at initialization. Refresh that host when the
 * app theme changes so its opaque document receives the new palette. This restarts guest-local JS
 * state; persisted configuration and bindings are supplied again by SandboxHost. Workers and widgets
 * without host-theme-tokens do not subscribe or restart. Replace this refresh with a theme message
 * when the sandbox protocol supports updates without reinitialization.
 */
export function ThemeAwareWidgetHost({
	Host,
	followsTheme,
	...props
}: WidgetRendererProps & { Host: WidgetRenderer; followsTheme: boolean }) {
	const theme = useSyncExternalStore(
		followsTheme ? subscribeToTheme : ignoreTheme,
		followsTheme ? readTheme : serverTheme,
		serverTheme,
	);
	return <Host key={theme} {...props} />;
}

/** Draw one resolved plan. Split out so the resolver's branches map 1:1 onto render calls. */
function renderPlan(
	plan: WidgetRenderPlan,
	props: WidgetRendererProps,
	followsTheme: boolean,
): ReactNode {
	switch (plan.kind) {
		case 'builtin':
			return <WidgetBody widget={props.widget} onCommand={props.onCommand} />;
		case 'template': {
			const Renderer = TEMPLATE_RENDERERS.get(plan.template);
			// The registry is re-checked here because it is mutable: a renderer unregistered between
			// resolve and draw must degrade, not throw.
			return Renderer ? (
				<Renderer {...props} />
			) : (
				<WidgetPlaceholder diagnostic={WIDGET_PLACEHOLDER_COPY.templateUnavailable} />
			);
		}
		case 'custom': {
			// Which sandbox the package asked for. Anything that is not a worker gets the frame, so a
			// package that names no sandbox keeps the RC-WID-1.3 behaviour it had.
			const Host = plan.entrypoint.sandbox === 'worker' ? WORKER_WIDGET_HOST : CUSTOM_WIDGET_HOST;
			return Host ? (
				<ThemeAwareWidgetHost
					Host={Host}
					followsTheme={followsTheme && plan.entrypoint.sandbox !== 'worker'}
					{...props}
				/>
			) : (
				<WidgetPlaceholder diagnostic={WIDGET_PLACEHOLDER_COPY.customHostUnavailable} />
			);
		}
		case 'placeholder':
			return <WidgetPlaceholder diagnostic={plan.diagnostic} />;
	}
}

export function WidgetRenderSlot({ widget, onCommand }: WidgetRendererProps) {
	const runtime = useRuntime();
	// The board view-model carries no entrypoint (it is chrome-only), so the definition is read here
	// — the same lookup `/board` and `/scene/:id` already use to build the view-model.
	const definition = findWidgetDefinition(runtime.state.widgets, widget.type);
	const plan = resolveWidgetRenderer(
		{
			widgetType: widget.type,
			status: widget.status,
			statusNote: widget.statusNote,
			entrypoint: definition?.renderEntrypoint,
		},
		{
			hasBuiltinBody,
			// A HAND-WRITTEN body wins over the generic template for the same widget. Every shipped
			// system widget declares a template kind (`timer` → tracker, `dice` → action-panel,
			// `initiative-tracker` → status-list…), and its builtin body is the specialised version of
			// that template: the live countdown, the roll history, the HP bars. The declarative
			// renderer is what a package with no code of its own gets, not a replacement for a body
			// that already exists — so the template branch is offered only where there is no builtin.
			hasTemplateRenderer: (template) =>
				TEMPLATE_RENDERERS.has(template) && !hasBuiltinBody(widget.type),
			hasCustomHost: CUSTOM_WIDGET_HOST !== null,
		},
	);
	return (
		<WidgetStyleScope
			variables={definition ? resolveWidgetStyleVariables(definition, widget.configuration) : {}}
		>
			<WidgetErrorBoundary widgetId={widget.id}>
				{renderPlan(
					plan,
					{ widget, onCommand },
					definition?.style?.capabilities?.includes('host-theme-tokens') ?? false,
				)}
			</WidgetErrorBoundary>
		</WidgetStyleScope>
	);
}
