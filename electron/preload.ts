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
	getObjectRelationshipGraph: () =>
		ipcRenderer.invoke('dndtools:storage:get-object-relationship-graph'),
	lintObjects: () => ipcRenderer.invoke('dndtools:storage:lint-objects'),
	getObjectHistory: (id: string, options?: { limit?: number }) =>
		ipcRenderer.invoke('dndtools:storage:get-object-history', id, options),
	revertObjectToHistory: (id: string, historyEntryId: string) =>
		ipcRenderer.invoke('dndtools:storage:revert-object-history', id, historyEntryId),
	getSetting: (key: string) => ipcRenderer.invoke('dndtools:storage:get-setting', key),
	setSetting: (key: string, value: unknown) =>
		ipcRenderer.invoke('dndtools:storage:set-setting', key, value),
	createSafetySnapshot: (reason?: string) =>
		ipcRenderer.invoke('dndtools:storage:create-safety-snapshot', reason),
	listSafetySnapshots: () => ipcRenderer.invoke('dndtools:storage:list-safety-snapshots'),
	restoreDeletedFromSnapshot: (snapshotId: string) =>
		ipcRenderer.invoke('dndtools:storage:restore-deleted-from-snapshot', snapshotId),
	importNotes: (notes: unknown[]) => ipcRenderer.invoke('dndtools:storage:import-notes', notes),
	exportAllNotes: () => ipcRenderer.invoke('dndtools:storage:export-all-notes'),
	getNoteCount: () => ipcRenderer.invoke('dndtools:storage:get-note-count'),
	getTagCounts: () => ipcRenderer.invoke('dndtools:storage:get-tag-counts'),
	refreshFromDisk: () => ipcRenderer.invoke('dndtools:storage:refresh-from-disk'),
	getIntegrityReport: () => ipcRenderer.invoke('dndtools:storage:get-integrity-report'),
	repairIntegrity: () => ipcRenderer.invoke('dndtools:storage:repair-integrity'),
	rebuildVaultIndex: () => ipcRenderer.invoke('dndtools:storage:rebuild-index'),
	clearMcpChangelog: (options?: { maxAgeMs?: number }) =>
		ipcRenderer.invoke('dndtools:storage:clear-changelog', options),
	getSchemaMigrationReport: () => ipcRenderer.invoke('dndtools:schema:get-migration-report'),
	runSchemaMigrations: (options?: { dryRun?: boolean; createCheckpoint?: boolean }) =>
		ipcRenderer.invoke('dndtools:schema:run-migrations', options),
	listMigrationCheckpoints: () => ipcRenderer.invoke('dndtools:schema:list-checkpoints'),
	restoreMigrationCheckpoint: (checkpointName: string) =>
		ipcRenderer.invoke('dndtools:schema:restore-checkpoint', checkpointName),
	getBackendInfo: () => ipcRenderer.invoke('dndtools:backend-info'),
	pickVaultDirectory: () => ipcRenderer.invoke('dndtools:pick-vault'),
	getMcpStatus: () => ipcRenderer.invoke('dndtools:mcp-status'),
	getEmbeddingStatus: () => ipcRenderer.invoke('dndtools:semantic:status'),
	embedTexts: (model: string, texts: string[]) =>
		ipcRenderer.invoke('dndtools:semantic:embed', model, texts),
	restartMcpSidecar: () => ipcRenderer.invoke('dndtools:mcp-restart'),
	getDiagnosticsHealth: () => ipcRenderer.invoke('dndtools:diagnostics:get-health'),
	markDiagnosticsSuccess: (subsystem: unknown) =>
		ipcRenderer.invoke('dndtools:diagnostics:mark-success', subsystem),
	recordDiagnosticsError: (event: unknown) =>
		ipcRenderer.invoke('dndtools:diagnostics:record-error', event),
	recordDiagnosticsPerformance: (event: unknown) =>
		ipcRenderer.invoke('dndtools:diagnostics:record-performance', event),
	exportDiagnosticsBundle: () => ipcRenderer.invoke('dndtools:diagnostics:export'),
	refreshVault: () => ipcRenderer.invoke('dndtools:vault-refresh'),
	listMcpPendingChanges: () => ipcRenderer.invoke('dndtools:mcp-changes:list'),
	listMcpAuditTrail: (limit?: number) => ipcRenderer.invoke('dndtools:mcp-changes:audit', limit),
	getMcpPolicySettings: () => ipcRenderer.invoke('dndtools:mcp-policy:get'),
	setMcpPolicySettings: (settings: unknown) =>
		ipcRenderer.invoke('dndtools:mcp-policy:set', settings),
	approveMcpChange: (changeId: string) =>
		ipcRenderer.invoke('dndtools:mcp-changes:approve', changeId),
	approveAllMcpChanges: () => ipcRenderer.invoke('dndtools:mcp-changes:approve-all'),
	rejectMcpChange: (changeId: string) =>
		ipcRenderer.invoke('dndtools:mcp-changes:reject', changeId),
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
