import { useMemo } from 'react';
import {
	VAULT_OBJECT_SUBTYPE_KEY,
	WIDGET_INTENT_CREATE_TARGETS,
	WIDGET_INTENT_ROUTES,
	WIDGET_INTENT_SETTINGS_TABS,
	classifyWidgetCommand,
	getContentItemsForActor,
	listCharactersForActor,
	listMapsForActor,
	listScreensForActor,
	type WidgetCommandDescriptor,
	type WidgetIntentCreateTarget,
	type WidgetIntentDescriptor,
	type WidgetIntentEntityKind,
	type WidgetIntentRoute,
	type WidgetIntentSettingsTab,
	type WidgetOutputDestinationClass,
} from '@dndtools/core';
import { Badge, Field, Input, Select } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
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
import type { WidgetDraft } from './draft';
import type { DraftIssue } from './validate';
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
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
						<div
							key={group}
							style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}
						>
							<span style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.sub }}>
								{t(KIND_COPY[group].label)} — {t(KIND_COPY[group].help)}
							</span>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
								{entries.map((catalogEntry) => {
									const type = catalogEntry.descriptor(draft.typeId || 'widget').type;
									const already = draft.commands.some((command) => command.type === type);
									return (
										<CatalogChip
											key={catalogEntry.label}
											label={t(catalogEntry.label)}
											already={already}
											onAdd={() => addCommand(catalogEntry)}
										/>
									);
								})}
							</div>
						</div>
					);
				})}
			</StepSection>
			<StepSection title={t('builder.commands.declared')}>
				{issueFor(issues, 'commands', t) && (
					<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.err }}>
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
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 'var(--space-2)',
										flexWrap: 'wrap',
									}}
								>
									<Badge status={kind === 'operate' ? 'info' : 'warning'}>
										{t(KIND_COPY[kind].label)}
									</Badge>
									<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
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
			<IntentsSection draft={draft} patch={patch} issues={issues} />
		</div>
	);
}

/** One catalogue pick. Shared by commands and intents so the two pickers read as one control. */
function CatalogChip({
	label,
	already,
	onAdd,
}: {
	label: string;
	already: boolean;
	onAdd: () => void;
}) {
	const { t } = useI18n();
	return (
		<button
			type="button"
			disabled={already}
			onClick={onAdd}
			style={{
				font: `600 var(--text-xs) ${T.sans}`,
				color: already ? T.sub : T.ink,
				padding: 'var(--space-1-5) var(--space-3)',
				borderRadius: 'var(--radius-full)',
				border: `1px solid ${already ? T.bd : T.bdS}`,
				background: already ? T.sunken : T.surf,
				cursor: already ? 'default' : 'pointer',
			}}
		>
			{already ? t('builder.commands.alreadyAdded', { label }) : label}
		</button>
	);
}

// --- RC-WID-5.1: intents -----------------------------------------------------------------------

/**
 * A catalogue row for an intent. `displayName` is stored text, like a command's, so it stays in the
 * source language until the author renames it; `label` names the chip and is translated.
 */
interface IntentSeed {
	label: MessageKey;
	group: 'open' | 'create';
	seed: WidgetIntentDescriptor;
}

const OPEN_ENTITY_SEEDS: [WidgetIntentEntityKind, MessageKey, string][] = [
	['character', 'builder.intents.openCharacter', 'Open character'],
	['map', 'builder.intents.openMap', 'Open map'],
	['note', 'builder.intents.openNote', 'Open note'],
	['quest', 'builder.intents.openQuest', 'Open quest'],
];

const CREATE_LABEL: Record<WidgetIntentCreateTarget, [MessageKey, string]> = {
	scene: ['home.create.scene', 'New scene'],
	screen: ['builder.intents.newScreen', 'New screen'],
	character: ['home.create.character', 'New character'],
	map: ['home.create.map', 'New map'],
	note: ['home.create.note', 'New note'],
	widget: ['home.create.widget', 'New widget'],
};

