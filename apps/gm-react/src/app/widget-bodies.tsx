/**
 * widget-bodies — the barrel for the hand-written builtin widget bodies. RC-WID-4.1 split the bodies
 * themselves into `app/widgets/builtin/*.tsx` (one file per body); this module stays put so every
 * existing importer — `WidgetRenderSlot`, `SandboxHost`, `WorkerHost`, the template renderers and
 * the widget builder's preview — keeps the import path it already had.
 */
export {
	BUILTIN_WIDGET_TYPES,
	hasBuiltinBody,
	WidgetBody,
	type WidgetCommandHandler,
} from './widgets/builtin';
