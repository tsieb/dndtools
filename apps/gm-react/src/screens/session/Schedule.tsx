import { useMemo, useState } from 'react';
import { Button, Field, Input, Select, Toaster, VisibilityChip } from '../../ds';
import { useI18n } from '../../i18n';
import { Panel, T, mono } from '../../app/screen-kit';
import {
	GOOGLE_CALENDAR_SETUP_RUNBOOK,
	connectGoogleCalendar,
	createSessionEvent,
	isGoogleCalendarConfigured,
	isGoogleCalendarSignedIn,
	rosterAttendeeEmails,
} from '../../cloud/googleCalendar';

// ── Schedule next session (cloud-tier roadmap P2 #8, Calendar half — metadata only) ───────────────

/**
 * DM-only real-world scheduling: creates a Google Calendar event (attendee invites + a
 * Calendar-native reminder) for the next session. Strictly metadata — the event carries a title,
 * a time, roster emails, and only the note the DM types here; never vault content — so it works
 * identically for Private (E2EE) vaults (ADR-026). Fail closed: without a configured Google
 * client id the panel points at the setup runbook instead of showing a dead button.
 */
export function SchedulePanel() {
	const { t } = useI18n();
	const [start, setStart] = useState('');
	const [duration, setDuration] = useState('180');
	const [reminder, setReminder] = useState('60');
	const [note, setNote] = useState('');
	const [busy, setBusy] = useState(false);
	const [link, setLink] = useState('');
	const emails = useMemo(rosterAttendeeEmails, []);

	// The runbook path renders in mono inside the sentence, so the sentence is one catalog message
	// split around the path rather than two fragments a translator cannot reorder.
	const notConfigured = t('session.schedule.notConfigured', {
		guide: GOOGLE_CALENDAR_SETUP_RUNBOOK,
	});
	const [notConfiguredBefore, notConfiguredAfter = ''] = notConfigured.split(
		GOOGLE_CALENDAR_SETUP_RUNBOOK,
	);

	if (!isGoogleCalendarConfigured) {
		return (
			<Panel
				title={t('session.schedule.title')}
				action={<VisibilityChip level="dm-only" compact />}
			>
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					{notConfiguredBefore}
					<span style={{ ...mono, fontSize: 12 }}>{GOOGLE_CALENDAR_SETUP_RUNBOOK}</span>
					{notConfiguredAfter}
				</div>
			</Panel>
		);
	}

	const create = async () => {
		if (!start || busy) return;
		setBusy(true);
		setLink('');
		try {
			if (!isGoogleCalendarSignedIn()) {
				const outcome = await connectGoogleCalendar();
				if (outcome.status !== 'signed-in') {
					if (outcome.status === 'failed') Toaster.error(outcome.message);
					return;
				}
			}
			const startDate = new Date(start);
			const created = await createSessionEvent({
				summary: t('session.schedule.eventSummary'),
				startIso: startDate.toISOString(),
				durationMinutes: Number(duration),
				attendeeEmails: emails,
				details: note,
				reminderMinutes: Number(reminder),
			});
			setLink(created.htmlLink);
			Toaster.success(
				emails.length
					? t('session.schedule.scheduledWithInvites', { count: emails.length })
					: t('session.schedule.scheduled'),
			);
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : t('session.schedule.createFailed'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Panel title={t('session.schedule.title')} action={<VisibilityChip level="dm-only" compact />}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
				<Field label={t('session.schedule.when')}>
					<Input
						type="datetime-local"
						value={start}
						onChange={(e: { target: { value: string } }) => setStart(e.target.value)}
					/>
				</Field>
				<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
					<Field label={t('session.schedule.length')} style={{ flex: 1, minWidth: 120 }}>
						<Select
							value={duration}
							onChange={(e: { target: { value: string } }) => setDuration(e.target.value)}
							options={[
								{ value: '120', label: t('session.schedule.hours', { count: 2 }) },
								{ value: '180', label: t('session.schedule.hours', { count: 3 }) },
								{ value: '240', label: t('session.schedule.hours', { count: 4 }) },
							]}
						/>
					</Field>
					<Field label={t('session.schedule.reminder')} style={{ flex: 1, minWidth: 120 }}>
						<Select
							value={reminder}
							onChange={(e: { target: { value: string } }) => setReminder(e.target.value)}
							options={[
								{ value: '60', label: t('session.schedule.reminderHour') },
								{ value: '1440', label: t('session.schedule.reminderDay') },
								{ value: '0', label: t('session.schedule.reminderDefault') },
							]}
						/>
					</Field>
				</div>
				<Field label={t('session.schedule.note')}>
					<Input
						value={note}
						onChange={(e: { target: { value: string } }) => setNote(e.target.value)}
						placeholder={t('session.schedule.notePlaceholder')}
					/>
				</Field>
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					{emails.length
						? t('session.schedule.invitesGo', { count: emails.length })
						: t('session.schedule.noRosterEmails')}{' '}
					{t('session.schedule.metadataOnly')}
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<Button onClick={() => void create()} disabled={!start || busy}>
						{t(busy ? 'session.schedule.scheduling' : 'session.schedule.create')}
					</Button>
					{link && (
						<a
							href={link}
							target="_blank"
							rel="noreferrer"
							style={{ font: `12.5px ${T.sans}`, color: T.acc }}
						>
							{t('session.schedule.openInCalendar')}
						</a>
					)}
				</div>
			</div>
		</Panel>
	);
}
