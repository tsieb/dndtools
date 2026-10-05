import {
	Component,
	useSyncExternalStore,
	useEffect,
	useRef,
	useState,
	type ComponentType,
	type CSSProperties,
	type ReactNode,
} from 'react';
import {
	findWidgetDefinition,
	resolveWidgetStyleVariables,
	type WidgetTemplateKind,
} from '@dndtools/core';
import { matchesMedia, subscribeMedia } from '../../platform/preferences';
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

/** RC-CAN-5.5 — how a body that outgrows its tile is recovered. Only the canvas frame can grow. */
export interface TileFitProps {
	/** Grow the containing tile by this many px without changing its saved layout. */
	onGrow?: (extraHeight: number) => void;
	onRestore?: () => void;
	/** Layout editing owns the frame's keys; reading mode lets the body scroll by keyboard. */
	keyboardScrollable?: boolean;
	/**
	 * RC-CAN-7.6 — the host sizes the tile to its content (a flow page), so the region never scrolls
	 * and must not clip what a body draws past its box: a card's shadow, a control's focus ring.
	 */
	fitsContent?: boolean;
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

/** Overflow-footer copy — English-only for now, like the tile menu's TEXT catalog
 * (`TileActionMenu`) and the frame's resize help: canvas tile chrome keeps its strings local. */
const TEXT = {
	lines: (count: number) => `${count} more ${count === 1 ? 'line' : 'lines'}`,
	more: 'More below',
	end: 'End of content',
	grow: 'Grow to fit',
	growLabel: (title: string) => `Grow ${title} to fit content`,
	restore: 'Restore tile size',
};

/** Keys a focused, scrollable region consumes (the browser scrolls it natively). */
const SCROLL_KEYS = new Set([
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'PageUp',
	'PageDown',
	'Home',
	'End',
	' ',
]);
const GROW_PASSES = 8;
/** The overlaid count/Grow row, and the room content keeps above it (text boxes stop short of
 * their line's leading, so a few px more keep the last line off the footer). */
const FOOTER_HEIGHT = 22;
const FOOTER_CLEARANCE = FOOTER_HEIGHT + 4;
/** Above every tile's stack index (a scene's widget order) and below the edit-mode marquee. */
const GROWN_TILE_Z = 10_000;

/** Textless content the ENG-8.1 clip detector also counts as losable. */
const CONTENT_CONTROLS =
	'button, input, select, textarea, img, canvas, video, svg, [role="button"]';

interface RegionFit {
	/** Where the body's real content ends, in layout px from the top of the content. */
	extent: number;
	/** Bottom edge of each rendered text line, in the same coordinates. */
	lines: number[];
	/** Content ends past the region's edge, so some of it is seen only by scrolling. */
	hidden: boolean;
	scrollable: boolean;
	top: number;
	view: number;
}
const NO_OVERFLOW: RegionFit = {
	extent: 0,
	lines: [],
	hidden: false,
	scrollable: false,
	top: 0,
	view: 0,
};
const sameFit = (a: RegionFit, b: RegionFit) =>
	a.extent === b.extent &&
	a.hidden === b.hidden &&
	a.scrollable === b.scrollable &&
	a.top === b.top &&
	a.view === b.view &&
	a.lines.join() === b.lines.join();

/**
 * Measure a body by its text and controls, not by `scrollHeight`: a box's trailing padding or a
 * 100%-height column overflowing by a few px hides nothing, and must not cost the tile its footer
 * space. Content an inner overflow box clips (a body's own scroller, a map viewport) ends at that
 * box; recovering it is that box's job. Rects are divided by the canvas zoom to stay in layout px.
 */
function regionFit(node: HTMLElement, content: HTMLElement): RegionFit {
	const origin = content.getBoundingClientRect();
	const scale = content.offsetHeight ? origin.height / content.offsetHeight : 1;
	const clips = new Map<Element, number>();
	const clipOf = (el: Element | null): number => {
		if (!el || el === content) return Infinity;
		let bottom = clips.get(el);
		if (bottom === undefined) {
			const own = getComputedStyle(el).overflowY === 'visible';
			bottom = Math.min(
				own ? Infinity : el.getBoundingClientRect().bottom,
				clipOf(el.parentElement),
			);
			clips.set(el, bottom);
		}
		return bottom;
	};
	let extent = 0;
	const lines = new Set<number>();
	const add = (rect: DOMRect, clip: number, line: boolean) => {
		if (!rect.height || rect.top >= clip) return;
		const bottom = Math.round((Math.min(rect.bottom, clip) - origin.top) / scale);
		extent = Math.max(extent, bottom);
		if (line) lines.add(bottom);
	};
	const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
	while (walker.nextNode()) {
		const text = walker.currentNode;
		if (!text.textContent?.trim()) continue;
		const range = document.createRange();
		range.selectNodeContents(text);
		const clip = clipOf(text.parentElement);
		for (const rect of range.getClientRects()) add(rect, clip, true);
	}
	for (const el of content.querySelectorAll(CONTENT_CONTROLS))
		add(el.getBoundingClientRect(), clipOf(el.parentElement), false);
	return {
		extent,
		lines: [...lines].sort((a, b) => a - b),
		hidden: extent > node.clientHeight + 1,
		scrollable: node.scrollHeight - node.clientHeight > 1,
		top: node.scrollTop,
		view: node.clientHeight,
	};
}

/**
 * RC-CAN-5.5 — "Grow to fit" is reading state, not a layout edit: in view mode the tile grows over
 * its neighbours by what its body measured; the saved scene size, and edit mode, are untouched.
 */
export function useTileFit(editing: boolean, height: number, stackOrder?: number) {
	const [extra, setExtra] = useState(0);
	// Editing the layout ends the reading expansion, so Done shows the size just edited.
	if (editing && extra) setExtra(0);
	const grown = !editing && extra > 0;
	const slot: TileFitProps = {
		keyboardScrollable: !editing,
		onGrow: editing ? undefined : (by) => setExtra((current) => current + by),
		onRestore: grown ? () => setExtra(0) : undefined,
	};
	return {
		box: { height: height + (grown ? extra : 0), zIndex: grown ? GROWN_TILE_Z : stackOrder },
		slot,
	};
}

/**
 * RC-CAN-5.5 — a tile's title. It is set in the sans face: the display face is for 24px and up, and
 * at 14px it truncated common names. When a narrow tile still cuts it, the full text stays in the
 * tooltip and, as this text node, in the frame's accessible name.
 */
export function TileTitle({ children }: { children: string }) {
	return (
		<span
			title={children}
			style={{
				flex: 1,
				minWidth: 0,
				font: '700 var(--text-sm) var(--font-sans)',
				color: 'var(--color-text-primary)',
				overflow: 'hidden',
				textOverflow: 'ellipsis',
				whiteSpace: 'nowrap',
			}}
		>
			{children}
		</span>
	);
}

/**
 * RC-WID-4.4 — every widget's contents are ONE region, named by its scene position and title, so a
 * screen-reader user can move tile to tile by landmark and always knows whose content they are in.
 * It is drawn here, on the single render path, rather than in each body: a builtin body, a template,
 * a sandboxed frame and the "disabled, preserved" placeholder all get it, and none can forget it.
 * The frame around it (`WidgetFrame`) is the focusable group that carries the layout chrome; this is
 * the content inside it.
 */
export function WidgetRegion({
	label,
	children,
	onGrow,
	onRestore,
	keyboardScrollable = true,
	fitsContent = false,
}: TileFitProps & { label: string; children: ReactNode }) {
	const scrollRef = useRef<HTMLElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const [fit, setFit] = useState<RegionFit>(NO_OVERFLOW);
	// Grow re-measures after the tile resizes: text re-wraps and a centred 100%-height body moves
	// with the tile, so one measured delta is not always the last. Bounded, so it cannot loop.
	const growPasses = useRef(0);
	const grow = useRef(onGrow);
	useEffect(() => {
		grow.current = onGrow;
	});
	useEffect(() => {
		const node = scrollRef.current;
		const content = contentRef.current;
		if (!node || !content || typeof ResizeObserver === 'undefined') return;
		let raf = 0;
		const measure = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				const next = regionFit(node, content);
				const short = Math.ceil(next.extent + FOOTER_CLEARANCE - next.view);
				if (growPasses.current > 0 && short > 1 && grow.current) {
					growPasses.current -= 1;
					grow.current(short);
				} else growPasses.current = 0;
				setFit((old) => (sameFit(old, next) ? old : next));
			});
		};
		const resize = new ResizeObserver(measure);
		const refresh = () => {
			resize.disconnect();
			for (const box of [node, content, ...content.children]) resize.observe(box);
			measure();
		};
		const mutation = new MutationObserver(refresh);
		mutation.observe(content, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
		});
		node.addEventListener('scroll', measure);
		refresh();
		return () => {
			cancelAnimationFrame(raf);
			resize.disconnect();
			mutation.disconnect();
			node.removeEventListener('scroll', measure);
		};
	}, []);
	// The footer overlays the region's bottom edge instead of taking a row from it, and appears only
	// when content is really hidden (or the tile is grown): a body that fits keeps every pixel, and
	// no body re-lays out because the footer came or went.
	const footer = fit.hidden || !!onRestore;
	const shownTo = fit.top + fit.view - (footer ? FOOTER_HEIGHT : 0);
	const below = fit.lines.filter((line) => line > shownTo + 1).length;
	const remaining = fit.extent > shownTo + 1;
	return (
		<div style={{ position: 'relative', height: '100%', minHeight: 0 }}>
			<section
				ref={scrollRef}
				aria-label={label}
				data-widget-region=""
				// A scrollable region must be focusable to scroll by keyboard (axe
				// scrollable-region-focusable); one that fits adds no tab stop. While the layout is
				// edited the frame owns the keys, so the region leaves the tab order.
				tabIndex={fit.scrollable ? (keyboardScrollable ? 0 : -1) : undefined}
				onKeyDown={(event) => {
					// Scroll keys on the focused region scroll it rather than moving to another tile.
					if (
						keyboardScrollable &&
						event.target === event.currentTarget &&
						SCROLL_KEYS.has(event.key)
					)
						event.stopPropagation();
				}}
				style={{ height: '100%', overflow: fitsContent ? 'visible' : 'auto' }}
			>
				<div ref={contentRef} style={{ height: '100%' }}>
					{children}
					{/* Scroll room so the last line can rise clear of the overlaid footer. */}
					{fit.hidden && <div aria-hidden style={{ height: FOOTER_CLEARANCE }} />}
				</div>
			</section>
			{footer && (
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						bottom: 0,
						height: FOOTER_HEIGHT,
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-1)',
						justifyContent: 'space-between',
						background: 'var(--color-surface-raised)',
						font: 'var(--text-xs) var(--font-sans)',
						color: 'var(--color-text-secondary)',
					}}
				>
					{remaining && (
						<span
							aria-hidden
							style={{
								position: 'absolute',
								bottom: '100%',
								left: 0,
								right: 0,
								height: 12,
								pointerEvents: 'none',
								background: 'linear-gradient(transparent, var(--color-surface-raised))',
							}}
						/>
					)}
					<span
						style={{
							minWidth: 0,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{below ? TEXT.lines(below) : remaining ? TEXT.more : TEXT.end}
					</span>
					{(onRestore || (onGrow && fit.hidden)) && (
						<button
							type="button"
							aria-label={onRestore ? TEXT.restore : TEXT.growLabel(label)}
							// Focus stays on this button: it is the same element as Grow and as Restore.
							onClick={() => {
								if (onRestore) {
									// The restored size hid content before, so keep the footer (and this
									// focused button) mounted until the next measure says otherwise.
									setFit((old) => ({ ...old, hidden: true }));
									return onRestore();
								}
								growPasses.current = GROW_PASSES;
								onGrow?.(Math.ceil(fit.extent + FOOTER_CLEARANCE - fit.view));
							}}
							style={{
								flex: '0 0 auto',
								font: 'inherit',
								color: 'inherit',
								border: '1px solid var(--color-border-strong)',
								borderRadius: 'var(--radius-sm)',
								background: 'var(--color-surface-raised)',
								padding: '0 var(--space-2)',
								cursor: 'pointer',
							}}
						>
							{onRestore ? TEXT.restore : TEXT.grow}
						</button>
					)}
				</div>
			)}
		</div>
	);
}

