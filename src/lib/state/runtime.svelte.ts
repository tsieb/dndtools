import { bootstrapApplication } from '$lib/runtime/bootstrap.js';
import { reportRuntimeError } from '$lib/runtime/diagnostics.js';

class RuntimeState {
	ready = $state(false);
	initializing = $state(false);
	error = $state<string | null>(null);

	async initialize(): Promise<void> {
		if (this.ready || this.initializing) {
			return;
		}

		this.initializing = true;
		this.error = null;
		try {
			await bootstrapApplication();
			this.ready = true;
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
			void reportRuntimeError({
				category: 'ui_runtime',
				error,
				code: 'RUNTIME_INITIALIZE_FAILED',
			});
		} finally {
			this.initializing = false;
		}
	}
}

export const runtimeState = new RuntimeState();
