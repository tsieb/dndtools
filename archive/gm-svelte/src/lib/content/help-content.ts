/**
 * UX-ONB-016 — the contextual help content registry. The help center scopes its overview + quick
 * tips to the CURRENT surface so the user reads help about where they actually are, not a generic
 * index. Content is authored and stored here (presentation only — no actor-private data), keyed by
 * route prefix; {@link resolveHelpContent} matches the longest prefix so nested routes (e.g.
 * `/scene/abc`) resolve to their surface.
 */
export interface HelpContent {
	/** Surface name used in the heading, e.g. "Command Center" → "Command Center help". */
	readonly surface: string;
	/** 2–3 sentence overview of what this surface is for. */
	readonly overview: string;
	/** 3–5 quick tips (UX-ONB-016 §quick tips). */
	readonly tips: readonly string[];
	/** Related help-article titles (the external help center is out of scope for the prototype). */
	readonly articles: readonly string[];
}

interface HelpRegistryEntry extends HelpContent {
	/** Route prefix this entry applies to. */
	readonly prefix: string;
}

/** The fallback surface (Command Center) used when no specific prefix matches. */
const COMMAND_CENTER: HelpRegistryEntry = {
	// Default / Command Center — also the fallback (catch-all, matched last).
	prefix: '/',
	surface: 'Command Center',
	overview:
		'The Command Center is your operational home for running a session. Compose your workspace from widgets and drive live play from one place.',
	tips: [
		'Add your first widget — an initiative tracker, a map, or a note — to build your workspace.',
		'Reach any action fast with the command palette (Mod+K).',
		'Switch feature tiers to reveal advanced tools as you grow comfortable.',
		'Press ? anywhere for the keyboard shortcut reference.',
	],
	articles: ['Command Center basics', 'Widget library', 'Running a session'],
};

const REGISTRY: readonly HelpRegistryEntry[] = [
	{
		prefix: '/scene',
		surface: 'Scene',
		overview:
			'A Scene is a spatial, pannable workspace of widgets. Build it here, then push exactly what you want your players to see.',
		tips: [
			'Scroll to zoom and drag the background to pan the canvas.',
			'Add widgets — maps, notes, characters, or dice — to compose the scene.',
			'Press ? for the full keyboard shortcut reference.',
			'What players see is actor-filtered: hidden content never leaks to a player view.',
		],
		articles: ['Building your first scene', 'Pushing a scene to players', 'Widget basics'],
	},
	{
		prefix: '/maps',
		surface: 'Maps',
		overview:
			'Maps are your battle and exploration surfaces. Draw one, import an image, or generate it, then layer fog of war and annotations.',
		tips: [
			'Create a map, then add layers for terrain, tokens, and fog.',
			'DM annotations stay DM-only until you reveal them.',
			'Embed a map in a scene to bring it to the table.',
		],
		articles: ['Creating a map', 'Fog of war', 'Layers and annotations'],
	},
	{
		prefix: '/characters',
		surface: 'Characters',
		overview:
			'Characters are your party members and NPCs. Add them here and link them to sessions, maps, and notes.',
		tips: [
			'Add a character, then link it to a session to track it live.',
			'Embed a character sheet as a widget on any canvas.',
			'Players only see the characters and fields their visibility permits.',
		],
		articles: ['Adding a character', 'Linking to a session', 'Character sheet widgets'],
	},
	{
		prefix: '/knowledge',
		surface: 'Knowledge',
		overview:
			'Knowledge is your campaign vault — markdown notes, structured objects, and the link graph that connects them.',
		tips: [
			'Create a note to start your knowledge base; wikilinks connect entities.',
			'Granular visibility lets you hide sections or fields from players.',
			'The graph builds itself from your notes, characters, and maps.',
		],
		articles: ['Your first note', 'Wikilinks and the graph', 'Visibility and embeds'],
	},
	{
		prefix: '/sessions',
		surface: 'Sessions',
		overview:
			'Sessions are live play. Start one to bring your players to the table and run combat, initiative, and handouts.',
		tips: [
			'Start a session, then drive initiative, timers, and handouts from the session tools.',
			'Hot paths acknowledge instantly and support undo where it matters.',
			'Push handouts and player views without leaving the session.',
		],
		articles: ['Starting a session', 'Running combat', 'Handouts and player views'],
	},
	{
		prefix: '/settings',
		surface: 'Settings',
		overview:
			'Settings control your device-local display preferences, your feature tier, and platform support details.',
		tips: [
			'Switch your feature tier to reveal or hide advanced tools (progressive disclosure).',
			'Theme, density, and motion preferences are remembered on this device.',
			'The support-status panel explains what each platform can and cannot do.',
		],
		articles: ['Feature tiers', 'Display preferences', 'Platform support'],
	},
	COMMAND_CENTER,
];

const DEFAULT = COMMAND_CENTER;

/** Resolve the help content for a route path by longest matching prefix (UX-ONB-016). */
export function resolveHelpContent(pathname: string): HelpContent {
	let best: HelpRegistryEntry = DEFAULT;
	for (const entry of REGISTRY) {
		if (entry.prefix === '/') continue; // the catch-all is the fallback, not a prefix match.
		if (pathname.startsWith(entry.prefix) && entry.prefix.length > best.prefix.length) {
			best = entry;
		}
	}
	return best;
}
