import type { JournalEntryView } from '@dndtools/core';
import { Badge, Button, EmptyState, Icon, Toaster } from '../../ds';
import { Panel, T } from '../screen-kit';
import { useI18n } from '../../i18n';
import { downloadTextFile, fileDateStamp } from '../../platform/download';
import { JOURNAL_KINDS } from '../../screens/player/shared';

/**
 * RC-CHR-2.3 — the character HISTORY TIMELINE: a chronological feed of what the character journal
 * (`character-journal.ts`, CHAR-012/CHAR-016) already carries, exported as a markdown journal.
 *
 * SCOPE DECISION: the roadmap describes a feed of "level-ups, rests, combats, downtime". Today the
 * core has NO durable per-character log of level-ups (`character-advancement.ts` keeps only the
 * CURRENT level/xp, no history array), rests (`CharacterResources.ledger` has timestamped `rest`
 * entries, but no actor-scoped query exposes it outside the widget-exposure system — see
 * `queries/character-exposure.ts`), or combats (`combat-tracker.ts` is session-scoped, not a
 * per-character durable record). The journal — read ONLY through the actor-filtered
 * {@link getCharacterJournalForActor} — is the one per-character feed that already carries real
 * timestamps and per-entry visibility, including the structured `downtime` kind (RC-CHR-2.2). This
 * component renders exactly that (fail-closed/honest: no synthesized "level 3 reached" entries
 * fabricated from data the core does not actually keep dated). Wiring the other three event
 * sources to append a journal (or dedicated) entry when they occur is a HANDOFF to
 * `character-advancement.ts` / `character-resources.ts` / `combat-tracker.ts` — outside this
 * story's `Owns: app/character/History.tsx`.
 *
 * Entries arrive newest-first (the journal's storage order); the export below reverses them to a
 * natural oldest-first reading order for the markdown file.
 */

const KIND_ICON: Record<string, string> = {
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
		t(JOURNAL_KINDS.find((k) => k.value === value)?.label ?? 'player.journal.kind.note');

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
					icon="recent"
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
								gap: 10,
								padding: '10px 0',
								borderTop: i ? `1px solid ${T.bd}` : 'none',
							}}
						>
							<Icon name={KIND_ICON[entry.kind] ?? 'note-edit'} size={15} color={T.acc} />
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
									<span style={{ font: `600 12.5px ${T.sans}` }}>{entry.title}</span>
									<Badge status="neutral">{kindLabel(entry.kind)}</Badge>
									<span style={{ marginLeft: 'auto', font: `10.5px ${T.mono}`, color: T.ter }}>
										{formatDate(new Date(entry.updatedAt))}
									</span>
								</div>
								{entry.kind === 'downtime' && entry.downtime && (
									<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 2 }}>
										{t('character.history.downtimeSummary', {
											activity: entry.downtime.activityType,
											days: entry.downtime.days,
										})}
									</div>
								)}
								{entry.body && (
									<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, marginTop: 4 }}>
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
