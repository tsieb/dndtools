export type ImportIssueSeverity = 'error' | 'warning' | 'info';

export type ImportResolutionChoice = 'skip' | 'overwrite' | 'merge';

export type ImportIssueCode =
	| 'duplicate_title_existing'
	| 'duplicate_title_incoming'
	| 'id_collision'
	| 'invalid_frontmatter'
	| 'encoding_issue'
	| 'missing_linked_file'
	| 'size_limit_exceeded'
	| 'manual_wikilink_resolution';

export interface ImportAnalysisIssue {
	id: string;
	code: ImportIssueCode;
	severity: ImportIssueSeverity;
	message: string;
	sourcePath: string;
	relatedPaths: string[];
	resolutionChoices: ImportResolutionChoice[];
	recommendedResolution: ImportResolutionChoice;
}

export interface ImportCandidateSummary {
	sourcePath: string;
	title: string;
	folder: string;
	id: string;
	tags: string[];
	hasFrontmatter: boolean;
	manualResolutionHints: string[];
}

export interface ImportFeatureMappingReport {
	mapped: string[];
	ignored: string[];
	manualResolution: string[];
}

export interface ImportAnalysisStats {
	errors: number;
	warnings: number;
	infos: number;
	duplicateTitles: number;
	idCollisions: number;
	invalidFrontmatter: number;
	encodingIssues: number;
	missingLinkedFiles: number;
	sizeLimitExceeded: number;
	manualResolutionItems: number;
}

export interface ImportAnalysisReport {
	generatedAt: string;
	sourceRoot: string;
	totalFiles: number;
	markdownFiles: number;
	largeImport: boolean;
	candidates: ImportCandidateSummary[];
	issues: ImportAnalysisIssue[];
	stats: ImportAnalysisStats;
	featureMapping: ImportFeatureMappingReport;
}

export type ImportJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ImportJobProgress {
	jobId: string;
	sourceRoot: string;
	status: ImportJobStatus;
	startedAt: string;
	updatedAt: string;
	totalFiles: number;
	processedFiles: number;
	imported: number;
	skipped: number;
	overwritten: number;
	merged: number;
	warnings: number;
	errors: string[];
	lastError: string | null;
	checkpointStored: boolean;
}

export interface ImportCheckpointSummary {
	exists: boolean;
	sourceRoot: string | null;
	createdAt: string | null;
	totalFiles: number;
	processedFiles: number;
	remainingFiles: number;
	defaultResolution: ImportResolutionChoice;
}

export type ExportProfile = 'portable_markdown_zip' | 'deterministic_markdown_zip';

export type ExportValidationIssueCode = 'broken_embed' | 'unresolved_link';

export interface ExportValidationIssue {
	code: ExportValidationIssueCode;
	severity: 'warning' | 'error';
	message: string;
	noteId: string;
	noteTitle: string;
	target: string;
}

export interface ExportValidationReport {
	generatedAt: string;
	brokenEmbeds: number;
	unresolvedLinks: number;
	issues: ExportValidationIssue[];
}

export interface ExportZipResult {
	canceled: boolean;
	path: string | null;
	profile: ExportProfile;
	noteCount: number;
	assetCount: number;
	validation: ExportValidationReport;
}
