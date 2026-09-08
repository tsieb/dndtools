import { Button, Field, IconButton, Input, Select } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import type { Draft, Translate } from './calendarDraft';

// ── The draft form ───────────────────────────────────────────────────────────────────────────────

export function CalendarForm({
	draft,
	busy,
	onChange,
	onCancel,
	onSave,
	t,
}: {
	draft: Draft;
	busy: boolean;
	onChange: (next: Draft) => void;
	onCancel: () => void;
	onSave: () => void;
	t: Translate;
}) {
	const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
	const rowStyle = {
		display: 'flex',
		gap: 8,
		alignItems: 'flex-end',
		flexWrap: 'wrap' as const,
		paddingBottom: 10,
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
			<Panel title={draft.id ? t('calendar.form.editTitle') : t('calendar.form.newTitle')}>
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					<Field label={t('calendar.field.name')} style={{ flex: '2 1 240px' }}>
						<Input
							value={draft.name}
							data-testid="calendar-name"
							onChange={(e: { target: { value: string } }) => set({ name: e.target.value })}
						/>
					</Field>
					<Field
						label={t('calendar.field.era')}
						help={t('calendar.field.eraHint')}
						style={{ flex: '1 1 140px' }}
					>
						<Input
							value={draft.epochLabel}
							data-testid="calendar-era"
							onChange={(e: { target: { value: string } }) => set({ epochLabel: e.target.value })}
						/>
					</Field>
				</div>
				<Field label={t('calendar.field.weekdays')} help={t('calendar.field.weekdaysHint')}>
					<Input
						value={draft.weekdays}
						data-testid="calendar-weekdays"
						onChange={(e: { target: { value: string } }) => set({ weekdays: e.target.value })}
					/>
				</Field>
			</Panel>

			<Panel
				title={t('calendar.months.title')}
				action={
					<Button
						size="sm"
						variant="secondary"
						icon="add"
						onClick={() =>
							set({
								months: [
									...draft.months,
									{ id: `month-${draft.months.length + 1}`, name: '', days: '30' },
								],
							})
						}
					>
						{t('calendar.months.add')}
					</Button>
				}
			>
				{draft.months.map((month, index) => (
					<div key={month.id} style={rowStyle}>
						<Field
							label={t('calendar.months.name', { n: index + 1 })}
							style={{ flex: '2 1 200px' }}
						>
							<Input
								value={month.name}
								data-testid={`calendar-month-name-${index}`}
								onChange={(e: { target: { value: string } }) =>
									set({
										months: draft.months.map((m, i) =>
											i === index ? { ...m, name: e.target.value } : m,
										),
									})
								}
							/>
						</Field>
						<Field label={t('calendar.months.days')} style={{ width: 92 }}>
							<Input
								type="number"
								min={1}
								value={month.days}
								data-testid={`calendar-month-days-${index}`}
								onChange={(e: { target: { value: string } }) =>
									set({
										months: draft.months.map((m, i) =>
											i === index ? { ...m, days: e.target.value } : m,
										),
									})
								}
							/>
						</Field>
						<IconButton
							icon="trash"
							size="sm"
							variant="ghost"
							label={t('calendar.months.remove', { name: month.name || String(index + 1) })}
							disabled={draft.months.length === 1}
							onClick={() => set({ months: draft.months.filter((_, i) => i !== index) })}
						/>
					</div>
				))}
			</Panel>

			<Panel
				title={t('calendar.moons.title')}
				action={
					<Button
						size="sm"
						variant="secondary"
						icon="add"
						onClick={() =>
							set({
								moons: [
									...draft.moons,
									{
										id: `moon-${draft.moons.length + 1}`,
										name: '',
										cycleDays: '28',
										offsetDays: '0',
									},
								],
							})
						}
					>
						{t('calendar.moons.add')}
					</Button>
				}
			>
				<div style={{ ...eb, marginBottom: 2 }}>{t('calendar.moons.hint')}</div>
				{draft.moons.length === 0 && (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('calendar.moons.none')}</div>
				)}
				{draft.moons.map((moon, index) => (
					<div key={moon.id} style={rowStyle}>
						<Field label={t('calendar.moons.name')} style={{ flex: '2 1 180px' }}>
							<Input
								value={moon.name}
								data-testid={`calendar-moon-name-${index}`}
								onChange={(e: { target: { value: string } }) =>
									set({
										moons: draft.moons.map((m, i) =>
											i === index ? { ...m, name: e.target.value } : m,
										),
									})
								}
							/>
						</Field>
						<Field label={t('calendar.moons.cycle')} style={{ width: 100 }}>
							<Input
								type="number"
								min={1}
								value={moon.cycleDays}
								data-testid={`calendar-moon-cycle-${index}`}
								onChange={(e: { target: { value: string } }) =>
									set({
										moons: draft.moons.map((m, i) =>
											i === index ? { ...m, cycleDays: e.target.value } : m,
										),
									})
								}
							/>
						</Field>
						<Field label={t('calendar.moons.offset')} style={{ width: 100 }}>
							<Input
								type="number"
								value={moon.offsetDays}
								onChange={(e: { target: { value: string } }) =>
									set({
										moons: draft.moons.map((m, i) =>
											i === index ? { ...m, offsetDays: e.target.value } : m,
										),
									})
								}
							/>
						</Field>
						<IconButton
							icon="trash"
							size="sm"
							variant="ghost"
							label={t('calendar.moons.remove', { name: moon.name || String(index + 1) })}
							onClick={() => set({ moons: draft.moons.filter((_, i) => i !== index) })}
						/>
					</div>
				))}
			</Panel>

			<Panel
				title={t('calendar.holidays.title')}
				action={
					<Button
						size="sm"
						variant="secondary"
						icon="add"
						onClick={() =>
							set({
								holidays: [
									...draft.holidays,
									{ id: `holiday-${draft.holidays.length + 1}`, name: '', month: 1, day: '1' },
								],
							})
						}
					>
						{t('calendar.holidays.add')}
					</Button>
				}
			>
				{draft.holidays.length === 0 && (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						{t('calendar.holidays.none')}
					</div>
				)}
				{draft.holidays.map((holiday, index) => (
					<div key={holiday.id} style={rowStyle}>
						<Field label={t('calendar.holidays.name')} style={{ flex: '2 1 180px' }}>
							<Input
								value={holiday.name}
								data-testid={`calendar-holiday-name-${index}`}
								onChange={(e: { target: { value: string } }) =>
									set({
										holidays: draft.holidays.map((h, i) =>
											i === index ? { ...h, name: e.target.value } : h,
										),
									})
								}
							/>
						</Field>
						<Field label={t('calendar.holidays.month')} style={{ flex: '1 1 150px' }}>
							<Select
								value={String(holiday.month)}
								data-testid={`calendar-holiday-month-${index}`}
								options={draft.months.map((m, i) => ({
									value: String(i + 1),
									label: m.name || t('calendar.months.name', { n: i + 1 }),
								}))}
								onChange={(e: { target: { value: string } }) =>
									set({
										holidays: draft.holidays.map((h, i) =>
											i === index ? { ...h, month: Math.max(1, Number(e.target.value) || 1) } : h,
										),
									})
								}
							/>
						</Field>
						<Field label={t('calendar.holidays.day')} style={{ width: 82 }}>
							<Input
								type="number"
								min={1}
								value={holiday.day}
								data-testid={`calendar-holiday-day-${index}`}
								onChange={(e: { target: { value: string } }) =>
									set({
										holidays: draft.holidays.map((h, i) =>
											i === index ? { ...h, day: e.target.value } : h,
										),
									})
								}
							/>
						</Field>
						<IconButton
							icon="trash"
							size="sm"
							variant="ghost"
							label={t('calendar.holidays.remove', { name: holiday.name || String(index + 1) })}
							onClick={() => set({ holidays: draft.holidays.filter((_, i) => i !== index) })}
						/>
					</div>
				))}
			</Panel>

			<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
				<Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
					{t('calendar.cancel')}
				</Button>
				<Button
					variant="primary"
					size="sm"
					icon="check"
					disabled={busy}
					data-testid="calendar-save"
					onClick={onSave}
				>
					{t('calendar.save')}
				</Button>
			</div>
		</div>
	);
}
