import { buildStarterWidgetPackage, type StarterWidgetEntry } from './shared';

/**
 * Weather Tracker (RC-WID-1.6) — a `tracker` whose measures are its own configuration.
 *
 * There is no weather in the core state, and inventing a data source that pretends otherwise would
 * be the dishonest kind of empty widget this repo forbids. So the conditions ARE the widget's
 * configuration: the DM sets temperature, wind and visibility in Customize and the tracker draws
 * them — the bounded fields as meters, the unbounded one as a figure (RC-WID-1.2 `Tracker`).
 *
 * The `selected-scene` query is what ties the reading to the table rather than to nothing: the
 * scene in play names what the weather is currently over, and it is audience `shared`, so a player
 * viewing the board sees the same sky the DM does.
 */
export const WEATHER_TRACKER_STARTER: StarterWidgetEntry = {
	packageId: 'starter.weather-tracker',
	widgetType: 'weather-tracker',
	name: 'Weather Tracker',
	description: 'Track travel weather scene to scene and share the reading with the table.',
	shipsCode: false,
	build: () =>
		buildStarterWidgetPackage({
			packageId: 'starter.weather-tracker',
			widgetType: 'weather-tracker',
			displayName: 'Weather Tracker',
			description: 'Track travel weather scene to scene and share the reading with the table.',
			category: 'Reference',
			template: 'tracker',
			configFields: [
				{
					key: 'condition',
					label: 'Condition',
					control: 'select',
					group: 'content',
					default: 'clear',
					options: [
						{ value: 'clear', label: 'Clear' },
						{ value: 'overcast', label: 'Overcast' },
						{ value: 'rain', label: 'Rain' },
						{ value: 'storm', label: 'Storm' },
						{ value: 'snow', label: 'Snow' },
						{ value: 'fog', label: 'Fog' },
					],
				},
				{
					key: 'temperature',
					label: 'Temperature',
					control: 'number',
					group: 'content',
					default: 12,
					min: -40,
					max: 50,
					step: 1,
					help: 'Degrees, as your table reckons them.',
				},
				{
					key: 'wind',
					label: 'Wind',
					control: 'number',
					group: 'content',
					default: 3,
					min: 0,
					max: 10,
					step: 1,
					help: 'Still at zero, a gale at ten.',
				},
				{
					key: 'visibility',
					label: 'Visibility',
					control: 'number',
					group: 'content',
					default: 8,
					min: 0,
					max: 10,
					step: 1,
					help: 'How far the party can see, zero to ten.',
				},
			],
			dataQueries: [
				{
					id: 'scene',
					label: 'Weather over',
					source: 'selected-scene',
					requiredCapability: 'viewer',
					audience: 'shared',
				},
			],
		}),
};
