import {
	approveAllDesktopMcpChanges,
	approveDesktopMcpChange,
	listDesktopMcpPendingChanges,
	rejectAllDesktopMcpChanges,
	rejectDesktopMcpChange,
	type DesktopMcpChangeRecord,
} from '$lib/desktop/bridge.js';

class McpChangesState {
	pending = $state<DesktopMcpChangeRecord[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);

	count = $derived(this.pending.length);

	async refresh(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			this.pending = await listDesktopMcpPendingChanges();
		} catch (error) {
			this.error = String(error);
		} finally {
			this.loading = false;
		}
	}

	async approve(changeId: string): Promise<boolean> {
		const applied = await approveDesktopMcpChange(changeId);
		await this.refresh();
		return !!applied;
	}

	async approveAll(): Promise<number> {
		const applied = await approveAllDesktopMcpChanges();
		await this.refresh();
		return applied.length;
	}

	async reject(changeId: string): Promise<boolean> {
		const rejected = await rejectDesktopMcpChange(changeId);
		await this.refresh();
		return !!rejected;
	}

	async rejectAll(): Promise<number> {
		const rejected = await rejectAllDesktopMcpChanges();
		await this.refresh();
		return rejected.length;
	}
}

export const mcpChangesState = new McpChangesState();
