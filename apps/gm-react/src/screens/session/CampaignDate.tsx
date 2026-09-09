import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	addDays,
	daysInMonth,
	holidaysOn,
	moonPhasesOn,
	getCalendarContinuityForActor,
	type CalendarDefinition,
	type CustomDate,
} from '@dndtools/core';
import { Button, Field, Icon, Input, Select } from '../../ds';
import { useI18n } from '../../i18n';
import { Panel, T } from '../../app/screen-kit';

type ContinuityDate = NonNullable<ReturnType<typeof getCalendarContinuityForActor>['currentDate']>;

// ── Campaign date (SES-012 — the control the Campaign timeline points at) ─────────────────────────

export function CampaignDatePanel({
	calendar,
	current,
	previewing,
	onSet,
}: {
	calendar: CalendarDefinition | null;
	current: ContinuityDate | null;
	previewing: boolean;
	onSet: (date: CustomDate, ok: string) => void;
}) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [year, setYear] = useState(1);
	const [month, setMonth] = useState(1);
	const [day, setDay] = useState(1);
	// Day and Year coerced on every keystroke (`Number(v) || 1`), so backspacing the last digit
	// snapped the field straight back to 1 and it could never be cleared to retype. Hold the raw
	// text and commit on blur, as EncounterBuilder's CR drafts do.
	const [dayText, setDayText] = useState('1');
	const [yearText, setYearText] = useState('1');

	// Keep the form anchored to the canonical current date (e.g. after “+1 day” or a set elsewhere).
	const currentIso = current?.isoLike ?? null;
	useEffect(() => {
		if (!current) return;
		setYear(current.value.year);
		setMonth(current.value.month);
		setDay(current.value.day);
		setYearText(String(current.value.year));
		setDayText(String(current.value.day));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- sync from the canonical date only
	}, [currentIso]);

	if (!calendar) {
		return (
			<Panel title={t('session.date.title')}>
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('session.date.noCalendar')}</div>
				{/* RC-KNW-3.1 — the empty state used to be terminal; it now points at the editor that
				    fixes it, so "no calendar" is a step in a flow rather than a wall. */}
				<div>
					<Button
						variant="secondary"
						size="sm"
						icon="add"
						onClick={() => navigate('/campaign/calendar')}
					>
						{t('session.date.defineCalendar')}
					</Button>
				</div>
			</Panel>
		);
	}

	const maxDay = daysInMonth(calendar, month) ?? 1;
	// RC-KNW-3.1 — derived, never stored: the moons and holidays of the CURRENT campaign date come
	// straight from the definition, so what the DM reads here is what every other surface derives.
	const moons = current ? moonPhasesOn(calendar, current.value) : [];
	const holidays = current ? holidaysOn(calendar, current.value) : [];

	// An empty or unparseable draft falls back to the last committed value rather than to a magic 1.
	function parsedDay(): number {
		const n = Number(dayText);
		if (!dayText.trim() || !Number.isFinite(n)) return Math.min(maxDay, Math.max(1, day));
		return Math.min(maxDay, Math.max(1, Math.trunc(n)));
	}
	function parsedYear(): number {
		const n = Number(yearText);
		if (!yearText.trim() || !Number.isFinite(n)) return Math.trunc(year);
		return Math.trunc(n);
	}
	function commitDay() {
		const next = parsedDay();
		setDay(next);
		setDayText(String(next));
	}
	function commitYear() {
		const next = parsedYear();
		setYear(next);
		setYearText(String(next));
	}

	function setDate() {
		if (!calendar) return;
		onSet(
			{
				calendarId: calendar.id,
				year: parsedYear(),
				month,
				day: parsedDay(),
			},
			t('session.date.setOk'),
		);
	}

	function advanceDay() {
		if (!calendar || !current) return;
		const next = addDays(calendar, current.value, 1);
		if (next) onSet(next, t('session.date.advancedOk'));
	}

	return (
		<Panel title={t('session.date.title')}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
				<Icon name="recent" size="sm" color={current ? T.acc : T.ter} />
				<div style={{ flex: '1 1 180px', minWidth: 0 }}>
					<div
						style={{
							font: `600 13px ${T.sans}`,
							color: T.ink,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{current ? current.display : t('session.date.none')}
					</div>
					<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
						{t('session.date.drives', { calendar: calendar.name })}
					</div>
				</div>
				<Button
					variant="secondary"
					size="sm"
					icon="skip"
					disabled={previewing || !current}
					onClick={advanceDay}
				>
					{t('session.date.advance')}
				</Button>
			</div>
			{(holidays.length > 0 || moons.length > 0) && (
				<div
					data-testid="session-date-derived"
					style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
				>
					{holidays.length > 0 && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								font: `12px ${T.sans}`,
								color: T.acc,
							}}
						>
							<Icon name="flag" size="sm" color={T.acc} />
							{holidays.map((h) => h.name).join(' · ')}
						</div>
					)}
					{moons.length > 0 && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								font: `12px ${T.sans}`,
								color: T.ter,
							}}
						>
							<Icon name="sparkle" size="sm" color={T.ter} />
							{moons
								.map((m) =>
									t('session.date.moonRow', {
										name: m.name,
										phase: t(`calendar.phase.${m.phase}` as const),
									}),
								)
								.join(' · ')}
						</div>
					)}
				</div>
			)}
			<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
				<Field label={t('session.date.month')} style={{ flex: '1 1 120px' }}>
					<Select
						value={String(month)}
						disabled={previewing}
						options={calendar.months.map((m, i) => ({ value: String(i + 1), label: m.name }))}
						onChange={(e: { target: { value: string } }) => {
							const next = Math.max(1, Math.trunc(Number(e.target.value) || 1));
							setMonth(next);
							const cap = daysInMonth(calendar, next) ?? 1;
							const clamped = Math.min(cap, Math.max(1, parsedDay()));
							setDay(clamped);
							setDayText(String(clamped));
						}}
					/>
				</Field>
				<Field label={t('session.date.day')} style={{ width: 70 }}>
					<Input
						type="number"
						min={1}
						max={maxDay}
						value={dayText}
						disabled={previewing}
						onChange={(e: { target: { value: string } }) => setDayText(e.target.value)}
						onBlur={commitDay}
					/>
				</Field>
				<Field label={t('session.date.year')} style={{ width: 84 }}>
					<Input
						type="number"
						value={yearText}
						disabled={previewing}
						onChange={(e: { target: { value: string } }) => setYearText(e.target.value)}
						onBlur={commitYear}
					/>
				</Field>
				<Button variant="primary" size="sm" icon="check" disabled={previewing} onClick={setDate}>
					{t('session.date.set')}
				</Button>
			</div>
			<div>
				<Button
					variant="ghost"
					size="sm"
					icon="note-edit"
					onClick={() => navigate('/campaign/calendar')}
				>
					{t('session.date.editCalendar')}
				</Button>
			</div>
		</Panel>
	);
}
