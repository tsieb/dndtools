import {
	classifyWidgetCommand,
	type WidgetCommandDescriptor,
	type WidgetOutputDestinationClass,
} from '@dndtools/core';
import { Badge, Field, Input, Select } from '../../ds';
import { T } from '../screen-kit';
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
import { CAPABILITY_LABEL, WRITES_TO_LABEL } from './vocabulary';
import { useI18n, type MessageKey, type MessageValues } from '../../i18n';

type Translate = (key: MessageKey, values?: MessageValues) => string;

/**
 * Commands — the actions a placed copy of this widget can take (RC-WID-2.1).
 *
 * A command is a DECLARATION the core enforces: `widget.dispatch-command` validates the payload
 * against the descriptor and `classifyWidgetCommand` decides whether it is an operate action a
 * player-operator may fire or a configure action only a manager may. That classification is shown
 * live on each row, so the authority a command will actually have is visible while it is written,
 * not discovered later.
 *
 * The catalogue below is the starting point RC-WID-2.3 grows into the full templated set with
 * per-command payload builders.
 */

/** `label` names the chip in the picker and is translated; the descriptor's `displayName` is
 * written into the built package, so like every other stored label it stays in the source
 * language until the author renames it. */
interface CatalogEntry {
	label: MessageKey;
	descriptor: (typeId: string) => WidgetCommandDescriptor;
}

const CATALOG: CatalogEntry[] = [
	{
		label: 'builder.catalog.roll',
		descriptor: (typeId) => ({
			type: `${typeId}.roll`,
			displayName: 'Roll',
			requiredCapability: 'operator',
			payloadSchema: { type: 'object', properties: { formula: { type: 'string' } } },
			writesTo: 'session',
			destinationClass: 'session',
		}),
	},
	{
		label: 'builder.catalog.advance',
		descriptor: (typeId) => ({
			type: `${typeId}.advance`,
			displayName: 'Advance',
			requiredCapability: 'operator',
			payloadSchema: { type: 'object', properties: { by: { type: 'number' } } },
			writesTo: 'scene',
			destinationClass: 'scene',
		}),
	},
	{
		label: 'builder.catalog.tick',
		descriptor: (typeId) => ({
			type: `${typeId}.tick`,
			displayName: 'Tick',
			requiredCapability: 'operator',
			payloadSchema: { type: 'object' },
			writesTo: 'scene',
			destinationClass: 'scene',
		}),
	},
	{
		label: 'builder.catalog.reset',
		descriptor: (typeId) => ({
			type: `${typeId}.reset`,
			displayName: 'Reset',
			requiredCapability: 'operator',
			payloadSchema: { type: 'object' },
			writesTo: 'scene',
			destinationClass: 'scene',
		}),
	},
	{
		label: 'builder.catalog.setValue',
		descriptor: (typeId) => ({
			type: `${typeId}.set-config`,
			displayName: 'Set value',
			requiredCapability: 'manager',
			payloadSchema: { type: 'object', properties: { value: { type: 'string' } } },
			writesTo: 'scene',
			destinationClass: 'scene',
		}),
	},
	{
		label: 'builder.catalog.show',
		descriptor: (typeId) => ({
			type: `${typeId}.show`,
			displayName: 'Show to players',
			requiredCapability: 'operator',
			payloadSchema: { type: 'object', properties: { text: { type: 'string' } } },
			writesTo: 'scene',
			destinationClass: 'player-visible-state',
		}),
	},
];

const capabilityOptions = (t: Translate) =>
	(['viewer', 'operator', 'manager'] as const).map((value) => ({
		value,
		label: t(CAPABILITY_LABEL[value]),
	}));
const writesToOptions = (t: Translate) =>
	(['scene', 'session', 'entity'] as const).map((value) => ({
		value,
		label: t(WRITES_TO_LABEL[value]),
	}));
// The five destinations this step offers. The core's class union is wider (it also carries the
// classes only an installed package can reach), so this is a partial map on purpose.
const DESTINATION_LABEL: Partial<Record<WidgetOutputDestinationClass, MessageKey>> = {
	scene: 'builder.writesTo.scene',
	session: 'builder.writesTo.session',
	entity: 'builder.writesTo.entity',
	'player-visible-state': 'builder.destination.playerVisibleState',
	'player-scene': 'builder.destination.playerScene',
};
const destinationOptions = (t: Translate) =>
	(Object.keys(DESTINATION_LABEL) as WidgetOutputDestinationClass[]).map((value) => ({
		value,
		label: t(DESTINATION_LABEL[value] ?? 'builder.writesTo.scene'),
	}));

