/** RC-AI-4.1: versioned, read-only wire contract. No commands or raw vault uploads. */
export interface CopilotQuestion {
	version: 1;
	vaultId: string;
	revision: string;
	question: string;
}

export interface CopilotCitation {
	sourceId: string;
	chunkId: string;
	revision: string;
}

export interface CopilotAnswer {
	version: 1;
	revision: string;
	status: 'answered' | 'not-found';
	answer: string;
	citations: CopilotCitation[];
}

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function keys(value: Record<string, unknown>, allowed: string[]): boolean {
	return Object.keys(value).every((key) => allowed.includes(key));
}

export function parseCopilotQuestion(value: unknown): CopilotQuestion {
	if (
		!object(value) ||
		!keys(value, ['version', 'vaultId', 'revision', 'question']) ||
		value.version !== 1 ||
		!text(value.vaultId, 128) ||
		!text(value.revision, 128) ||
		!text(value.question, 4000)
	)
		throw new Error('Invalid Copilot question.');
	return { version: 1, vaultId: value.vaultId, revision: value.revision, question: value.question };
}

/** Validate before rendering; citations must belong to the requested snapshot. */
export function parseCopilotAnswer(value: unknown, revision: string): CopilotAnswer {
	if (
		!object(value) ||
		!keys(value, ['version', 'revision', 'status', 'answer', 'citations']) ||
		value.version !== 1 ||
		value.revision !== revision ||
		(value.status !== 'answered' && value.status !== 'not-found') ||
		!text(value.answer, 16000) ||
		!Array.isArray(value.citations) ||
		value.citations.length > 3 ||
		(value.status === 'answered' ? value.citations.length === 0 : value.citations.length !== 0)
	)
		throw new Error('Invalid Copilot answer.');
	const seen = new Set<string>();
	const citations = value.citations.map((citation: unknown): CopilotCitation => {
		if (
			!object(citation) ||
			!keys(citation, ['sourceId', 'chunkId', 'revision']) ||
			!text(citation.sourceId, 128) ||
			!text(citation.chunkId, 128) ||
			citation.revision !== revision ||
			seen.has(citation.chunkId)
		)
			throw new Error('Invalid Copilot citation.');
		seen.add(citation.chunkId);
		return { sourceId: citation.sourceId, chunkId: citation.chunkId, revision };
	});
	return { version: 1, revision, status: value.status, answer: value.answer, citations };
}

/** Supplied only by an authenticated server adapter, never decoded from the question body. */
export interface CopilotScope {
	accountId: string;
	vaultId: string;
	actorId: string;
}

/** Actor-visible text at one revision. Long structured fields become separate chunks. */
export interface CopilotChunk {
	sourceId: string;
	chunkId: string;
	text: string;
}
export interface CopilotSnapshot {
	revision: string;
	chunks: CopilotChunk[];
}

export function parseCopilotSnapshot(value: unknown): CopilotSnapshot {
	if (
		!object(value) ||
		!keys(value, ['revision', 'chunks']) ||
		!text(value.revision, 128) ||
		!Array.isArray(value.chunks) ||
		value.chunks.length > 10000
	)
		throw new Error('Invalid Copilot snapshot.');
	const seen = new Set<string>();
	const chunks = value.chunks.map((chunk: unknown): CopilotChunk => {
		if (
			!object(chunk) ||
			!keys(chunk, ['sourceId', 'chunkId', 'text']) ||
			!text(chunk.sourceId, 128) ||
			!text(chunk.chunkId, 128) ||
			!text(chunk.text, 4000) ||
			seen.has(chunk.chunkId)
		)
			throw new Error('Invalid Copilot chunk.');
		seen.add(chunk.chunkId);
		return { sourceId: chunk.sourceId, chunkId: chunk.chunkId, text: chunk.text };
	});
	return { revision: value.revision, chunks };
}
