import { type WidgetBindingDefinition } from '@dndtools/core';
import { Checkbox, Field, Input, Select } from '../../ds';
import { slugify, type WidgetDraft } from './draft';
import { FieldGrid, RowCard, RowList, removeAt, replaceAt } from './fields';
import { CAPABILITY_LABEL } from './vocabulary';

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
const BINDING_MODE_LABEL: Record<WidgetBindingDefinition['mode'], string> = {
	read: 'Read it',
	operate: 'Read and act on it',
	manage: 'Read, act on and change it',
	observe: 'Watch it for changes',
};

const BINDING_MODE_OPTIONS = (['read', 'operate', 'manage', 'observe'] as const).map((value) => ({
	value,
	label: BINDING_MODE_LABEL[value],
}));

const CAPABILITY_OPTIONS = (['viewer', 'operator', 'manager'] as const).map((value) => ({
	value,
	label: CAPABILITY_LABEL[value],
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
	const set = (index: number, next: WidgetBindingDefinition) =>
		onChange(replaceAt(bindings, index, next));
	return (
		<RowList
			empty={
				kind === 'required'
					? 'No required bindings. The widget draws without being pointed at anything.'
					: 'No optional bindings.'
			}
			addLabel={kind === 'required' ? 'Add required binding' : 'Add optional binding'}
			onAdd={onAdd}
		>
			{bindings.map((binding, index) => (
				<RowCard
					key={`${kind}-binding-${index}`}
					title={binding.label || binding.id}
					removeLabel={`Remove ${kind} binding ${binding.label || binding.id}`}
					onRemove={() => onChange(removeAt(bindings, index))}
				>
					<FieldGrid>
						<Field label="Label">
							<Input
								value={binding.label}
								onChange={(e: { target: { value: string } }) =>
									set(index, { ...binding, label: e.target.value })
								}
							/>
						</Field>
						<Field label="Id">
							<Input
								value={binding.id}
								onChange={(e: { target: { value: string } }) =>
									set(index, { ...binding, id: slugify(e.target.value) })
								}
							/>
						</Field>
						<Field
							label="Entity types"
							help="What it may be pointed at, separated by commas — for example character, npc."
						>
							<Input
								value={binding.entityTypes.join(', ')}
								onChange={(e: { target: { value: string } }) =>
									set(index, { ...binding, entityTypes: parseEntityTypes(e.target.value) })
								}
							/>
						</Field>
						<Field label="Mode" help="What the widget asks to do with it.">
							<Select
								value={binding.mode}
								options={BINDING_MODE_OPTIONS}
								onChange={(e: { target: { value: string } }) =>
									set(index, {
										...binding,
										mode: e.target.value as WidgetBindingDefinition['mode'],
									})
								}
							/>
						</Field>
						<Field label="Needs">
							<Select
								value={binding.requiredCapability}
								options={CAPABILITY_OPTIONS}
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
							label="The widget cannot draw without it"
							onChange={() => onMove(binding, index)}
						/>
					</div>
				</RowCard>
			))}
		</RowList>
	);
}
