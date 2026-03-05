import type { VaultObject } from '$lib/types/object.js';
import { getStorage } from '$lib/platform/storage/index.js';

class ObjectsState {
	objects = $state<VaultObject[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);

	objectById = $derived.by(() => {
		const index: Record<string, VaultObject> = {};
		for (const object of this.objects) {
			index[String(object.id)] = object;
		}
		return index;
	});

	async loadAll(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			this.objects = await getStorage().getAllObjects();
		} catch (error) {
			this.error = String(error);
		} finally {
			this.loading = false;
		}
	}
}

export const objectsState = new ObjectsState();
