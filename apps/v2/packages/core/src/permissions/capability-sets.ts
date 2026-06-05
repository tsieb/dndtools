import type { CapabilitySet } from '../state/permission-state';
import {
	CAPABILITY_SET_SCHEMA,
	hasCapabilitySchemaForEntityType,
	isKnownCapabilitySet,
} from './capability-schema';
import { isWriteCapableCapabilitySet } from './base-roles';

/**
 * PERM-005 / PERM-006 / PERM-008 — the system-defined capability-set inheritance rules, human
 * explanations, and the effective-permission preview model (Architecture Contract 3, "Minimum
 * Capability Sets" inheritance + DM grant UI requirements).
 *
 * This module is the single source of truth for:
 *
 *   - which capability sets a granted set IMPLIES per entity type (PERM-006 inheritance),
 *   - the human-readable name + explanation + operation summary for each set (PERM-008), and
 *   - the effective-permission PREVIEW the DM grant UI renders — computed HERE in the core so the
 *     GUI never authors policy or shows raw field checkboxes (Contract 1 / Contract 3 rule 6).
 *
 * Pure data + pure functions. No GUI, no storage. Capability sets remain schema-defined named
 * options per entity type; nothing here lets a grant author a raw field list (Cross-Contract
 * Non-Negotiable 9).
 */

/**
 * The capability sets each granted set implies, PER ENTITY TYPE, exactly as Contract 3 defines.
 * A granted set always implies itself plus its narrower sets. `viewer` implies only `viewer`.
 *
 * Keyed by entity type so a character `owner` and a scene `co-editor` resolve against different
 * inheritance graphs. Field/section-scoped entity types reuse their parent entity's graph.
 */
const INHERITANCE_BY_ENTITY_TYPE: Record<string, Record<string, readonly CapabilitySet[]>> =
	Object.freeze({
		character: {
			owner: ['owner', 'combat-participant', 'backstory-editor', 'viewer'],
			'combat-participant': ['combat-participant', 'viewer'],
			'backstory-editor': ['backstory-editor', 'viewer'],
			viewer: ['viewer'],
		},
		'character-field': {
			owner: ['owner', 'combat-participant', 'backstory-editor', 'viewer'],
			'combat-participant': ['combat-participant', 'viewer'],
			'backstory-editor': ['backstory-editor', 'viewer'],
			viewer: ['viewer'],
		},
		note: {
			'section-editor': ['section-editor', 'contributor', 'viewer'],
			contributor: ['contributor', 'viewer'],
			viewer: ['viewer'],
		},
		// CONTENT-011 — calendar-aware notes/structured objects reuse the note authoring graph: an
		// authorized editor holds `section-editor` (full edit) or `contributor` (write); `viewer` reads.
		'content-item': {
			'section-editor': ['section-editor', 'contributor', 'viewer'],
			contributor: ['contributor', 'viewer'],
			viewer: ['viewer'],
		},
		'note-section': {
			'section-editor': ['section-editor', 'contributor', 'viewer'],
			contributor: ['contributor', 'viewer'],
			viewer: ['viewer'],
		},
		widget: {
			manager: ['manager', 'operator', 'viewer'],
			operator: ['operator', 'viewer'],
			viewer: ['viewer'],
		},
		'timer-widget': {
			operator: ['operator', 'viewer'],
			viewer: ['viewer'],
		},
		scene: {
			'co-editor': ['co-editor', 'viewer'],
			viewer: ['viewer'],
		},
	});

/**
 * The set of capability sets a granted set confers for an entity type, INCLUDING the granted set
 * itself. Fails closed: an unknown entity type or an unknown granted set yields just the granted set
 * (no inherited elevation). This is the PERM-006 inheritance expansion.
 */
export function inheritedCapabilitySets(
	entityType: string,
	granted: CapabilitySet,
): CapabilitySet[] {
	const graph = INHERITANCE_BY_ENTITY_TYPE[entityType];
	const inherited = graph?.[granted];
	if (inherited) return [...inherited];
	// Unknown entity type or unknown set: confer only the granted set, never more.
	return [granted];
}

/**
 * True when holding `granted` on `entityType` confers `required` through inheritance (or equality).
 * Used by `grants.ts` to decide whether a grant satisfies a required capability, and by the
 * effective-surface computation. Fails closed for unknown sets/types.
 */
export function capabilitySetGrants(
	entityType: string,
	granted: CapabilitySet,
	required: CapabilitySet,
): boolean {
	return inheritedCapabilitySets(entityType, granted).includes(required);
}

