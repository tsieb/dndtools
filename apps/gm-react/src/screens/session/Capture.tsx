import { useMemo, useState } from 'react';
import {
	composeSessionLogMarkdown,
	isEmptySessionLogCapture,
	normalizeSessionLogCapture,
	type SessionArchiveSnapshot,
	type SessionLogCapture,
	type SessionRecapEntityRef,
} from '@dndtools/core';
import { Button, Chip, Input, Select, Textarea, VisibilityChip } from '../../ds';
import { useI18n } from '../../i18n';
import { Panel, T, eb } from '../../app/screen-kit';

// ── End-of-session capture (RC-SES-4.1) ───────────────────────────────────────────────────────────

/** One entity the DM can mark as changed by the session, as a reference the capture stores. */
export type CaptureCandidate = SessionRecapEntityRef;

/** What one capture asks the screen to write: the recap fields plus the note it becomes. */
export interface CaptureSubmission {
	archiveId: string;
	title: string;
	markdown: string;
	capture: SessionLogCapture;
}

const MAX_CANDIDATES = 24;

function formatArchiveStamp(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * CapturePanel — the DM-only END-OF-SESSION CAPTURE (RC-SES-4.1). The DM writes what happened, marks
 * which entities the session changed, and lists the follow-ups; saving writes BOTH the structured
 * recap onto the session archive (`session.author-recap`) and a durable `session-log` note in the
 * vault (`content.create-item`), so the same capture is readable in Knowledge and — when the campaign
 * date is set — dated on the Campaign timeline.
 *
 * Capturing needs a session ARCHIVE to hang on, exactly like recap authoring: ending a live session
 * into Recap is what creates one, and the empty state says so rather than offering a control that
 * could only be rejected.
 */
export function CapturePanel({
	archives,
	defaultArchiveId,
	candidates,
	hasCampaignDate,
	previewing,
	onCapture,
}: {
	archives: SessionArchiveSnapshot[];
	defaultArchiveId: string | null;
	candidates: CaptureCandidate[];
	hasCampaignDate: boolean;
	previewing: boolean;
	onCapture: (submission: CaptureSubmission) => Promise<boolean>;
}) {
	const { t } = useI18n();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [title, setTitle] = useState('');
	const [happened, setHappened] = useState('');
	const [followUps, setFollowUps] = useState('');
	const [changedIds, setChangedIds] = useState<string[]>([]);
	const [filter, setFilter] = useState('');
	const [busy, setBusy] = useState(false);

	const target =
		archives.find((a) => a.id === (selectedId ?? defaultArchiveId)) ?? archives[0] ?? null;

	const defaultTitle = target
		? t('session.capture.defaultTitle', {
				name: target.title ?? formatArchiveStamp(target.archivedAt),
			})
		: '';

	// The chips the DM can pick from: everything when the filter is empty (bounded), else the matches.
	// A chip already selected stays visible whatever the filter says, so a selection can always be
	// removed without first clearing the search.
	const visibleCandidates = useMemo(() => {
		const needle = filter.trim().toLowerCase();
		const matches = needle
			? candidates.filter((c) => c.label.toLowerCase().includes(needle))
			: candidates;
		const shown = matches.slice(0, MAX_CANDIDATES);
		const shownIds = new Set(shown.map((c) => c.entityId));
		return [
			...shown,
			...candidates.filter((c) => changedIds.includes(c.entityId) && !shownIds.has(c.entityId)),
		];
	}, [candidates, filter, changedIds]);

	const capture: SessionLogCapture = useMemo(
		() =>
			normalizeSessionLogCapture({
				happened,
				changes: candidates.filter((c) => changedIds.includes(c.entityId)),
				followUps: followUps.split('\n'),
			}),
		[happened, followUps, changedIds, candidates],
	);
	const empty = isEmptySessionLogCapture(capture);

	function toggle(entityId: string): void {
		setChangedIds((prev) =>
			prev.includes(entityId) ? prev.filter((id) => id !== entityId) : [...prev, entityId],
		);
	}

	async function save(): Promise<void> {
		if (!target || busy || empty) return;
		const markdown = composeSessionLogMarkdown(capture, {
			happened: t('session.capture.happened'),
			changes: t('session.capture.changed'),
			followUps: t('session.capture.followUps'),
		});
		setBusy(true);
		try {
			// A throw from the persist layer must not freeze the panel with the DM's unwritten capture
			// inside it — the same guard recap authoring needs (PrepRecap.tsx).
			const saved = await onCapture({
				archiveId: target.id,
				title: title.trim() || defaultTitle,
				markdown,
				capture,
			});
			// Only clear on success: a rejected capture keeps every word so the DM can act and retry.
			if (saved) {
				setTitle('');
				setHappened('');
				setFollowUps('');
				setChangedIds([]);
				setFilter('');
			}
		} finally {
			setBusy(false);
		}
	}

	return (
		<Panel title={t('session.capture.title')} action={<VisibilityChip level="dm-only" compact />}>
			{archives.length === 0 ? (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					{t('session.capture.noArchives')}
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{archives.length > 1 && (
						<Select
							aria-label={t('session.capture.archivedSession')}
							value={target?.id ?? ''}
							options={archives.map((a) => ({
								value: a.id,
								label: a.title
									? `${a.title} · ${formatArchiveStamp(a.archivedAt)}`
									: formatArchiveStamp(a.archivedAt),
							}))}
							onChange={(e: { target: { value: string } }) => setSelectedId(e.target.value)}
						/>
					)}
					<Input
						aria-label={t('session.capture.noteTitle')}
						value={title}
						placeholder={defaultTitle}
						onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
					/>
					<div>
						<div style={{ ...eb, marginBottom: 5 }}>{t('session.capture.happened')}</div>
						<Textarea
							value={happened}
							rows={4}
							aria-label={t('session.capture.happened')}
							placeholder={t('session.capture.happenedPlaceholder')}
							onChange={(e: { target: { value: string } }) => setHappened(e.target.value)}
						/>
					</div>
					<div>
						<div style={{ ...eb, marginBottom: 5 }}>{t('session.capture.changed')}</div>
						{candidates.length === 0 ? (
							<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
								{t('session.capture.nothingToMark')}
							</div>
						) : (
							<>
								{candidates.length > MAX_CANDIDATES && (
									<Input
										aria-label={t('session.capture.filter')}
										value={filter}
										placeholder={t('session.capture.filter')}
										onChange={(e: { target: { value: string } }) => setFilter(e.target.value)}
									/>
								)}
								<div
									role="group"
									aria-label={t('session.capture.changed')}
									style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}
								>
									{visibleCandidates.map((c) => {
										const on = changedIds.includes(c.entityId);
										return (
											<button
												key={`${c.entityType}:${c.entityId}`}
												type="button"
												role="checkbox"
												aria-checked={on}
												disabled={previewing}
												onClick={() => toggle(c.entityId)}
												style={{
													border: 'none',
													background: 'transparent',
													padding: 0,
													cursor: previewing ? 'default' : 'pointer',
												}}
											>
												<Chip
													tone={on ? 'accent' : 'neutral'}
													selected={on}
													icon={on ? 'check' : undefined}
												>
													{c.label}
												</Chip>
											</button>
										);
									})}
								</div>
							</>
						)}
					</div>
					<div>
						<div style={{ ...eb, marginBottom: 5 }}>{t('session.capture.followUps')}</div>
						<Textarea
							value={followUps}
							rows={3}
							aria-label={t('session.capture.followUps')}
							placeholder={t('session.capture.followUpsPlaceholder')}
							onChange={(e: { target: { value: string } }) => setFollowUps(e.target.value)}
						/>
						<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 4 }}>
							{t('session.capture.followUpsHelp')}
						</div>
					</div>
					<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
						{t(hasCampaignDate ? 'session.capture.willDate' : 'session.capture.noCampaignDate')}
					</div>
					<Button
						variant="primary"
						size="sm"
						icon="check"
						disabled={previewing || busy || empty || !target}
						onClick={() => void save()}
					>
						{t('session.capture.save')}
					</Button>
				</div>
			)}
		</Panel>
	);
}
