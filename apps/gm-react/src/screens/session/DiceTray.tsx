import { useState } from 'react';
import type { EvaluatedTerm } from '@dndtools/core';
import { Button, DiceResult, Icon, Input } from '../../ds';
import { useI18n, type MessageKey, type MessageValues } from '../../i18n';
import { Panel, T, mono } from '../../app/screen-kit';
import { copyToClipboard } from '../../platform/preferences';

// ── Dice ──────────────────────────────────────────────────────────────────────────────────────────

type TrayRoll = {
	id: string;
	expression: string;
	total: number;
	label: string | null;
	dice: number[];
	modifier: number;
	terms?: EvaluatedTerm[];
};

/** Natural-20/natural-1 detection on a RECORDED roll: exactly one d20 term keeping a single die.
 *  Mirrors `screens/play/Dice.tsx`'s `critOf` (the player table's crit readout) so the DM's roll
 *  tray agrees with what players see for the same roll — kept as a small local copy rather than a
 *  cross-screen import so this file's `terms` stays optional (`getDiceHistoryForActor` always
 *  supplies it, but nothing here should assume that of a caller). */
function critOf(terms: EvaluatedTerm[] | undefined): 'success' | 'fail' | undefined {
	const diceTerms = (terms ?? []).filter(
		(t): t is Extract<EvaluatedTerm, { kind: 'dice' }> => t.kind === 'dice',
	);
	if (diceTerms.length !== 1) return undefined;
	const term = diceTerms[0];
	if (term.sides !== 20 || term.kept.length !== 1) return undefined;
	return term.kept[0] === 20 ? 'success' : term.kept[0] === 1 ? 'fail' : undefined;
}

/** RC-SES-2.1 — one line per dice term, showing every die rolled (not just the kept ones), so a
 *  kh1/kl1 advantage roll reads as "both dice fell, this one counted" instead of hiding the drop. */
function termBreakdown(
	t: (key: MessageKey, vars?: MessageValues) => string,
	terms: EvaluatedTerm[],
) {
	return terms
		.filter((term): term is Extract<EvaluatedTerm, { kind: 'dice' }> => term.kind === 'dice')
		.map((term) => {
			const faces = term.dice
				.map((d) =>
					d.kept ? String(d.value) : t('session.dice.breakdown.dropped', { value: d.value }),
				)
				.join(', ');
			return `${term.count}d${term.sides}${term.keep ? term.keep : ''}: [${faces}]`;
		});
}

/** Renders the per-die breakdown for one roll, gated behind an expand/collapse toggle (tap or Enter/
 *  Space on the toggle button — a keyboard equivalent for what would otherwise be pointer-only hover). */
function RollBreakdown({ roll }: { roll: TrayRoll }) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const terms = roll.terms ?? [];
	const diceTerms = terms.filter((term) => term.kind === 'dice');
	if (diceTerms.length === 0) return null;
	const panelId = `dice-breakdown-${roll.id}`;
	return (
		<div>
			<button
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((v) => !v)}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 3,
					font: `11px ${T.sans}`,
					color: T.ter,
					background: 'none',
					border: 'none',
					padding: 0,
					cursor: 'pointer',
				}}
			>
				<Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
				{t('session.dice.breakdown.toggle')}
			</button>
			{open && (
				<div
					id={panelId}
					style={{ ...mono, fontSize: 11, color: T.sub, marginTop: 3, display: 'grid', gap: 2 }}
				>
					{termBreakdown(t, terms).map((line, i) => (
						<span key={i}>{line}</span>
					))}
				</div>
			)}
		</div>
	);
}

/** RC-SES-2.1 — "Export roll log": a plain-text digest of the visible roll history, copied to the
 *  clipboard so the DM can paste it straight into the session recap (`SessionArchiveRecap.markdown`)
 *  or a note. The full history already rides along on every archive snapshot automatically
 *  (`SessionArchiveSnapshot.diceHistory`); this gives the DM a human-readable version of it on demand,
 *  without inventing a second durable copy in the core. */
function exportRollLogText(rolls: TrayRoll[]): string {
	return rolls
		.map((r) => {
			const label = r.label ? `${r.label}: ` : '';
			return `- ${label}${r.expression} → ${r.total}`;
		})
		.join('\n');
}