const FORCED_COLORS_QUERY = '(forced-colors: active)';

function subscribeToAppearance(onChange: () => void) {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	const unsubscribeMedia = subscribeMedia([FORCED_COLORS_QUERY], onChange);
	return () => {
		observer.disconnect();
		unsubscribeMedia();
	};
}

const readTheme = () => document.documentElement.getAttribute('data-theme') ?? '';
const readForcedColors = () => matchesMedia(FORCED_COLORS_QUERY);
/** The whole palette: a frame drawn with the host's tokens restarts on any theme change. */
const readPalette = () => `${readTheme()}|${readForcedColors()}`;
/** Only the contrast state `SandboxHost` forwards to every frame (RC-WID-4.4). */
const readContrast = () => `${readTheme() === 'high-contrast'}|${readForcedColors()}`;
const serverAppearance = () => '';
const ignoreAppearance = () => () => {};

/**
 * Refresh on palette/contrast changes so package scripts that inspect accessibility signals only
 * at startup can apply them again. This restarts guest-local JS state; persisted configuration and
 * bindings are supplied again by SandboxHost. The kit also receives live appearance messages for
 * changes such as density and motion, which do not restart the frame.
 *
 * Two tiers. A frame that declares `host-theme-tokens` (`followsTheme`) restarts on any theme change,
 * because its palette came from the host. EVERY other frame (`followsContrast`) restarts only when the
 * contrast state flips — the high-contrast theme, or the OS forcing colours — because SandboxHost
 * forwards that state to all frames regardless of declared capabilities. Workers draw through the host's
 * own templates and follow neither. Removing this refresh also requires a guest notification
 * contract for scripts that currently read the contrast variables only at startup.
 */
