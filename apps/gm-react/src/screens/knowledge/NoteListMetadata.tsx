import { parseMarkdownNote, type ContentItemView } from '@dndtools/core';
import { T } from '../../app/screen-kit';

/** Metadata comes from the same actor-filtered note as the title and excerpt. */
export function NoteListMetadata({ note }: { note: ContentItemView }) {
	const declaredFolder = note.fields['dndtools.folder'];
	const sourcePath = note.fields['sourcePath'];
	const folder =
		typeof declaredFolder === 'string' && declaredFolder.trim()
			? declaredFolder.trim()
			: typeof sourcePath === 'string'
				? sourcePath.replaceAll('\\', '/').split('/').slice(0, -1).filter(Boolean).join(' / ')
				: '';
	const storedTags = note.fields['tags'];
	const tags = [
		...new Set(
			[
				...(Array.isArray(storedTags)
					? storedTags.filter((tag): tag is string => typeof tag === 'string')
					: []),
				...parseMarkdownNote(note.body).tags,
			]
				.map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
				.filter(Boolean),
		),
	].slice(0, 2);
	if (!folder && tags.length === 0) return null;
	return (
		<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter, marginBottom: 'var(--space-2)' }}>
			{folder && <div data-testid="note-folder">{folder}</div>}
			{tags.length > 0 && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
					{tags.map((tag) => (
						<span key={tag} data-testid="note-tag">
							#{tag}
						</span>
					))}
				</div>
			)}
		</div>
	);
}
