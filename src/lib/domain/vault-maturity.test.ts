import { describe, expect, it } from 'vitest';
import { MATURITY_THRESHOLDS } from '$lib/domain/maturity-thresholds.js';
import {
	deriveVaultDisclosureState,
	normalizeVaultMaturitySignals,
} from '$lib/domain/vault-maturity.js';

describe('normalizeVaultMaturitySignals', () => {
	it('coerces missing and invalid values to non-negative integers', () => {
		expect(
			normalizeVaultMaturitySignals({
				noteCount: 6.9,
				linkCount: -2,
				tagCount: Number.NaN,
			}),
		).toEqual({
			noteCount: 6,
			linkCount: 0,
			tagCount: 0,
			sessionCount: 0,
			mapCount: 0,
			objectNoteCount: 0,
		});
	});
});

describe('deriveVaultDisclosureState', () => {
	it('keeps all disclosure toggles false below thresholds', () => {
		expect(
			deriveVaultDisclosureState({
				noteCount: MATURITY_THRESHOLDS.revealKnowledgeTagsNoteCount - 1,
				linkCount: MATURITY_THRESHOLDS.revealKnowledgeGraphLinkCount - 1,
				sessionCount: MATURITY_THRESHOLDS.promoteSessionSectionSessionCount - 1,
				objectNoteCount: MATURITY_THRESHOLDS.revealCampaignEntityListObjectNoteCount - 1,
			}),
		).toEqual({
			revealKnowledgeTags: false,
			revealKnowledgeGraphLink: false,
			revealKnowledgeCollections: false,
			promoteSessionSection: false,
			revealCampaignEntityList: false,
		});
	});

	it('turns disclosure toggles on at threshold boundaries', () => {
		expect(
			deriveVaultDisclosureState({
				noteCount: MATURITY_THRESHOLDS.revealKnowledgeCollectionsNoteCount,
				linkCount: MATURITY_THRESHOLDS.revealKnowledgeGraphLinkCount,
				sessionCount: MATURITY_THRESHOLDS.promoteSessionSectionSessionCount,
				objectNoteCount: MATURITY_THRESHOLDS.revealCampaignEntityListObjectNoteCount,
			}),
		).toEqual({
			revealKnowledgeTags: true,
			revealKnowledgeGraphLink: true,
			revealKnowledgeCollections: true,
			promoteSessionSection: true,
			revealCampaignEntityList: true,
		});
	});
});
