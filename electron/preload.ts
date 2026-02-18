import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dndtoolsDesktop', {
	getNote: (id: string) => ipcRenderer.invoke('dndtools:storage:get-note', id),
	getAllNotes: (options?: { includeDeleted?: boolean }) =>
		ipcRenderer.invoke('dndtools:storage:get-all-notes', options),
	saveNote: (note: unknown) => ipcRenderer.invoke('dndtools:storage:save-note', note),
	deleteNote: (id: string, permanent?: boolean) =>
		ipcRenderer.invoke('dndtools:storage:delete-note', id, permanent),
	restoreNote: (id: string) => ipcRenderer.invoke('dndtools:storage:restore-note', id),
	getNotesByFolder: (folder: string) =>
		ipcRenderer.invoke('dndtools:storage:get-notes-by-folder', folder),
	getNotesByTag: (tag: string) => ipcRenderer.invoke('dndtools:storage:get-notes-by-tag', tag),
	getRecentNotes: (limit: number) => ipcRenderer.invoke('dndtools:storage:get-recent-notes', limit),
	getDeletedNotes: () => ipcRenderer.invoke('dndtools:storage:get-deleted-notes'),
	resolveTitle: (title: string) => ipcRenderer.invoke('dndtools:storage:resolve-title', title),
	getLinksFrom: (noteId: string) => ipcRenderer.invoke('dndtools:storage:get-links-from', noteId),
	getLinksTo: (noteId: string) => ipcRenderer.invoke('dndtools:storage:get-links-to', noteId),
	setLinksFrom: (noteId: string, links: unknown[]) =>
		ipcRenderer.invoke('dndtools:storage:set-links-from', noteId, links),
	getAllLinks: () => ipcRenderer.invoke('dndtools:storage:get-all-links'),
	getSessionBoards: () => ipcRenderer.invoke('dndtools:storage:get-session-boards'),
	getSessionBoard: (id: string) => ipcRenderer.invoke('dndtools:storage:get-session-board', id),
	saveSessionBoard: (board: unknown) =>
		ipcRenderer.invoke('dndtools:storage:save-session-board', board),
	deleteSessionBoard: (id: string) =>
		ipcRenderer.invoke('dndtools:storage:delete-session-board', id),
	suggestRelatedNotes: (noteIds: string[], limit?: number) =>
		ipcRenderer.invoke('dndtools:storage:suggest-related-notes', noteIds, limit),
	getObject: (id: string) => ipcRenderer.invoke('dndtools:storage:get-object', id),
	getAllObjects: (options?: { type?: string; query?: string }) =>
		ipcRenderer.invoke('dndtools:storage:get-all-objects', options),
	saveObject: (object: unknown) => ipcRenderer.invoke('dndtools:storage:save-object', object),
	deleteObject: (id: string) => ipcRenderer.invoke('dndtools:storage:delete-object', id),
	getSetting: (key: string) => ipcRenderer.invoke('dndtools:storage:get-setting', key),
	setSetting: (key: string, value: unknown) =>
		ipcRenderer.invoke('dndtools:storage:set-setting', key, value),
	importNotes: (notes: unknown[]) => ipcRenderer.invoke('dndtools:storage:import-notes', notes),
	exportAllNotes: () => ipcRenderer.invoke('dndtools:storage:export-all-notes'),
	getNoteCount: () => ipcRenderer.invoke('dndtools:storage:get-note-count'),
	getTagCounts: () => ipcRenderer.invoke('dndtools:storage:get-tag-counts'),
	refreshFromDisk: () => ipcRenderer.invoke('dndtools:storage:refresh-from-disk'),
	getIntegrityReport: () => ipcRenderer.invoke('dndtools:storage:get-integrity-report'),
	repairIntegrity: () => ipcRenderer.invoke('dndtools:storage:repair-integrity'),
	getBackendInfo: () => ipcRenderer.invoke('dndtools:backend-info'),
	pickVaultDirectory: () => ipcRenderer.invoke('dndtools:pick-vault'),
	getMcpStatus: () => ipcRenderer.invoke('dndtools:mcp-status'),
	restartMcpSidecar: () => ipcRenderer.invoke('dndtools:mcp-restart'),
	refreshVault: () => ipcRenderer.invoke('dndtools:vault-refresh'),
	listMcpPendingChanges: () => ipcRenderer.invoke('dndtools:mcp-changes:list'),
	approveMcpChange: (changeId: string) => ipcRenderer.invoke('dndtools:mcp-changes:approve', changeId),
	approveAllMcpChanges: () => ipcRenderer.invoke('dndtools:mcp-changes:approve-all'),
	rejectMcpChange: (changeId: string) => ipcRenderer.invoke('dndtools:mcp-changes:reject', changeId),
	rejectAllMcpChanges: () => ipcRenderer.invoke('dndtools:mcp-changes:reject-all'),
	minimizeWindow: () => ipcRenderer.invoke('dndtools:window:minimize'),
	toggleWindowMaximize: () => ipcRenderer.invoke('dndtools:window:toggle-maximize'),
	closeWindow: () => ipcRenderer.invoke('dndtools:window:close'),
	getWindowState: () => ipcRenderer.invoke('dndtools:window:get-state'),
	onWindowStateChange: (callback: (state: { isMaximized: boolean }) => void) => {
		const listener = (_event: unknown, payload: { isMaximized: boolean }) => callback(payload);
		ipcRenderer.on('dndtools:window-state', listener);
		return () => ipcRenderer.removeListener('dndtools:window-state', listener);
	},
});
