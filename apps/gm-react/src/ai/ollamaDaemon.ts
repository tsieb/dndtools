/**
 * ollamaDaemon — RC-AI-3.3. The management half of the local Ollama path: list what is already
 * pulled, pull a new model, delete one, and estimate the disk it holds. This is device-local
 * network traffic to the SAME daemon `embeddings.ts` (RC-AI-3.2) and the router's local backend
 * (RC-AI-3.1) already speak to (`LOCAL_OLLAMA`) — no key, nothing that syncs, nothing durable.
 *
 * Desktop only: the UI gates this whole surface on `runtimeKind === 'electron'` before any call
 * here runs (`AiLocalModels.tsx`), the same way Android is blocked from the loopback provider
 * connect card. This module still fails closed and honest on its own if that gate is ever
 * bypassed — every reason a call could not complete is a named, user-facing string.
 */

import { LOCAL_OLLAMA } from './localLlmGuidance';

/** Ollama's native model-management routes, relative to the daemon root (not the `/v1` OpenAI shim). */
const TAGS_PATH = '/api/tags';
const PULL_PATH = '/api/pull';
const DELETE_PATH = '/api/delete';

export interface OllamaModel {
	name: string;
	sizeBytes: number;
	digest: string | null;
	modifiedAt: string | null;
}

export type OllamaDaemonUnavailableReason = 'network' | 'bad-response' | 'not-found' | 'cancelled';

export class OllamaDaemonError extends Error {
	readonly reason: OllamaDaemonUnavailableReason;
	constructor(reason: OllamaDaemonUnavailableReason, message: string) {
		super(message);
		this.name = 'OllamaDaemonError';
		this.reason = reason;
	}
}

/** The daemon root: `LOCAL_OLLAMA.healthUrl` is `.../api/tags`, so strip that suffix. */
function daemonRoot(): string {
	return LOCAL_OLLAMA.healthUrl.replace(/\/api\/tags$/, '');
}

function networkError(cause: unknown): OllamaDaemonError {
	if (cause instanceof DOMException && cause.name === 'AbortError') {
		return new OllamaDaemonError('cancelled', 'Cancelled.');
	}
	return new OllamaDaemonError(
		'network',
		'Could not reach the local Ollama daemon — check that `ollama serve` is running.',
	);
}

/** List the models already pulled onto this device, largest disk cost first is NOT assumed here. */
export async function listOllamaModels(signal?: AbortSignal): Promise<OllamaModel[]> {
	let response: Response;
	try {
		response = await fetch(`${daemonRoot()}${TAGS_PATH}`, { redirect: 'error', signal });
	} catch (cause) {
		throw networkError(cause);
	}
	if (!response.ok) {
		throw new OllamaDaemonError('bad-response', `Ollama returned ${response.status}.`);
	}
	let data: unknown;
	try {
		data = await response.json();
	} catch {
		throw new OllamaDaemonError('bad-response', 'Ollama returned an unreadable reply.');
	}
	const rawModels =
		data && typeof data === 'object' && Array.isArray((data as { models?: unknown }).models)
			? (data as { models: unknown[] }).models
			: [];
	return rawModels
		.map((entry): OllamaModel | null => {
			if (!entry || typeof entry !== 'object') return null;
			const e = entry as Record<string, unknown>;
			if (typeof e.name !== 'string') return null;
			return {
				name: e.name,
				sizeBytes: typeof e.size === 'number' ? e.size : 0,
				digest: typeof e.digest === 'string' ? e.digest : null,
				modifiedAt: typeof e.modified_at === 'string' ? e.modified_at : null,
			};
		})
		.filter((m): m is OllamaModel => m !== null);
}

export interface OllamaPullProgress {
	/** Ollama's own status line, e.g. "pulling manifest", "verifying sha256 digest". */
	status: string;
	/** 0–100, or null while a step reports no completed/total byte counts (e.g. "verifying"). */
	percent: number | null;
}

/**
 * Pull a model, reporting Ollama's streamed NDJSON progress as it arrives. Resolves once the
 * stream ends; throws on a network failure, a non-OK status, or an `{error}` line in the stream
 * (Ollama reports an unknown model name or a corrupt download that way, not with an HTTP error).
 */
export async function pullOllamaModel(
	model: string,
	onProgress?: (progress: OllamaPullProgress) => void,
	signal?: AbortSignal,
): Promise<void> {
	let response: Response;
	try {
		response = await fetch(`${daemonRoot()}${PULL_PATH}`, {
			method: 'POST',
			redirect: 'error',
			signal,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: model }),
		});
	} catch (cause) {
		throw networkError(cause);
	}
	if (!response.ok) {
		throw new OllamaDaemonError(
			response.status === 404 ? 'not-found' : 'bad-response',
			response.status === 404
				? `Ollama has no model named "${model}".`
				: `Ollama returned ${response.status}.`,
		);
	}
	if (!response.body) return; // a test double may not stream; treat a bare 200 as "done"
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let newline: number;
		while ((newline = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (!line) continue;
			let event: unknown;
			try {
				event = JSON.parse(line);
			} catch {
				continue; // a partial or non-JSON line from a misbehaving daemon is skipped, not fatal
			}
			if (!event || typeof event !== 'object') continue;
			const e = event as Record<string, unknown>;
			if (typeof e.error === 'string') {
				throw new OllamaDaemonError('bad-response', e.error);
			}
			const completed = typeof e.completed === 'number' ? e.completed : null;
			const total = typeof e.total === 'number' ? e.total : null;
			onProgress?.({
				status: typeof e.status === 'string' ? e.status : '',
				percent: completed !== null && total ? Math.round((completed / total) * 100) : null,
			});
		}
	}
}

/** Delete a pulled model, freeing its disk space. */
export async function deleteOllamaModel(model: string, signal?: AbortSignal): Promise<void> {
	let response: Response;
	try {
		response = await fetch(`${daemonRoot()}${DELETE_PATH}`, {
			method: 'DELETE',
			redirect: 'error',
			signal,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: model }),
		});
	} catch (cause) {
		throw networkError(cause);
	}
	if (!response.ok) {
		throw new OllamaDaemonError(
			response.status === 404 ? 'not-found' : 'bad-response',
			response.status === 404
				? `Ollama has no model named "${model}".`
				: `Ollama returned ${response.status}.`,
		);
	}
}

/** Human-readable disk size, base-1024, matching the precision of the rest of the app's file sizes. */
export function formatModelSize(bytes: number): string {
	if (bytes <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** exponent;
	return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}
