import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	findPackageRecordForWidgetType,
	findWidgetDefinition,
	resolveCustomWidgetRuntimePolicy,
	type WidgetDefinition,
	type WidgetPackageDefinition,
	type WidgetPackageRecord,
} from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { BoardWidget } from '../board-helpers';
import type { WidgetCommandHandler } from '../widget-bodies';
import { SEMANTIC_TOKEN_VALUES } from '../widgetBuilder/vocabulary';
import { resolveWidgetTemplateData } from './dataEnvironment';
import { WidgetPlaceholder } from './WidgetPlaceholder';
import {
	ASSEMBLY_COPY,
	READY_TIMEOUT_MS,
	WIDGET_HOST_API_VERSION,
	WIDGET_HOST_CHANNEL,
	WIDGET_SANDBOX_ATTRIBUTE,
	WIDGET_SANDBOX_DOCUMENT,
	approvedHostPermissions,
	assembleWidgetDocument,
	clampContentHeight,
	collectThemeVariables,
	decideDispatch,
	decideOutbound,
	decidePermission,
	isolateFrame,
	parseGuestMessage,
	type GuestMessage,
} from './hostBridge';

/**
 * SandboxHost — where a `custom-html-js` widget actually runs (RC-WID-1.3, ADR-031 §1).
 *
 * The component is deliberately thin, because the interesting parts are elsewhere on purpose:
 * `hostBridge.ts` decides what every message means and `packages/core/src/security/*` decides every
 * answer. What is left here is the part that genuinely needs a browser — create the frame, attribute
 * messages to it, push actor-filtered props at it, and take it down when it misbehaves.
 *
 * Three things about the frame are load-bearing and none of them are configurable:
 *
 *   - `sandbox="allow-scripts"` with no `allow-same-origin`, so the document has an opaque origin and
 *     is not in a position to reach the vault, storage, the Electron bridge or the host's DOM at all.
 *     The attribute comes from the core baseline; `auditSandboxFrame()` is the test that it still does.
 *   - The document is SERVED (`public/widget-host.html`), not `srcdoc`. A srcdoc document inherits the
 *     embedder's CSP, which under the packaged shell's `script-src 'self'` would silently refuse to run
 *     every widget ever installed. The package's assets are delivered in the `init` message instead.
 *   - A message is acted on only when `event.source` is THIS frame's `contentWindow`. Origin cannot do
 *     that job here — an opaque origin posts as `"null"`, and so does every other sandboxed frame on
 *     the page — so identity is the window object itself.
 *
 * Failure is contained rather than fatal: a frame that throws, that never says `ready`, or that pins a
 * host API version this build does not speak is isolated through `isolateWidgetFailure` and replaced
 * by the same "disabled, preserved" card every other unavailable renderer shows. The widget's
 * configuration, binding and place on the board are untouched, and its neighbours never notice.
 */

/** What the frame is handed on `render`. Actor-filtered by construction — see the note below. */
interface SandboxRenderProps {
	widget: {
		id: string;
		type: string;
		title: string;
		visibility: string;
		width: number;
		height: number;
	};
	configuration: Record<string, unknown>;
	binding: {
		entityType: string;
		entityId: string;
		status: string;
		statusNote: string | null;
	} | null;
	queries: unknown;
	computed: unknown;
	isDm: boolean;
}

interface HostFailure {
	diagnostic: string;
}

/** The host tokens the builder's Style step offers as `--widget-*` values (`var(--color-…)`). */
const STYLE_STEP_THEME_TOKENS: readonly string[] = SEMANTIC_TOKEN_VALUES.flatMap(
	(option) => /^var\((--[a-z0-9-]+)\)$/.exec(option.value)?.[1] ?? [],
);

/** The design-system kit (RC-WID-5.4): served beside the sandbox document, delivered in `init`. */
export const WIDGET_KIT_STYLESHEET = 'widget-kit.css';

