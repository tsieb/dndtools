import type { JournalEntryView } from '@dndtools/core';
import { Badge, Button, EmptyState, Icon, Toaster } from '../../ds';
import { Panel, T } from '../screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { downloadTextFile, fileDateStamp } from '../../platform/download';
import { JOURNAL_KINDS } from '../../screens/player/shared';

/**
 * RC-CHR-2.3 — the character HISTORY TIMELINE: a chronological feed of the character journal
 * (`character-journal.ts`, CHAR-012/CHAR-016), exported as a markdown journal.
 *
 * RC-ENG-8.12 — the feed covers level-ups, rests, combats and downtime. The core appends a dated
 * `rest` / `combat` / `level-up` journal entry when each event happens (`withCharacterHistory`,
 * wired from `character.rest`, `character.commit-advancement` / `character.apply-advancement` and
 * `combat.end`), under the journal's own per-entry visibility, so this component still reads ONLY
 * the actor-filtered {@link getCharacterJournalForActor} entries the sheet hands it. Downtime stays
 * the structured `downtime` kind (RC-CHR-2.2); everything else is a hand-written journal entry.
 *
 * Entries arrive newest-first (the journal's storage order); the export below reverses them to a
 * natural oldest-first reading order for the markdown file.
 */

/** RC-ENG-8.12 — the history kinds the core writes; the authorable kinds come from `JOURNAL_KINDS`. */
const HISTORY_KIND_LABEL: Record<string, MessageKey> = {
	rest: 'character.history.kind.rest',
	combat: 'character.history.kind.combat',
	'level-up': 'character.history.kind.levelUp',
};

const KIND_ICON: Record<string, string> = {
	rest: 'rest-long',
	combat: 'sword',
	'level-up': 'level-up',
	downtime: 'session-bolt',
	'session-highlight': 'sparkle',
	'personal-quest': 'flag',
	'npc-impression': 'characters-person',
	bookmark: 'tag',
	note: 'note-edit',
};

/** Stable English kind label for the exported file — a markdown journal travels outside the app
 * (saved to disk, pasted elsewhere), so it reads the same regardless of the viewer's locale. */
function kindMarkdownLabel(kind: string): string {
	switch (kind) {
		case 'rest':
			return 'Rest';
		case 'combat':
			return 'Combat';
		case 'level-up':
			return 'Level up';
		case 'downtime':
			return 'Downtime';
		case 'session-highlight':
			return 'Session highlight';
		case 'personal-quest':
			return 'Personal quest';
		case 'npc-impression':
			return 'NPC impression';
		case 'bookmark':
			return 'Bookmark';
		default:
			return 'Note';
	}
}

/** Pure: the character's journal, oldest-first, as a markdown journal document. */
export function journalEntriesToMarkdown(
	characterName: string,
	entries: JournalEntryView[],
): string {
	const lines = [`# ${characterName} — history`, ''];
	if (entries.length === 0) {
		lines.push('_No entries yet._');
		return lines.join('\n');
	}
	const oldestFirst = [...entries].reverse();
	for (const entry of oldestFirst) {
		lines.push(`## ${entry.title || '(untitled)'}`);
		lines.push(`_${kindMarkdownLabel(entry.kind)} — ${entry.updatedAt}_`);
		lines.push('');
		if (entry.kind === 'downtime' && entry.downtime) {
			const { activityType, days, cost, outcome } = entry.downtime;
			lines.push(`- Activity: ${activityType}`);
			lines.push(`- Days: ${days}`);
			if (cost !== undefined) lines.push(`- Cost: ${cost}`);
			if (outcome) lines.push(`- Outcome: ${outcome}`);
			lines.push('');
		}
		if (entry.body) {
			lines.push(entry.body);
			lines.push('');
		}
	}
	return lines.join('\n');
}

export function CharacterHistoryTimeline({
	characterName,
	entries,
}: {
	characterName: string;
	entries: JournalEntryView[];
}) {
	const { t, formatDate } = useI18n();
	const kindLabel = (value: string) =>
		t(
			HISTORY_KIND_LABEL[value] ??
				JOURNAL_KINDS.find((k) => k.value === value)?.label ??
				'player.journal.kind.note',
		);

	const exportMarkdown = async () => {
		const markdown = journalEntriesToMarkdown(characterName, entries);
		const slug = characterName.trim().toLowerCase().replace(/\s+/g, '-') || 'character';
		const result = await downloadTextFile(
			`${slug}-history-${fileDateStamp()}.md`,
			markdown,
			'text/markdown',
			t('character.history.exportTitle'),
		);
		if (result.status === 'exported') Toaster.success(t('character.history.exported'));
	};

	return (
		<Panel
			title={t('character.history.title', { count: entries.length })}
			action={
				<Button
					variant="secondary"
					size="sm"
					icon="download"
					disabled={entries.length === 0}
					onClick={() => void exportMarkdown()}
				>
					{t('character.history.export')}
				</Button>
			}
		>
			{entries.length === 0 ? (
				<EmptyState
					inset
					illustration="timeline-empty"
					title={t('character.history.emptyTitle')}
					description={t('character.history.emptyBody')}
				/>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{entries.map((entry, i) => (
						<div
							key={entry.id}
							style={{
								display: 'flex',
								gap: 'var(--space-2)',
								padding: 'var(--space-2) 0',
								borderTop: i ? `1px solid ${T.bd}` : 'none',
							}}
						>
							<Icon name={KIND_ICON[entry.kind] ?? 'note-edit'} size={15} color={T.acc} />
							<div style={{ flex: 1, minWidth: 0 }}>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 'var(--space-2)',
										flexWrap: 'wrap',
									}}
								>
									<span style={{ font: `600 var(--text-sm) ${T.sans}` }}>{entry.title}</span>
									<Badge status="neutral">{kindLabel(entry.kind)}</Badge>
									<span
										style={{ marginLeft: 'auto', font: `var(--text-xs) ${T.mono}`, color: T.ter }}
									>
										{formatDate(new Date(entry.updatedAt))}
									</span>
								</div>
								{entry.kind === 'downtime' && entry.downtime && (
									<div
										style={{
											font: `var(--text-xs) ${T.sans}`,
											color: T.ter,
											marginTop: 'var(--space-0-5)',
										}}
									>
										{t('character.history.downtimeSummary', {
											activity: entry.downtime.activityType,
											days: entry.downtime.days,
										})}
									</div>
								)}
								{entry.body && (
									<div
										style={{
											font: `var(--text-xs)/1.5 ${T.sans}`,
											color: T.sub,
											marginTop: 'var(--space-1)',
										}}
									>
										{entry.body}
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</Panel>
	);
}
