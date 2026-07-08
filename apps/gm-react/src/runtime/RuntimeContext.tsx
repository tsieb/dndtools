import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useSyncExternalStore,
	type ReactNode,
} from 'react';
import { SceneRuntime } from './SceneRuntime';
import { defaultEnvironment } from './environment';

// The device owner. The app seeds a DM actor with this id (plus demo participants) on first load;
// the "view as" control switches which actor's filtered view is rendered.
export const DEFAULT_DM_ACTOR_ID = 'dm-1';

const RuntimeCtx = createContext<SceneRuntime | null>(null);

export function RuntimeProvider({ children }: { children: ReactNode }) {
	const ref = useRef<SceneRuntime | null>(null);
	if (ref.current === null) {
		ref.current = new SceneRuntime({
			env: defaultEnvironment(),
			defaultActorId: DEFAULT_DM_ACTOR_ID,
		});
	}
	const runtime = ref.current;

	useEffect(() => {
		void runtime.load();
		// DEV-only test seam: expose the live runtime so the round-trip verification (and manual
		// debugging) can dispatch commands and inspect the persisted Core state. Never present in a
		// production build (`import.meta.env.DEV` is statically false and tree-shaken out).
		if (import.meta.env.DEV) {
			(window as unknown as { __rt?: SceneRuntime }).__rt = runtime;
		}
	}, [runtime]);

	return <RuntimeCtx.Provider value={runtime}>{children}</RuntimeCtx.Provider>;
}

/**
 * Subscribe to the runtime. Any state change (load, dispatch, view-as, preview) bumps the version
 * and re-renders the consumer through `useSyncExternalStore`. Read `runtime.state` for the
 * actor-filtered CoreStateSlice and call `runtime.dispatch(command)` to mutate.
 */
export function useRuntime(): SceneRuntime {
	const runtime = useContext(RuntimeCtx);
	if (!runtime) throw new Error('useRuntime must be used within a RuntimeProvider');
	useSyncExternalStore(runtime.subscribe, runtime.getVersion, runtime.getVersion);
	return runtime;
}
