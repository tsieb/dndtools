export type { NoteId, FolderId, Note, Link, TagEntry, Folder } from './note.js';
export { createNoteId, createFolderId, ROOT_FOLDER } from './note.js';

export type {
	AppSettings,
	DiceMacro,
	EditorSettings,
	SortSettings,
	SettingRecord,
} from './settings.js';
export { DEFAULT_SETTINGS } from './settings.js';

export type { StorageAdapter, ImportResult } from './storage.js';
export type {
	VaultObjectId,
	VaultObjectType,
	AbilityScoreKey,
	AbilityScores,
	StatBlockEntry,
	StatBlockData,
	CharacterData,
	ImageData,
	NpcData,
	LocationData,
	FactionData,
	QuestData,
	ItemData,
	EncounterData,
	TimelineEventData,
	ObjectRelationshipType,
	ObjectRelationship,
	StatBlockObject,
	CharacterObject,
	ImageObject,
	NpcObject,
	LocationObject,
	FactionObject,
	QuestObject,
	ItemObject,
	EncounterObject,
	TimelineEventObject,
	VaultObject,
	ObjectGraphNode,
	ObjectGraphEdge,
	ObjectRelationshipGraph,
	ObjectLintSeverity,
	ObjectLintIssue,
	VaultObjectHistoryEntry,
	ObjectEmbedRef,
} from './object.js';
export { createVaultObjectId } from './object.js';

export type {
	SessionBoardId,
	SessionBoard,
	SessionBoardTile,
	RelatedNoteSuggestion,
} from './session-board.js';
export { createSessionBoardId } from './session-board.js';

export type { Result } from './result.js';
export { ok, err, isOk, isErr } from './result.js';

export type { TemplateScope, NoteTemplate, ReusableSnippet } from './template-library.js';
export type {
	ImportIssueSeverity,
	ImportResolutionChoice,
	ImportIssueCode,
	ImportAnalysisIssue,
	ImportCandidateSummary,
	ImportFeatureMappingReport,
	ImportAnalysisStats,
	ImportAnalysisReport,
	ImportJobStatus,
	ImportJobProgress,
	ImportCheckpointSummary,
	ExportProfile,
	ExportValidationIssueCode,
	ExportValidationIssue,
	ExportValidationReport,
	ExportZipResult,
} from './import-export.js';
