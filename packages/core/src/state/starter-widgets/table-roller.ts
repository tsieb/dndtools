import { buildStarterWidgetPackage, type StarterWidgetEntry } from './shared';

/**
 * Table Roller (RC-WID-1.6) — an `action-panel` bound to a rollable table.
 *
 * The panel's one button is a DECLARED `dice.roll`, so pressing it goes through
 * `widget.dispatch-command` into the shared session dice engine: the core checks operator authority,
 * validates the payload against the declared schema, computes the outcome from a seed and records it
 * in session history. The widget itself writes nothing.
 *
 * The expression and the label are configuration rather than code, so a DM points this at their own
 * table by editing two fields instead of authoring a package. The optional `dice-table` binding is
 * what makes it *this* table's roller: the bound object's availability is reported by the panel's
 * data query, so an unbound or hidden table reads as unbound rather than as an empty result.
 */
export const TABLE_ROLLER_STARTER: StarterWidgetEntry = {
	packageId: 'starter.table-roller',
	widgetType: 'table-roller',
	name: 'Table Roller',
	description: 'Roll one of your own tables and record the result in the session.',
	shipsCode: false,
	build: () =>
		buildStarterWidgetPackage({
			packageId: 'starter.table-roller',
			widgetType: 'table-roller',
			displayName: 'Table Roller',
			description: 'Roll one of your own tables and record the result in the session.',
			category: 'Dice & Timers',
			template: 'action-panel',
			configFields: [
				{
					key: 'expression',
					label: 'Dice expression',
					control: 'text',
					group: 'content',
					default: '1d20',
					help: 'What to roll, for example 1d20 or 2d6+1.',
				},
				{
					key: 'label',
					label: 'Roll label',
					control: 'text',
					group: 'content',
					default: 'Table roll',
					help: 'How the roll is named in session history.',
				},
			],
			optionalBindings: [
				{
					id: 'table',
					label: 'Rollable table',
					entityTypes: ['dice-table'],
					mode: 'read',
					requiredCapability: 'viewer',
				},
			],
			dataQueries: [
				{
					id: 'table',
					label: 'Bound table',
					source: 'binding',
					bindingIds: ['table'],
					requiredCapability: 'viewer',
					audience: 'shared',
				},
			],
			commands: [
				{
					type: 'dice.roll',
					displayName: 'Roll the table',
					requiredCapability: 'operator',
					writesTo: 'session',
					destinationClass: 'session',
					payloadSchema: {
						type: 'object',
						required: ['expression'],
						properties: { expression: { type: 'string' }, label: { type: 'string' } },
						additionalProperties: true,
					},
				},
			],
		}),
};
