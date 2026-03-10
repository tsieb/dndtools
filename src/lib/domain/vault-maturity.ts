import { MATURITY_THRESHOLDS, type MaturityThresholds } from '$lib/domain/maturity-thresholds.js';

export interface VaultMaturitySignals {
	noteCount: number;
	linkCount: number;
	tagCount: number;
	sessionCount: number;
	mapCount: number;
	objectNoteCount: number;
}

export interface VaultDisclosureState {
	revealKnowledgeTags: boolean;
	revealKnowledgeGraphLink: boolean;
	revealKnowledgeCollections: boolean;
	promoteSessionSection: boolean;
	revealCampaignEntityList: boolean;
}

function asNonNegativeInt(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.trunc(value));
}

export function normalizeVaultMaturitySignals(
	signals: Partial<VaultMaturitySignals> | null | undefined,
): VaultMaturitySignals {
	return {
		noteCount: asNonNegativeInt(signals?.noteCount ?? 0),
		linkCount: asNonNegativeInt(signals?.linkCount ?? 0),
		tagCount: asNonNegativeInt(signals?.tagCount ?? 0),
		sessionCount: asNonNegativeInt(signals?.sessionCount ?? 0),
		mapCount: asNonNegativeInt(signals?.mapCount ?? 0),
		objectNoteCount: asNonNegativeInt(signals?.objectNoteCount ?? 0),
	};
}

export function deriveVaultDisclosureState(
	rawSignals: Partial<VaultMaturitySignals> | null | undefined,
	thresholds: MaturityThresholds = MATURITY_THRESHOLDS,
): VaultDisclosureState {
	const signals = normalizeVaultMaturitySignals(rawSignals);
	return {
		revealKnowledgeTags: signals.noteCount >= thresholds.revealKnowledgeTagsNoteCount,
		revealKnowledgeGraphLink: signals.linkCount >= thresholds.revealKnowledgeGraphLinkCount,
		revealKnowledgeCollections: signals.noteCount >= thresholds.revealKnowledgeCollectionsNoteCount,
		promoteSessionSection: signals.sessionCount >= thresholds.promoteSessionSectionSessionCount,
		revealCampaignEntityList:
			signals.objectNoteCount >= thresholds.revealCampaignEntityListObjectNoteCount,
	};
}
