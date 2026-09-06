import { classifyWidgetCommand } from '@dndtools/core';
import { useState } from 'react';
import { Button, DefinitionList, Field, Input, Select, Switch, Textarea } from '../../../ds';
import { useI18n } from '../../../i18n';
import {
	ComputedFields,
	TemplateNote,
	TemplateShell,
	cfg,
	type WidgetTemplateProps,
} from './shared';

/**
 * `form-panel` — collect a few values and send them somewhere (RC-WID-1.2): a loot entry, a rumour,
 * a countdown's new length. The fields are the definition's `configFields` in the `content` group,
 * and Submit dispatches the widget's first declared command through `widget.dispatch-command`, where
 * the core validates the payload against the command's declared schema and checks operator
 * authority. This template never writes state itself.
 *
 * Fail closed, and never fake a success:
 *
 * - A definition with no declared command has nothing to submit TO, so the fields are shown as a
 *   read-only summary of the current settings instead of an editable form that goes nowhere.
 * - A `manager` command is not offered to a viewer without DM authority.
 * - While the layout is being edited `onCommand` is absent, so Submit is soft-disabled and says why
 *   rather than swallowing the press.
 *
 * Local edits stay local until Submit — nothing is persisted by typing, so an abandoned draft never
 * becomes an op.
 */
export function FormPanelTemplate({ widget, definition, data, onCommand }: WidgetTemplateProps) {
	const { t } = useI18n();
	const fields = (definition?.configFields ?? widget.configFields).filter(
		(field) => (field.group ?? 'content') === 'content',
	);
	// The same fail-closed test `action-panel` makes: a configure VERB is a configure action whatever
	// the descriptor declares, so a viewer is never offered a Submit the core would refuse.
	const command =
		(definition?.commands ?? []).find(
			(candidate) => classifyWidgetCommand(candidate) === 'operate' || data.isDm,
		) ?? null;

	const [values, setValues] = useState<Record<string, unknown>>({});
	const valueOf = (key: string): unknown => (key in values ? values[key] : cfg(widget, key));
	const set = (key: string, value: unknown) =>
		setValues((previous) => ({ ...previous, [key]: value }));

	if (fields.length === 0) {
		return (
			<TemplateShell testId="widget-template-form-panel">
				<TemplateNote>{t('widgetTemplate.noFields')}</TemplateNote>
				<ComputedFields data={data} />
			</TemplateShell>
		);
	}

	if (!command) {
		return (
			<TemplateShell testId="widget-template-form-panel">
				<TemplateNote>{t('widgetTemplate.noAction')}</TemplateNote>
				<DefinitionList
					layout="stacked"
					items={fields.map((field) => ({
						label: field.label,
						value: String(cfg(widget, field.key) ?? ''),
					}))}
				/>
				<ComputedFields data={data} />
			</TemplateShell>
		);
	}

	return (
		<TemplateShell testId="widget-template-form-panel">
			<ComputedFields data={data} />
			{fields.map((field) => {
				const value = valueOf(field.key);
				if (field.control === 'toggle') {
					return (
						<Switch
							key={field.key}
							label={field.label}
							checked={value === true}
							onChange={(next: boolean) => set(field.key, next)}
						/>
					);
				}
				return (
					<Field key={field.key} label={field.label} help={field.help}>
						{field.control === 'select' ? (
							<Select
								options={field.options ?? []}
								value={value == null ? '' : String(value)}
								onChange={(event: { target: { value: string } }) =>
									set(field.key, event.target.value)
								}
							/>
						) : field.control === 'textarea' ? (
							<Textarea
								rows={2}
								value={value == null ? '' : String(value)}
								placeholder={field.placeholder}
								onChange={(event: { target: { value: string } }) =>
									set(field.key, event.target.value)
								}
							/>
						) : (
							<Input
								type={
									field.control === 'number'
										? 'number'
										: field.control === 'color'
											? 'color'
											: 'text'
								}
								value={value == null ? '' : String(value)}
								placeholder={field.placeholder}
								min={field.min}
								max={field.max}
								step={field.step}
								onChange={(event: { target: { value: string } }) =>
									set(
										field.key,
										field.control === 'number' ? Number(event.target.value) : event.target.value,
									)
								}
							/>
						)}
					</Field>
				);
			})}
			{/* No local "Sent" confirmation: the dispatch is asynchronous and the core may reject it, so
			    anything this component printed on click would be a guess. The screen that owns the
			    dispatch reports the real outcome through its status channel. */}
			<Button
				size="sm"
				variant="primary"
				style={{ alignSelf: 'flex-start' }}
				aria-disabled={onCommand ? undefined : true}
				title={onCommand ? undefined : 'Finish editing the layout to use this.'}
				onClick={
					onCommand
						? () =>
								onCommand(
									command.type,
									Object.fromEntries(fields.map((field) => [field.key, valueOf(field.key)])),
								)
						: undefined
				}
			>
				{command.displayName}
			</Button>
		</TemplateShell>
	);
}