/**
 * The kit's class-contract version. Must equal `--kit-version` in `public/widget-kit.css`. A served
 * file that says otherwise (a stale cache, a half-finished deploy) is not installed at all, so a
 * widget draws with its own styles rather than against a contract it was not written for.
 */
export const WIDGET_KIT_VERSION = 1;

/** How long the host waits for the kit before initialising the frame without it. */
const KIT_LOAD_TIMEOUT_MS = 4000;

/**
 * The theme tokens the kit draws with, beyond the bridge's forwarded set and the Style step's list.
 * Theme-DEPENDENT values only (colours, shadows, the mono face). The theme-invariant scale lives in
 * the kit itself, because a forwarded value is set inline and would override the kit's own density
 * sets and motion collapse. widgetKit.test.ts holds this list, the kit and the app's tokens together.
 */
export const KIT_THEME_TOKENS: readonly string[] = Object.freeze([
	'--color-surface-overlay',
	'--color-surface-sunken',
	'--color-border-strong',
	'--color-border-focus',
	'--color-accent-hover',
	'--color-accent-subtle',
	'--color-accent-border',
	'--color-status-success-text',
	'--color-status-success-subtle',
	'--color-status-warning-text',
	'--color-status-warning-subtle',
	'--color-status-error-text',
	'--color-status-error-subtle',
	'--color-status-error-foreground',
	'--color-status-info',
	'--color-status-info-text',
	'--color-status-info-subtle',
	'--color-interactive-hover',
	'--color-interactive-selected',
	'--color-interactive-focus-ring',
	'--shadow-sm',
	'--shadow-md',
	'--shadow-lg',
	'--font-mono',
]);

/**
 * The theme variables handed to the frame on `init` (RC-WID-2.4): the bridge's forwarded set, plus
 * every semantic token the Style step lets a `--widget-*` token point at, plus the ones the kit
 * draws with (RC-WID-5.4). A frame does not inherit host CSS, so a declared
 * `var(--color-surface-sunken)` the bridge's list did not carry would resolve to nothing inside it.
 * Still gated on `host-theme-tokens`, and still the semantic layer only.
 */
export function collectSandboxThemeVariables(
	definition: WidgetDefinition,
	read: (token: string) => string,
): Record<string, string> {
	const variables = collectThemeVariables(definition, read);
	if (!usesHostTheme(definition)) return variables;
	for (const token of [...STYLE_STEP_THEME_TOKENS, ...KIT_THEME_TOKENS]) {
		if (token in variables) continue;
		const value = read(token).trim();
		if (value !== '') variables[token] = value;
	}
	return variables;
}

/** Whether a definition asked to look like the host: its theme tokens, the kit, its attributes. */
function usesHostTheme(definition: WidgetDefinition): boolean {
	return (definition.style?.capabilities ?? []).includes('host-theme-tokens');
}

/** What the frame mirrors from the host `<html>`, so the kit's density and motion sets apply. */
interface HostDocumentLook {
	theme: string | null;
	density: string | null;
	motion: string | null;
	colorScheme: string | null;
	/** The host's root font size. Every kit length is in rem, and the frame's own root is 13px. */
	rootFontSize: string | null;
}

interface HostLook {
	themeVariables: Record<string, string>;
	hostDocument: HostDocumentLook | null;
}

/** Changes on the host `<html>` that can change what a themed frame should look like. */
const HOST_LOOK_ATTRIBUTES = ['data-theme', 'data-density', 'data-motion', 'style', 'class'];

/** Everything the frame is told about the host's appearance, read from ONE computed style. */
function readHostLook(definition: WidgetDefinition): HostLook {
	if (typeof window === 'undefined') return { themeVariables: {}, hostDocument: null };
	const root = document.documentElement;
	const style = window.getComputedStyle(root);
	return {
		themeVariables: collectSandboxThemeVariables(definition, (token) =>
			style.getPropertyValue(token),
		),
		hostDocument: usesHostTheme(definition)
			? {
					theme: root.getAttribute('data-theme'),
					density: root.getAttribute('data-density'),
					motion: root.getAttribute('data-motion'),
					colorScheme: style.getPropertyValue('color-scheme').trim() || null,
					rootFontSize: style.getPropertyValue('font-size').trim() || null,
				}
			: null,
	};
}

