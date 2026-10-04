import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/messages/en';
import { es } from '../../i18n/messages/es';
import { GUIDE_IDS, HELP_TOPICS, guideForRoute, guideParagraphs, readGuide } from './helpTopics';

const USER_DOCS = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
	'..',
	'..',
	'docs',
	'user',
);

// RC-UX-3.1 — "copy in the voice". The rules are the content fundamentals in
// `docs/design-package/readme.md`: address the DM as you, sentence case, state things plainly, no
// emoji, no engine jargon. These are the parts of that voice a test can hold without a human.

const topics = Object.entries(HELP_TOPICS);

describe('contextual help topics', () => {
	it('covers every placement the roadmap names', () => {
		expect(Object.keys(HELP_TOPICS).sort()).toEqual(
			[
				'calendar',
				'customTypes',
				'projection',
				'recoveryKey',
				'stagedProposals',
				'systemPicker',
				'vaultPrivacy',
				'visibility',
				'widgetTrust',
			].sort(),
		);
	});

	it.each(topics)('%s: title is sentence case', (_id, topic) => {
		const title = en[topic.title];
		const [, ...rest] = title.split(' ');
		expect(title[0]).toBe(title[0].toUpperCase());
		for (const word of rest) expect(word).toBe(word.toLowerCase());
	});

	// A label is NOT required to repeat its title: the trigger sits beside the very field it explains,
	// and Playwright's `getByLabel`/`getByRole` name match is a case-insensitive substring, so
	// "About visibility" next to a "Visibility" select made `getByLabel('Visibility')` ambiguous.
	it('gives every trigger its own name, distinct from its panel title', () => {
		const labels = topics.map(([, topic]) => en[topic.label]);
		expect(new Set(labels).size).toBe(labels.length);
		for (const [, topic] of topics) expect(en[topic.label]).not.toBe(en[topic.title]);
	});

	it.each(topics)('%s: body speaks to the DM plainly', (_id, topic) => {
		const body = en[topic.body];
		expect(body).toMatch(/\byou(r)?\b/i);
		expect(body).not.toMatch(/!/);
		expect(body).not.toMatch(/\p{Extended_Pictographic}/u);
		// No raw identifiers: no backticks, no dotted command or key names like `session.set-workflow`.
		expect(body).not.toMatch(/`|\w\.\w/);
		// Short enough to read in the popover without scrolling; a longer story belongs in a doc.
		expect(body.length).toBeLessThanOrEqual(280);
	});

	it.each(topics)('%s: every string is translated into Spanish', (_id, topic) => {
		for (const key of [topic.label, topic.title, topic.body]) {
			expect(es[key], key).toBeTruthy();
			expect(es[key], key).not.toBe(en[key]);
		}
	});
});

// RC-UX-6.6 — the guides a lost GM lands on.
describe('user guides', () => {
	const guides = GUIDE_IDS.map(
		(id) => [id, readFileSync(join(USER_DOCS, `${id}.md`), 'utf8')] as const,
	);

	it('bundles every guide in docs/user, and nothing else', () => {
		const files = readdirSync(USER_DOCS)
			.filter((file) => file.endsWith('.md'))
			.map((file) => file.replace(/\.md$/, ''));
		expect([...GUIDE_IDS].sort()).toEqual(files.sort());
	});

	it.each([
		['/screens', 'screens'],
		['/screen/abc', 'screens'],
		['/board', 'screens'],
		['/scene/abc', 'screens'],
		['/session', 'running-a-session'],
		['/characters', 'characters'],
		['/characters/pc-1', 'characters'],
		['/atlas', 'maps'],
		['/knowledge/note-1', 'notes'],
		['/campaign/calendar', 'notes'],
		['/settings', 'settings'],
		['/', null],
		['/audio', null],
		['/sessions-elsewhere', null],
	])('opens %s on %s', (pathname, guide) => {
		expect(guideForRoute(pathname)).toBe(guide);
	});

	// Keyboard copy that a phone cannot act on (ONB-17: "Press ⌘K" on a phone).
	// Case-sensitive: "Tab" is the key, "tab bar" is the phone's navigation.
	const KEYBOARD_COPY =
		/⌘|\bCtrl\b|\b[Pp]ress(es)?\b|\b[Kk]eyboard\b|\barrow keys?\b|\bShift\b|\bTab\b/;

	it.each(guides)('%s: every piece of keyboard copy has a touch twin', (_id, markdown) => {
		const paragraphs = guideParagraphs(markdown);
		const keyboard = paragraphs.filter((paragraph) => paragraph.tier === 'keyboard');
		const touch = paragraphs.filter((paragraph) => paragraph.tier === 'touch');
		expect(keyboard.length).toBeGreaterThan(0);
		expect(touch.length).toBe(keyboard.length);
		for (const paragraph of paragraphs.filter((entry) => entry.tier === null))
			expect(paragraph.text, paragraph.text).not.toMatch(KEYBOARD_COPY);
		for (const paragraph of touch)
			expect(paragraph.text, paragraph.text).not.toMatch(KEYBOARD_COPY);
	});

	it.each(guides)(
		'%s: each tier reads its own variant, without markers or references',
		(_id, markdown) => {
			const phone = readGuide(markdown, 'touch');
			const desktop = readGuide(markdown, 'keyboard');
			expect(phone.title).toBe(desktop.title);
			expect(phone.title).not.toMatch(/^#/);
			for (const { body } of [phone, desktop]) {
				expect(body).not.toContain('<!--');
				expect(body).not.toContain('Implementation references');
			}
			expect(phone.body).not.toMatch(KEYBOARD_COPY);
			expect(desktop.body).not.toBe(phone.body);
		},
	);
});
