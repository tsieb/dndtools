import { useMemo, useState } from 'react';
import { Button, Field, Input, Select, Toaster, VisibilityChip } from '../../ds';
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
	const [start, setStart] = useState('');
	const [duration, setDuration] = useState('180');
	const [reminder, setReminder] = useState('60');
	const [note, setNote] = useState('');
	const [busy, setBusy] = useState(false);
	const [link, setLink] = useState('');
	const emails = useMemo(rosterAttendeeEmails, []);

	if (!isGoogleCalendarConfigured) {
		return (
			<Panel title="Schedule next session" action={<VisibilityChip level="dm-only" compact />}>
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					Google Calendar scheduling isn’t set up for this install. A one-time Google Cloud setup
					enables it — see the guide at{' '}
					<span style={{ ...mono, fontSize: 12 }}>{GOOGLE_CALENDAR_SETUP_RUNBOOK}</span>.
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
				summary: 'D&D — game session',
				startIso: startDate.toISOString(),
				durationMinutes: Number(duration),
				attendeeEmails: emails,
				details: note,
				reminderMinutes: Number(reminder),
			});
			setLink(created.htmlLink);
			Toaster.success(
				emails.length
					? `Session scheduled — ${emails.length} ${emails.length === 1 ? 'invite' : 'invites'} sent.`
					: 'Session scheduled on your calendar.',
			);
		} catch (error) {
			Toaster.error(
				error instanceof Error
					? error.message
					: 'The calendar event couldn’t be created — try again.',
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Panel title="Schedule next session" action={<VisibilityChip level="dm-only" compact />}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
				<Field label="When">
					<Input
						type="datetime-local"
						value={start}
						onChange={(e: { target: { value: string } }) => setStart(e.target.value)}
					/>
				</Field>
				<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
					<Field label="Length" style={{ flex: 1, minWidth: 120 }}>
						<Select
							value={duration}
							onChange={(e: { target: { value: string } }) => setDuration(e.target.value)}
							options={[
								{ value: '120', label: '2 hours' },
								{ value: '180', label: '3 hours' },
								{ value: '240', label: '4 hours' },
							]}
						/>
					</Field>
					<Field label="Reminder" style={{ flex: 1, minWidth: 120 }}>
						<Select
							value={reminder}
							onChange={(e: { target: { value: string } }) => setReminder(e.target.value)}
							options={[
								{ value: '60', label: '1 hour before' },
								{ value: '1440', label: '1 day before' },
								{ value: '0', label: 'Calendar default' },
							]}
						/>
					</Field>
				</div>
				<Field label="Note to players (optional)">
					<Input
						value={note}
						onChange={(e: { target: { value: string } }) => setNote(e.target.value)}
						placeholder="Bring snacks."
					/>
				</Field>
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					{emails.length
						? `Invites go to ${emails.length} roster ${emails.length === 1 ? 'email' : 'emails'}.`
						: 'No roster emails yet — the event is created on your calendar only.'}{' '}
					Only the title, time, and this note leave the vault.
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<Button onClick={() => void create()} disabled={!start || busy}>
						{busy ? 'Scheduling…' : 'Create calendar event'}
					</Button>
					{link && (
						<a
							href={link}
							target="_blank"
							rel="noreferrer"
							style={{ font: `12.5px ${T.sans}`, color: T.acc }}
						>
							Open in Google Calendar
						</a>
					)}
				</div>
			</div>
		</Panel>
	);
}
