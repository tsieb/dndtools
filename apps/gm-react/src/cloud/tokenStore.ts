// A synchronous ICognitoStorage (what amazon-cognito-identity-js requires) backed by an in-memory
// Map and mirrored to the OS-encrypted durable store through one ordered queue. Cognito's storage
// API cannot await writes, so flush() is the explicit teardown barrier: sign-out waits until every
// earlier set/remove and the final namespace sweep have reached disk before reporting completion.
import type { ICognitoStorage } from 'amazon-cognito-identity-js';
import { durableSecretStore, hasDurableSecretStoreBridge } from './secureStore';

const NS = 'cog:'; // namespace persisted keys so we only touch our own

class SecureTokenStore implements ICognitoStorage {
	private mem = new Map<string, string>();
	private durable = false;
	private durableTail: Promise<void> = Promise.resolve();
	private durableSequence = 0;
	private durableFailures: Array<{ sequence: number; message: string }> = [];

	/** Queue without ever leaving a rejected background Promise that could become unhandled. */
	private enqueueDurable(
		label: string,
		operation: () => Promise<boolean>,
		supersedesEarlierFailures = false,
	): void {
		const sequence = ++this.durableSequence;
		this.durableTail = this.durableTail.then(async () => {
			let succeeded = false;
			try {
				succeeded = await operation();
			} catch {
				// Treat bridge/IPC exceptions exactly like a false result; neither proves persistence.
			}
			if (succeeded) {
				if (supersedesEarlierFailures) {
					this.durableFailures = this.durableFailures.filter(
						(failure) => failure.sequence > sequence,
					);
				}
				return;
			}
			this.durableFailures.push({ sequence, message: label });
		});
	}

	setItem(key: string, value: string): void {
		this.mem.set(key, value);
		if (this.durable) {
			this.enqueueDurable('write', () => durableSecretStore.set(NS + key, value));
		}
	}

	getItem(key: string): string | null {
		return this.mem.has(key) ? this.mem.get(key)! : null;
	}

	removeItem(key: string): void {
		this.mem.delete(key);
		if (this.durable) {
			this.enqueueDurable('remove', () => durableSecretStore.remove(NS + key));
		}
	}

	clear(): void {
		this.mem.clear();
		if (!this.durable && !hasDurableSecretStoreBridge) return;
		// Enumerate at execution time, after all earlier writes/removals. This catches keys that were
		// persisted before hydration or by a write still queued when clear() was called. A successful
		// sweep proves the Cognito namespace is empty and therefore safely supersedes earlier failures.
		this.enqueueDurable(
			'clear',
			async () => {
				if (!(await durableSecretStore.available())) return false;
				const keys = (await durableSecretStore.keys()).filter((key) => key.startsWith(NS));
				let removed = true;
				for (const key of keys) {
					try {
						if (!(await durableSecretStore.remove(key))) removed = false;
					} catch {
						removed = false;
					}
				}
				return removed;
			},
			true,
		);
	}

	/** Wait for all durable mutations queued before this call, rejecting if persistence was unproven. */
	async flush(): Promise<void> {
		const through = this.durableSequence;
		const barrier = this.durableTail;
		await barrier;
		const failures = this.durableFailures.filter((failure) => failure.sequence <= through);
		this.durableFailures = this.durableFailures.filter((failure) => failure.sequence > through);
		if (failures.length > 0) {
			throw new Error(
				`Could not flush ${failures.length} durable Cognito token operation${failures.length === 1 ? '' : 's'} (${failures.map((failure) => failure.message).join(', ')}).`,
			);
		}
	}

	/** Load any persisted tokens into memory. Call once before reading auth state. */
	async hydrate(): Promise<void> {
		await this.flush();
		this.durable = await durableSecretStore.available();
		if (!this.durable) return;
		// Do not expose a partially hydrated Cognito session. One corrupt/undecryptable entry makes the
		// complete durable token set untrustworthy, so collect everything before changing memory.
		const hydrated = new Map<string, string>();
		for (const nsKey of await durableSecretStore.keys()) {
			if (!nsKey.startsWith(NS)) continue;
			const value = await durableSecretStore.get(nsKey);
			if (value !== null) hydrated.set(nsKey.slice(NS.length), value);
		}
		for (const [key, value] of hydrated) this.mem.set(key, value);
	}
}

export const tokenStore = new SecureTokenStore();
