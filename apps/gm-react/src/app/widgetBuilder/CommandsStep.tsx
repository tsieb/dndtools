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

interface CatalogEntry {
	label: string;
	descriptor: (typeId: string) => WidgetCommandDescriptor;
}

const CATALOG: CatalogEntry[] = [
	{
		label: 'Roll',
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
		label: 'Advance',
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
		label: 'Tick',
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
		label: 'Reset',
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
		label: 'Set value',
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
		label: 'Show to players',
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

const CAPABILITY_OPTIONS = (['viewer', 'operator', 'manager'] as const).map((value) => ({
	value,
	label: CAPABILITY_LABEL[value],
}));
const WRITES_TO_OPTIONS = (['scene', 'session', 'entity'] as const).map((value) => ({
	value,
	label: WRITES_TO_LABEL[value],
}));
const DESTINATION_OPTIONS: { value: WidgetOutputDestinationClass; label: string }[] = [
	{ value: 'scene', label: 'The scene' },
	{ value: 'session', label: 'The session' },
	{ value: 'entity', label: 'A bound entity' },
	{ value: 'player-visible-state', label: 'Player visible state' },
	{ value: 'player-scene', label: 'The player scene' },
];

const KIND_COPY: Record<'operate' | 'configure', { label: string; help: string }> = {
	operate: {
		label: 'Operate',
		help: 'An operator at the table can fire this.',
	},
	configure: {
		label: 'Configure',
		help: 'Only a campaign manager can fire this.',
	},
};

export function CommandsStep({ draft, patch, issues }: StepProps) {
	const setCommand = (index: number, next: WidgetCommandDescriptor) =>
		patch({ commands: replaceAt(draft.commands, index, next) });

	const addCommand = (entry: CatalogEntry) => {
		const descriptor = entry.descriptor(draft.typeId || 'widget');
		if (draft.commands.some((command) => command.type === descriptor.type)) return;
		patch({ commands: [...draft.commands, descriptor] });
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader
				title="Commands"
				help="What this widget can do. Lamplight classifies each one as an operate or a configure action and enforces that at the table."
			/>
			<StepSection
				title="Add from the catalogue"
				help="Each entry is a ready-made descriptor named after this widget's type id."
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
								{already ? `${entry.label} — added` : entry.label}
							</button>
						);
					})}
				</div>
			</StepSection>
			<StepSection title="Declared commands">
				{issueFor(issues, 'commands') && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'commands')}
					</span>
				)}
				<RowList
					empty="No commands. An action panel with no commands renders as a read-only card."
					addLabel="Add a blank command"
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
								removeLabel={`Remove command ${command.displayName || command.type}`}
								onRemove={() => patch({ commands: removeAt(draft.commands, index) })}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
									<Badge status={kind === 'operate' ? 'info' : 'warning'}>
										{KIND_COPY[kind].label}
									</Badge>
									<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
										{KIND_COPY[kind].help}
									</span>
								</div>
								<FieldGrid>
									<Field label="Name">
										<Input
											value={command.displayName}
											onChange={(e: { target: { value: string } }) =>
												setCommand(index, { ...command, displayName: e.target.value })
											}
										/>
									</Field>
									<Field label="Type" help="The dotted id the core dispatches.">
										<Input
											value={command.type}
											onChange={(e: { target: { value: string } }) =>
												setCommand(index, { ...command, type: e.target.value.trim() })
											}
										/>
									</Field>
									<Field label="Needs">
										<Select
											value={command.requiredCapability}
											options={CAPABILITY_OPTIONS}
											onChange={(e: { target: { value: string } }) =>
												setCommand(index, {
													...command,
													requiredCapability: e.target
														.value as WidgetCommandDescriptor['requiredCapability'],
												})
											}
										/>
									</Field>
									<Field label="Writes to">
										<Select
											value={command.writesTo}
											options={WRITES_TO_OPTIONS}
											onChange={(e: { target: { value: string } }) =>
												setCommand(index, {
													...command,
													writesTo: e.target.value as WidgetCommandDescriptor['writesTo'],
												})
											}
										/>
									</Field>
									<Field label="Destination" help="What class of data this command reaches.">
										<Select
											value={command.destinationClass ?? 'scene'}
											options={DESTINATION_OPTIONS}
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
