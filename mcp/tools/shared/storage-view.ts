import type { FileSystemAdapter } from '../../storage.js';

type IndexEntry = {
	id: string;
	title: string;
	folder: string;
	filePath?: string;
	tags: string[];
	createdAt: string;
	updatedAt: string;
	deleted: boolean;
	deletedAt: string | null;
};

type LinkEntry = {
	sourceId: string;
	targetId: string;
	displayText: string;
	position: number;
};

type FolderEntry = {
	path: string;
	noteCount: number;
	subfolders: string[];
};

interface AsyncStorageViews {
	getIndexEntriesAsync?: () => Promise<IndexEntry[]>;
	getAllLinksFromIndexAsync?: () => Promise<LinkEntry[]>;
	getFolderTreeAsync?: () => Promise<FolderEntry[]>;
}

export async function getIndexEntriesView(storage: FileSystemAdapter): Promise<IndexEntry[]> {
	const candidate = storage as FileSystemAdapter & AsyncStorageViews;
	if (typeof candidate.getIndexEntriesAsync === 'function') {
		return candidate.getIndexEntriesAsync();
	}
	return storage.getIndexEntries();
}

export async function getLinkEntriesView(storage: FileSystemAdapter): Promise<LinkEntry[]> {
	const candidate = storage as FileSystemAdapter & AsyncStorageViews;
	if (typeof candidate.getAllLinksFromIndexAsync === 'function') {
		return candidate.getAllLinksFromIndexAsync();
	}
	return storage.getAllLinksFromIndex();
}

export async function getFolderTreeView(storage: FileSystemAdapter): Promise<FolderEntry[]> {
	const candidate = storage as FileSystemAdapter & AsyncStorageViews;
	if (typeof candidate.getFolderTreeAsync === 'function') {
		return candidate.getFolderTreeAsync();
	}
	return storage.getFolderTree();
}
