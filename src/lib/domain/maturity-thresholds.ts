export interface MaturityThresholds {
	revealKnowledgeTagsNoteCount: number;
	revealKnowledgeGraphLinkCount: number;
	revealKnowledgeCollectionsNoteCount: number;
	promoteSessionSectionSessionCount: number;
	revealCampaignEntityListObjectNoteCount: number;
}

export const MATURITY_THRESHOLDS: Readonly<MaturityThresholds> = {
	revealKnowledgeTagsNoteCount: 5,
	revealKnowledgeGraphLinkCount: 3,
	revealKnowledgeCollectionsNoteCount: 10,
	promoteSessionSectionSessionCount: 1,
	revealCampaignEntityListObjectNoteCount: 1,
};
