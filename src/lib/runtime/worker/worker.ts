/// <reference lib="webworker" />

import {
	buildLinkGraphEntries,
	buildSerializedSearchIndex,
	parseNotesForIndex,
} from './operations.js';
import type { WorkerRequestMessage, WorkerResponseMessage } from './types.js';

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
	const message = event.data;
	const respond = (response: WorkerResponseMessage): void => {
		workerScope.postMessage(response);
	};

	try {
		switch (message.kind) {
			case 'parseNoteBatch':
				respond({ id: message.id, ok: true, result: parseNotesForIndex(message.payload) });
				return;
			case 'buildSearchIndex':
				respond({ id: message.id, ok: true, result: buildSerializedSearchIndex(message.payload) });
				return;
			case 'buildLinkGraph':
				respond({ id: message.id, ok: true, result: buildLinkGraphEntries(message.payload) });
				return;
		}
	} catch (error) {
		respond({
			id: message.id,
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		});
	}
};
