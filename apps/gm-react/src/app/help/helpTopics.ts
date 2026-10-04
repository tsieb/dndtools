import type { MessageKey } from '../../i18n';

/** One contextual-help topic: the trigger's accessible name, the panel title, and the explanation. */
export type HelpTopic = {
	label: MessageKey;
	title: MessageKey;
	body: MessageKey;
};

/**
 * RC-UX-3.1 — the controls whose consequence a DM cannot read off the label alone. Each placement
 * renders `<ContextHelp topic="…" />` beside its control; the copy lives in the `help.tip.*` keys so
 * a translator sees every explanation in one block, and `helpTopics.test.ts` holds it to the voice
 * rules in `docs/design-package/readme.md` (content fundamentals).
 *
 * The label is its own key rather than "About " + title: a title opens a sentence and a label
 * embeds it mid-sentence, and only the translator knows how each locale cases that.
 */
export const HELP_TOPICS = {
	vaultPrivacy: {
		label: 'help.tip.vaultPrivacy.label',
		title: 'help.tip.vaultPrivacy.title',
		body: 'help.tip.vaultPrivacy.body',
	},
	projection: {
		label: 'help.tip.projection.label',
		title: 'help.tip.projection.title',
		body: 'help.tip.projection.body',
	},
	visibility: {
		label: 'help.tip.visibility.label',
		title: 'help.tip.visibility.title',
		body: 'help.tip.visibility.body',
	},
	stagedProposals: {
		label: 'help.tip.stagedProposals.label',
		title: 'help.tip.stagedProposals.title',
		body: 'help.tip.stagedProposals.body',
	},
	calendar: {
		label: 'help.tip.calendar.label',
		title: 'help.tip.calendar.title',
		body: 'help.tip.calendar.body',
	},
	customTypes: {
		label: 'help.tip.customTypes.label',
		title: 'help.tip.customTypes.title',
		body: 'help.tip.customTypes.body',
	},
	systemPicker: {
		label: 'help.tip.systemPicker.label',
		title: 'help.tip.systemPicker.title',
		body: 'help.tip.systemPicker.body',
	},
	widgetTrust: {
		label: 'help.tip.widgetTrust.label',
		title: 'help.tip.widgetTrust.title',
		body: 'help.tip.widgetTrust.body',
	},
	recoveryKey: {
		label: 'help.tip.recoveryKey.label',
		title: 'help.tip.recoveryKey.title',
		body: 'help.tip.recoveryKey.body',
	},
} as const satisfies Record<string, HelpTopic>;

export type HelpTopicId = keyof typeof HELP_TOPICS;

/**
 * RC-UX-6.6 — the user guides in `docs/user`, in the order the Help menu lists them. The id is the
 * file name; HelpMenu bundles each file under its id.
 */
export const GUIDE_IDS = [
	'getting-started',
	'screens',
	'running-a-session',
	'characters',
	'maps',
	'notes',
	'settings',
	'widgets-and-builders',
	'systems',
	'remote-play',
	'privacy-modes',
	'android-desktop-install',
] as const;

export type GuideId = (typeof GUIDE_IDS)[number];

/**
 * The guide Help opens on, by route: a lost GM gets the page about the screen in front of them, with
 * the full list one level up. A route no guide covers (Command Center, Audio, Extensions…) opens on
 * the full list, which starts with Getting started.
 */
const ROUTE_GUIDES: readonly { prefixes: readonly string[]; guide: GuideId }[] = [
	{ prefixes: ['/screens', '/screen', '/scenes', '/scene', '/board'], guide: 'screens' },
	{ prefixes: ['/session'], guide: 'running-a-session' },
	{ prefixes: ['/characters'], guide: 'characters' },
	{ prefixes: ['/atlas'], guide: 'maps' },
	{ prefixes: ['/knowledge', '/campaign', '/graph'], guide: 'notes' },
	{ prefixes: ['/settings'], guide: 'settings' },
];

export function guideForRoute(pathname: string): GuideId | null {
	for (const { prefixes, guide } of ROUTE_GUIDES) {
		if (prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/')))
			return guide;
	}
	return null;
}

/**
 * Keyboard copy has a touch twin (ONB-17: the tour told phone users to press ⌘K). The paragraph
 * after a `<!-- keyboard -->` line is read on the desktop and rail tiers only, and the paragraph after
 * `<!-- touch -->` replaces it on a phone. The markers are HTML comments, so the same file still
 * reads cleanly on GitHub, where both variants show.
 */
export type GuideTier = 'keyboard' | 'touch';

const VARIANT_RE = /^<!--\s*(keyboard|touch)\s*-->\s*/;
/** Everything below this heading is a maintainer's source list, never shown in the app. */
const REFERENCES_HEADING = '\n## Implementation references';

/** A guide's paragraphs, each with the tier it is written for (null: every tier). */
export function guideParagraphs(markdown: string): { tier: GuideTier | null; text: string }[] {
	const [, ...rest] = markdown.split(REFERENCES_HEADING)[0]!.split('\n');
	const paragraphs: { tier: GuideTier | null; text: string }[] = [];
	let pending: GuideTier | null = null;
	for (const raw of rest.join('\n').split(/\n{2,}/)) {
		const paragraph = raw.trim();
		if (!paragraph) continue;
		const variant = VARIANT_RE.exec(paragraph);
		const text = variant ? paragraph.slice(variant[0].length).trim() : paragraph;
		const tier: GuideTier | null = variant ? (variant[1] as GuideTier) : pending;
		// Prettier puts a blank line after an HTML comment, so a marker usually stands alone and tags
		// the paragraph that follows it.
		if (!text) {
			pending = tier;
			continue;
		}
		paragraphs.push({ tier, text });
		pending = null;
	}
	return paragraphs;
}

export function readGuide(markdown: string, tier: GuideTier): { title: string; body: string } {
	const title = markdown.split('\n')[0]!.replace(/^# /, '');
	const body = guideParagraphs(markdown)
		.filter((paragraph) => paragraph.tier === null || paragraph.tier === tier)
		.map((paragraph) => paragraph.text)
		.join('\n\n');
	return { title, body };
}
