import type { WidgetPackageDefinition } from '@dndtools/core';
import { TemplatePicker } from '../../app/canvas/TemplatePicker';
import { GenerateDialog } from '../../app/widgetBuilder/GenerateDialog';
import type { Viewport } from '../../app/useViewport';
import { WidgetBuilder } from '../extensions/WidgetBuilder';

/**
 * RC-POL-1.2 — the board's modal flows, out of `Board.tsx`: the scene-template picker (RC-CAN-4.4)
 * and the gallery's "Generate with assistant" and "Build your own" entries (RC-CAN-4.1). `builder.pkg`
 * is the assistant's staged proposal, or null for a blank widget; neither is durable until the
 * builder installs it, and what it installs goes back to the gallery through `onBuilt` (RC-WID-6.2).
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
	onBuilt: (pkg: WidgetPackageDefinition | null) => void;
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
			<GenerateDialog
				open={generateOpen}
				onClose={onGenerateClose}
				onGenerated={(pkg) => {
					onGenerateClose();
					onBuilder({ pkg });
				}}
			/>
			{builder && (
				<WidgetBuilder
					generatedPackage={builder.pkg}
					onClose={() => onBuilder(null)}
					onInstalled={onBuilt}
				/>
			)}
		</>
	);
}