/** A human-readable description of one capability set for the DM grant UI (PERM-008). */
export interface CapabilitySetDescriptor {
	capabilitySet: CapabilitySet;
	/** Title-cased display label (e.g. "Combat Participant"). */
	label: string;
	/** One-sentence explanation of what the set is for. Never raw field lists. */
	explanation: string;
	/** Short summaries of operations this set (directly) allows. */
	allows: readonly string[];
	/** The capability sets this set implies (inheritance), excluding itself. */
	implies: CapabilitySet[];
	/** Whether the set authorizes any write/operate action (vs. read-only). */
	writeCapable: boolean;
}

/**
 * The authored explanation + allowed-operation summary for every capability set per entity type,
 * mirroring Contract 3's "Minimum Capability Sets" tables. The GUI renders these; it does not
 * author them. Messages describe capabilities, NOT raw entity field names, so the surface stays a
 * named-set picker rather than a field checklist (Contract 3 rule 6 / Cross-Contract 9).
 */
const CAPABILITY_SET_COPY: Record<
	string,
	Record<string, { label: string; explanation: string; allows: readonly string[] }>
> = Object.freeze({
	character: {
		owner: {
			label: 'Owner',
			explanation: 'Full control of this character as the player who owns it.',
			allows: [
				'Edit all player-authored character fields',
				'Manage level-up and advancement',
				'Update combat and resource fields',
				'Edit backstory, personality, and history',
			],
		},
		'combat-participant': {
			label: 'Combat Participant',
			explanation: 'Run this character in combat without editing its full sheet.',
			allows: [
				'Write HP, temporary HP, and conditions',
				'Track death saves and concentration',
				'Spend spell slots and class resources',
				'Add session combat notes',
			],
		},
		'backstory-editor': {
			label: 'Backstory Editor',
			explanation: 'Develop this character’s story without touching combat stats.',
			allows: [
				'Write backstory and personality',
				'Edit relationships, goals, bonds, and flaws',
				'Maintain history and player notes',
			],
		},
		viewer: {
			label: 'Viewer',
			explanation: 'Read the character fields visible to this player. No changes.',
			allows: ['Read visible character fields only'],
		},
	},
	note: {
		'section-editor': {
			label: 'Section Editor',
			explanation: 'Edit one explicitly named section of this note.',
			allows: ['Edit the named section’s content'],
		},
		contributor: {
			label: 'Contributor',
			explanation: 'Add new content or comments without changing what is already there.',
			allows: ['Append new content and comments'],
		},
		viewer: {
			label: 'Viewer',
			explanation: 'Read the visible note or section content. No changes.',
			allows: ['Read visible note or section content'],
		},
	},
	widget: {
		manager: {
			label: 'Manager',
			explanation: 'Configure and rebind this widget where the scene allows it.',
			allows: [
				'Configure the widget',
				'Move and resize where the scene permits',
				'Bind and unbind data',
				'Use the widget’s runtime actions',
			],
		},
		operator: {
			label: 'Operator',
			explanation: 'Use this widget’s runtime actions without configuring it.',
			allows: ['Use runtime actions (roll, start/stop, advance, mark complete)'],
		},
		viewer: {
			label: 'Viewer',
			explanation: 'See this widget and its visible data. No changes.',
			allows: ['See the widget and its visible data'],
		},
	},
	scene: {
		'co-editor': {
			label: 'Co-editor',
			explanation: 'Help build this scene, subject to per-widget permissions.',
			allows: [
				'Add, move, resize, and remove widgets',
				'Configure widgets, where widget permissions allow',
			],
		},
		viewer: {
			label: 'Viewer',
			explanation: 'View the scene and its visible widgets. No changes.',
			allows: ['View the scene and visible widgets'],
		},
	},
	'timer-widget': {
		operator: {
			label: 'Operator',
			explanation: 'Operate this tool’s runtime actions.',
			allows: ['Start, pause, resume, reset, advance, roll, or draw'],
		},
		viewer: {
			label: 'Viewer',
			explanation: 'See the tool state. No changes.',
			allows: ['See the tool state'],
		},
	},
});

// Field- and section-scoped entity types reuse their parent entity's copy.
const COPY_ENTITY_TYPE_ALIAS: Record<string, string> = Object.freeze({
	'character-field': 'character',
	'note-section': 'note',
});

function copyEntityType(entityType: string): string {
	return COPY_ENTITY_TYPE_ALIAS[entityType] ?? entityType;
}

function defaultLabel(capabilitySet: CapabilitySet): string {
	return capabilitySet
		.split('-')
		.map((part) => (part.length > 0 ? part[0]!.toUpperCase() + part.slice(1) : part))
		.join(' ');
}

