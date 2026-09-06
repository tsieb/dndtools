import { Field, Input, Select } from '../../ds';
import { type DockPreference } from './draft';
import { FieldGrid, StepHeader, StepSection, issueFor, type StepProps } from './fields';
import { DOCK_PREFERENCE_LABEL, RESIZE_LABEL } from './vocabulary';
import { useI18n, type MessageKey, type MessageValues } from '../../i18n';

type Translate = (key: MessageKey, values?: MessageValues) => string;

/**
 * Layout — how big the widget starts, how small it may get, whether it resizes, and where it
 * prefers to sit (RC-WID-2.1).
 *
 * The dock preference is declared as a `display` config field rather than a new schema field, so it
 * persists with the instance, appears in the Inspector's Display group like any other setting, and
 * needs no `schemaVersion` bump. `draft.ts` builds that field; this step only picks its default.
 */

// Both option lists are copy, so they are built per locale rather than frozen at module load.
const dockOptions = (t: Translate) =>
	(Object.keys(DOCK_PREFERENCE_LABEL) as DockPreference[]).map((value) => ({
		value,
		label: t(DOCK_PREFERENCE_LABEL[value]),
	}));

const resizeOptions = (t: Translate) =>
	(Object.keys(RESIZE_LABEL) as (keyof typeof RESIZE_LABEL)[]).map((value) => ({
		value,
		label: t(RESIZE_LABEL[value]),
	}));

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
	const { t } = useI18n();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader title={t('builder.layout.title')} help={t('builder.layout.help')} />
			<StepSection
				title={t('builder.layout.defaultSize')}
				help={t('builder.layout.defaultSizeHelp')}
			>
				<FieldGrid>
					{numberField(
						t('builder.layout.defaultWidth'),
						draft.defaultSize.width,
						issueFor(issues, 'defaultSize.width', t),
						(width) => patch({ defaultSize: { ...draft.defaultSize, width } }),
					)}
					{numberField(
						t('builder.layout.defaultHeight'),
						draft.defaultSize.height,
						issueFor(issues, 'defaultSize.height', t),
						(height) => patch({ defaultSize: { ...draft.defaultSize, height } }),
					)}
				</FieldGrid>
			</StepSection>
			<StepSection title={t('builder.layout.minSize')} help={t('builder.layout.minSizeHelp')}>
				<FieldGrid>
					{numberField(
						t('builder.layout.minWidth'),
						draft.minSize.width,
						issueFor(issues, 'minSize.width', t),
						(width) => patch({ minSize: { ...draft.minSize, width } }),
					)}
					{numberField(
						t('builder.layout.minHeight'),
						draft.minSize.height,
						issueFor(issues, 'minSize.height', t),
						(height) => patch({ minSize: { ...draft.minSize, height } }),
					)}
				</FieldGrid>
			</StepSection>
			<StepSection title={t('builder.layout.behaviour')}>
				<FieldGrid>
					<Field label={t('builder.layout.resizePolicy')}>
						<Select
							value={draft.resizePolicy}
							options={resizeOptions(t)}
							onChange={(e: { target: { value: string } }) =>
								patch({ resizePolicy: e.target.value as typeof draft.resizePolicy })
							}
						/>
					</Field>
					<Field
						label={t('builder.layout.dockPreference')}
						help={t('builder.layout.dockPreferenceHelp')}
					>
						<Select
							value={draft.dockPreference}
							options={dockOptions(t)}
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
