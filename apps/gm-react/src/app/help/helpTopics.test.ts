import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/messages/en';
import { es } from '../../i18n/messages/es';
import { HELP_TOPICS } from './helpTopics';

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