/**
 * Build the descriptor (label, explanation, allowed operations, inheritance, write-capability) for
 * one capability set on an entity type. Returns `null` for a capability set that is not defined for
 * the entity type — the grant UI must never offer an undefined set (PERM-008 AC2 / fail closed).
 */
export function describeCapabilitySet(
	entityType: string,
	capabilitySet: CapabilitySet,
): CapabilitySetDescriptor | null {
	if (!isKnownCapabilitySet(entityType, capabilitySet)) return null;
	const copy = CAPABILITY_SET_COPY[copyEntityType(entityType)]?.[capabilitySet];
	const implies = inheritedCapabilitySets(entityType, capabilitySet).filter(
		(set) => set !== capabilitySet,
	);
	return {
		capabilitySet,
		label: copy?.label ?? defaultLabel(capabilitySet),
		explanation: copy?.explanation ?? `Grants the ${capabilitySet} capability set.`,
		allows: copy?.allows ?? [],
		implies,
		writeCapable: isWriteCapableCapabilitySet(capabilitySet),
	};
}

/**
 * List the capability sets a DM may grant on an entity type, each fully described (PERM-005 /
 * PERM-008). Only schema-defined named sets appear — never raw fields, never undefined sets. An
 * entity type with no schema yields an empty list (fail closed: nothing is offered).
 */
export function listGrantableCapabilitySets(entityType: string): CapabilitySetDescriptor[] {
	if (!hasCapabilitySchemaForEntityType(entityType)) return [];
	const sets = CAPABILITY_SET_SCHEMA[entityType] ?? [];
	const described: CapabilitySetDescriptor[] = [];
	for (const set of sets) {
		const descriptor = describeCapabilitySet(entityType, set);
		if (descriptor) described.push(descriptor);
	}
	return described;
}

/** The effective-permission preview the DM grant UI renders for a candidate grant (PERM-008). */
export interface GrantEffectivePreview {
	entityType: string;
	capabilitySet: CapabilitySet;
	/** True when the capability set is defined for the entity type; false ⇒ not grantable. */
	grantable: boolean;
	label: string;
	explanation: string;
	/** Every capability set conferred by this grant via inheritance, including the granted set. */
	effectiveCapabilitySets: CapabilitySet[];
	/** A flat, deduped summary of every operation the grant ultimately allows. */
	allowedOperations: string[];
	/**
	 * Capability sets DEFINED for the entity type that this grant does NOT confer — the "excluded"
	 * surface the UI shows so the DM sees what the grant withholds (PERM-008 AC1).
	 */
	excludedCapabilitySets: CapabilitySet[];
	writeCapable: boolean;
}

/**
 * Compute the effective-permission PREVIEW for a candidate grant of `capabilitySet` on `entityType`.
 * This is the model the DM grant UI renders: the granted set, everything it inherits, the operations
 * it ultimately allows, and the sets it excludes. Pure; computed in the core so the GUI shows a
 * named-set summary, never raw field checkboxes or hidden policy (PERM-008 / Contract 1).
 *
 * Fails closed for an unknown/undefined set: `grantable` is false and no operations are previewed.
 */
export function previewGrantEffect(
	entityType: string,
	capabilitySet: CapabilitySet,
): GrantEffectivePreview {
	const descriptor = describeCapabilitySet(entityType, capabilitySet);
	if (!descriptor) {
		return {
			entityType,
			capabilitySet,
			grantable: false,
			label: defaultLabel(capabilitySet),
			explanation: 'This capability set is not available for this entity type.',
			effectiveCapabilitySets: [],
			allowedOperations: [],
			excludedCapabilitySets: [...(CAPABILITY_SET_SCHEMA[entityType] ?? [])],
			writeCapable: false,
		};
	}

	const effectiveSets = inheritedCapabilitySets(entityType, capabilitySet);
	const allowed: string[] = [];
	const seen = new Set<string>();
	for (const set of effectiveSets) {
		const setDescriptor = describeCapabilitySet(entityType, set);
		for (const operation of setDescriptor?.allows ?? []) {
			if (!seen.has(operation)) {
				seen.add(operation);
				allowed.push(operation);
			}
		}
	}

	const definedSets = CAPABILITY_SET_SCHEMA[entityType] ?? [];
	const effectiveSetSet = new Set(effectiveSets);
	const excluded = definedSets.filter((set) => !effectiveSetSet.has(set));

	return {
		entityType,
		capabilitySet,
		grantable: true,
		label: descriptor.label,
		explanation: descriptor.explanation,
		effectiveCapabilitySets: effectiveSets,
		allowedOperations: allowed,
		excludedCapabilitySets: excluded,
		writeCapable: descriptor.writeCapable,
	};
}
