/**
 * Canvas manipulation & outline barrel (UX-CANVAS-002/003/004/005/006/009/012/015). The editor layer
 * that sits on top of the reusable viewport runtime: pure selection / transform / alignment / z-order /
 * undo / library / shortcut models, plus the reactive {@link CanvasManipulationController}. Surfaces
 * import from here so the manipulation model is built once, not per route.
 */

export * from './selection';
export * from './transform';
export * from './alignment';
export * from './z-order';
export * from './undo-stack';
export * from './widget-library';
export * from './canvas-shortcuts';
export * from './widget-chrome';
export * from './binding-inspector';
export * from './canvas-templates';
export * from './player-view-preview';
export * from './empty-canvas';
export {
	CanvasManipulationController,
	type LayoutCommand,
	type ManipWidget,
	type ManipulationHost,
} from './manipulation-controller.svelte';
