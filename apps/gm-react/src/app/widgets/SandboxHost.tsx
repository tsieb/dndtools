import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	findPackageRecordForWidgetType,
	findWidgetDefinition,
	resolveCustomWidgetRuntimePolicy,
	type WidgetPackageDefinition,
	type WidgetPackageRecord,
} from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { BoardWidget } from '../board-helpers';
import type { WidgetCommandHandler } from '../widget-bodies';
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
	const [ready, setReady] = useState(false);
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
					send('init', {
						widgetInstanceId: widget.id,
						html: payload.html,
						css: payload.css,
						scripts: payload.scripts,
						themeVariables: collectThemeVariables(definition, (token) =>
							typeof window === 'undefined'
								? ''
								: window.getComputedStyle(document.documentElement).getPropertyValue(token),
						),
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
