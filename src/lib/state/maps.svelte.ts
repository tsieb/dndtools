import type { MapObject } from '$lib/types/object.js';
import { getStorage } from '$lib/platform/storage/index.js';

class MapsState {
	maps = $state<MapObject[]>([]);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);

	mapById = $derived.by(() => {
		const index: Record<string, MapObject> = {};
		for (const map of this.maps) {
			index[String(map.id)] = map;
		}
		return index;
	});

	async loadAll(): Promise<void> {
		if (this.loading) return;
		this.loading = true;
		this.error = null;
		try {
			const objects = await getStorage().getAllObjects({ type: 'map' });
			this.maps = objects
				.filter((entry): entry is MapObject => entry.type === 'map')
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		} catch (error) {
			this.error = String(error);
		} finally {
			this.loaded = true;
			this.loading = false;
		}
	}

	async saveMap(map: MapObject): Promise<void> {
		await getStorage().saveObject(map);
	}
}

export const mapsState = new MapsState();
