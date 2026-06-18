<script lang="ts">
	// Test harness: provides a SceneRuntime via context so runtime-dependent widget renderers
	// (MapWidget, the data templates) can be rendered through the unified WidgetView in unit tests.
	import type { WidgetDefinition, WidgetInstance, WidgetSurface } from '@dndtools/core';
	import type { SceneRuntime } from '$lib/canvas-runtime/runtime.svelte';
	import { provideRuntime } from '$lib/state/runtime-context';
	import WidgetView from '$lib/gui/ux-canvas/widgets/WidgetView.svelte';

	interface Props {
		runtime: SceneRuntime;
		definition: WidgetDefinition;
		widget?: WidgetInstance | null;
		config?: Record<string, unknown>;
		surface?: WidgetSurface;
	}
	const { runtime, definition, widget = null, config, surface = 'scene' }: Props = $props();
	// svelte-ignore state_referenced_locally
	// One-shot test harness: capturing the initial runtime to seed context is exactly intended.
	provideRuntime(runtime);
</script>

<WidgetView {definition} {widget} {config} {surface} />
