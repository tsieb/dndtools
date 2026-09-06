import { buildStarterWidgetPackage, type StarterWidgetEntry } from './shared';

/**
 * Rumor Board (RC-WID-1.6) — a `scene-message` card: one passage, pinned where the party can read
 * it, with the scene in play as its heading.
 *
 * This is the template that renders from configuration alone, so the rumour is durable widget state
 * rather than screen copy — it survives a reload, syncs like everything else, and is edited in
 * Customize. The `selected-scene` query is what supplies the heading: the active scene becomes the
 * card's context line, which is what makes this a board in the tavern rather than a sticky note.
 */
export const RUMOR_BOARD_STARTER: StarterWidgetEntry = {
	packageId: 'starter.rumor-board',
	widgetType: 'rumor-board',
	name: 'Rumor Board',
	description: 'Pin what the party has heard, under the name of the scene they heard it in.',
	shipsCode: false,
	build: () =>
		buildStarterWidgetPackage({
			packageId: 'starter.rumor-board',
			widgetType: 'rumor-board',
			displayName: 'Rumor Board',
			description: 'Pin what the party has heard, under the name of the scene they heard it in.',
			category: 'Reference',
			template: 'scene-message',
			configFields: [
				{
					key: 'message',
					label: 'What the party has heard',
					control: 'textarea',
					group: 'content',
					default: 'The road east is closed, and nobody will say why.',
					help: 'Shown to everyone the widget is shared with.',
				},
			],
			dataQueries: [
				{
					id: 'scene',
					label: 'Heard in',
					source: 'selected-scene',
					requiredCapability: 'viewer',
					audience: 'shared',
				},
			],
		}),
};
