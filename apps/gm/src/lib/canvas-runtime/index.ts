/**
 * Canvas runtime barrel (UX-CANVAS-001/014/016). The reusable viewport + performance + gesture
 * foundation every spatial surface consumes. Re-exports the pure math/perf/gesture modules and the
 * reactive `ViewportController`; the existing `SceneRuntime` (scene state + command dispatch) stays in
 * `./runtime.svelte` and is exported here too so surfaces have one import site for the canvas runtime.
 */

export * from './viewport';
export * from './virtualize';
export * from './perf';
export * from './gestures';
export { ViewportController } from './viewport-controller.svelte';
export { SceneRuntime, defaultEnvironment, MAP_IMPORT_ADAPTERS } from './runtime.svelte';