/** Whether a kit stylesheet declares the class-contract version this host speaks. */
export function kitDeclaresVersion(css: string, version: number): boolean {
	return new RegExp(`--kit-version:\\s*${version}\\s*;`).test(css);
}

let kitRequest: Promise<string | null> | null = null;

/**
 * The kit's text, fetched once per page and shared by every frame. The HOST fetches it, from its
 * own origin, and sends the text in `init`: the frame's `style-src 'unsafe-inline'` already admits
 * that, whereas letting the frame link it would have meant widening the sandbox policy (see
 * `renderer-isolation.ts`). A failed load resolves to null and is not cached, so the next frame
 * tries again; the frame is initialised without the kit rather than not at all.
 */
export function loadWidgetKit(): Promise<string | null> {
	if (kitRequest) return kitRequest;
	const attempt = fetchWidgetKit();
	kitRequest = attempt;
	void attempt.then((css) => {
		if (css === null && kitRequest === attempt) kitRequest = null;
	});
	return attempt;
}

async function fetchWidgetKit(): Promise<string | null> {
	if (typeof fetch !== 'function' || typeof document === 'undefined') return null;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), KIT_LOAD_TIMEOUT_MS);
	try {
		// Resolved against the app's base URL, like the sandbox document, so `./` builds work too.
		const url = new URL(`${WIDGET_KIT_STYLESHEET}?v=${WIDGET_KIT_VERSION}`, document.baseURI);
		const response = await fetch(url, { signal: controller.signal });
		if (!response.ok) return null;
		const css = await response.text();
		return kitDeclaresVersion(css, WIDGET_KIT_VERSION) ? css : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export function SandboxHost({
	widget,
	onCommand,
	previewPackage,
}: {
	widget: BoardWidget;
	onCommand?: WidgetCommandHandler;
	/**
	 * An UNINSTALLED package to run instead of looking this widget's type up in the registry, so the
	 * widget builder's preview (RC-WID-2.5) runs the draft in this very host rather than in a second
	 * one that could disagree with it. There is no package RECORD for a draft and none is invented:
	 * `approvedHostPermissions(null)` is empty, so a preview runs at exactly the trust an unreviewed
	 * package has after install — every host permission denied.
	 */
	previewPackage?: WidgetPackageDefinition;
}) {
	const runtime = useRuntime();
	const frameRef = useRef<HTMLIFrameElement | null>(null);
	const sentRef = useRef<{ props: string; configuration: string; binding: string } | null>(null);
	const lookRef = useRef<string | null>(null);
	const [ready, setReady] = useState(false);
	const [initialized, setInitialized] = useState(false);
	const [contentHeight, setContentHeight] = useState<number | null>(null);
	const [failure, setFailure] = useState<HostFailure | null>(null);

	const definition = previewPackage
		? (previewPackage.widgets.find((entry) => entry.type === widget.type) ?? null)
		: (findWidgetDefinition(runtime.state.widgets, widget.type) ?? null);
	const record: WidgetPackageRecord | null = previewPackage
		? null
		: (findPackageRecordForWidgetType(runtime.state.widgets, widget.type) ?? null);

	// The props the frame receives come from the SAME actor-filtered resolution the declarative
	// templates use (WID-1.2), so an untrusted renderer is fed exactly what the least-privileged
	// viewer of this surface may see. A `dm` audience query is withheld before it ever reaches a frame.
	const data = resolveWidgetTemplateData(runtime.state, runtime.activeActorId, definition, widget);

	const source = previewPackage ?? record?.package ?? null;
	const assembly = useMemo(
		() =>
			definition && source
				? assembleWidgetDocument(source, definition, widget.configuration)
				: null,
		[definition, source, widget.configuration],
	);

	const policyIssue = useMemo(() => {
		if (!definition) return null;
		const { issues } = resolveCustomWidgetRuntimePolicy(definition, {
			approvedPermissions: approvedHostPermissions(record),
		});
		// A missing sandbox declaration is not a refusal — the host supplies iframe isolation anyway.
		return issues.find((issue) => issue.code !== 'custom-runtime-missing-sandbox') ?? null;
	}, [definition, record]);

	const approved = useMemo(() => approvedHostPermissions(record), [record]);

	// Isolation is a statement about the OTHER widgets, so the host has to know who they are: the
	// instances sharing this widget's scene, which are exactly the ones that must survive its failure.
	const siblingIds = useMemo(() => {
		const scenes = runtime.state.scenes.scenes;
		for (const scene of Object.values(scenes)) {
			if (scene.widgets.some((instance) => instance.id === widget.id)) {
				return scene.widgets.map((instance) => instance.id);
			}
		}
		return [widget.id];
	}, [runtime.state.scenes.scenes, widget.id]);

	/** Post one host→guest message. Target origin is `*`: an opaque origin has no name to address. */
	const send = useCallback((kind: string, body: Record<string, unknown>) => {
		const frame = frameRef.current;
		if (!frame?.contentWindow) return;
		frame.contentWindow.postMessage(
			{ channel: WIDGET_HOST_CHANNEL, hostApiVersion: WIDGET_HOST_API_VERSION, kind, ...body },
			'*',
		);
	}, []);

	const answer = useCallback(
		(requestId: string, result: unknown) => send('result', { requestId, result }),
		[send],
	);

	const renderProps = useMemo<SandboxRenderProps>(
		() => ({
			widget: {
				id: widget.id,
				type: widget.type,
				title: widget.title,
				visibility: widget.visibility,
				width: widget.w,
				height: widget.h,
			},
			configuration: widget.configuration,
			binding: widget.bindingRef
				? {
						entityType: widget.bindingRef.entityType,
						entityId: widget.bindingRef.entityId,
						status: widget.status,
						statusNote: widget.statusNote,
					}
				: null,
			queries: data.queries,
			computed: data.computed,
			isDm: data.isDm,
		}),
		[widget, data],
	);

	/** Everything a guest message can mean. Each branch either relays to the core or refuses. */
	const handle = useCallback(
		(message: GuestMessage) => {
			if (!definition) return;
			switch (message.kind) {
				case 'ready': {
					setReady(true);
					const payload = assembly?.payload;
					if (!payload) return;
					// A themed package also gets the design-system kit (RC-WID-5.4), fetched here and sent
					// as text. The frame's `render` may arrive first; the guest holds it until installed.
					const kit = usesHostTheme(definition) ? loadWidgetKit() : Promise.resolve(null);
					void kit.then((kitCss) => {
						const look = readHostLook(definition);
						lookRef.current = JSON.stringify(look);
						send('init', {
							widgetInstanceId: widget.id,
							html: payload.html,
							css: payload.css,
							scripts: payload.scripts,
							themeVariables: look.themeVariables,
							hostDocument: look.hostDocument,
							kit: kitCss === null ? null : { version: WIDGET_KIT_VERSION, css: kitCss },
						});
						setInitialized(true);
					});
					return;
				}
				case 'requestPermission':
					answer(message.requestId, decidePermission(widget.id, message.capability, approved));
					return;
				case 'outbound':
					answer(message.requestId, decideOutbound(widget.id, message, definition, approved));
					return;
				case 'dispatch': {
					const decision = decideDispatch(definition, message.commandType);
					if (decision.accepted) onCommand?.(message.commandType, message.payload);
					answer(message.requestId, decision);
					return;
				}
				case 'resize':
					setContentHeight(clampContentHeight(message.height));
					return;
				case 'error': {
					setFailure({ diagnostic: isolateFrame(widget.id, siblingIds, 'crashed').message });
					return;
				}
			}
		},
		[definition, assembly, send, answer, widget.id, siblingIds, approved, onCommand],
	);

	// One listener per mounted host. A message is ours only if it came from our own frame's window.
	useEffect(() => {
		function onMessage(event: MessageEvent) {
			const frame = frameRef.current;
			if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
			const parsed = parseGuestMessage(event.data);
			if ('drop' in parsed) return;
			handle(parsed);
		}
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, [handle]);

	// A frame that never speaks is a frame that failed. Say so rather than showing an empty box.
	useEffect(() => {
		if (ready || failure) return;
		const timer = window.setTimeout(() => {
			setFailure({ diagnostic: isolateFrame(widget.id, siblingIds, 'crashed').message });
		}, READY_TIMEOUT_MS);
		return () => window.clearTimeout(timer);
	}, [ready, failure, widget.id, siblingIds]);

	// Keep the frame in step with the campaign. The runtime re-renders on every state change and rebuilds
	// these objects each time, so identity says nothing about whether anything the WIDGET can see moved
	// — the comparison is on the serialized values, or the frame would be re-rendered several times a
	// second for changes happening elsewhere in the vault. Configuration and binding get their own
	// message so a widget can react to a setting without being torn down and rebuilt.
	useEffect(() => {
		if (!ready) return;
		const next = {
			props: JSON.stringify(renderProps),
			configuration: JSON.stringify(widget.configuration),
			binding: JSON.stringify(renderProps.binding),
		};
		const previous = sentRef.current;
		if (previous === null) {
			send('render', { props: renderProps });
		} else {
			if (next.configuration !== previous.configuration) {
				send('configChanged', { configuration: widget.configuration });
			}
			if (next.binding !== previous.binding) {
				send('bindingChanged', { binding: renderProps.binding });
			}
			if (next.props !== previous.props) send('render', { props: renderProps });
		}
		sentRef.current = next;
	}, [ready, send, renderProps, widget.configuration]);

	// Keep a themed frame in step with the host's look. Switching theme, density or motion changes the
	// host `<html>`; without this the frame would keep the look it was initialised with for as long as
	// it stays on the board. Re-reads are compared by value, so unrelated style writes send nothing.
	useEffect(() => {
		if (!initialized || !definition || !usesHostTheme(definition)) return;
		if (typeof MutationObserver === 'undefined') return;
		const observer = new MutationObserver(() => {
			const look = readHostLook(definition);
			const serialized = JSON.stringify(look);
			if (serialized === lookRef.current) return;
			lookRef.current = serialized;
			send('theme', { themeVariables: look.themeVariables, hostDocument: look.hostDocument });
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: HOST_LOOK_ATTRIBUTES,
		});
		return () => observer.disconnect();
	}, [initialized, definition, send]);

	if (!definition || !source) {
		return <WidgetPlaceholder diagnostic="This widget's package is no longer installed." />;
	}
	if (policyIssue) return <WidgetPlaceholder diagnostic={policyIssue.message} />;
	if (assembly?.problem) {
		return <WidgetPlaceholder diagnostic={ASSEMBLY_COPY[assembly.problem]} />;
	}
	if (failure) return <WidgetPlaceholder diagnostic={failure.diagnostic} />;

	return (
		<iframe
			ref={frameRef}
			data-testid={`widget-sandbox-${widget.id}`}
			data-widget-sandbox={widget.type}
			data-content-height={contentHeight ?? ''}
			title={`${widget.title} — custom widget`}
			src={WIDGET_SANDBOX_DOCUMENT}
			sandbox={WIDGET_SANDBOX_ATTRIBUTE}
			style={{
				display: 'block',
				width: '100%',
				height: contentHeight === null ? '100%' : `${contentHeight}px`,
				maxHeight: '100%',
				border: 0,
				background: 'transparent',
			}}
		/>
	);
}
