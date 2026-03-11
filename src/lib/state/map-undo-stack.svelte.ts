export interface MapUndoEntry<TSnapshot> {
	label: string;
	before: TSnapshot;
	after: TSnapshot;
}

export interface MapUndoResult<TSnapshot> {
	label: string;
	snapshot: TSnapshot;
}

export class MapUndoStack<TSnapshot> {
	readonly capacity: number;
	undoEntries = $state<MapUndoEntry<TSnapshot>[]>([]);
	redoEntries = $state<MapUndoEntry<TSnapshot>[]>([]);

	constructor(capacity = 50) {
		this.capacity = Math.max(1, Math.floor(capacity));
	}

	get canUndo(): boolean {
		return this.undoEntries.length > 0;
	}

	get canRedo(): boolean {
		return this.redoEntries.length > 0;
	}

	clear(): void {
		this.undoEntries = [];
		this.redoEntries = [];
	}

	record(entry: MapUndoEntry<TSnapshot>): void {
		this.undoEntries = [...this.undoEntries, entry];
		if (this.undoEntries.length > this.capacity) {
			this.undoEntries = this.undoEntries.slice(this.undoEntries.length - this.capacity);
		}
		this.redoEntries = [];
	}

	undo(): MapUndoResult<TSnapshot> | null {
		const entry = this.undoEntries[this.undoEntries.length - 1];
		if (!entry) return null;
		this.undoEntries = this.undoEntries.slice(0, this.undoEntries.length - 1);
		this.redoEntries = [...this.redoEntries, entry];
		return {
			label: entry.label,
			snapshot: entry.before,
		};
	}

	redo(): MapUndoResult<TSnapshot> | null {
		const entry = this.redoEntries[this.redoEntries.length - 1];
		if (!entry) return null;
		this.redoEntries = this.redoEntries.slice(0, this.redoEntries.length - 1);
		this.undoEntries = [...this.undoEntries, entry];
		return {
			label: entry.label,
			snapshot: entry.after,
		};
	}
}
