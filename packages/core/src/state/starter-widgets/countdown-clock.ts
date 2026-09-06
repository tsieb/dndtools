import { buildStarterWidgetPackage, type StarterWidgetEntry } from './shared';

/**
 * Countdown Clock (RC-WID-1.6) — the front-of-house clock: a `tracker` of filled segments out of a
 * whole, the shape a doom clock, a ritual or an approaching patrol takes at the table.
 *
 * Like the Weather Tracker its measures are configuration, because a clock's position is a DM's
 * judgement rather than something the core derives. `filled` is bounded by `segments`' own ceiling,
 * so the tracker draws it as a meter and the number it reports is the number the DM set — nothing is
 * inferred and nothing advances on its own.
 *
 * The `session-state` query gives the clock its context line (what the session is doing right now)
 * and is audience `shared`, so a clock on the player view says the same thing to everyone.
 */
export const COUNTDOWN_CLOCK_STARTER: StarterWidgetEntry = {
	packageId: 'starter.countdown-clock',
	widgetType: 'countdown-clock',
	name: 'Countdown Clock',
	description: 'Fill in a clock segment by segment as something closes in on the party.',
	shipsCode: false,
	build: () =>
		buildStarterWidgetPackage({
			packageId: 'starter.countdown-clock',
			widgetType: 'countdown-clock',
			displayName: 'Countdown Clock',
			description: 'Fill in a clock segment by segment as something closes in on the party.',
			category: 'Dice & Timers',
			template: 'tracker',
			configFields: [
				{
					key: 'title',
					label: 'What is coming',
					control: 'text',
					group: 'content',
					default: 'The clock',
					help: 'Named on the meter, so the table knows what is filling.',
				},
				{
					key: 'filled',
					label: 'Segments filled',
					control: 'number',
					group: 'content',
					default: 0,
					min: 0,
					max: 8,
					step: 1,
				},
			],
			dataQueries: [
				{
					id: 'session',
					label: 'Session',
					source: 'session-state',
					requiredCapability: 'viewer',
					audience: 'shared',
				},
			],
			defaultSize: { width: 300, height: 200 },
		}),
};
