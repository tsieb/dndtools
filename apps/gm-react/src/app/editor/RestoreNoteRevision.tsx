import { useState } from 'react';
import { Button, Toaster } from '../../ds';
import { T } from '../screen-kit';
import { useI18n } from '../../i18n';
import type { NoteEditorProps } from './NoteEditor';

/**
 * Restore one recorded revision. It goes through the same conflict-aware write as an ordinary editor
 * save, so restoring over a note that moved elsewhere records a conflict instead of overwriting it.
 * The restore is itself a new revision, which is what makes it undoable: the version it replaced is
 * the next row in the same history list.
 */
export function RestoreNoteRevision({
	snapshot,
	revision,
	label,
	busy,
	onSave,
}: {
	snapshot: { title: string; body: string; revision: number };
	/** The note's CURRENT revision, the base the restore write is checked against. */
	revision: number;
	/** Accessible name; names the revision so a list of Restore buttons is not ambiguous. */
	label: string;
	busy: boolean;
	onSave: NoteEditorProps['onSave'];
}) {
	const { t } = useI18n();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	return (
		<>
			<Button
				size="sm"
				variant="secondary"
				icon="undo"
				aria-label={label}
				disabled={busy || pending}
				onClick={async () => {
					setError(null);
					setPending(true);
					try {
						const result = await onSave({
							title: snapshot.title,
							body: snapshot.body,
							baseRevision: revision,
						});
						if (result.status === 'saved') {
							Toaster.success(t('knowledge.historyRestored', { revision: snapshot.revision }));
						} else if (result.status === 'conflict') setError(t('editor.conflictBody'));
						else setError(result.message);
					} catch (cause) {
						setError(cause instanceof Error ? cause.message : t('knowledge.saveFailed'));
					} finally {
						setPending(false);
					}
				}}
			>
				{t(pending ? 'editor.statusSaving' : 'knowledge.historyRestore')}
			</Button>
			{error && (
				<span role="alert" style={{ font: `var(--text-xs) ${T.sans}`, color: T.err }}>
					{error}
				</span>
			)}
		</>
	);
}
