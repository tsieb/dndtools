import type { MessageKey, MessageValues } from '../i18n';

/**
 * Campaign's data-only vocabulary: the option tables the quest and faction editors offer, the two
 * mapping tables onto DS component vocabulary, and the two helpers that render a key-carrying table.
 *
 * Extracted from `Campaign.tsx` unchanged so the screen stays under its RC-STB-2.7 line baseline
 * while RC-UX-1.2 moves its copy into the message catalog.
 */

export type Translate = (key: MessageKey, values?: MessageValues) => string;

export const STANCE_TONE: Record<string, string> = {
	hostile: 'error',
	neutral: 'neutral',
	friendly: 'success',
	allied: 'accent',
};

// Every option table below carries a message KEY, not a label: the caller renders it with `t` so a
// non-English locale gets the translated option instead of the English source (RC-UX-1.2).
export const STANCE_OPTIONS: { value: string; label: MessageKey }[] = [
	{ value: 'hostile', label: 'campaign.stance.hostile' },
	{ value: 'neutral', label: 'campaign.stance.neutral' },
	{ value: 'friendly', label: 'campaign.stance.friendly' },
	{ value: 'allied', label: 'campaign.stance.allied' },
];

// The `quest` subtype's declared status vocabulary (schemas: active | completed | failed | paused).
export const QUEST_STATUS_OPTIONS: { value: string; label: MessageKey }[] = [
	{ value: 'active', label: 'campaign.questStatus.active' },
	{ value: 'completed', label: 'campaign.questStatus.completed' },
	{ value: 'failed', label: 'campaign.questStatus.failed' },
	{ value: 'paused', label: 'campaign.questStatus.paused' },
];

// Core quest status → the DS QuestCard status key (the card calls the paused state "onhold").
export const QUEST_CARD_STATUS: Record<string, string> = {
	active: 'active',
	completed: 'completed',
	failed: 'failed',
	paused: 'onhold',
};

export const FACTION_KIND_OPTIONS: { value: string; label: MessageKey }[] = [
	{ value: 'cult', label: 'campaign.factionKind.cult' },
	{ value: 'militia', label: 'campaign.factionKind.militia' },
	{ value: 'guild', label: 'campaign.factionKind.guild' },
	{ value: 'party', label: 'campaign.factionKind.party' },
	{ value: 'order', label: 'campaign.factionKind.order' },
	{ value: 'other', label: 'campaign.factionKind.other' },
];

// Core visibility → the safety-critical VisibilityChip level (same map as Knowledge).
export const VIS_CHIP: Record<string, string> = {
	'dm-only': 'dm-only',
	'player-visible': 'players',
	shared: 'players',
};
export const VIS_OPTIONS: { value: string; label: MessageKey }[] = [
	{ value: 'dm-only', label: 'common.visibility.dmOnly' },
	{ value: 'player-visible', label: 'campaign.vis.players' },
	{ value: 'shared', label: 'common.visibility.shared' },
];

export const KIND_LABEL: Record<string, MessageKey> = {
	pc: 'characters.kind.pc',
	npc: 'characters.kind.npc',
	monster: 'characters.kind.monster',
	sidekick: 'characters.kind.sidekick',
};

/** A key-carrying option table rendered for the DS `Select`, which wants plain labels. */
export const options = (table: { value: string; label: MessageKey }[], t: Translate) =>
	table.map((option) => ({ value: option.value, label: t(option.label) }));

/** One option's label — or the stored value itself, should the subtype's vocabulary ever widen
 * past what this screen declares. Falling back to the raw value keeps a widened schema readable
 * instead of silently relabelling it as something else. */
export const optionLabel = (
	table: { value: string; label: MessageKey }[],
	value: string,
	t: Translate,
) => {
	const key = table.find((option) => option.value === value)?.label;
	return key ? t(key) : value;
};