const KIND_COPY: Record<'operate' | 'configure', { label: MessageKey; help: MessageKey }> = {
	operate: {
		label: 'builder.commandKind.operate',
		help: 'builder.commandKind.operateHelp',
	},
	configure: {
		label: 'builder.commandKind.configure',
		help: 'builder.commandKind.configureHelp',
	},
};

export function CommandsStep({ draft, patch, issues }: StepProps) {
	const { t } = useI18n();
	const setCommand = (index: number, next: WidgetCommandDescriptor) =>
		patch({ commands: replaceAt(draft.commands, index, next) });

	const addCommand = (entry: CatalogEntry) => {
		const descriptor = entry.descriptor(draft.typeId || 'widget');
		if (draft.commands.some((command) => command.type === descriptor.type)) return;
		patch({ commands: [...draft.commands, descriptor] });
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader title={t('builder.step.commands')} help={t('builder.commands.help')} />
			<StepSection
				title={t('builder.commands.catalogTitle')}
				help={t('builder.commands.catalogHelp')}
			>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
					{CATALOG.map((entry) => {
						const type = entry.descriptor(draft.typeId || 'widget').type;
						const already = draft.commands.some((command) => command.type === type);
						return (
							<button
								key={entry.label}
								type="button"
								disabled={already}
								onClick={() => addCommand(entry)}
								style={{
									font: `600 12px ${T.sans}`,
									color: already ? T.ter : T.ink,
									padding: '6px 11px',
									borderRadius: 999,
									border: `1px solid ${already ? T.bd : T.bdS}`,
									background: already ? T.sunken : T.surf,
									cursor: already ? 'default' : 'pointer',
								}}
							>
								{already
									? t('builder.commands.alreadyAdded', { label: t(entry.label) })
									: t(entry.label)}
							</button>
						);
					})}
				</div>
			</StepSection>
			<StepSection title={t('builder.commands.declared')}>
				{issueFor(issues, 'commands', t) && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'commands', t)}
					</span>
				)}
				<RowList
					empty={t('builder.commands.empty')}
					addLabel={t('builder.commands.addBlank')}
					onAdd={() =>
						patch({
							commands: [
								...draft.commands,
								{
									type: `${draft.typeId || 'widget'}.action-${draft.commands.length + 1}`,
									displayName: `Action ${draft.commands.length + 1}`,
									requiredCapability: 'operator',
									payloadSchema: { type: 'object' },
									writesTo: 'scene',
									destinationClass: 'scene',
								},
							],
						})
					}
				>
					{draft.commands.map((command, index) => {
						const kind = classifyWidgetCommand(command);
						return (
							<RowCard
								key={`command-${index}`}
								title={command.displayName || command.type}
								removeLabel={t('builder.commands.remove', {
									name: command.displayName || command.type,
								})}
								onRemove={() => patch({ commands: removeAt(draft.commands, index) })}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
									<Badge status={kind === 'operate' ? 'info' : 'warning'}>
										{t(KIND_COPY[kind].label)}
									</Badge>
									<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
										{t(KIND_COPY[kind].help)}
									</span>
								</div>
								<FieldGrid>
									<Field label={t('builder.commands.name')}>
										<Input
											value={command.displayName}
											onChange={(e: { target: { value: string } }) =>
												setCommand(index, { ...command, displayName: e.target.value })
											}
										/>
									</Field>
									<Field label={t('builder.commands.type')} help={t('builder.commands.typeHelp')}>
										<Input
											value={command.type}
											onChange={(e: { target: { value: string } }) =>
												setCommand(index, { ...command, type: e.target.value.trim() })
											}
										/>
									</Field>
									<Field label={t('builder.binding.needs')}>
										<Select
											value={command.requiredCapability}
											options={capabilityOptions(t)}
											onChange={(e: { target: { value: string } }) =>
												setCommand(index, {
													...command,
													requiredCapability: e.target
														.value as WidgetCommandDescriptor['requiredCapability'],
												})
											}
										/>
									</Field>
									<Field label={t('builder.commands.writesTo')}>
										<Select
											value={command.writesTo}
											options={writesToOptions(t)}
											onChange={(e: { target: { value: string } }) =>
												setCommand(index, {
													...command,
													writesTo: e.target.value as WidgetCommandDescriptor['writesTo'],
												})
											}
										/>
									</Field>
									<Field
										label={t('builder.commands.destination')}
										help={t('builder.commands.destinationHelp')}
									>
										<Select
											value={command.destinationClass ?? 'scene'}
											options={destinationOptions(t)}
											onChange={(e: { target: { value: string } }) =>
												setCommand(index, {
													...command,
													destinationClass: e.target.value as WidgetOutputDestinationClass,
												})
											}
										/>
									</Field>
								</FieldGrid>
							</RowCard>
						);
					})}
				</RowList>
			</StepSection>
		</div>
	);
}
