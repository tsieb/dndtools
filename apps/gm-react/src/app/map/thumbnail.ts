import type { MapLayerQueryEntry, MapView } from '@dndtools/core';

/** Only actor-filtered core query results may cross the worker boundary. */
export interface ThumbnailModel {
	view: MapView;
	layers: MapLayerQueryEntry[];
	colors: Record<string, string>;
}
export interface ThumbnailResult {
	uri: string;
	durationMs: number;
}

/** One worker per gallery lifetime. Content keys include permissions-filtered geometry and theme. */
export class MapThumbnailClient {
	private worker: Worker | null = null;
	private nextId = 0;
	private pending = new Map<
		number,
		{ resolve: (value: ThumbnailResult) => void; reject: (error: Error) => void }
	>();
	private cache = new Map<string, Promise<ThumbnailResult>>();

	generate(model: ThumbnailModel): Promise<ThumbnailResult> {
		const key = JSON.stringify(model);
		const cached = this.cache.get(key);
		if (cached) return cached;
		if (!this.worker) {
			this.worker = new Worker(new URL('./thumbnail.worker.ts', import.meta.url), {
				type: 'module',
			});
			this.worker.onmessage = ({ data }) => {
				const request = this.pending.get(data.id);
				this.pending.delete(data.id);
				if (data.error) request?.reject(new Error(data.error));
				else request?.resolve(data.result);
			};
			this.worker.onerror = () => this.dispose();
		}
		const id = ++this.nextId;
		const result = new Promise<ThumbnailResult>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.worker!.postMessage({ id, model });
		}).catch((error: unknown) => {
			this.cache.delete(key);
			throw error;
		});
		this.cache.set(key, result);
		// Bounded insertion-order cache; in-flight requests still resolve for their callers.
		if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
		return result;
	}

	dispose() {
		this.worker?.terminate();
		this.worker = null;
		for (const request of this.pending.values())
			request.reject(new Error('Thumbnail worker stopped'));
		this.pending.clear();
		this.cache.clear();
	}
}
