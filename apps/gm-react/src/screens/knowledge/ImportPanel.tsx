import { useEffect, useState } from 'react';
import { Button, Card, Dialog, Icon, Select, Textarea } from '../../ds';
import { T } from '../../app/screen-kit';
import { pickTextFiles } from '../../platform/filePick';
import { importPolicies } from './shared';
import { useI18n } from '../../i18n';

/** Turn picked files into paste-box archive text. A `.json` export bundle (the shape Community's
 * Export downloads) expands into its member files; anything else imports as one markdown note. */
function pickedFilesToArchiveText(files: Array<{ name: string; text: string }>): string {
	const parts: string[] = [];
	for (const file of files) {
		if (file.name.toLowerCase().endsWith('.json')) {
			try {
				const parsed = JSON.parse(file.text) as {
					format?: unknown;
					files?: Array<{ path?: unknown; markdown?: unknown }>;
				};
				if (parsed.format === 'dndtools-content-export' && Array.isArray(parsed.files)) {
					for (const entry of parsed.files) {
						if (typeof entry.path === 'string' && typeof entry.markdown === 'string') {
							parts.push(`===== ${entry.path} =====\n${entry.markdown.trimEnd()}`);
						}
					}
					continue;
				}
			} catch {
				/* not a bundle — fall through and import the raw text as one file */
			}
		}
		parts.push(`===== ${file.name} =====\n${file.text.trimEnd()}`);
	}
	return parts.join('\n\n');
}

export function ImportPanel({
	onImport,
	onCancel,
	busy,
	message,
	failed,
}: {
	onImport: (text: string, policy: string) => void;
	onCancel: () => void;
	busy: boolean;
	message: string | null;
	failed: boolean;
}) {
	const { t } = useI18n();
	const [text, setText] = useState('');
	const [policy, setPolicy] = useState('skip');
	// "Overwrite existing" is the one import outcome with no inverse: `content-import` replaces the
	// note body in place AND rewrites its visibility from the file — failing closed to dm-only and
	// blanking `sharedWith`, so it silently revokes player access as well. Deleting ONE note in this
	// same screen gets an Undo toast; this destroys many at once with nothing. Confirm it, and only
	// it — the default `skip` policy stays a single click.
	const [confirmOverwrite, setConfirmOverwrite] = useState(false);
	// Clear the buffer once an import SUCCEEDS. It used to survive, with Import still enabled, so the
	// most destructive action on this screen was one stray click from running a second time over the
	// notes it had just replaced — with the confirm dialog as the only barrier. A FAILED import keeps
	// the text, because that is the copy the user still needs to fix and retry.
	useEffect(() => {
		if (message && !failed) setText('');
	}, [message, failed]);
	const pickFiles = async () => {
		const files = await pickTextFiles('.md,.markdown,.txt,.json');
		if (files.length === 0) return;
		const archive = pickedFilesToArchiveText(files);
		if (!archive) return;
		// Append into the paste box (never silently dispatch) so the user reviews before importing.
		setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${archive}` : archive));
	};
	return (
		<Card
			elevation="flat"
			padding="md"
			style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
				<div style={{ flex: 1, font: `600 13px ${T.sans}`, color: T.ink }}>
					{t('knowledge.importTitle')}
				</div>
				<Button
					variant="secondary"
					size="sm"
					icon="import"
					disabled={busy}
					onClick={() => void pickFiles()}
				>
					{t('knowledge.importFiles')}
				</Button>
			</div>
			<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
				{t('knowledge.importIntroA')} <code style={{ fontFamily: T.mono }}>.md</code>{' '}
				{t('knowledge.importIntroB')} <code style={{ fontFamily: T.mono }}>.json</code>{' '}
				{t('knowledge.importIntroC')}{' '}
				<code style={{ fontFamily: T.mono }}>===== path.md =====</code>{' '}
				{t('knowledge.importIntroD')}
			</div>
			<Textarea
				// The only unlabeled field in this file — a screen reader announced "edit, multiline,
				// blank" with no hint that this is the import buffer (WCAG 4.1.2).
				aria-label={t('knowledge.importField')}
				value={text}
				onChange={(e: { target: { value: string } }) => setText(e.target.value)}
				rows={8}
				placeholder={t('knowledge.importPlaceholder')}
				style={{ fontFamily: T.mono, fontSize: 12.5 }}
			/>
			{/* flexWrap because this row carries a Select, a status message and two buttons — on a
			    393px phone it overflowed the card, and a page-level overflow here also shifts
			    `.app-main`. The sibling rows in this file already wrap. */}
			<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
				<Select
					aria-label={t('knowledge.importPolicy')}
					options={importPolicies(t)}
					value={policy}
					onChange={(e: { target: { value: string } }) => setPolicy(e.target.value)}
				/>
				<div style={{ flex: 1 }} />
				{/* Success AND rejection both land in `message`; rendering them in the same neutral grey
				 * made a failed import look identical to "Imported 4 new." Tone by outcome, and make it
				 * a live region so the result is announced at all. */}
				<span
					role="status"
					style={{
						font: `12px ${T.sans}`,
						color: failed ? 'var(--color-status-error-text)' : T.sub,
						display: 'inline-flex',
						alignItems: 'center',
						gap: 5,
					}}
				>
					{message && failed && <Icon name="warning" size={13} />}
					{message}
				</span>
				<Button
					variant="primary"
					size="sm"
					icon="import"
					disabled={busy || !text.trim()}
					onClick={() => {
						if (policy === 'overwrite') setConfirmOverwrite(true);
						else onImport(text, policy);
					}}
				>
					{t('knowledge.import')}
				</Button>
				<Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
					{t('common.action.close')}
				</Button>
			</div>
			<Dialog
				open={confirmOverwrite}
				onClose={() => setConfirmOverwrite(false)}
				tone="danger"
				icon="warning"
				size="sm"
				title={t('knowledge.overwriteTitle')}
				description={t('knowledge.overwriteBody')}
				footer={
					<>
						<Button variant="secondary" size="sm" onClick={() => setConfirmOverwrite(false)}>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="danger"
							size="sm"
							onClick={() => {
								setConfirmOverwrite(false);
								onImport(text, policy);
							}}
						>
							{t('knowledge.overwrite')}
						</Button>
					</>
				}
			/>
		</Card>
	);
}
