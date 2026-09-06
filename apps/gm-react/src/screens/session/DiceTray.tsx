import { Button, DiceResult, Input } from '../../ds';
import { useI18n } from '../../i18n';
import { Panel, T, mono } from '../../app/screen-kit';

// ── Dice ──────────────────────────────────────────────────────────────────────────────────────────

export function DicePanel({
	rolls,
	isLive,
	previewing,
	expr,
	onExpr,
	onRoll,
}: {
	rolls: {
		id: string;
		expression: string;
		total: number;
		label: string | null;
		dice: number[];
		modifier: number;
	}[];
	isLive: boolean;
	previewing: boolean;
	expr: string;
	onExpr: (v: string) => void;
	onRoll: (expression: string) => void;
}) {
	const { t } = useI18n();
	const presets = ['1d20', '1d20+5', '2d6+3', '1d8+2', '4d6'];
	// `getDiceHistoryForActor` returns rolls oldest-first (appended), so the newest is the LAST element.
	const recent = [...rolls].reverse();
	const last = recent[0];
	const disabled = !isLive || previewing;
	return (
		<Panel title={t('session.dice.title')}>
			{/* `DiceResult` is a plain <div> and `onRoll` passes no `ok` string, so pressing Roll used
			    to produce no announcement whatsoever — the result simply appeared. Permanently mounted
			    for the same reason as the combat readout above. */}
			<div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
				{last
					? t('session.dice.announcement', { expression: last.expression, total: last.total })
					: ''}
			</div>
			{!isLive && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{t('session.dice.goLive')}</div>
			)}
			<div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
				{presets.map((p) => (
					<Button
						key={p}
						variant="secondary"
						size="sm"
						disabled={disabled}
						onClick={() => onRoll(p)}
					>
						{p}
					</Button>
				))}
			</div>
			{/* A <form> so Enter (and a phone keyboard's Go key) rolls — typing "2d6+4" and pressing
			    Enter used to do nothing at all on the busiest control of the live-play screen. */}
			<form
				style={{ display: 'flex', gap: 8 }}
				onSubmit={(e) => {
					e.preventDefault();
					if (disabled || !expr.trim()) return;
					onRoll(expr.trim());
				}}
			>
				<Input
					value={expr}
					onChange={(e: { target: { value: string } }) => onExpr(e.target.value)}
					placeholder={t('session.dice.expressionPlaceholder')}
					aria-label={t('session.dice.expression')}
					style={{ flex: 1 }}
				/>
				<Button type="submit" variant="accent" icon="dice" disabled={disabled || !expr.trim()}>
					{t('session.dice.roll')}
				</Button>
			</form>
			{last && (
				<DiceResult
					notation={last.expression}
					total={last.total}
					rolls={last.dice}
					modifier={last.modifier}
				/>
			)}
			{recent.length > 1 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
					{recent.slice(1, 6).map((d) => (
						<div
							key={d.id}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								font: `12px ${T.sans}`,
								color: T.ter,
							}}
						>
							<span style={{ ...mono, color: T.sub }}>{d.expression}</span>
							<span style={{ flex: 1, borderBottom: `1px dotted ${T.bd}` }} />
							<span style={{ ...mono, color: T.ink, fontWeight: 700 }}>{d.total}</span>
						</div>
					))}
				</div>
			)}
		</Panel>
	);
}
