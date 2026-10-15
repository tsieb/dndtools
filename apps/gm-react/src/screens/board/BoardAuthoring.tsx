import { lazy, Suspense } from 'react';
import type { WidgetPackageDefinition } from '@dndtools/core';
import { useI18n } from '../../i18n';

// RC-ENG-3.2 — the authoring tools load on demand; a local Suspense keeps the board mounted.
const GenerateDialog = lazy(() =>
	import('../../app/widgetBuilder/GenerateDialog').then((module) => ({
		default: module.GenerateDialog,
	})),
);
const WidgetBuilder = lazy(() =>
	import('../extensions/WidgetBuilder').then((module) => ({ default: module.WidgetBuilder })),
);

/**
 * RC-CAN-4.1 — the gallery's "Generate with assistant" and "Build your own" entries. `builder.pkg`
 * is the generated package to open the builder on, or null for a blank one.
 */
export function BoardAuthoring({
	generateOpen,
	onGenerateClose,
	builder,
	onBuilder,
	onInstalled,
}: {
	generateOpen: boolean;
	onGenerateClose: () => void;
	builder: { pkg: WidgetPackageDefinition | null } | null;
	onBuilder: (next: { pkg: WidgetPackageDefinition | null } | null) => void;
	onInstalled: (pkg: WidgetPackageDefinition) => void;
}) {
	const { t } = useI18n();
	return (
		<Suspense fallback={<p role="status">{t('common.state.loading')}</p>}>
			{generateOpen && (
				<GenerateDialog
					open={generateOpen}
					onClose={onGenerateClose}
					onGenerated={(pkg) => {
						onGenerateClose();
						onBuilder({ pkg });
					}}
				/>
			)}
			{builder && (
				<WidgetBuilder
					generatedPackage={builder.pkg}
					onClose={() => onBuilder(null)}
					onInstalled={onInstalled}
				/>
			)}
		</Suspense>
	);
}
