import { visit } from 'unist-util-visit';
import type { VaultObject, VaultObjectType } from '$lib/types/object.js';
import { getVaultObjectTypeLabel, summarizeVaultObject } from '$lib/domain/objects.js';
import { parseEmbedRenderOptions, type EmbedRenderOptions } from '$lib/domain/object-embeds.js';

interface HastElement {
	type: 'element';
	tagName: string;
	properties: Record<string, unknown>;
	children: HastNode[];
}

interface HastText {
	type: 'text';
	value: string;
}

type HastNode = HastElement | HastText | { type: string; children?: HastNode[] };

interface HastRoot {
	type: 'root';
	children: HastNode[];
}

interface ObjectEmbedMatch {
	kind: 'object';
	type: VaultObjectType;
	id: string;
	label?: string;
	options: EmbedRenderOptions;
}

interface NoteEmbedMatch {
	kind: 'note';
	target: string;
	targetBy: 'id' | 'title';
	label?: string;
	options: EmbedRenderOptions;
}

type EmbedMatch = ObjectEmbedMatch | NoteEmbedMatch;

export interface ResolvedNoteEmbed {
	id: string;
	title: string;
	kind?: string;
	summary?: string;
	preview?: string;
	updatedAt?: string;
	object?: VaultObject | null;
	cycleDetected?: boolean;
}

const EMBED_TOKEN_REGEX = /!\[\[([^\]]+)\]\]/g;

export interface RehypeObjectEmbedsOptions {
	resolveObject?: (match: ObjectEmbedMatch) => VaultObject | null | undefined;
	resolveNote?: (match: NoteEmbedMatch) => ResolvedNoteEmbed | null | undefined;
	currentNoteId?: string;
}

function text(value: string): HastText {
	return { type: 'text', value };
}

function detailLine(label: string, value: string | undefined): HastElement | null {
	const content = value?.trim();
	if (!content) return null;
	return {
		type: 'element',
		tagName: 'span',
		properties: { className: ['object-embed__line'] },
		children: [
			{
				type: 'element',
				tagName: 'span',
				properties: { className: ['object-embed__line-label'] },
				children: [text(label)],
			},
			text(content),
		],
	};
}

function detailList(label: string, values: string[]): HastElement | null {
	if (values.length === 0) return null;
	return {
		type: 'element',
		tagName: 'span',
		properties: { className: ['object-embed__line'] },
		children: [
			{
				type: 'element',
				tagName: 'span',
				properties: { className: ['object-embed__line-label'] },
				children: [text(label)],
			},
			text(values.join(', ')),
		],
	};
}

function abilityRow(object: VaultObject): HastElement | null {
	const abilities =
		object.type === 'stat_block'
			? object.data.abilities
			: object.type === 'character'
				? object.data.abilities
				: undefined;
	if (!abilities) return null;

	const abilityPairs: Array<[string, number]> = [
		['STR', abilities.str],
		['DEX', abilities.dex],
		['CON', abilities.con],
		['INT', abilities.int],
		['WIS', abilities.wis],
		['CHA', abilities.cha],
	];

	return {
		type: 'element',
		tagName: 'span',
		properties: { className: ['object-embed__abilities'] },
		children: abilityPairs.flatMap(([label, value], index) => {
			const node: HastNode = {
				type: 'element',
				tagName: 'span',
				properties: { className: ['object-embed__ability'] },
				children: [text(`${label} ${value}`)],
			};
			return index === abilityPairs.length - 1 ? [node] : [node, text(' ')];
		}),
	};
}

