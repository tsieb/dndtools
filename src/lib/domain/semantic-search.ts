import type { Note, NoteId } from '$lib/types/note.js';
import {
	embedDesktopTexts,
	getDesktopEmbeddingStatus,
	getDesktopMcpStatus,
} from '$lib/platform/desktop/bridge.js';

export interface SemanticAvailability {
	enabled: boolean;
	sidecarRunning: boolean;
	model: string | null;
	reason: string | null;
	checkedAt: string;
}

export interface SemanticSearchResult {
	id: NoteId;
	score: number;
}

const MAX_CANDIDATES = 320;
const MAX_NOTE_EMBED_TEXT_LENGTH = 2_400;
const EMBED_BATCH_SIZE = 12;
const MIN_SIMILARITY = 0.18;

function clip(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return value.slice(0, maxLength);
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---[\s\S]*?---\n?/, '');
}

function asEmbedText(note: Note): string {
	const type = typeof note.frontmatter.type === 'string' ? note.frontmatter.type : '';
	const body = stripFrontmatter(note.content);
	const joined = [
		note.title,
		`folder:${note.folder}`,
		type ? `type:${type}` : '',
		note.tags.length > 0 ? `tags:${note.tags.join(',')}` : '',
		body,
	]
		.filter(Boolean)
		.join('\n');
	return clip(joined, MAX_NOTE_EMBED_TEXT_LENGTH);
}

function cosineSimilarity(a: number[], b: number[]): number {
	const len = Math.min(a.length, b.length);
	if (len === 0) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < len; i += 1) {
		const av = a[i] ?? 0;
		const bv = b[i] ?? 0;
		dot += av * bv;
		normA += av * av;
		normB += bv * bv;
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / Math.sqrt(normA * normB);
}

type CachedVector = {
	model: string;
	updatedAt: string;
	vector: number[];
};

class SemanticSearchService {
	private availabilityCache: SemanticAvailability | null = null;
	private noteVectors = new Map<string, CachedVector>();
	private queryVectors = new Map<string, { model: string; vector: number[] }>();
	private availabilityPromise: Promise<SemanticAvailability> | null = null;

	resetCaches(): void {
		this.availabilityCache = null;
		this.noteVectors.clear();
		this.queryVectors.clear();
		this.availabilityPromise = null;
	}

	async getAvailability(forceRefresh = false): Promise<SemanticAvailability> {
		if (!forceRefresh && this.availabilityCache) {
			return this.availabilityCache;
		}
		if (this.availabilityPromise) {
			return this.availabilityPromise;
		}
		this.availabilityPromise = this.computeAvailability()
			.then((status) => {
				this.availabilityCache = status;
				return status;
			})
			.finally(() => {
				this.availabilityPromise = null;
			});
		return this.availabilityPromise;
	}

	private async computeAvailability(): Promise<SemanticAvailability> {
		const checkedAt = new Date().toISOString();
		if (!window.dndtoolsDesktop) {
			return {
				enabled: false,
				sidecarRunning: false,
				model: null,
				reason: 'Desktop runtime required',
				checkedAt,
			};
		}

		const sidecar = await getDesktopMcpStatus().catch(() => null);
		const sidecarRunning = sidecar?.state === 'running';
		if (!sidecarRunning) {
			return {
				enabled: false,
				sidecarRunning: false,
				model: null,
				reason: 'MCP sidecar is not running',
				checkedAt,
			};
		}

		const embeddings = await getDesktopEmbeddingStatus().catch(() => null);
		if (!embeddings || !embeddings.available || !embeddings.model) {
			return {
				enabled: false,
				sidecarRunning: true,
				model: null,
				reason: embeddings?.reason ?? 'No local embedding model available',
				checkedAt,
			};
		}

		return {
			enabled: true,
			sidecarRunning: true,
			model: embeddings.model,
			reason: null,
			checkedAt,
		};
	}

	private async getQueryVector(model: string, query: string): Promise<number[]> {
		const key = `${model}:${query.trim().toLowerCase()}`;
		const cached = this.queryVectors.get(key);
		if (cached) {
			return cached.vector;
		}

		const vectors = await embedDesktopTexts(model, [query]);
		const vector = vectors[0] ?? [];
		this.queryVectors.set(key, { model, vector });
		return vector;
	}

	private async ensureNoteVectors(model: string, notes: Note[]): Promise<void> {
		const missing: Note[] = [];
		for (const note of notes) {
			const key = String(note.id);
			const cached = this.noteVectors.get(key);
			if (!cached || cached.model !== model || cached.updatedAt !== note.updatedAt) {
				missing.push(note);
			}
		}

		for (let index = 0; index < missing.length; index += EMBED_BATCH_SIZE) {
			const batch = missing.slice(index, index + EMBED_BATCH_SIZE);
			const texts = batch.map((note) => asEmbedText(note));
			const vectors = await embedDesktopTexts(model, texts);
			for (let i = 0; i < batch.length; i += 1) {
				const note = batch[i];
				if (!note) continue;
				this.noteVectors.set(String(note.id), {
					model,
					updatedAt: note.updatedAt,
					vector: vectors[i] ?? [],
				});
			}
		}
	}

	async search(input: {
		query: string;
		notes: Note[];
		excludeIds?: Set<string>;
		limit?: number;
	}): Promise<SemanticSearchResult[]> {
		const normalized = input.query.trim();
		if (!normalized) return [];
		const availability = await this.getAvailability();
		if (!availability.enabled || !availability.model) return [];

		const excludeIds = input.excludeIds ?? new Set<string>();
		const limit = Math.max(1, Math.min(20, input.limit ?? 8));
		const candidates = input.notes
			.filter((note) => !note.deleted && !excludeIds.has(String(note.id)))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, MAX_CANDIDATES);

		if (candidates.length === 0) return [];

		const queryVector = await this.getQueryVector(availability.model, normalized);
		await this.ensureNoteVectors(availability.model, candidates);

		const scored = candidates
			.map((note) => {
				const vector = this.noteVectors.get(String(note.id))?.vector ?? [];
				return {
					id: note.id,
					score: cosineSimilarity(queryVector, vector),
				};
			})
			.filter((entry) => entry.score >= MIN_SIMILARITY)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);

		return scored;
	}
}

export const semanticSearchService = new SemanticSearchService();
