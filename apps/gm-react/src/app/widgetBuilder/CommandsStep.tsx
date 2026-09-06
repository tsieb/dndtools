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
 * RC-WID-2.3 grows that into the full templated catalogue and makes the classification BINDING
 * rather than advisory: a command whose verb configures the widget can only be declared as
 * `manager`, because `classifyWidgetCommand` will treat it as a configure action whatever the
 * descriptor claims. Letting an author declare `rename` as `operator` would ship a package whose
 * own declaration disagrees with the authority the core grants it — the button would render for a
 * player and then be refused. Reconciling the two here is what keeps the declaration honest.
 */

/** `label` names the chip in the picker and is translated; the descriptor's `displayName` is
 * written into the built package, so like every other stored label it stays in the source
 * language until the author renames it. */
export interface CatalogEntry {
	label: MessageKey;
	descriptor: (typeId: string) => WidgetCommandDescriptor;
}

/** Shorthand for a catalogue row: everything a descriptor needs beyond its verb and wording. */
function entry(
	verb: string,
	label: MessageKey,
	displayName: string,
	rest: Omit<WidgetCommandDescriptor, 'type' | 'displayName'>,
): CatalogEntry {
	return {
		label,
		descriptor: (typeId) => ({ type: `${typeId}.${verb}`, displayName, ...rest }),
	};
}

const OPERATE_PAYLOAD: WidgetCommandDescriptor['payloadSchema'] = { type: 'object' };

/**
 * The templated command descriptors an author picks from. Each is a real, valid descriptor: the verb
 * decides the authority (`OPERATE_ACTION_VERBS` / `CONFIGURE_ACTION_VERBS`), `writesTo` and
 * `destinationClass` say what it reaches, and `payloadSchema` names the configuration keys the
 * templates read off a placed copy before dispatching.
 */
export const CATALOG: CatalogEntry[] = [
	entry('roll', 'builder.catalog.roll', 'Roll', {
		requiredCapability: 'operator',
		payloadSchema: { type: 'object', properties: { formula: { type: 'string' } } },
		writesTo: 'session',
		destinationClass: 'session',
	}),
	entry('draw', 'builder.catalog.draw', 'Draw', {
		requiredCapability: 'operator',
		payloadSchema: OPERATE_PAYLOAD,
		writesTo: 'session',
		destinationClass: 'session',
	}),
	entry('start', 'builder.catalog.start', 'Start', {
		requiredCapability: 'operator',
		payloadSchema: OPERATE_PAYLOAD,
		writesTo: 'scene',
		destinationClass: 'scene',
	}),
	entry('pause', 'builder.catalog.pause', 'Pause', {
		requiredCapability: 'operator',
		payloadSchema: OPERATE_PAYLOAD,
		writesTo: 'scene',
		destinationClass: 'scene',
	}),
	entry('resume', 'builder.catalog.resume', 'Resume', {
		requiredCapability: 'operator',
		payloadSchema: OPERATE_PAYLOAD,
		writesTo: 'scene',
		destinationClass: 'scene',
	}),
	entry('advance', 'builder.catalog.advance', 'Advance', {
		requiredCapability: 'operator',
		payloadSchema: { type: 'object', properties: { by: { type: 'number' } } },
		writesTo: 'scene',
		destinationClass: 'scene',
	}),
	entry('tick', 'builder.catalog.tick', 'Tick', {
		requiredCapability: 'operator',
		payloadSchema: OPERATE_PAYLOAD,
		writesTo: 'scene',
		destinationClass: 'scene',
	}),
	entry('reset', 'builder.catalog.reset', 'Reset', {
		requiredCapability: 'operator',
		payloadSchema: OPERATE_PAYLOAD,
		writesTo: 'scene',
		destinationClass: 'scene',
	}),
	entry('mark-complete', 'builder.catalog.markComplete', 'Mark complete', {
		requiredCapability: 'operator',
		payloadSchema: OPERATE_PAYLOAD,
		writesTo: 'scene',
		destinationClass: 'scene',
	}),
	entry('write-note-line', 'builder.catalog.writeNoteLine', 'Write a note line', {
		requiredCapability: 'operator',
		payloadSchema: { type: 'object', properties: { line: { type: 'string' } } },
		writesTo: 'entity',
		destinationClass: 'entity',
	}),
	entry('show', 'builder.catalog.show', 'Show to players', {
		requiredCapability: 'operator',
		payloadSchema: { type: 'object', properties: { text: { type: 'string' } } },
		writesTo: 'scene',
		destinationClass: 'player-visible-state',
	}),
	entry('set-config', 'builder.catalog.setValue', 'Set value', {
		requiredCapability: 'manager',
		payloadSchema: { type: 'object', properties: { value: { type: 'string' } } },
		writesTo: 'scene',
		destinationClass: 'scene',
	}),
	entry('rename', 'builder.catalog.rename', 'Rename', {
		requiredCapability: 'manager',
		payloadSchema: { type: 'object', properties: { name: { type: 'string' } } },
		writesTo: 'scene',
		destinationClass: 'scene',
	}),
	entry('set-duration', 'builder.catalog.setDuration', 'Set duration', {
		requiredCapability: 'manager',
		payloadSchema: { type: 'object', properties: { seconds: { type: 'number' } } },
		writesTo: 'scene',
		destinationClass: 'scene',
	}),
];