function buildObjectDetails(object: VaultObject): HastNode[] {
	switch (object.type) {
		case 'stat_block': {
			const lines: HastNode[] = [];
			const kindBits = [object.data.size, object.data.creatureType, object.data.alignment]
				.filter((part): part is string => !!part)
				.join(' ');
			const kindLine = detailLine('Type:', kindBits);
			if (kindLine) lines.push(kindLine);
			const hpLine = detailLine('HP:', object.data.hitPoints);
			if (hpLine) lines.push(hpLine);
			const speedLine = detailLine('Speed:', object.data.speed);
			if (speedLine) lines.push(speedLine);
			const crLine = detailLine('CR:', object.data.challengeRating);
			if (crLine) lines.push(crLine);
			const abilities = abilityRow(object);
			if (abilities) lines.push(abilities);
			const traitNames = object.data.traits.map((entry) => entry.name);
			const actionNames = object.data.actions.map((entry) => entry.name);
			const traits = detailList('Traits:', traitNames.slice(0, 4));
			if (traits) lines.push(traits);
			const actions = detailList('Actions:', actionNames.slice(0, 4));
			if (actions) lines.push(actions);
			return lines;
		}
		case 'character': {
			const lines: HastNode[] = [];
			const classLine = detailLine(
				'Class:',
				object.data.className
					? object.data.level
						? `${object.data.className} ${object.data.level}`
						: object.data.className
					: undefined,
			);
			if (classLine) lines.push(classLine);
			const ancestryLine = detailLine('Ancestry:', object.data.ancestry);
			if (ancestryLine) lines.push(ancestryLine);
			const bgLine = detailLine('Background:', object.data.background);
			if (bgLine) lines.push(bgLine);
			const alignLine = detailLine('Alignment:', object.data.alignment);
			if (alignLine) lines.push(alignLine);
			const hpLine =
				object.data.hitPoints !== undefined
					? detailLine('HP:', String(object.data.hitPoints))
					: null;
			if (hpLine) lines.push(hpLine);
			const acLine =
				object.data.armorClass !== undefined
					? detailLine('AC:', String(object.data.armorClass))
					: null;
			if (acLine) lines.push(acLine);
			const speedLine = detailLine('Speed:', object.data.speed);
			if (speedLine) lines.push(speedLine);
			const abilities = abilityRow(object);
			if (abilities) lines.push(abilities);
			const goalLine = detailList('Goals:', object.data.goals.slice(0, 3));
			if (goalLine) lines.push(goalLine);
			const bondLine = detailList('Bonds:', object.data.bonds.slice(0, 3));
			if (bondLine) lines.push(bondLine);
			const flawLine = detailList('Flaws:', object.data.flaws.slice(0, 3));
			if (flawLine) lines.push(flawLine);
			return lines;
		}
		case 'image': {
			const lines: HastNode[] = [];
			if (object.data.url) {
				lines.push({
					type: 'element',
					tagName: 'img',
					properties: {
						className: ['object-embed__image'],
						src: object.data.url,
						alt: object.data.alt ?? object.name,
						loading: 'lazy',
						width: object.data.width,
						height: object.data.height,
					},
					children: [],
				});
			}
			const captionLine = detailLine('Caption:', object.data.caption);
			if (captionLine) lines.push(captionLine);
			const creditLine = detailLine('Credit:', object.data.credit);
			if (creditLine) lines.push(creditLine);
			return lines;
		}
	}
}

function parseEmbedToken(inner: string): EmbedMatch | null {
	const segments = inner
		.split('|')
		.map((entry) => entry.trim());
	const target = segments[0];
	if (!target) return null;

	const optionIndex = segments.findIndex((segment, index) => index > 0 && segment.includes('='));
	const label =
		optionIndex === 1 ? undefined : optionIndex > 1 ? segments.slice(1, optionIndex).join(' | ') : segments[1];
	const rawOptions =
		optionIndex >= 0
			? segments.slice(optionIndex).join(',')
			: segments.length > 2
				? segments.slice(2).join(',')
				: undefined;
	const options = parseEmbedRenderOptions(rawOptions);

	if (target.startsWith('obj:')) {
		const parts = target.split(':');
		const type = parts[1];
		const id = parts[2];
		if (!type || !id) return null;
		if (type !== 'stat_block' && type !== 'character' && type !== 'image') return null;
		return {
			kind: 'object',
			type,
			id,
			label,
			options,
		};
	}

	if (target.startsWith('note:') || target.startsWith('id:')) {
		const noteTarget = target.slice(target.indexOf(':') + 1).trim();
		if (!noteTarget) return null;
		return {
			kind: 'note',
			target: noteTarget,
			targetBy: 'id',
			label,
			options,
		};
	}

	return {
		kind: 'note',
		target,
		targetBy: 'title',
		label,
		options,
	};
}

