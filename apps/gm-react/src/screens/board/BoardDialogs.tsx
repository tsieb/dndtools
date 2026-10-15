import type { WidgetPackageDefinition } from '@dndtools/core';
import { TemplatePicker } from '../../app/canvas/TemplatePicker';
import type { Viewport } from '../../app/useViewport';
import { BoardAuthoring } from './BoardAuthoring';

/**
 * RC-POL-1.2 — the board's modal flows, out of `Board.tsx`: the scene-template picker (RC-CAN-4.4)
 * and the gallery's "Generate with assistant" and "Build your own" entries (RC-CAN-4.1), which
 * `BoardAuthoring` loads on demand (RC-ENG-3.2). `builder.pkg` is the assistant's staged proposal,
 * or null for a blank widget; what the builder installs goes back to the gallery (RC-WID-6.2).
 */
export function BoardDialogs({
	viewport,
	sceneId,
	templatesOpen,
	onTemplatesClose,
	onTemplateApplied,
	generateOpen,
	onGenerateClose,
	builder,
	onBuilder,
	onBuilt,
}: {
	viewport: Viewport;
	sceneId: string | null;
	templatesOpen: boolean;
	onTemplatesClose: () => void;
	onTemplateApplied: () => void;
	generateOpen: boolean;
	onGenerateClose: () => void;
	builder: { pkg: WidgetPackageDefinition | null } | null;
	onBuilder: (next: { pkg: WidgetPackageDefinition | null } | null) => void;
	onBuilt: (pkg: WidgetPackageDefinition) => void;
}) {
	return (
		<>
			<TemplatePicker
				open={templatesOpen}
				onClose={onTemplatesClose}
				viewport={viewport}
				sceneId={sceneId}
				onApplied={onTemplateApplied}
			/>
			<BoardAuthoring
				generateOpen={generateOpen}
				onGenerateClose={onGenerateClose}
				builder={builder}
				onBuilder={onBuilder}
				onInstalled={onBuilt}
			/>
		</>
	);
}
