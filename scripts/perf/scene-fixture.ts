import type { CoreCommand } from '@dndtools/core';
import type { SceneRuntime } from '../../apps/gm-react/src/runtime/SceneRuntime';

/** Browser-side fixture setup, outside the timed first navigation. Uses durable commands. */
export async function seedLargeScene() {
	const rt = (window as unknown as { __rt: SceneRuntime }).__rt;
	const sceneId = rt.state.commandCenter.homeSceneId;
	if (!sceneId) throw new Error('Home scene absent');
	const commands = {
		async dispatch(type: string, payload: unknown) {
			const result = await rt.dispatch({
				type,
				actorId: rt.defaultActorId,
				payload,
			} as CoreCommand);
			if (result.status !== 'accepted') throw new Error(JSON.stringify(result.rejection));
		},
	};
	const originals = [...rt.state.scenes.scenes[sceneId].widgets];
	if (!originals.length || originals.length > 50) throw new Error('Unexpected demo fixture');
	// Demo hydration auto-binds every map tile. Use non-map tiles for the other 40.
	const unbound = originals.filter((widget) => widget.type !== 'map');
	if (!unbound.length) throw new Error('No unbound demo widget types');
	const mapId = Object.keys(rt.state.maps.maps)[0];
	if (!mapId) throw new Error('Demo map absent');
	for (const widget of originals) {
		await commands.dispatch('scene.destroy-widget', { sceneId, widgetInstanceId: widget.id });
	}
	for (let i = 0; i < 50; i++) {
		const source =
			i < 10
				? { type: 'map', version: '1.0.0', configuration: {}, localState: {} }
				: unbound[i % unbound.length];
		await commands.dispatch('scene.add-widget', {
			sceneId,
			widget: {
				type: source.type,
				version: source.version,
				configuration: source.configuration,
				localState: source.localState,
				layout: { x: (i % 5) * 240, y: Math.floor(i / 5) * 180, w: 240, h: 180 },
				binding:
					i < 10
						? {
								source: { entityType: 'map', entityId: mapId },
								mode: 'read',
								requiredCapability: 'viewer',
							}
						: null,
			},
		});
	}
}
