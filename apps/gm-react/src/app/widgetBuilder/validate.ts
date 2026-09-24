import {
	isValidFormula,
	widgetFormulaIdentifiers,
	widgetQueryFormulaIdentifier,
} from '@dndtools/core';
import type { MessageKey } from '../../i18n';
import {
	SEMVER_PATTERN,
	SLUG_PATTERN,
	STEP_IDS,
	type BuilderStepId,
	type WidgetDraft,
} from './draft';

/** A problem, as a catalog key plus its values: the builder is framework-free of English so the
 * step that renders it decides the wording per locale (RC-UX-1.2). */
export interface DraftIssue {
	step: BuilderStepId;
	field: string;
	message: MessageKey;
	values?: Record<string, string | number>;
}

/**
 * Problems the builder can name before dispatching. Deliberately narrow: it covers what the DM can
 * fix in a step, and leaves everything else to the core's own validation on Review.
 */
export function validateDraft(draft: WidgetDraft): DraftIssue[] {
	const issues: DraftIssue[] = [];
	const add = (
		step: BuilderStepId,
		field: string,
		message: MessageKey,
		values?: Record<string, string | number>,
	) => issues.push({ step, field, message, values });

	if (!draft.name.trim()) add('identity', 'name', 'builder.issue.name');
	if (!draft.packageId) add('identity', 'packageId', 'builder.issue.packageId');
	else if (!SLUG_PATTERN.test(draft.packageId))
		add('identity', 'packageId', 'builder.issue.packageIdShape');
	if (!draft.typeId) add('identity', 'typeId', 'builder.issue.typeId');
	else if (!SLUG_PATTERN.test(draft.typeId)) add('identity', 'typeId', 'builder.issue.typeIdShape');
	if (!SEMVER_PATTERN.test(draft.version)) add('identity', 'version', 'builder.issue.version');
	if (draft.surfaces.length === 0) add('identity', 'surfaces', 'builder.issue.surfaces');
	if (draft.supportedProfiles.length === 0)
		add('identity', 'supportedProfiles', 'builder.issue.profiles');

	for (const axis of ['width', 'height'] as const) {
		if (draft.defaultSize[axis] <= 0)
			add(
				'layout',
				`defaultSize.${axis}`,
				`builder.issue.default${axis === 'width' ? 'Width' : 'Height'}`,
			);
		if (draft.minSize[axis] <= 0)
			add('layout', `minSize.${axis}`, `builder.issue.min${axis === 'width' ? 'Width' : 'Height'}`);
		if (draft.minSize[axis] > draft.defaultSize[axis])
			add(
				'layout',
				`minSize.${axis}`,
				`builder.issue.min${axis === 'width' ? 'Width' : 'Height'}TooLarge`,
			);
	}

	const bindingIds = new Set<string>();
	for (const binding of [...draft.requiredBindings, ...draft.optionalBindings]) {
		if (!binding.id) add('data', 'bindings', 'builder.issue.bindingId');
		else if (bindingIds.has(binding.id))
			add('data', 'bindings', 'builder.issue.bindingDuplicate', { id: binding.id });
		else if (!SLUG_PATTERN.test(binding.id))
			add('data', 'bindings', 'builder.issue.bindingIdShape', { id: binding.id });
		bindingIds.add(binding.id);
		if (binding.entityTypes.length === 0)
			add('data', 'bindings', 'builder.issue.bindingEntityTypes', { id: binding.id });
	}

	const queryIds = new Set<string>();
	// Two ids that differ only in punctuation fold to ONE formula identifier, so a formula naming it
	// would silently read the wrong query. Caught here rather than surprising the author at render.
	const identifierOwners = new Map<string, string>();
	for (const query of draft.dataQueries) {
		if (!query.id) add('data', 'dataQueries', 'builder.issue.queryId');
		else if (queryIds.has(query.id))
			add('data', 'dataQueries', 'builder.issue.queryDuplicate', { id: query.id });
		queryIds.add(query.id);
		if (query.source === 'binding') {
			for (const id of query.bindingIds ?? []) {
				if (!bindingIds.has(id))
					add('data', 'dataQueries', 'builder.issue.queryUndeclaredBinding', { id: query.id });
			}
		}
		const identifier = widgetQueryFormulaIdentifier(query.id, 'count');
		const owner = identifierOwners.get(identifier);
		if (owner !== undefined && owner !== query.id)
			add('data', 'dataQueries', 'builder.issue.queryIdentifierClash', {
				owner,
				id: query.id,
			});
		else identifierOwners.set(identifier, query.id);
	}

	const identifiers = widgetFormulaIdentifiers(draft.dataQueries);
	for (const field of draft.computedFields) {
		for (const inputId of field.inputQueryIds) {
			if (!queryIds.has(inputId))
				add('data', 'computedFields', 'builder.issue.computedMissingQuery', { id: field.id });
		}
		if (field.formula !== undefined && field.valueType === 'number') {
			if (!field.formula.trim())
				add('data', 'computedFields', 'builder.issue.computedEmptyFormula', { id: field.id });
			else if (!isValidFormula(field.formula, identifiers))
				add('data', 'computedFields', 'builder.issue.computedBadFormula', { id: field.id });
		}
	}

	const configKeys = new Set<string>();
	for (const field of draft.configFields) {
		if (!field.key) add('config', 'configFields', 'builder.issue.configKey');
		else if (configKeys.has(field.key))
			add('config', 'configFields', 'builder.issue.configDuplicate', { key: field.key });
		configKeys.add(field.key);
	}

	const commandTypes = new Set<string>();
	for (const command of draft.commands) {
		if (!command.type) add('commands', 'commands', 'builder.issue.commandType');
		else if (commandTypes.has(command.type))
			add('commands', 'commands', 'builder.issue.commandDuplicate', { type: command.type });
		commandTypes.add(command.type);
	}

	if (draft.runtime === 'custom-html-js') {
		if (!draft.customCode.html.trim() && !draft.customCode.js.trim())
			add('advanced', 'customCode', 'builder.issue.customCodeEmpty');
	}
	// A network grant scoped to no destination class can never be used: SEC-011 denies every class
	// that was not approved, so asking for the permission without one is a request for nothing.
	if (draft.hostPermissions.includes('network') && draft.networkDestinations.length === 0)
		add('advanced', 'networkDestinations', 'builder.issue.networkDestinations');
	if (!draft.hostPermissions.includes('network') && draft.networkDestinations.length > 0)
		add('advanced', 'networkDestinations', 'builder.issue.networkWithoutPermission');

	const tokenNames = new Set<string>();
	for (const token of draft.styleTokens) {
		if (!token.name) add('style', 'styleTokens', 'builder.issue.tokenName');
		else if (tokenNames.has(token.name))
			add('style', 'styleTokens', 'builder.issue.tokenDuplicate', { name: token.name });
		tokenNames.add(token.name);
	}

	return issues;
}

/** The first step with an unresolved issue, so "Review" can send the DM back to the right place. */
export function firstBlockedStep(issues: DraftIssue[]): BuilderStepId | null {
	for (const step of STEP_IDS) {
		if (issues.some((issue) => issue.step === step)) return step;
	}
	return null;
}
