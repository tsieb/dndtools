import { useRef, useState, type ReactNode } from 'react';
import type { CoreCommand } from '@dndtools/core';
import { T } from '../../../app/screen-kit';
import type { SheetField, SheetIO } from './subject';

/** What one write came back with. A null `message` means the transport has already said why. */
export type SheetWriteResult = { ok: true } | { ok: false; message: string | null };

export interface SheetFeedback {
	io: SheetIO;
	/** The polite status text: the last success, or '' while nothing has been said. */
	note: string;
	/** True while a write is in flight. */
	saving: boolean;
	/** The refusal shown in the frame's alert (validation refusals with a field render beside it). */
	error: { text: string; seq: number } | null;
	/** Drop the note and refusal, e.g. when the frame switches character or section. */
	clear: () => void;
}

/**
 * RC-CHR-6.2 — the one feedback channel every sheet frame uses. Each frame renders `note` into its own
 * polite status (mounted empty from the start, so a change is announced) and `error` into its own alert;
 * panels raise field refusals through `io.refuse` and show them with `io.fieldError`. Every write first
 * empties the note, so a stale success never sits under a fresh refusal and a repeated action is heard
 * again; each refusal gets a fresh `seq`, so the alert re-mounts and announces a repeat.
 */
export function useSheetFeedback({
	run,
	newId,
	failure,
	savedNote = '',
}: {
	run: (command: CoreCommand) => Promise<SheetWriteResult>;
	newId: () => string;
	/** The refusal text for a write that threw (a failed persist). */
	failure: (cause: unknown) => string;
	/** Announced after a write that brought no note of its own. */
	savedNote?: string;
}): SheetFeedback {
	const [note, setNote] = useState('');
	const [saving, setSaving] = useState(false);
	const [refusal, setRefusal] = useState<{ text: string; field?: SheetField; seq: number } | null>(
		null,
	);
	const seq = useRef(0);
	const refuse = (text: string, field?: SheetField) => {
		seq.current += 1;
		setNote('');
		setRefusal({ text, field, seq: seq.current });
	};
	const dispatch = async (command: CoreCommand, okNote?: string) => {
		setRefusal(null);
		setNote('');
		setSaving(true);
		try {
			const result = await run(command);
			setSaving(false);
			if (!result.ok) {
				if (result.message) refuse(result.message);
				return false;
			}
			setNote(okNote ?? savedNote);
			return true;
		} catch (cause) {
			setSaving(false);
			refuse(failure(cause));
			return false;
		}
	};
	const fieldError = (field: SheetField): ReactNode =>
		refusal?.field === field ? (
			<div
				key={refusal.seq}
				role="alert"
				style={{ flexBasis: '100%', font: `var(--text-xs) ${T.sans}`, color: T.err }}
			>
				{refusal.text}
			</div>
		) : null;
	return {
		io: { dispatch, refuse, announce: setNote, newId, fieldError },
		note,
		saving,
		error: refusal && !refusal.field ? { text: refusal.text, seq: refusal.seq } : null,
		clear: () => {
			setNote('');
			setRefusal(null);
		},
	};
}
