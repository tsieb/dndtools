import { Field, Input, Select } from '../../ds';
import { DOCK_PREFERENCE_LABEL, type DockPreference } from './draft';
import { FieldGrid, StepHeader, StepSection, issueFor, type StepProps } from './fields';
import { RESIZE_LABEL } from './vocabulary';

/**
 * Layout — how big the widget starts, how small it may get, whether it resizes, and where it
 * prefers to sit (RC-WID-2.1).
 *
 * The dock preference is declared as a `display` config field rather than a new schema field, so it
 * persists with the instance, appears in the Inspector's Display group like any other setting, and
 * needs no `schemaVersion` bump. `draft.ts` builds that field; this step only picks its default.
 */

const DOCK_OPTIONS = (Object.keys(DOCK_PREFERENCE_LABEL) as DockPreference[]).map((value) => ({
	value,
	label: DOCK_PREFERENCE_LABEL[value],
}));

const RESIZE_OPTIONS = (Object.keys(RESIZE_LABEL) as (keyof typeof RESIZE_LABEL)[]).map(
	(value) => ({ value, label: RESIZE_LABEL[value] }),
);

function numberField(
	label: string,
	value: number,
	error: string | undefined,
	onChange: (next: number) => void,
) {
	return (
		<Field label={label} error={error}>
			<Input
				type="number"
				min={1}
				value={String(value)}
				onChange={(e: { target: { value: string } }) => {
					const next = Number.parseInt(e.target.value, 10);
					onChange(Number.isFinite(next) ? next : 0);
				}}
			/>
		</Field>
	);
}

export function LayoutStep({ draft, patch, issues }: StepProps) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader
				title="Layout"
				help="The size the widget is placed at, the smallest it may be squeezed to, and how it behaves when a surface docks widgets."
			/>
			<StepSection title="Default size" help="Measured in canvas pixels.">
				<FieldGrid>
					{numberField(
						'Default width',
						draft.defaultSize.width,
						issueFor(issues, 'defaultSize.width'),
						(width) => patch({ defaultSize: { ...draft.defaultSize, width } }),
					)}
					{numberField(
						'Default height',
						draft.defaultSize.height,
						issueFor(issues, 'defaultSize.height'),
						(height) => patch({ defaultSize: { ...draft.defaultSize, height } }),
					)}
				</FieldGrid>
			</StepSection>
			<StepSection title="Minimum size" help="A widget is never squeezed below this.">
				<FieldGrid>
					{numberField(
						'Minimum width',
						draft.minSize.width,
						issueFor(issues, 'minSize.width'),
						(width) => patch({ minSize: { ...draft.minSize, width } }),
					)}
					{numberField(
						'Minimum height',
						draft.minSize.height,
						issueFor(issues, 'minSize.height'),
						(height) => patch({ minSize: { ...draft.minSize, height } }),
					)}
				</FieldGrid>
			</StepSection>
			<StepSection title="Behaviour">
				<FieldGrid>
					<Field label="Resize policy">
						<Select
							value={draft.resizePolicy}
							options={RESIZE_OPTIONS}
							onChange={(e: { target: { value: string } }) =>
								patch({ resizePolicy: e.target.value as typeof draft.resizePolicy })
							}
						/>
					</Field>
					<Field
						label="Dock preference"
						help="Saved as a display setting on every placed copy. The scene canvas is free-form and leaves it alone."
					>
						<Select
							value={draft.dockPreference}
							options={DOCK_OPTIONS}
							onChange={(e: { target: { value: string } }) =>
								patch({ dockPreference: e.target.value as DockPreference })
							}
						/>
					</Field>
				</FieldGrid>
			</StepSection>
		</div>
	);
}