export const INTENT_CATALOG: IntentSeed[] = [
	...OPEN_ENTITY_SEEDS.map(([entityKind, label, displayName]) => ({
		label,
		group: 'open' as const,
		seed: { id: `open-${entityKind}`, displayName, kind: 'open-entity' as const, entityKind },
	})),
	{
		label: 'builder.intents.openScreen',
		group: 'open',
		seed: { id: 'open-screen', displayName: 'Open screen', kind: 'open-screen' },
	},
	{
		label: 'builder.intents.openRoute',
		group: 'open',
		seed: { id: 'open-page', displayName: 'Open page', kind: 'open-route', route: '/characters' },
	},
	{
		label: 'builder.intents.openSettings',
		group: 'open',
		seed: {
			id: 'open-settings',
			displayName: 'Open Settings',
			kind: 'open-settings',
			tab: 'appearance',
		},
	},
	...WIDGET_INTENT_CREATE_TARGETS.map((target) => ({
		label: CREATE_LABEL[target][0],
		group: 'create' as const,
		seed: {
			id: `new-${target}`,
			displayName: CREATE_LABEL[target][1],
			kind: 'create' as const,
			target,
		},
	})),
];

/** The seed's id, suffixed until it is unique in the draft (two "Open character" buttons are fine). */
export function uniqueIntentId(base: string, intents: readonly WidgetIntentDescriptor[]): string {
	const taken = new Set(intents.map((intent) => intent.id));
	if (!taken.has(base)) return base;
	let index = 2;
	while (taken.has(`${base}-${index}`)) index += 1;
	return `${base}-${index}`;
}

/**
 * The intent problems the step names itself. Duplicate ids and empty names are also refused by the
 * core schema on Review; these two are not, and would otherwise ship a button nobody can follow.
 */
export function validateIntents(draft: WidgetDraft): DraftIssue[] {
	const issues: DraftIssue[] = [];
	for (const intent of draft.intents) {
		if (!intent.displayName.trim())
			issues.push({
				step: 'commands',
				field: 'intents',
				message: 'builder.issue.intentName',
				values: { id: intent.id },
			});
		// A template has no code to supply a target at press time, so its open button must carry one.
		else if (
			draft.runtime === 'template' &&
			(intent.kind === 'open-entity' || intent.kind === 'open-screen') &&
			!intent.targetId
		)
			issues.push({
				step: 'commands',
				field: 'intents',
				message: 'builder.issue.intentTarget',
				values: { name: intent.displayName },
			});
	}
	// Without `navigate` the host drops every request a custom widget makes.
	if (
		draft.runtime === 'custom-html-js' &&
		draft.intents.length > 0 &&
		!draft.hostPermissions.includes('navigate')
	)
		issues.push({
			step: 'commands',
			field: 'intents',
			message: 'builder.issue.intentsNeedNavigate',
		});
	return issues;
}

const ROUTE_LABEL: Record<WidgetIntentRoute, MessageKey> = {
	'/': 'nav.home',
	'/scenes': 'nav.scenes',
	'/session': 'nav.session',
	'/board': 'nav.gmScreen',
	'/characters': 'nav.characters',
	'/atlas': 'nav.maps',
	'/campaign': 'nav.story',
	'/campaign/calendar': 'builder.intents.route.calendar',
	'/campaign/relationships': 'builder.intents.route.relationships',
	'/knowledge': 'nav.notes',
	'/graph': 'nav.graph',
	'/audio': 'nav.audio',
	'/extensions': 'nav.extensions',
};

const SETTINGS_TAB_LABEL: Record<WidgetIntentSettingsTab, MessageKey> = {
	appearance: 'settings.nav.appearance',
	language: 'settings.nav.language',
	account: 'settings.nav.account',
	subscription: 'settings.nav.subscription',
	players: 'settings.nav.players',
	permissions: 'settings.nav.permissions',
	vault: 'settings.nav.vault',
	sync: 'settings.nav.sync',
	tools: 'settings.nav.tools',
	ai: 'settings.nav.ai',
	plugins: 'settings.nav.plugins',
	systems: 'settings.nav.systems',
	accessibility: 'settings.nav.accessibility',
	about: 'settings.nav.about',
};