export function ThemeAwareWidgetHost({
	Host,
	followsTheme,
	followsContrast = false,
	...props
}: WidgetRendererProps & {
	Host: WidgetRenderer;
	followsTheme: boolean;
	followsContrast?: boolean;
}) {
	const appearance = useSyncExternalStore(
		followsTheme || followsContrast ? subscribeToAppearance : ignoreAppearance,
		followsTheme ? readPalette : followsContrast ? readContrast : serverAppearance,
		serverAppearance,
	);
	return <Host key={appearance} {...props} />;
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
			const worker = plan.entrypoint.sandbox === 'worker';
			const Host = worker ? WORKER_WIDGET_HOST : CUSTOM_WIDGET_HOST;
			return Host ? (
				<ThemeAwareWidgetHost
					Host={Host}
					followsTheme={followsTheme && !worker}
					followsContrast={!worker}
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

export function WidgetRenderSlot({
	widget,
	onCommand,
	...fit
}: WidgetRendererProps & TileFitProps) {
	const runtime = useRuntime();
	// Titles are editable and repeated types often share one (e.g. three "Note" tiles). Prefix the
	// persisted scene-list position so each landmark has a distinct, readable name without exposing
	// an internal ID. Moving/resizing a tile leaves this number unchanged.
	// Unplaced previews have no scene position and keep their title.
	const scene = Object.values(runtime.state.scenes.scenes).find((candidate) =>
		candidate.widgets.some((instance) => instance.id === widget.id),
	);
	const position = scene?.widgets.findIndex((instance) => instance.id === widget.id) ?? -1;
	const title = widget.title.trim() || widget.typeLabel;
	const regionLabel = position >= 0 ? `${position + 1}. ${title}` : title;
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
			<WidgetRegion label={regionLabel} {...fit}>
				<WidgetErrorBoundary widgetId={widget.id}>
					{renderPlan(
						plan,
						{ widget, onCommand },
						definition?.style?.capabilities?.includes('host-theme-tokens') ?? false,
					)}
				</WidgetErrorBoundary>
			</WidgetRegion>
		</WidgetStyleScope>
	);
}