function createEmbedHeader(
	badgeLabel: string,
	title: string,
	showToggle: boolean,
	dataId: string,
	dataType: string,
): HastElement {
	return {
		type: 'element',
		tagName: 'span',
		properties: { className: ['object-embed__header'] },
		children: [
			{
				type: 'element',
				tagName: 'span',
				properties: { className: ['object-embed__badge'] },
				children: [text(badgeLabel)],
			},
			{
				type: 'element',
				tagName: 'span',
				properties: { className: ['object-embed__title'] },
				children: [text(title)],
			},
			...(showToggle
				? [
						{
							type: 'element',
							tagName: 'a',
							properties: {
								href: '#',
								className: ['object-embed__toggle'],
								'data-object-action': 'toggle',
								'data-object-id': dataId,
								'data-object-type': dataType,
							},
							children: [text('Details')],
						} satisfies HastElement,
					]
				: []),
		],
	};
}

function createObjectEmbedCard(match: ObjectEmbedMatch, object: VaultObject | null | undefined): HastElement {
	const resolved = object ?? null;
	const title = match.label?.trim() || resolved?.name || `Missing ${getVaultObjectTypeLabel(match.type)}`;
	const summary = resolved?.summary?.trim() || (resolved ? summarizeVaultObject(resolved) : '');
	const details = resolved ? buildObjectDetails(resolved) : [];
	const showToggle = match.options.view !== 'inline';

	return {
		type: 'element',
		tagName: 'span',
		properties: {
			className: [
				'object-embed',
				`object-embed--${match.type}`,
				showToggle ? 'object-embed--card' : 'object-embed--inline',
				resolved ? 'object-embed--resolved' : 'object-embed--missing',
			],
			'data-object-card': 'true',
			'data-object-id': match.id,
			'data-object-type': match.type,
		},
		children: [
			createEmbedHeader(getVaultObjectTypeLabel(match.type), title, showToggle, match.id, match.type),
			...(summary
				? [
						{
							type: 'element',
							tagName: 'span',
							properties: { className: ['object-embed__summary'] },
							children: [text(summary)],
						} satisfies HastElement,
					]
				: []),
			...(showToggle
				? [
						{
							type: 'element',
							tagName: 'span',
							properties: {
								className: ['object-embed__details'],
								hidden: match.options.open === true ? undefined : true,
							},
							children:
								details.length > 0
									? details
									: [text(resolved ? 'No additional details available.' : 'Object not found.')],
						} satisfies HastElement,
					]
				: []),
		],
	};
}