interface TargetOption {
	value: string;
	label: string;
}

/**
 * What an open intent can point at, read the way the author sees the vault. These are the same
 * actor-filtered reads the destinations use; the viewer's own gate is applied again at press time.
 */
function useIntentTargets(): Record<WidgetIntentEntityKind | 'screen', TargetOption[]> {
	const runtime = useRuntime();
	const state = runtime.state;
	const actorId = runtime.defaultActorId;
	return useMemo(() => {
		const { characters, maps, permissions, content, scenes } = state;
		const items = getContentItemsForActor(content, permissions, actorId);
		const byName = (a: TargetOption, b: TargetOption) => a.label.localeCompare(b.label);
		return {
			character: listCharactersForActor(characters, permissions, actorId).map((c) => ({
				value: c.id,
				label: c.name,
			})),
			map: listMapsForActor(maps, permissions, actorId).map((m) => ({
				value: m.id,
				label: m.name,
			})),
			note: items
				.filter((item) => item.kind === 'note')
				.map((item) => ({ value: item.id, label: item.title }))
				.sort(byName),
			quest: items
				.filter(
					(item) => item.kind === 'object' && item.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'quest',
				)
				.map((item) => ({ value: item.id, label: item.title }))
				.sort(byName),
			screen: listScreensForActor(scenes, permissions, actorId).map((screen) => ({
				value: screen.id,
				label: screen.name,
			})),
		};
	}, [state, actorId]);
}

/**
 * Open and create — the intents a placed copy offers (RC-WID-5.1). An intent writes nothing: it takes
 * whoever presses it to a screen, an entity, a page, a Settings tab or a creation flow, and only ever
 * one that viewer could already open. A template's open button carries its target here; a custom
 * widget's may leave it to the code, which then needs the `navigate` permission at review.
 */
function IntentsSection({ draft, patch, issues }: StepProps) {
	const { t } = useI18n();
	const targets = useIntentTargets();
	const custom = draft.runtime === 'custom-html-js';
	const intentIssues = [...issues, ...validateIntents(draft)];
	const setIntent = (index: number, next: WidgetIntentDescriptor) =>
		patch({ intents: replaceAt(draft.intents, index, next) });
	const addIntent = (entry: IntentSeed) => {
		const seed = { ...entry.seed, id: uniqueIntentId(entry.seed.id, draft.intents) };
		// A template's open button has no code to pick a target, so it starts on the first one the
		// author can see rather than on nothing.
		if (!custom && (seed.kind === 'open-entity' || seed.kind === 'open-screen')) {
			const first = targets[seed.kind === 'open-screen' ? 'screen' : seed.entityKind][0];
			if (first) seed.targetId = first.value;
		}
		patch({
			intents: [...draft.intents, seed],
			// Custom code follows an intent only with `navigate` approved at review, so declaring one
			// asks for it; the author can still take it back on Advanced.
			...(custom && !draft.hostPermissions.includes('navigate')
				? { hostPermissions: [...draft.hostPermissions, 'navigate' as const] }
				: {}),
		});
	};
	const createAdded = (entry: IntentSeed) =>
		entry.seed.kind === 'create' &&
		draft.intents.some(
			(intent) =>
				intent.kind === 'create' &&
				entry.seed.kind === 'create' &&
				intent.target === entry.seed.target,
		);

	return (
		<StepSection title={t('builder.intents.title')} help={t('builder.intents.help')}>
			{(['open', 'create'] as const).map((group) => (
				<div key={group} style={{ display: 'flex', flexDirection: 'column', gap: T.space.oneHalf }}>
					<span style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.sub }}>
						{t(group === 'open' ? 'builder.intents.groupOpen' : 'builder.intents.groupCreate')}
					</span>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: T.space.two }}>
						{INTENT_CATALOG.filter((entry) => entry.group === group).map((entry) => (
							<CatalogChip
								key={entry.label}
								label={t(entry.label)}
								already={createAdded(entry)}
								onAdd={() => addIntent(entry)}
							/>
						))}
					</div>
				</div>
			))}
			{issueFor(intentIssues, 'intents', t) && (
				<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.err }}>
					{issueFor(intentIssues, 'intents', t)}
				</span>
			)}
			{draft.intents.length === 0 ? (
				<span style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
					{t('builder.intents.empty')}
				</span>
			) : (
				draft.intents.map((intent, index) => (
					<RowCard
						key={`intent-${index}`}
						title={intent.displayName || intent.id}
						removeLabel={t('builder.intents.remove', { name: intent.displayName || intent.id })}
						onRemove={() => patch({ intents: removeAt(draft.intents, index) })}
					>
						<div style={{ display: 'flex', alignItems: 'center', gap: T.space.two }}>
							<Badge status="neutral">{t('builder.intents.badge')}</Badge>
							<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
								{t('builder.intents.badgeHelp')}
							</span>
						</div>
						<FieldGrid>
							<Field label={t('builder.intents.name')}>
								<Input
									value={intent.displayName}
									onChange={(e: { target: { value: string } }) =>
										setIntent(index, { ...intent, displayName: e.target.value })
									}
								/>
							</Field>
							<IntentTargetField
								intent={intent}
								custom={custom}
								targets={targets}
								onChange={(next) => setIntent(index, next)}
							/>
						</FieldGrid>
					</RowCard>
				))
			)}
		</StepSection>
	);
}

