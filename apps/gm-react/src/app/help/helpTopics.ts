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
