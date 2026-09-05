import type { WidgetConfigControl, WidgetConfigField } from '@dndtools/core';
import { Field, Input, Select, Switch } from '../../ds';
import { T } from '../screen-kit';
import { DOCK_PREFERENCE_KEY, slugify } from './draft';
import {
	FieldGrid,
	RowCard,
	RowList,
	StepHeader,
	StepSection,
	issueFor,
	removeAt,
	replaceAt,
	type StepProps,
} from './fields';
import { CONTROLS, CONTROL_LABEL, FIELD_GROUP_LABEL } from './vocabulary';

/**
 * Config fields — the settings a DM edits on a PLACED copy of the widget (RC-WID-2.1).
 *
 * These are declarations, not values: the scene Inspector renders one control per field from this
 * list and writes the result through `scene.configure-widget`, so every field added here is a real
 * control on every instance. `draft.ts` derives the widget's `configurationSchema` from them, which
 * is what the core validates a configuration against.
 *
 * RC-WID-2.3 extends this step with per-control validation ranges and grouped previews.
 */

const CONTROL_OPTIONS = CONTROLS.map((control) => ({
	value: control,
	label: CONTROL_LABEL[control],
}));
const GROUP_OPTIONS = (['content', 'display', 'style'] as const).map((value) => ({
	value,
	label: FIELD_GROUP_LABEL[value],
}));

function defaultFor(control: WidgetConfigControl): unknown {
	if (control === 'number') return 0;
	if (control === 'toggle') return false;
	if (control === 'color') return 'var(--color-accent)';
	return '';
}

function defaultAsText(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'string') return value;
	return String(value);
}

export function ConfigStep({ draft, patch, issues }: StepProps) {
	const setField = (index: number, next: WidgetConfigField) =>
		patch({ configFields: replaceAt(draft.configFields, index, next) });

	const addField = () => {
		let index = draft.configFields.length + 1;
		while (draft.configFields.some((field) => field.key === `setting${index}`)) index += 1;
		patch({
			configFields: [
				...draft.configFields,
				{
					key: `setting${index}`,
					label: `Setting ${index}`,
					control: 'text',
					group: 'content',
					default: '',
				},
			],
		});
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader
				title="Config fields"
				help="What the DM can change on each placed copy. Every field here becomes a control in the scene Inspector."
			/>
			<StepSection title="Fields">
				{issueFor(issues, 'configFields') && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'configFields')}
					</span>
				)}
				<RowList
					empty="No settings yet. A widget with none is the same on every scene."
					addLabel="Add config field"
					onAdd={addField}
				>
					{draft.configFields.map((field, index) => (
						<RowCard
							key={`config-${index}`}
							title={field.label || field.key}
							removeLabel={`Remove config field ${field.label || field.key}`}
							onRemove={() => patch({ configFields: removeAt(draft.configFields, index) })}
						>
							<FieldGrid>
								<Field label="Label">
									<Input
										value={field.label}
										onChange={(e: { target: { value: string } }) =>
											setField(index, { ...field, label: e.target.value })
										}
									/>
								</Field>
								<Field
									label="Key"
									error={
										field.key === DOCK_PREFERENCE_KEY
											? 'That key is reserved for the dock preference.'
											: undefined
									}
								>
									<Input
										value={field.key}
										onChange={(e: { target: { value: string } }) =>
											setField(index, { ...field, key: slugify(e.target.value) })
										}
									/>
								</Field>
								<Field label="Control">
									<Select
										value={field.control}
										options={CONTROL_OPTIONS}
										onChange={(e: { target: { value: string } }) => {
											const control = e.target.value as WidgetConfigControl;
											setField(index, { ...field, control, default: defaultFor(control) });
										}}
									/>
								</Field>
								<Field label="Group">
									<Select
										value={field.group ?? 'content'}
										options={GROUP_OPTIONS}
										onChange={(e: { target: { value: string } }) =>
											setField(index, {
												...field,
												group: e.target.value as WidgetConfigField['group'],
											})
										}
									/>
								</Field>
							</FieldGrid>
							{field.control === 'toggle' ? (
								<Switch
									checked={field.default === true}
									label="Starts switched on"
									onChange={(next: boolean) => setField(index, { ...field, default: next })}
								/>
							) : (
								<Field label="Default value">
									<Input
										value={defaultAsText(field.default)}
										onChange={(e: { target: { value: string } }) => {
											const raw = e.target.value;
											setField(index, {
												...field,
												default:
													field.control === 'number'
														? Number.isFinite(Number(raw))
															? Number(raw)
															: 0
														: raw,
											});
										}}
									/>
								</Field>
							)}
							<Field label="Help text" help="Shown under the control in the Inspector.">
								<Input
									value={field.help ?? ''}
									onChange={(e: { target: { value: string } }) =>
										setField(index, { ...field, help: e.target.value || undefined })
									}
								/>
							</Field>
							{field.control === 'select' && (
								<Field
									label="Choices"
									help="One per line, or value=Label to give a choice its own wording."
								>
									<Input
										value={(field.options ?? []).map((o) => `${o.value}=${o.label}`).join(', ')}
										placeholder="calm=Calm, tense=Tense"
										onChange={(e: { target: { value: string } }) =>
											setField(index, {
												...field,
												options: e.target.value
													.split(',')
													.map((part) => part.trim())
													.filter(Boolean)
													.map((part) => {
														const [value, label] = part.split('=');
														return {
															value: (value ?? '').trim(),
															label: (label ?? value ?? '').trim(),
														};
													}),
											})
										}
									/>
								</Field>
							)}
						</RowCard>
					))}
				</RowList>
			</StepSection>
		</div>
	);
}