/** The one field that differs by kind: what to open, which page, which tab, or what to create. */
function IntentTargetField({
	intent,
	custom,
	targets,
	onChange,
}: {
	intent: WidgetIntentDescriptor;
	custom: boolean;
	targets: Record<WidgetIntentEntityKind | 'screen', TargetOption[]>;
	onChange: (next: WidgetIntentDescriptor) => void;
}) {
	const { t } = useI18n();
	const onValue =
		(apply: (value: string) => WidgetIntentDescriptor) => (e: { target: { value: string } }) =>
			onChange(apply(e.target.value));

	switch (intent.kind) {
		case 'open-entity':
		case 'open-screen': {
			const list = targets[intent.kind === 'open-screen' ? 'screen' : intent.entityKind];
			// A custom widget may leave the target to its code (checked at press time); a template
			// has no code, so the empty option is only a prompt and the draft reports it as missing.
			const none = {
				value: '',
				label: t(custom ? 'builder.intents.widgetChooses' : 'builder.intents.pickTarget'),
			};
			return (
				<Field label={t('builder.intents.target')}>
					<Select
						value={intent.targetId ?? ''}
						options={[none, ...list]}
						onChange={onValue((value) => {
							const { targetId: _previous, ...rest } = intent;
							return value === '' ? rest : { ...rest, targetId: value };
						})}
					/>
				</Field>
			);
		}
		case 'open-route':
			return (
				<Field label={t('builder.intents.page')}>
					<Select
						value={intent.route}
						options={WIDGET_INTENT_ROUTES.map((route) => ({
							value: route,
							label: t(ROUTE_LABEL[route]),
						}))}
						onChange={onValue((value) => ({ ...intent, route: value as WidgetIntentRoute }))}
					/>
				</Field>
			);
		case 'open-settings':
			return (
				<Field label={t('builder.intents.tab')}>
					<Select
						value={intent.tab}
						options={WIDGET_INTENT_SETTINGS_TABS.map((tab) => ({
							value: tab,
							label: t(SETTINGS_TAB_LABEL[tab]),
						}))}
						onChange={onValue((value) => ({ ...intent, tab: value as WidgetIntentSettingsTab }))}
					/>
				</Field>
			);
		case 'create':
			return (
				<Field label={t('builder.intents.creates')}>
					<Select
						value={intent.target}
						options={WIDGET_INTENT_CREATE_TARGETS.map((target) => ({
							value: target,
							label: t(CREATE_LABEL[target][0]),
						}))}
						onChange={onValue((value) => ({
							...intent,
							target: value as WidgetIntentCreateTarget,
						}))}
					/>
				</Field>
			);
	}
}