export function DicePanel({
	rolls,
	isLive,
	previewing,
	expr,
	onExpr,
	label,
	onLabel,
	onRoll,
}: {
	rolls: TrayRoll[];
	isLive: boolean;
	previewing: boolean;
	expr: string;
	onExpr: (v: string) => void;
	label: string;
	onLabel: (v: string) => void;
	onRoll: (expression: string, label?: string) => void;
}) {
	const { t } = useI18n();
	const [copied, setCopied] = useState(false);
	const presets = ['1d20', '1d20+5', '2d6+3', '1d8+2', '4d6'];
	// `getDiceHistoryForActor` returns rolls oldest-first (appended), so the newest is the LAST element.
	const recent = [...rolls].reverse();
	const last = recent[0];
	const lastCrit = last ? critOf(last.terms) : undefined;
	const lastNatural = lastCrit && last?.dice.length === 1 ? last.dice[0] : null;
	const disabled = !isLive || previewing;
	return (
		<Panel
			title={t('session.dice.title')}
			action={
				rolls.length > 0 ? (
					<Button
						variant="ghost"
						size="sm"
						icon={copied ? 'check' : 'duplicate'}
						onClick={() => {
							void copyToClipboard(exportRollLogText(rolls)).then((ok) => {
								if (!ok) return;
								setCopied(true);
								setTimeout(() => setCopied(false), 1500);
							});
						}}
					>
						{t(copied ? 'common.state.copied' : 'session.dice.export')}
					</Button>
				) : undefined
			}
		>
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
						onClick={() => onRoll(p, label.trim() || undefined)}
					>
						{p}
					</Button>
				))}
			</div>
			{/* A <form> so Enter (and a phone keyboard's Go key) rolls — typing "2d6+4" and pressing
			    Enter used to do nothing at all on the busiest control of the live-play screen. */}
			<form
				style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
				onSubmit={(e) => {
					e.preventDefault();
					if (disabled || !expr.trim()) return;
					onRoll(expr.trim(), label.trim() || undefined);
				}}
			>
				<Input
					value={expr}
					onChange={(e: { target: { value: string } }) => onExpr(e.target.value)}
					placeholder={t('session.dice.expressionPlaceholder')}
					aria-label={t('session.dice.expression')}
					style={{ flex: 2, minWidth: 100 }}
				/>
				<Input
					value={label}
					onChange={(e: { target: { value: string } }) => onLabel(e.target.value)}
					placeholder={t('session.dice.labelPlaceholder')}
					aria-label={t('session.dice.label')}
					style={{ flex: 1, minWidth: 100 }}
				/>
				<Button type="submit" variant="accent" icon="dice" disabled={disabled || !expr.trim()}>
					{t('session.dice.roll')}
				</Button>
			</form>
			{last && (
				<div>
					<DiceResult
						notation={last.expression}
						total={last.total}
						rolls={last.dice}
						modifier={last.modifier}
						crit={lastCrit}
						critNatural={lastNatural}
					/>
					{last.label && (
						<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 4 }}>{last.label}</div>
					)}
					<div style={{ marginTop: 4 }}>
						<RollBreakdown roll={last} />
					</div>
				</div>
			)}
			{recent.length > 1 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
					{recent.slice(1, 6).map((d) => {
						const crit = critOf(d.terms);
						return (
							<div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										font: `12px ${T.sans}`,
										color: T.ter,
									}}
								>
									<span style={{ ...mono, color: T.sub }}>
										{d.label ? `${d.label} · ` : ''}
										{d.expression}
									</span>
									<span style={{ flex: 1, borderBottom: `1px dotted ${T.bd}` }} />
									<span
										style={{
											...mono,
											color: crit === 'success' ? T.ok : crit === 'fail' ? T.err : T.ink,
											fontWeight: 700,
										}}
									>
										{d.total}
										{crit === 'success' ? ` · ${t('session.dice.nat20')}` : ''}
										{crit === 'fail' ? ` · ${t('session.dice.nat1')}` : ''}
									</span>
								</div>
								<RollBreakdown roll={d} />
							</div>
						);
					})}
				</div>
			)}
		</Panel>
	);
}
