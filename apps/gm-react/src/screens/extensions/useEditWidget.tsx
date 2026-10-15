import { lazy, Suspense, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { widgetPackageForkIdentity } from '@dndtools/core';
import { Toaster } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	editStepFor,
	readPackage,
	widgetEditTarget,
	type BuilderStepId,
} from '../../app/widgetBuilder/draft';
import { useI18n } from '../../i18n';

// RC-ENG-3.2 — the builder loads when a GM opens it. Every tile menu and the scene Inspector call this
// hook, so a static import put the whole builder on the app's boot path.
const WidgetBuilder = lazy(() =>
	import('./WidgetBuilder').then((module) => ({ default: module.WidgetBuilder })),
);

/** Edit a placed widget, forking first when the installed definition belongs to someone else. */
export function useEditWidget(widgetInstanceId: string, widgetType: string) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [session, setSession] = useState<{
		packageId: string;
		step: BuilderStepId;
		/** The tile's own type, to go back to if the builder closes with the copy still off. */
		revertTo: string | null;
	} | null>(null);
	const busyRef = useRef(false);
	const dmId = runtime.defaultActorId;
	const target = widgetEditTarget(runtime.state, widgetType);
	const available =
		!runtime.preview && runtime.state.permissions.actors[dmId]?.role === 'dm' && target !== null;

	/** Move this tile onto `type`; a refusal is shown, and the copy is still saved either way. */
	const repoint = async (type: string) => {
		const scene = Object.values(runtime.state.scenes.scenes).find((candidate) =>
			candidate.widgets.some((instance) => instance.id === widgetInstanceId),
		);
		const instance = scene?.widgets.find((candidate) => candidate.id === widgetInstanceId);
		if (!scene || !instance || instance.type === type) return;
		const result = await runtime.dispatch({
			type: 'scene.repoint-widget',
			actorId: dmId,
			payload: { sceneId: scene.id, widgetInstanceId, widgetType: type },
		});
		if (result.status !== 'accepted') Toaster.error(result.rejection.message);
	};

	const open = async () => {
		if (!available || !target || busyRef.current) return;
		busyRef.current = true;
		try {
			let copy = target.kind === 'fork' ? undefined : target.record;
			if (target.kind === 'fork') {
				const identity = widgetPackageForkIdentity(runtime.state.widgets, widgetType);
				const name = target.name;
				const result = await runtime.dispatch({
					type: 'widget.package.fork',
					actorId: dmId,
					payload: {
						packageId: target.source.package.id,
						widgetType,
						forkPackageId: identity.packageId,
						forkWidgetType: identity.widgetType,
						displayName: t('extensions.builder.forkName', { name }),
					},
				});
				if (result.status !== 'accepted') {
					Toaster.error(result.rejection.message);
					return;
				}
				copy = runtime.state.widgets.packages[identity.packageId];
				Toaster.info(t('extensions.builder.forked', { name }));
			}
			if (!copy) return;
			if (target.kind !== 'own') await repoint(copy.package.widgets[0]!.type);
			const step = editStepFor(readPackage(copy.package));
			const revertTo = target.kind === 'own' ? null : widgetType;
			setSession({ packageId: copy.package.id, step, revertTo });
		} finally {
			busyRef.current = false;
		}
	};

	const editing = session ? runtime.state.widgets.packages[session.packageId] : undefined;
	// A portal still bubbles through the React tree, and a tile menu sits inside the canvas: a key in
	// the builder would reach its shortcuts (Ctrl+Z undoes the board) and a wheel would pan it. The
	// fence stops them; the builder hears its own keys on its overlay first.
	const fence = (e: React.SyntheticEvent) => e.stopPropagation();
	const editor =
		session && editing
			? createPortal(
					<div onKeyDown={fence} onKeyUp={fence} onWheel={fence} onContextMenu={fence}>
						<Suspense fallback={null}>
							<WidgetBuilder
								editPackage={editing.package}
								initialStep={session.step}
								onClose={() => {
									setSession(null);
									if (
										session.revertTo &&
										!runtime.state.widgets.packages[session.packageId]?.enabled
									)
										void repoint(session.revertTo);
								}}
							/>
						</Suspense>
					</div>,
					document.body,
				)
			: null;
	return { available, open, editor };
}
