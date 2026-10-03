import { buildStarterWidgetPackage, type StarterWidgetEntry } from './shared';

/**
 * Party Loot Ledger (RC-WID-1.6) — a `data-table` over the vault's notes, with a declared write back
 * to one of them.
 *
 * The table reads `notes` through the actor-filtered content query, so the ledger a player sees is
 * exactly the set of notes that player may already open: a hoard kept as a DM-only note never
 * appears here, and the widget does no filtering of its own (Contract 2).
 *
 * The `outputWrites` entry declares the widget's one write — appending a split to the bound ledger
 * note — as an `entity` destination that requires confirmation, and the matching command descriptor
 * is what it writes THROUGH. Both are declarations, not capabilities: the review sheet lists them so
 * nobody installs a ledger without seeing that it can write back, and the write itself is an
 * ordinary core command subject to the manager check and the op log.
 */
export const LOOT_LEDGER_STARTER: StarterWidgetEntry = {
	packageId: 'starter.loot-ledger',
	widgetType: 'loot-ledger',
	name: 'Party Loot Ledger',
	description: 'List the notes that record treasure, and write a split back to one of them.',
	shipsCode: false,
	build: () =>
		buildStarterWidgetPackage({
			packageId: 'starter.loot-ledger',
			widgetType: 'loot-ledger',
			displayName: 'Party Loot Ledger',
			description: 'List the notes that record treasure, and write a split back to one of them.',
			category: 'Reference',
			template: 'data-table',
			optionalBindings: [
				{
					id: 'ledger',
					label: 'Ledger note',
					entityTypes: ['note'],
					mode: 'manage',
					requiredCapability: 'manager',
				},
			],
			dataQueries: [
				{
					id: 'ledger',
					label: 'Ledger notes',
					source: 'notes',
					requiredCapability: 'viewer',
					audience: 'shared',
				},
			],
			computedFields: [
				{
					id: 'entries',
					label: 'Entries',
					inputQueryIds: ['ledger'],
					valueType: 'number',
					formula: 'ledger_count',
				},
			],
			commands: [
				{
					type: 'loot-ledger.write-note-line',
					displayName: 'Write a split to the ledger',
					requiredCapability: 'manager',
					writesTo: 'entity',
					destinationClass: 'entity',
					targetBindingId: 'ledger',
					// RC-WID-6.1 — appends one line to the bound ledger note through the note's own
					// `content.update-item`, so the write is still the core's, under its edit check.
					executor: 'write-note-line',
					payloadSchema: {
						type: 'object',
						required: ['line'],
						properties: { line: { type: 'string' } },
						additionalProperties: false,
					},
				},
			],
			outputWrites: [
				{
					id: 'append-split',
					label: 'Write a split to the ledger note',
					commandType: 'loot-ledger.write-note-line',
					destinationClass: 'entity',
					requiresConfirmation: true,
					payloadSchema: {
						type: 'object',
						required: ['line'],
						properties: { line: { type: 'string' } },
						additionalProperties: false,
					},
				},
			],
		}),
};
