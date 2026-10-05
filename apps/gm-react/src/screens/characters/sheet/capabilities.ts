import {
	CHARACTER_ENTITY_TYPE,
	hasDmAuthority,
	hasGrantedCapability,
	type CoreStateSlice,
} from '@dndtools/core';

/**
 * RC-CHR-6.2 — what one actor may write on one character, as the core answers it. The sheet body draws
 * its panels and controls from this and nothing else: never from the route it is mounted on.
 *
 *  - `combat` — CHAR-007 (`character.update-combat-resource`): hit points, temporary HP, conditions,
 *    spending a slot, concentration. The DM, the `owner`, or a `combat-participant`.
 *  - `manage` — the owner-or-DM writes: CHAR-008 resources and rests, prepared spells and slot totals,
 *    equipment and coin, attacks, identity, backstory and tag fields, the journal, XP and level-up.
 *  - `dm` — DM authority only: `character.set-combat` (absolute HP, AC) and `character.set-sharing`.
 *
 * A read-only preview takes no write at all (the runtime rejects them), so it holds none of these.
 */
export interface SheetCapabilities {
	combat: boolean;
	manage: boolean;
	dm: boolean;
}

export const NO_SHEET_CAPABILITIES: SheetCapabilities = { combat: false, manage: false, dm: false };

/** The core's authority for `actorId` on `characterId`, folded with a read-only preview. */
export function sheetCapabilitiesFor(
	state: Pick<CoreStateSlice, 'permissions'>,
	actorId: string,
	characterId: string,
	readOnly: boolean,
	now?: string,
): SheetCapabilities {
	const actor = state.permissions.actors[actorId];
	if (!actor || readOnly) return NO_SHEET_CAPABILITIES;
	const granted = (capability: 'owner' | 'combat-participant') =>
		hasGrantedCapability(
			state.permissions,
			actor,
			CHARACTER_ENTITY_TYPE,
			characterId,
			capability,
			now,
		);
	const manage = granted('owner');
	return {
		combat: manage || granted('combat-participant'),
		manage,
		dm: hasDmAuthority(actor.role),
	};
}

/**
 * The companion's capabilities: the host computes `combat` / `manage` with the same grant check for
 * the joined viewer (`net/viewModels` `sheetWrites`). A companion viewer is never the DM.
 */
export function capabilitiesFromWrites(writes: {
	combat: boolean;
	manage: boolean;
}): SheetCapabilities {
	return { combat: writes.combat || writes.manage, manage: writes.manage, dm: false };
}

export type SheetSectionId = 'sheet' | 'resources' | 'levelup' | 'journal' | 'history';

export type SheetPanelId =
	| 'abilities'
	| 'combat'
	| 'spellcasting'
	| 'identity'
	| 'attacks'
	| 'backstory'
	| 'equipment'
	| 'reference'
	| 'tags'
	| 'bio'
	| 'sharing'
	| 'resources'
	| 'death-saves'
	| 'rest'
	| 'prepared-spells'
	| 'xp'
	| 'level-up'
	| 'journal'
	| 'history';

/** Every panel of the sheet, in reading order, with the capability that admits it (none = everyone). */
const PANELS: { id: SheetPanelId; section: SheetSectionId; needs?: keyof SheetCapabilities }[] = [
	// Sheet, first column then second (the DOM reading order; one column on a phone keeps it).
	{ id: 'abilities', section: 'sheet' },
	{ id: 'attacks', section: 'sheet' },
	{ id: 'equipment', section: 'sheet' },
	{ id: 'bio', section: 'sheet' },
	{ id: 'combat', section: 'sheet' },
	{ id: 'spellcasting', section: 'sheet' },
	{ id: 'identity', section: 'sheet' },
	{ id: 'backstory', section: 'sheet' },
	{ id: 'reference', section: 'sheet' },
	{ id: 'tags', section: 'sheet' },
	// `character.set-sharing` is DM-only.
	{ id: 'sharing', section: 'sheet', needs: 'dm' },
	{ id: 'resources', section: 'resources' },
	{ id: 'death-saves', section: 'resources' },
	// `character.rest` is an owner-or-DM recovery.
	{ id: 'rest', section: 'resources', needs: 'manage' },
	{ id: 'prepared-spells', section: 'resources' },
	// `character.set-xp` and the staged advancement share the owner-or-DM guard.
	{ id: 'xp', section: 'levelup', needs: 'manage' },
	{ id: 'level-up', section: 'levelup', needs: 'manage' },
	{ id: 'journal', section: 'journal' },
	{ id: 'history', section: 'history' },
];

export const SHEET_SECTIONS: SheetSectionId[] = [
	'sheet',
	'resources',
	'levelup',
	'journal',
	'history',
];

/** The panels `caps` admits, grouped by section; a section with no panel is not offered. */
export function sheetPlan(
	caps: SheetCapabilities,
): { section: SheetSectionId; panels: SheetPanelId[] }[] {
	return SHEET_SECTIONS.map((section) => ({
		section,
		panels: PANELS.filter((p) => p.section === section && (!p.needs || caps[p.needs])).map(
			(p) => p.id,
		),
	})).filter((s) => s.panels.length > 0);
}

/** Whether `caps` admits `panel` — the same answer {@link sheetPlan} gives. */
export function admits(caps: SheetCapabilities, panel: SheetPanelId): boolean {
	const entry = PANELS.find((p) => p.id === panel);
	return !!entry && (!entry.needs || caps[entry.needs]);
}
