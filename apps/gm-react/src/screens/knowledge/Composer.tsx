import { useState } from 'react';
import { Button, Card, Input } from '../../ds';
import { useI18n } from '../../i18n';

export function Composer({
	onCreate,
	onCancel,
	busy,
}: {
	onCreate: (title: string) => void;
	onCancel: () => void;
	busy: boolean;
}) {
	const { t } = useI18n();
	const [title, setTitle] = useState('');
	return (
		<Card
			elevation="flat"
			padding="md"
			style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}
		>
			<Input
				value={title}
				autoFocus
				aria-label={t('knowledge.newNoteTitle')}
				onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
				placeholder={t('knowledge.newNoteTitlePlaceholder')}
				style={{ flex: 1 }}
				onKeyDown={(e: { key: string }) => {
					// The Create button is gated on `busy`; Enter was not, so holding it (or a fast
					// double press) fired overlapping creates and produced duplicate notes.
					if (e.key === 'Enter' && !busy && title.trim()) onCreate(title.trim());
				}}
			/>
			<Button
				variant="primary"
				size="sm"
				icon="check"
				disabled={busy || !title.trim()}
				onClick={() => onCreate(title.trim())}
			>
				{t('common.action.create')}
			</Button>
			<Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
				{t('common.action.cancel')}
			</Button>
		</Card>
	);
}
