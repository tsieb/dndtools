import type { FileSystemAdapter } from '../../storage.js';
import { extractNoteEmbeds } from '../../../src/lib/domain/object-embeds.js';

export function appendEmbed(content: string, embed: string): string {
	const trimmed = content.trimEnd();
	if (!trimmed) return embed;
	const separator = trimmed.endsWith('\n') ? '\n' : '\n\n';
	return `${trimmed}${separator}${embed}`;
}

export function prependEmbed(content: string, embed: string): string {
	const trimmedStart = content.trimStart();
	if (!trimmedStart) return embed;
	const rest = content.replace(/^\s+/, '');
	return `${embed}\n\n${rest}`;
}

export function applyEmbedAtPosition(
	content: string,
	embed: string,
	position: 'append' | 'prepend',
): string {
	return position === 'prepend' ? prependEmbed(content, embed) : appendEmbed(content, embed);
}

function pathExists(edges: Map<string, Set<string>>, start: string, goal: string): boolean {
	if (start === goal) return true;
	const visited = new Set<string>();
	const stack = [start];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || visited.has(current)) continue;
		visited.add(current);

		for (const next of edges.get(current) ?? []) {
			if (next === goal) return true;
			if (!visited.has(next)) stack.push(next);
		}
	}

	return false;
}

export async function wouldCreateEmbedCycle(
	storage: FileSystemAdapter,
	sourceId: string,
	targetId: string,
): Promise<boolean> {
	if (sourceId === targetId) return true;

	const notes = await storage.getAllNotes();
	const active = notes.filter((note) => !note.deleted);
	const byTitle = new Map(active.map((note) => [note.title.toLowerCase(), String(note.id)]));
	const byId = new Set(active.map((note) => String(note.id)));
	const edges = new Map<string, Set<string>>();

	for (const note of active) {
		const source = String(note.id);
		const refs = extractNoteEmbeds(note.content);
		for (const ref of refs) {
			const resolvedTarget =
				ref.targetBy === 'id'
					? byId.has(ref.target)
						? ref.target
						: null
					: (byTitle.get(ref.target.toLowerCase()) ?? null);
			if (!resolvedTarget) continue;
			const entry = edges.get(source) ?? new Set<string>();
			entry.add(resolvedTarget);
			edges.set(source, entry);
		}
	}

	const entry = edges.get(sourceId) ?? new Set<string>();
	entry.add(targetId);
	edges.set(sourceId, entry);

	return pathExists(edges, targetId, sourceId);
}