function createNoteEmbedCard(
	match: NoteEmbedMatch,
	note: ResolvedNoteEmbed | null | undefined,
	currentNoteId?: string,
): HastElement {
	const resolved = note ?? null;
	const fallbackTitle = match.targetBy === 'id' ? `Note ${match.target}` : match.target;
	const title = match.label?.trim() || resolved?.title || fallbackTitle;
	const object = resolved?.object ?? null;
	const summary =
		resolved?.summary?.trim() ||
		(object ? object.summary : undefined) ||
		resolved?.preview?.trim() ||
		'';
	const showToggle = match.options.view !== 'inline';
	const isCycle = !!(resolved?.cycleDetected || (currentNoteId && resolved?.id === currentNoteId));
	const details: HastNode[] = [];
	if (isCycle) {
		details.push(text('Cycle prevented: this embed resolves back to the current note.'));
	} else if (object) {
		details.push(...buildObjectDetails(object));
	} else {
		const kindLine = detailLine('Kind:', resolved?.kind ?? 'note');
		if (kindLine) details.push(kindLine);
		const idLine = detailLine('Id:', resolved?.id ?? (match.targetBy === 'id' ? match.target : undefined));
		if (idLine) details.push(idLine);
		const updatedLine = detailLine('Updated:', resolved?.updatedAt);
		if (updatedLine) details.push(updatedLine);
		if (match.options.view === 'content' && resolved?.preview?.trim()) {
			details.push({
				type: 'element',
				tagName: 'span',
				properties: { className: ['object-embed__line'] },
				children: [text(resolved.preview.trim())],
			});
		}
	}

	return {
		type: 'element',
		tagName: 'span',
		properties: {
			className: [
				'object-embed',
				object ? `object-embed--${object.type}` : 'object-embed--note',
				showToggle ? 'object-embed--card' : 'object-embed--inline',
				resolved ? 'object-embed--resolved' : 'object-embed--missing',
			],
			'data-object-card': 'true',
			'data-object-id': resolved?.id ?? match.target,
			'data-object-type': object?.type ?? 'note',
		},
		children: [
			createEmbedHeader(
				object ? getVaultObjectTypeLabel(object.type) : resolved?.kind ?? 'Note',
				title,
				showToggle,
				resolved?.id ?? match.target,
				object?.type ?? 'note',
			),
			...(summary
				? [
						{
							type: 'element',
							tagName: 'span',
							properties: { className: ['object-embed__summary'] },
							children: [text(summary)],
						} satisfies HastElement,
					]
				: []),
			...(showToggle
				? [
						{
							type: 'element',
							tagName: 'span',
							properties: {
								className: ['object-embed__details'],
								hidden: match.options.open === true ? undefined : true,
							},
							children:
								details.length > 0
									? details
									: [text(resolved ? 'No additional details available.' : 'Note not found.')],
						} satisfies HastElement,
					]
				: []),
		],
	};
}

/** Rehype plugin that turns object and note embed tokens into rich cards. */
export function rehypeObjectEmbeds(options: RehypeObjectEmbedsOptions = {}) {
	const resolveObject = options.resolveObject ?? (() => null);
	const resolveNote = options.resolveNote ?? (() => null);

	return (tree: HastRoot): void => {
		visit(
			tree as unknown as HastNode,
			'text',
			(node: unknown, index: number | undefined, parent: unknown) => {
				if (!parent || index === undefined) return;
				const parentNode = parent as HastNode;
				const textNode = node as HastNode;
				if (textNode.type !== 'text') return;

				const parentElement = parentNode.type === 'element' ? (parentNode as HastElement) : null;
				if (parentElement) {
					const blocked = new Set(['code', 'pre', 'a']);
					if (blocked.has(parentElement.tagName)) return;
				}

				const value = (textNode as HastText).value;
				EMBED_TOKEN_REGEX.lastIndex = 0;
				if (!EMBED_TOKEN_REGEX.test(value)) return;

				EMBED_TOKEN_REGEX.lastIndex = 0;
				const children: HastNode[] = [];
				let lastIndex = 0;
				let match: RegExpExecArray | null;

				while ((match = EMBED_TOKEN_REGEX.exec(value)) !== null) {
					const inner = (match[1] ?? '').trim();
					const parsed = parseEmbedToken(inner);
					if (!parsed) continue;

					if (match.index > lastIndex) {
						children.push(text(value.slice(lastIndex, match.index)));
					}

					if (parsed.kind === 'object') {
						children.push(createObjectEmbedCard(parsed, resolveObject(parsed)));
					} else {
						children.push(
							createNoteEmbedCard(parsed, resolveNote(parsed), options.currentNoteId),
						);
					}
					lastIndex = match.index + match[0].length;
				}

				if (lastIndex < value.length) {
					children.push(text(value.slice(lastIndex)));
				}

				const parentWithChildren = parentNode as { children?: HastNode[] };
				if (Array.isArray(parentWithChildren.children) && children.length > 0) {
					parentWithChildren.children.splice(index, 1, ...children);
				}
			},
		);
	};
}

