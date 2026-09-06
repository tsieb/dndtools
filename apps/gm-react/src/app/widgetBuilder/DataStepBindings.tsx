import { type WidgetBindingDefinition } from '@dndtools/core';
import { Checkbox, Field, Input, Select } from '../../ds';
import { slugify, type WidgetDraft } from './draft';
import { FieldGrid, RowCard, RowList, removeAt, replaceAt, type Translate } from './fields';
import { CAPABILITY_LABEL } from './vocabulary';
import { useI18n, type MessageKey } from '../../i18n';

/**
 * The Data step's binding editor (RC-WID-2.2).
 *
 * A binding is what a PLACED copy is pointed at, declared here as a contract rather than resolved:
 * the id the definition refers to it by, the entity types it accepts, and the MODE it asks for.
 * The mode is not decoration — `widget-operator-authority.ts` reads it to decide whether a viewer
 * may fire the widget's commands, so "read it" and "read, act on and change it" are two different
 * asks and the author has to make one of them on purpose.
 *
 * Required and optional bindings are the same declaration with different consequences: a required
 * one makes the widget refuse to draw until the DM points it at something. They share this editor
 * so a binding can move between the two lists without being retyped.
 */

/** What a binding asks to do with the entity it is pointed at. Verbs first, no engine jargon. */
const BINDING_MODE_LABEL: Record<WidgetBindingDefinition['mode'], MessageKey> = {
	read: 'builder.bindingMode.read',
	operate: 'builder.bindingMode.operate',
	manage: 'builder.bindingMode.manage',
	observe: 'builder.bindingMode.observe',
};

const bindingModeOptions = (t: Translate) =>
	(['read', 'operate', 'manage', 'observe'] as const).map((value) => ({
		value,
		label: t(BINDING_MODE_LABEL[value]),
	}));

const capabilityOptions = (t: Translate) =>
	(['viewer', 'operator', 'manager'] as const).map((value) => ({
		value,
		label: t(CAPABILITY_LABEL[value]),
	}));

/** An id no binding in the draft is using, whichever list it sits in. */
export function nextBindingId(draft: WidgetDraft): string {
	const taken = new Set(
		[...draft.requiredBindings, ...draft.optionalBindings].map((binding) => binding.id),
	);
	let index = taken.size + 1;
	while (taken.has(`binding-${index}`)) index += 1;
	return `binding-${index}`;
}

/** Comma-separated text ⇄ the entity-type list, so one input declares several accepted types. */
function parseEntityTypes(value: string): string[] {
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

export function BindingRows({
	bindings,
	kind,
	onChange,
	onAdd,
	onMove,
}: {
	bindings: WidgetBindingDefinition[];
	kind: 'required' | 'optional';
	onChange: (next: WidgetBindingDefinition[]) => void;
	onAdd: () => void;
	onMove: (binding: WidgetBindingDefinition, index: number) => void;
}) {
	const { t } = useI18n();
	const set = (index: number, next: WidgetBindingDefinition) =>
		onChange(replaceAt(bindings, index, next));
	return (
		<RowList
			empty={t(kind === 'required' ? 'builder.binding.noRequired' : 'builder.binding.noOptional')}
			addLabel={t(
				kind === 'required' ? 'builder.binding.addRequired' : 'builder.binding.addOptional',
			)}
			onAdd={onAdd}
		>
			{bindings.map((binding, index) => (
				<RowCard
					key={`${kind}-binding-${index}`}
					title={binding.label || binding.id}
					removeLabel={t(
						kind === 'required'
							? 'builder.binding.removeRequired'
							: 'builder.binding.removeOptional',
						{ name: binding.label || binding.id },
					)}
					onRemove={() => onChange(removeAt(bindings, index))}
				>
					<FieldGrid>
						<Field label={t('builder.binding.label')}>
							<Input
								value={binding.label}
								onChange={(e: { target: { value: string } }) =>
									set(index, { ...binding, label: e.target.value })
								}
							/>
						</Field>
						<Field label={t('builder.binding.id')}>
							<Input
								value={binding.id}
								onChange={(e: { target: { value: string } }) =>
									set(index, { ...binding, id: slugify(e.target.value) })
								}
							/>
						</Field>
						<Field
							label={t('builder.binding.entityTypes')}
							help={t('builder.binding.entityTypesHelp')}
						>
							<Input
								value={binding.entityTypes.join(', ')}
								onChange={(e: { target: { value: string } }) =>
									set(index, { ...binding, entityTypes: parseEntityTypes(e.target.value) })
								}
							/>
						</Field>
						<Field label={t('builder.binding.mode')} help={t('builder.binding.modeHelp')}>
							<Select
								value={binding.mode}
								options={bindingModeOptions(t)}
								onChange={(e: { target: { value: string } }) =>
									set(index, {
										...binding,
										mode: e.target.value as WidgetBindingDefinition['mode'],
									})
								}
							/>
						</Field>
						<Field label={t('builder.binding.needs')}>
							<Select
								value={binding.requiredCapability}
								options={capabilityOptions(t)}
								onChange={(e: { target: { value: string } }) =>
									set(index, {
										...binding,
										requiredCapability: e.target
											.value as WidgetBindingDefinition['requiredCapability'],
									})
								}
							/>
						</Field>
					</FieldGrid>
					<div>
						<Checkbox
							checked={kind === 'required'}
							label={t('builder.binding.cannotDrawWithout')}
							onChange={() => onMove(binding, index)}
						/>
					</div>
				</RowCard>
			))}
		</RowList>
	);
}
