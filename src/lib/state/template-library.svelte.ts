import { DND_TEMPLATES } from '$lib/domain/templates.js';
import { REUSABLE_SNIPPETS } from '$lib/domain/snippets.js';
import { getStorage } from '$lib/platform/storage/index.js';
import type { NoteTemplate, ReusableSnippet } from '$lib/types/template-library.js';

function cloneTemplate(template: NoteTemplate): NoteTemplate {
	return {
		...template,
		defaultTags: [...template.defaultTags],
	};
}

function cloneSnippet(snippet: ReusableSnippet): ReusableSnippet {
	return {
		...snippet,
	};
}

class TemplateLibraryState {
	templates = $state<NoteTemplate[]>(DND_TEMPLATES.map(cloneTemplate));
	snippets = $state<ReusableSnippet[]>(REUSABLE_SNIPPETS.map(cloneSnippet));
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);

	async refresh(): Promise<void> {
		this.loading = true;
		try {
			const storage = getStorage();
			const [templates, snippets] = await Promise.all([
				storage.getNoteTemplates(),
				storage.getReusableSnippets(),
			]);
			if (templates.length > 0) {
				this.templates = templates.map(cloneTemplate);
			}
			if (snippets.length > 0) {
				this.snippets = snippets.map(cloneSnippet);
			}
			this.error = null;
			this.loaded = true;
		} catch (error) {
			this.error = String(error);
			if (!this.loaded) {
				this.templates = DND_TEMPLATES.map(cloneTemplate);
				this.snippets = REUSABLE_SNIPPETS.map(cloneSnippet);
			}
		} finally {
			this.loading = false;
		}
	}
}

export const templateLibraryState = new TemplateLibraryState();