/**
 * Raise a descriptor's declared capability to match how the core will actually classify it.
 *
 * `classifyWidgetCommand` is the authority: a configure VERB is a configure action even when the
 * descriptor says `operator`. Storing `operator` on such a command would be a declaration the core
 * silently overrules, so the step stores what the core will enforce instead.
 */
export function reconcileCommandAuthority(
	descriptor: WidgetCommandDescriptor,
): WidgetCommandDescriptor {
	if (classifyWidgetCommand(descriptor) !== 'configure') return descriptor;
	if (descriptor.requiredCapability === 'manager') return descriptor;
	return { ...descriptor, requiredCapability: 'manager' };
}

/** Whether the VERB alone forces a configure classification, whatever capability is declared. */
export function verbForcesConfigure(descriptor: WidgetCommandDescriptor): boolean {
	return classifyWidgetCommand({ ...descriptor, requiredCapability: 'operator' }) === 'configure';
}

/** When the verb forces a configure classification, `manager` is the only truthful declaration. */
const managerOnlyOption = (t: Translate) => [
	{ value: 'manager', label: t(CAPABILITY_LABEL.manager) },
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
		patch({ commands: replaceAt(draft.commands, index, reconcileCommandAuthority(next)) });

	const addCommand = (entry: CatalogEntry) => {
		const descriptor = reconcileCommandAuthority(entry.descriptor(draft.typeId || 'widget'));
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
				{(['operate', 'configure'] as const).map((group) => {
					const entries = CATALOG.filter(
						(candidate) =>
							classifyWidgetCommand(candidate.descriptor(draft.typeId || 'widget')) === group,
					);
					return (
						<div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
							<span style={{ font: `600 11.5px ${T.sans}`, color: T.ter }}>
								{t(KIND_COPY[group].label)} — {t(KIND_COPY[group].help)}
							</span>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
								{entries.map((catalogEntry) => {
									const type = catalogEntry.descriptor(draft.typeId || 'widget').type;
									const already = draft.commands.some((command) => command.type === type);
									return (
										<button
											key={catalogEntry.label}
											type="button"
											disabled={already}
											onClick={() => addCommand(catalogEntry)}
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
												? t('builder.commands.alreadyAdded', { label: t(catalogEntry.label) })
												: t(catalogEntry.label)}
										</button>
									);
								})}
							</div>
						</div>
					);
				})}
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
						// A configure VERB is a configure action whatever the descriptor declares, so the
						// only capability that can honestly be stored on it is `manager`.
						const forced = verbForcesConfigure(command);
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
									<Field
										label={t('builder.binding.needs')}
										help={forced ? t('builder.commands.verbForcesManager') : undefined}
									>
										<Select
											value={command.requiredCapability}
											options={forced ? managerOnlyOption(t) : capabilityOptions(t)}
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
