import {
	approveAllDesktopMcpChanges,
	approveDesktopMcpChange,
	listDesktopMcpPendingChanges,
	rejectAllDesktopMcpChanges,
	rejectDesktopMcpChange,
	type DesktopMcpChangeRecord,
} from '$lib/platform/desktop/bridge.js';

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

	async approveMany(changeIds: string[]): Promise<number> {
		let approved = 0;
		for (const changeId of changeIds) {
			const applied = await approveDesktopMcpChange(changeId);
			if (applied) approved += 1;
		}
		await this.refresh();
		return approved;
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

	async rejectMany(changeIds: string[]): Promise<number> {
		let rejectedCount = 0;
		for (const changeId of changeIds) {
			const rejected = await rejectDesktopMcpChange(changeId);
			if (rejected) rejectedCount += 1;
		}
		await this.refresh();
		return rejectedCount;
	}

	async rejectAll(): Promise<number> {
		const rejected = await rejectAllDesktopMcpChanges();
		await this.refresh();
		return rejected.length;
	}
}

export const mcpChangesState = new McpChangesState();
