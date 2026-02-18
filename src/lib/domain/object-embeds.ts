import { createVaultObjectId, type ObjectEmbedRef, type VaultObjectType } from '$lib/types/object.js';
import type { NoteId } from '$lib/types/note.js';

const OBJECT_EMBED_REGEX = /!\[\[obj:(stat_block|character|image):([A-Za-z0-9_-]+)(?:\|([^\]]+))?\]\]/g;
const NOTE_EMBED_REGEX = /!\[\[([^\]]+)\]\]/g;

export type EmbedRenderView = 'card' | 'inline' | 'content';

export interface EmbedRenderOptions {
	view?: EmbedRenderView;
	open?: boolean;
	maxDepth?: number;
}

export interface NoteEmbedRef {
	target: string;
	targetBy: 'id' | 'title';
	label?: string;
	options: EmbedRenderOptions;
	position: number;
}

export function parseEmbedRenderOptions(raw: string | undefined): EmbedRenderOptions {
	if (!raw) return {};

	const options: EmbedRenderOptions = {};
	const segments = raw
		.split(/[;,]/g)
		.map((entry) => entry.trim())
		.filter(Boolean);
	for (const segment of segments) {
		const [rawKey, ...valueParts] = segment.split('=');
		const key = rawKey?.trim().toLowerCase();
		const value = valueParts.join('=').trim();
		if (!key || !value) continue;

		if (key === 'view' && (value === 'card' || value === 'inline' || value === 'content')) {
			options.view = value;
		}
		if (key === 'open') {
			if (value === 'true') options.open = true;
			if (value === 'false') options.open = false;
		}
		if (key === 'maxDepth' || key === 'maxdepth' || key === 'depth') {
			const parsed = Number.parseInt(value, 10);
			if (Number.isFinite(parsed) && parsed > 0) {
				options.maxDepth = parsed;
			}
		}
	}

	return options;
}

export function formatObjectEmbed(
	type: VaultObjectType,
	id: string,
	label?: string,
): string {
	const cleanLabel = label?.trim();
	return cleanLabel
		? `![[obj:${type}:${id}|${cleanLabel}]]`
		: `![[obj:${type}:${id}]]`;
}

export function formatNoteEmbed(
	target: { id?: string | NoteId; title?: string },
	label?: string,
	options?: EmbedRenderOptions,
): string {
	const targetText = target.id ? `note:${String(target.id)}` : target.title?.trim();
	if (!targetText) {
		throw new Error('formatNoteEmbed requires either a note id or title');
	}

	const cleanLabel = label?.trim();
	const optionParts: string[] = [];
	if (options?.view) optionParts.push(`view=${options.view}`);
	if (typeof options?.open === 'boolean') optionParts.push(`open=${options.open ? 'true' : 'false'}`);
	if (typeof options?.maxDepth === 'number' && Number.isFinite(options.maxDepth)) {
		optionParts.push(`maxDepth=${Math.max(1, Math.trunc(options.maxDepth))}`);
	}

	if (cleanLabel && optionParts.length > 0) {
		return `![[${targetText}|${cleanLabel}|${optionParts.join(',')}]]`;
	}
	if (cleanLabel) {
		return `![[${targetText}|${cleanLabel}]]`;
	}
	if (optionParts.length > 0) {
		return `![[${targetText}|${optionParts.join(',')}]]`;
	}
	return `![[${targetText}]]`;
}

export function extractObjectEmbeds(content: string): ObjectEmbedRef[] {
	const embeds: ObjectEmbedRef[] = [];
	let match: RegExpExecArray | null;
	OBJECT_EMBED_REGEX.lastIndex = 0;

	while ((match = OBJECT_EMBED_REGEX.exec(content)) !== null) {
		const rawType = match[1];
		const rawId = match[2];
		if (!rawType || !rawId) continue;

		embeds.push({
			type: rawType as VaultObjectType,
			id: createVaultObjectId(rawId),
			label: match[3]?.trim() || undefined,
			position: match.index,
		});
	}

	return embeds;
}

export function extractNoteEmbeds(content: string): NoteEmbedRef[] {
	const embeds: NoteEmbedRef[] = [];
	let match: RegExpExecArray | null;
	NOTE_EMBED_REGEX.lastIndex = 0;

	while ((match = NOTE_EMBED_REGEX.exec(content)) !== null) {
		if (match.index === 0 || content[match.index - 1] !== '!') {
			continue;
		}

		const inner = (match[1] ?? '').trim();
		if (!inner) continue;

		const [rawTarget, rawLabel, rawOptions] = inner.split('|');
		const targetSpec = rawTarget?.trim() ?? '';
		if (!targetSpec || targetSpec.startsWith('obj:')) continue;

		const targetBy: 'id' | 'title' =
			targetSpec.startsWith('note:') || targetSpec.startsWith('id:') ? 'id' : 'title';
		const target =
			targetBy === 'id' ? targetSpec.slice(targetSpec.indexOf(':') + 1).trim() : targetSpec;
		if (!target) continue;

		const labelRaw = rawLabel?.trim();
		const maybeOptions = rawOptions?.trim();
		const optionsFromLabel =
			labelRaw && labelRaw.includes('=') && !maybeOptions ? parseEmbedRenderOptions(labelRaw) : {};
		const label =
			labelRaw && !(labelRaw.includes('=') && !maybeOptions) ? labelRaw : undefined;
		const options = {
			...optionsFromLabel,
			...parseEmbedRenderOptions(maybeOptions),
		};

		embeds.push({
			target,
			targetBy,
			label,
			options,
			position: match.index,
		});
	}

	return embeds;
}

export function isObjectEmbedToken(value: string): boolean {
	OBJECT_EMBED_REGEX.lastIndex = 0;
	return OBJECT_EMBED_REGEX.test(value.trim());
}
