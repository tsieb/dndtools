import { getContext, setContext } from 'svelte';
import { SceneRuntime } from '../canvas-runtime/runtime.svelte';

const KEY = Symbol('dndtools:v2:scene-runtime');

export function provideRuntime(runtime: SceneRuntime): SceneRuntime {
	setContext(KEY, runtime);
	return runtime;
}

export function useRuntime(): SceneRuntime {
	const runtime = getContext<SceneRuntime | undefined>(KEY);
	if (!runtime) {
		throw new Error('SceneRuntime context is missing; mount inside the root layout.');
	}
	return runtime;
}
