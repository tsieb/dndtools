import { useMemo } from 'react';
import {
	advancementStateOf,
	checkAdvancementEligibility,
	computeEncumbrance,
	effectiveProficiencyBonus,
	getActiveSystemForActor,
	getCharacterForActor,
	getCharacterJournalForActor,
	getPartyOverviewForActor,
	hasGrantedCapability,
	inventoryOf,
	listCharactersForActor,
	passivePerception,
	resourcesOf,
	CHARACTER_ENTITY_TYPE,
} from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { PlayerData } from './shared';

/** Actor-scoped sheet projection and capability gates shared by every tab. */
export function usePlayerData(pcChoice: string | null) {
	const runtime = useRuntime();
	const state = runtime.state;
	const actorId = runtime.defaultActorId;
	return useMemo<PlayerData>(() => {
		// The player's PCs: every player-visible PC the actor may see (finalized PCs are `shared`
		// with their owning player actor, so a player sees their own; the DM sees the whole roster).
		// RC-CHR-1.1 — the reads are package-scoped: `CharacterView.resources` is every resource the
		// ACTIVE package declares for this character, so a campaign on Generic reads a stress clock
		// where a 5e one reads ki, without either name appearing on this screen.
		const activePackage = getActiveSystemForActor(
			state.systems,
			state.permissions,
			actorId,
		).activePackage;
		const pcs = listCharactersForActor(
			state.characters,
			state.permissions,
			actorId,
			activePackage,
		).filter((c) => c.kind === 'pc');
		const chosen = pcs.find((c) => c.id === pcChoice) ?? pcs[0] ?? null;
		const view = chosen
			? getCharacterForActor(state.characters, state.permissions, actorId, chosen.id, activePackage)
			: null;
		const record = chosen ? state.characters.characters[chosen.id] : undefined;
		const resources = record ? resourcesOf(record) : null;
		const journalView = chosen
			? getCharacterJournalForActor(state.characters, state.permissions, actorId, chosen.id)
			: null;
		const actor = state.permissions.actors[actorId] ?? null;
		const isDm = actor?.role === 'dm';
		// Journal + advancement authority: the DM, or a granted character `owner` (mirrors the
		// command-layer checks in character-journal.ts / character-advancement.ts — re-enforced there).
		const isOwner = !!(
			actor &&
			chosen &&
			!isDm &&
			hasGrantedCapability(state.permissions, actor, CHARACTER_ENTITY_TYPE, chosen.id, 'owner')
		);
		// RC-CHR-4.3 (DEBT-2026-005) — while the DM is previewing (any role), EVERY write is rejected
		// read-only by the runtime regardless of who would otherwise be authorized, so an authority check
		// alone leaves a dead control behind. Fold `runtime.readOnly` into every manage-capability flag so
		// the DM never sees a "canAuthor…" affordance the click can't actually honor.
		const readOnlyPreview = runtime.readOnly;
		const party = getPartyOverviewForActor(state.characters, state.permissions, actorId);
		// RC-CHR-3.2 — the party's aggregate STR (defaulting each member to 10), for the stash's
		// encumbrance BASELINE (`encumbranceLevelFor(stashWeight, partyStrength)`). `pcs` is the exact
		// same actor-filtered visible-PC set `party.members` derives from, so this never over-counts a
		// member the DM can see but the viewer cannot.
		const partyStrength = pcs.reduce((sum, c) => sum + (c.abilityScores.str ?? 10), 0) || 10;
		return {
			characterId: chosen?.id ?? null,
			view,
			resources,
			pcs: pcs.map((c) => ({ id: c.id, name: c.name })),
			partyStrength,
			// Pure derived queries, computed AFTER the actor-filtered gate passed (same pattern as
			// `resourcesOf` above) — they read only abilityScores / proficiencies / data.level.
			passive: record ? passivePerception(record) : null,
			profBonus: record ? effectiveProficiencyBonus(record) : null,
			journal: journalView?.entries ?? [],
			canAuthorJournal: (isDm || isOwner) && !readOnlyPreview,
			// Structured inventory + encumbrance from the durable record (same post-gate pattern as
			// `resourcesOf`); encumbrance is derived on read so it can never drift from items/coins/STR.
			inventory: record ? inventoryOf(record) : null,
			encumbrance: record ? computeEncumbrance(record) : null,
			canManageInventory: (isDm || isOwner) && !readOnlyPreview,
			// RC-CHR-1.1 — the package's own resource rules fused with this sheet's counters.
			resourceInstances: view?.resources ?? [],
			canManageResources: (isDm || isOwner) && !readOnlyPreview,
			party,
			advancement: record ? advancementStateOf(record) : null,
			xpEligible: record ? checkAdvancementEligibility(record, 'xp') : null,
			milestoneEligible: record ? checkAdvancementEligibility(record, 'milestone') : null,
			canAdvance: (isDm || isOwner) && !readOnlyPreview,
			isDm,
			readOnlyPreview,
		};
	}, [state, actorId, pcChoice, runtime.readOnly]);
}
