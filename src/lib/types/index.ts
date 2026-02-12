export type {
	NoteId,
	FolderId,
	Note,
	Link,
	TagEntry,
	Folder,
} from './note.js';
export { createNoteId, createFolderId, ROOT_FOLDER } from './note.js';

export type {
	AppSettings,
	EditorSettings,
	SortSettings,
	SettingRecord,
} from './settings.js';
export { DEFAULT_SETTINGS } from './settings.js';

export type { StorageAdapter, ImportResult } from './storage.js';

export type { Result } from './result.js';
export { ok, err, isOk, isErr } from './result.js';
