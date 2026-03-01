export type TemplateScope = 'global' | 'folder';

export interface NoteTemplate {
	id: string;
	name: string;
	description: string;
	icon: string;
	content: string;
	defaultTags: string[];
	defaultFolder: string;
	scope: TemplateScope;
	scopeFolder: string | null;
	titleTemplate?: string;
	sourcePath?: string;
}

export interface ReusableSnippet {
	id: string;
	name: string;
	description: string;
	content: string;
	sourcePath?: string;
}
