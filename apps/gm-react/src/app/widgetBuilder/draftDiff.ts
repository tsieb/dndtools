import type { MessageKey } from '../../i18n';
import type { WidgetDraft } from './draft';

/**
 * RC-WID-3.3 — diffing two drafts field-by-field so an iteration run can be inspected before it is
 * applied.
 *
 * The assistant's re-run always produces a WHOLE new draft (RC-WID-3.1 stages a whole package), but
 * the DM asked to "change one thing", so applying it wholesale would silently discard every manual
 * edit that was not part of the ask. This module only computes the comparison — a plain data
 * structure the dialog renders and the "apply" step reads from field-by-field — so it is unit
 * tested without a DOM.
 */

/** One changed field, named for display and compared by its printable form. */
export interface DraftFieldDiff {
	/** The `WidgetDraft` key this diff came from, so `applyDraftDiff` can copy exactly this field. */
	field: keyof WidgetDraft;
	label: MessageKey;
	before: string;
	after: string;
}

const NONE = '—';

function joinOrNone(values: string[]): string {
	return values.length === 0 ? NONE : values.join(', ');
}

/** Human-readable summaries for the fields worth showing a diff for. Identity fields the DM
 * controls directly (packageId, typeId, version) are compared too, but sizing/style plumbing that
 * is rarely the target of a "change X" ask is left out to keep the diff readable. */
const FIELD_PRINTERS: Partial<{
	[K in keyof WidgetDraft]: (draft: WidgetDraft) => string;
}> = {
	name: (d) => d.name || NONE,
	description: (d) => d.description || NONE,
	category: (d) => d.category || NONE,
	icon: (d) => d.icon || NONE,
	template: (d) => (d.runtime === 'custom-html-js' ? 'custom-html-js' : d.template),
	surfaces: (d) => joinOrNone(d.surfaces),
	dataQueries: (d) => joinOrNone(d.dataQueries.map((q) => q.label)),
	computedFields: (d) => joinOrNone(d.computedFields.map((f) => f.label)),
	configFields: (d) => joinOrNone(d.configFields.map((f) => f.key)),
	commands: (d) => joinOrNone(d.commands.map((c) => c.displayName)),
	styleTokens: (d) => joinOrNone(d.styleTokens.map((t) => `${t.name}: ${t.value}`)),
	hostPermissions: (d) => joinOrNone(d.hostPermissions),
	networkDestinations: (d) => joinOrNone(d.networkDestinations),
};

const FIELD_LABEL: Partial<{ [K in keyof WidgetDraft]: MessageKey }> = {
	name: 'builder.identity.name',
	description: 'builder.identity.description',
	category: 'builder.identity.category',
	icon: 'builder.identity.icon',
	template: 'builder.step.data',
	surfaces: 'builder.identity.surfaces',
	dataQueries: 'builder.review.dataQueries',
	computedFields: 'builder.step.data',
	configFields: 'builder.step.config',
	commands: 'builder.step.commands',
	styleTokens: 'builder.step.style',
	hostPermissions: 'builder.advanced.permsLegend',
	networkDestinations: 'builder.advanced.destinationsLegend',
};

/** The field order the diff is presented in — identity first, then the shape of the widget. */
const DIFF_FIELDS = Object.keys(FIELD_PRINTERS) as (keyof WidgetDraft)[];

/**
 * Field-by-field diff between the draft on screen and the assistant's re-run. Only fields that
 * actually changed are returned, in a stable, reviewable order.
 */
export function diffDrafts(before: WidgetDraft, after: WidgetDraft): DraftFieldDiff[] {
	const diffs: DraftFieldDiff[] = [];
	for (const field of DIFF_FIELDS) {
		const printer = FIELD_PRINTERS[field];
		const label = FIELD_LABEL[field];
		if (!printer || !label) continue;
		const beforeText = printer(before);
		const afterText = printer(after);
		if (beforeText !== afterText)
			diffs.push({ field, label, before: beforeText, after: afterText });
	}
	return diffs;
}

/**
 * Apply a chosen subset of an iteration's field changes onto the current draft. Only the named
 * fields are copied from `after`; everything else — packageId, version, provenance, the DM's own
 * changelog note — is left exactly as the DM already has it.
 */
export function applyDraftDiff<K extends keyof WidgetDraft>(
	current: WidgetDraft,
	after: WidgetDraft,
	fields: readonly K[],
): WidgetDraft {
	const next = { ...current };
	for (const field of fields) next[field] = after[field];
	return next;
}
