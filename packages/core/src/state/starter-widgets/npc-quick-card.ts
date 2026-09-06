import { buildStarterWidgetPackage, type StarterWidgetEntry } from './shared';

/**
 * NPC Quick Card (RC-WID-1.6) — a `stat-block` for the one character this widget is bound to.
 *
 * The card's subject comes from its BINDING rather than from a list: the DM points it at an NPC and
 * the card is that NPC's, which is what makes it worth keeping on the board between sessions. An
 * unbound card says it has no source instead of quietly showing whoever happens to be first, and a
 * bound-but-hidden entity reports the board's own binding status rather than inventing a second
 * opinion about it (RC-WID-1.2 `dataEnvironment`).
 *
 * The second query is what the card puts underneath: how many characters the viewer can see at all,
 * as a computed figure. It is audience `shared` and resolved through `visible-characters`, so a
 * player's count is a count of the party they already know about.
 */
export const NPC_QUICK_CARD_STARTER: StarterWidgetEntry = {
	packageId: 'starter.npc-quick-card',
	widgetType: 'npc-quick-card',
	name: 'NPC Quick Card',
	description: 'Keep one bound character to hand, with the party count underneath.',
	shipsCode: false,
	build: () =>
		buildStarterWidgetPackage({
			packageId: 'starter.npc-quick-card',
			widgetType: 'npc-quick-card',
			displayName: 'NPC Quick Card',
			description: 'Keep one bound character to hand, with the party count underneath.',
			category: 'Reference',
			template: 'stat-block',
			requiredBindings: [
				{
					id: 'npc',
					label: 'Character',
					entityTypes: ['character'],
					mode: 'read',
					requiredCapability: 'viewer',
				},
			],
			dataQueries: [
				{
					id: 'npc',
					label: 'Bound character',
					source: 'binding',
					bindingIds: ['npc'],
					requiredCapability: 'viewer',
					audience: 'shared',
				},
				{
					id: 'party',
					label: 'Party',
					source: 'visible-characters',
					requiredCapability: 'viewer',
					audience: 'shared',
				},
			],
			computedFields: [
				{
					id: 'party-size',
					label: 'Characters visible',
					inputQueryIds: ['party'],
					valueType: 'number',
					formula: 'party_count',
				},
			],
		}),
};
