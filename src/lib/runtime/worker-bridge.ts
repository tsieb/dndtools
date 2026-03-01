import {
	buildLinkGraphEntries,
	buildSerializedSearchIndex,
	parseNotesForIndex,
} from './worker/operations.js';
import type {
	BuildLinkGraphRequest,
	BuildLinkGraphResult,
	BuildSearchIndexRequest,
	BuildSearchIndexResult,
	ParseNoteBatchRequest,
	ParseNoteBatchResult,
	WorkerRequestMessage,
	WorkerResponseMessage,
} from './worker/types.js';

const WORKER_REQUEST_TIMEOUT_MS = 30_000;

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
};

class WorkerBridge {
	private worker: Worker | null = null;
	private disabled = false;
	private requestCounter = 0;
	private pending = new Map<string, PendingRequest>();

	private canUseWorker(): boolean {
		return typeof Worker !== 'undefined';
	}

	private createWorker(): Worker | null {
		if (this.disabled || !this.canUseWorker()) {
			return null;
		}
		if (this.worker) {
			return this.worker;
		}
		try {
			const worker = new Worker(new URL('./worker/worker.ts', import.meta.url), {
				type: 'module',
			});
			worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
				this.handleWorkerResponse(event.data);
			};
			worker.onerror = () => {
				this.failWorkerAndFallback('Worker execution failed.');
			};
			this.worker = worker;
			return worker;
		} catch {
			this.disabled = true;
			return null;
		}
	}

	private failWorkerAndFallback(message: string): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this.disabled = true;
		for (const [requestId, pendingRequest] of this.pending.entries()) {
			clearTimeout(pendingRequest.timeout);
			pendingRequest.reject(new Error(message));
			this.pending.delete(requestId);
		}
	}

	private handleWorkerResponse(response: WorkerResponseMessage): void {
		const pendingRequest = this.pending.get(response.id);
		if (!pendingRequest) {
			return;
		}
		this.pending.delete(response.id);
		clearTimeout(pendingRequest.timeout);
		if (response.ok) {
			pendingRequest.resolve(response.result);
			return;
		}
		pendingRequest.reject(new Error(response.error));
	}

	private async postRequest<TResult>(
		kind: WorkerRequestMessage['kind'],
		payload: WorkerRequestMessage['payload'],
	): Promise<TResult> {
		const worker = this.createWorker();
		if (!worker) {
			throw new Error('Worker is unavailable.');
		}

		const id = `worker-${Date.now()}-${this.requestCounter++}`;
		const request = { id, kind, payload } as WorkerRequestMessage;

		return await new Promise<TResult>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				this.failWorkerAndFallback('Worker request timed out.');
				reject(new Error('Worker request timed out.'));
			}, WORKER_REQUEST_TIMEOUT_MS);

			this.pending.set(id, {
				resolve: (value) => resolve(value as TResult),
				reject,
				timeout,
			});
			worker.postMessage(request);
		});
	}

	async parseNoteBatch(input: ParseNoteBatchRequest): Promise<ParseNoteBatchResult> {
		try {
			return await this.postRequest<ParseNoteBatchResult>('parseNoteBatch', input);
		} catch {
			return parseNotesForIndex(input);
		}
	}

	async buildSearchIndex(input: BuildSearchIndexRequest): Promise<BuildSearchIndexResult> {
		try {
			return await this.postRequest<BuildSearchIndexResult>('buildSearchIndex', input);
		} catch {
			return buildSerializedSearchIndex(input);
		}
	}

	async buildLinkGraph(input: BuildLinkGraphRequest): Promise<BuildLinkGraphResult> {
		try {
			return await this.postRequest<BuildLinkGraphResult>('buildLinkGraph', input);
		} catch {
			return buildLinkGraphEntries(input);
		}
	}
}

export const workerBridge = new WorkerBridge();
