import { useState } from 'react';
import {
	daysInMonth,
	formatCustomDate,
	holidaysOn,
	moonPhasesOn,
	type CalendarDefinition,
	type CustomDate,
} from '@dndtools/core';
import { Button, Field, Icon, Input, Select } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { num, type Translate } from './calendarDraft';

// ── Derived preview: what the definition actually means on a date ────────────────────────────────

export function CalendarPreview({
	calendar,
	calendars,
	onSelect,
	t,
}: {
	calendar: CalendarDefinition;
	calendars: CalendarDefinition[];
	onSelect: (id: string) => void;
	t: Translate;
}) {
	const [month, setMonth] = useState(1);
	const [day, setDay] = useState('1');
	const [year, setYear] = useState('1');

	const cap = daysInMonth(calendar, month) ?? 1;
	const date: CustomDate = {
		calendarId: calendar.id,
		year: num(year, 1, Number.MIN_SAFE_INTEGER),
		month,
		day: Math.min(cap, num(day, 1, 1)),
	};
	const moons = moonPhasesOn(calendar, date);
	const holidays = holidaysOn(calendar, date);

	return (
		<Panel
			title={t('calendar.preview.title')}
			action={
				calendars.length > 1 ? (
					<Select
						value={calendar.id}
						options={calendars.map((c) => ({ value: c.id, label: c.name }))}
						onChange={(e: { target: { value: string } }) => onSelect(e.target.value)}
					/>
				) : undefined
			}
		>
			<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
				<Field label={t('session.date.month')} style={{ flex: '1 1 150px' }}>
					<Select
						value={String(month)}
						options={calendar.months.map((m, i) => ({ value: String(i + 1), label: m.name }))}
						onChange={(e: { target: { value: string } }) =>
							setMonth(Math.max(1, Number(e.target.value) || 1))
						}
					/>
				</Field>
				<Field label={t('session.date.day')} style={{ width: 80 }}>
					<Input
						type="number"
						min={1}
						max={cap}
						value={day}
						onChange={(e: { target: { value: string } }) => setDay(e.target.value)}
					/>
				</Field>
				<Field label={t('session.date.year')} style={{ width: 92 }}>
					<Input
						type="number"
						value={year}
						onChange={(e: { target: { value: string } }) => setYear(e.target.value)}
					/>
				</Field>
			</div>
			<div data-testid="calendar-preview-date" style={{ font: `600 15px ${T.disp}`, color: T.ink }}>
				{formatCustomDate(calendar, date, 'long')}
			</div>
			<div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 200px', minWidth: 0 }}>
					<div style={eb}>{t('calendar.moons.title')}</div>
					{moons.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('calendar.moons.none')}</div>
					) : (
						<ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
							{moons.map((moon) => (
								<li
									key={moon.moonId}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										font: `12.5px ${T.sans}`,
										color: T.sub,
									}}
								>
									<Icon name="sparkle" size="sm" color={T.acc} />
									{t('calendar.moons.row', {
										name: moon.name,
										phase: t(`calendar.phase.${moon.phase}` as const),
									})}
								</li>
							))}
						</ul>
					)}
				</div>
				<div style={{ flex: '1 1 200px', minWidth: 0 }}>
					<div style={eb}>{t('calendar.holidays.title')}</div>
					{holidays.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							{t('calendar.holidays.noneToday')}
						</div>
					) : (
						<ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
							{holidays.map((holiday) => (
								<li
									key={holiday.id}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										font: `12.5px ${T.sans}`,
										color: T.sub,
									}}
								>
									<Icon name="flag" size="sm" color={T.acc} />
									{holiday.name}
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</Panel>
	);
}

// ── Date a note ──────────────────────────────────────────────────────────────────────────────────

export function DateANote({
	calendar,
	notes,
	onDate,
	t,
}: {
	calendar: CalendarDefinition;
	notes: Array<{ id: string; title: string }>;
	onDate: (itemId: string, field: string, date: CustomDate) => Promise<boolean>;
	t: Translate;
}) {
	const [noteId, setNoteId] = useState(notes[0]?.id ?? '');
	const [field, setField] = useState('occurredOn');
	const [month, setMonth] = useState(1);
	const [day, setDay] = useState('1');
	const [year, setYear] = useState('1');
	const [busy, setBusy] = useState(false);

	if (notes.length === 0) {
		return (
			<Panel title={t('calendar.note.title')}>
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('calendar.note.noNotes')}</div>
			</Panel>
		);
	}

	const cap = daysInMonth(calendar, month) ?? 1;
	const date: CustomDate = {
		calendarId: calendar.id,
		year: num(year, 1, Number.MIN_SAFE_INTEGER),
		month,
		day: Math.min(cap, num(day, 1, 1)),
	};

	async function apply() {
		const trimmed = field.trim();
		if (!noteId || !trimmed) return;
		setBusy(true);
		try {
			await onDate(noteId, trimmed, date);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Panel title={t('calendar.note.title')}>
			<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>{t('calendar.note.blurb')}</div>
			<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
				<Field label={t('calendar.note.note')} style={{ flex: '2 1 200px' }}>
					<Select
						value={noteId}
						data-testid="calendar-note-select"
						options={notes.map((n) => ({ value: n.id, label: n.title }))}
						onChange={(e: { target: { value: string } }) => setNoteId(e.target.value)}
					/>
				</Field>
				<Field
					label={t('calendar.note.field')}
					help={t('calendar.note.fieldHint')}
					style={{ flex: '1 1 150px' }}
				>
					<Input
						value={field}
						data-testid="calendar-note-field"
						onChange={(e: { target: { value: string } }) => setField(e.target.value)}
					/>
				</Field>
			</div>
			<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
				<Field label={t('session.date.month')} style={{ flex: '1 1 150px' }}>
					<Select
						value={String(month)}
						data-testid="calendar-note-month"
						options={calendar.months.map((m, i) => ({ value: String(i + 1), label: m.name }))}
						onChange={(e: { target: { value: string } }) =>
							setMonth(Math.max(1, Number(e.target.value) || 1))
						}
					/>
				</Field>
				<Field label={t('session.date.day')} style={{ width: 80 }}>
					<Input
						type="number"
						min={1}
						max={cap}
						value={day}
						data-testid="calendar-note-day"
						onChange={(e: { target: { value: string } }) => setDay(e.target.value)}
					/>
				</Field>
				<Field label={t('session.date.year')} style={{ width: 92 }}>
					<Input
						type="number"
						value={year}
						data-testid="calendar-note-year"
						onChange={(e: { target: { value: string } }) => setYear(e.target.value)}
					/>
				</Field>
				<Button
					variant="primary"
					size="sm"
					icon="check"
					disabled={busy}
					data-testid="calendar-note-apply"
					onClick={() => void apply()}
				>
					{t('calendar.note.apply')}
				</Button>
			</div>
			<div style={{ font: `12px ${T.sans}`, color: T.ter }} data-testid="calendar-note-preview">
				{t('calendar.note.preview', { date: formatCustomDate(calendar, date, 'medium') })}
			</div>
		</Panel>
	);
}
