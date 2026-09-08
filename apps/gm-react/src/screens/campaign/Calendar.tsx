import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	actorCanAuthorContent,
	getContentItemsForActor,
	type CalendarDefinition,
	type CustomDate,
} from '@dndtools/core';
import { Button, EmptyState, Icon, Toaster } from '../../ds';
import { BackBar, Page, Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { CalendarForm } from './CalendarForm';
import { CalendarPreview, DateANote } from './CalendarPreview';
import { draftFromDefinition, emptyDraft, num, slug, type Draft } from './calendarDraft';

/**
 * RC-KNW-3.1 — the CALENDAR EDITOR: the first surface where a DM can actually author a campaign
 * calendar. Before this, `content.define-calendar` existed in the core and was reachable only from
 * the demo seed, so a fresh campaign could never get a calendar at all and every dated surface (the
 * Campaign timeline, the Session campaign date, note date fields) was permanently empty.
 *
 * The screen edits a DRAFT and commits it in ONE `content.define-calendar` dispatch — that command
 * defines-or-replaces a whole definition by id, so a partial save is not a thing that can happen.
 * Nothing here re-implements calendar arithmetic: month lengths, the holiday match, and every moon
 * phase come from `state/calendar.ts`, which is a pure function of (definition, date) and reads no
 * clock, so the preview a DM sees is exactly what every other surface will derive.
 *
 * Dating a note is the second half of the story: a note is a content item with named CUSTOM-DATE
 * FIELDS, and this screen writes one through `content.update-item` against the calendar being
 * edited. The note list is the actor-filtered read, so a DM only ever dates a note they can see.
 */

export function Calendar() {
	const runtime = useRuntime();
	const navigate = useNavigate();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;

	const { calendars, notes, canAuthor } = useMemo(() => {
		const { content, permissions } = runtime.state;
		return {
			calendars: Object.values(content.calendars) as CalendarDefinition[],
			notes: getContentItemsForActor(content, permissions, actorId).filter(
				(n) => n.kind === 'note',
			),
			canAuthor: actorCanAuthorContent(permissions, actorId),
		};
	}, [runtime.state, actorId]);

	const [selectedId, setSelectedId] = useState<string | null>(calendars[0]?.id ?? null);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [busy, setBusy] = useState(false);

	const selected = calendars.find((c) => c.id === selectedId) ?? calendars[0] ?? null;

	function edit(calendar: CalendarDefinition | null) {
		setDraft(calendar ? draftFromDefinition(calendar) : emptyDraft());
	}

	async function save() {
		if (!draft) return;
		const name = draft.name.trim();
		if (!name) {
			Toaster.error(t('calendar.err.name'));
			return;
		}
		const months = draft.months
			.map((m, i) => ({
				id: m.id || slug('month', m.name, i),
				name: m.name.trim(),
				days: num(m.days, 30, 1),
			}))
			.filter((m) => m.name.length > 0);
		if (months.length === 0) {
			Toaster.error(t('calendar.err.months'));
			return;
		}
		const weekdays = draft.weekdays
			.split(',')
			.map((w) => w.trim())
			.filter((w) => w.length > 0);
		const moons = draft.moons
			.map((m, i) => ({
				id: m.id || slug('moon', m.name, i),
				name: m.name.trim(),
				cycleDays: num(m.cycleDays, 28, 1),
				offsetDays: num(m.offsetDays, 0, Number.MIN_SAFE_INTEGER),
			}))
			.filter((m) => m.name.length > 0);
		const holidays = draft.holidays
			.map((h, i) => ({
				id: h.id || slug('holiday', h.name, i),
				name: h.name.trim(),
				month: Math.min(Math.max(1, h.month), months.length),
				day: num(h.day, 1, 1),
			}))
			.filter((h) => h.name.length > 0);
		const id = draft.id || slug('calendar', name, 0);

		setBusy(true);
		try {
			// One dispatch defines-or-replaces the whole definition; there is no partial-save state.
			const result = await runtime.dispatch({
				type: 'content.define-calendar',
				actorId,
				payload: {
					id,
					name,
					months,
					...(weekdays.length > 0 ? { weekdays } : {}),
					...(draft.epochLabel.trim() ? { epochLabel: draft.epochLabel.trim() } : {}),
					...(moons.length > 0 ? { moons } : {}),
					...(holidays.length > 0 ? { holidays } : {}),
				},
			});
			if (result.status !== 'accepted') {
				Toaster.error(result.rejection.message);
				return;
			}
			setSelectedId(id);
			setDraft(null);
			Toaster.success(t('calendar.savedOk'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Page max={980}>
			<BackBar to="/campaign" label={t('calendar.back')} />
			<h1 style={{ font: `700 22px ${T.disp}`, color: T.ink, margin: '0 0 4px' }}>
				{t('calendar.title')}
			</h1>
			<p style={{ font: `13px ${T.sans}`, color: T.sub, margin: '0 0 18px', maxWidth: 620 }}>
				{t('calendar.blurb')}
			</p>

			{!canAuthor && (
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.sub }}>{t('calendar.readOnly')}</div>
				</Panel>
			)}

			{canAuthor && !draft && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
					<Panel
						title={t('calendar.list.title')}
						action={
							<Button variant="primary" size="sm" icon="add" onClick={() => edit(null)}>
								{t('calendar.new')}
							</Button>
						}
					>
						{calendars.length === 0 ? (
							<EmptyState
								icon="recent"
								title={t('calendar.empty.title')}
								description={t('calendar.empty.body')}
							/>
						) : (
							<ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
								{calendars.map((calendar) => (
									<li
										key={calendar.id}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 10,
											padding: '10px 0',
											borderBottom: `1px solid ${T.bd}`,
										}}
									>
										<Icon name="recent" size="sm" color={T.acc} />
										<div style={{ flex: '1 1 auto', minWidth: 0 }}>
											<div style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>
												{calendar.name}
											</div>
											<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
												{t('calendar.summary', {
													months: calendar.months.length,
													moons: calendar.moons?.length ?? 0,
													holidays: calendar.holidays?.length ?? 0,
												})}
											</div>
										</div>
										<Button size="sm" variant="secondary" onClick={() => edit(calendar)}>
											{t('calendar.edit')}
										</Button>
									</li>
								))}
							</ul>
						)}
					</Panel>

					{selected && (
						<CalendarPreview
							calendar={selected}
							onSelect={setSelectedId}
							calendars={calendars}
							t={t}
						/>
					)}

					{selected && (
						<DateANote
							calendar={selected}
							notes={notes}
							onDate={async (itemId: string, field: string, date: CustomDate) => {
								const result = await runtime.dispatch({
									type: 'content.update-item',
									actorId,
									payload: { itemId, dateFields: { [field]: date } },
								});
								if (result.status !== 'accepted') {
									Toaster.error(result.rejection.message);
									return false;
								}
								Toaster.success(t('calendar.note.datedOk'));
								return true;
							}}
							t={t}
						/>
					)}
				</div>
			)}

			{canAuthor && draft && (
				<CalendarForm
					draft={draft}
					busy={busy}
					onChange={setDraft}
					onCancel={() => setDraft(null)}
					onSave={() => void save()}
					t={t}
				/>
			)}

			{/* A calendar is only useful once the Session points at a date in it. */}
			{canAuthor && !draft && selected && (
				<div style={{ marginTop: 14 }}>
					<Button variant="ghost" size="sm" icon="arrow-right" onClick={() => navigate('/session')}>
						{t('calendar.toSession')}
					</Button>
				</div>
			)}
		</Page>
	);
}
