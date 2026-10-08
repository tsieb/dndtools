import { useState } from 'react';
import { parseDiceExpression } from '@dndtools/core';
import { Toaster } from '../../../../ds';
import { useI18n } from '../../../../i18n';
import { useRuntime } from '../../../../runtime/RuntimeContext';
import { DicePanel } from '../../../../screens/session/DiceTray';
import { Chip, OpChip, SR_ONLY, bodyWrap, cfg } from '../../../widget-body-kit';
import type { WidgetTemplateProps } from '../shared';
import { declares, detailOf, useWidgetCommandRunner } from './boardData';

/**
 * `dice-roller` — the GM board's quick rolls (RC-WID-5.7; the `dice` builtin body until then,
 * unchanged on screen). Its `tray` view is the Session screen's dice tray (RC-CAN-7.8,
 * SCREENS_PARITY SE-15): quick rolls, an expression and a label, Roll, and the roll history. Both
 * read the definition's `dice-history` query, the viewer's own history, and roll only through the
 * declared `dice.roll`.
 */
export function DiceRollerTemplate(props: WidgetTemplateProps) {
	return cfg<string>(props.widget, 'view') === 'tray' ? (
		<DiceTray {...props} />
	) : (
		<QuickRolls {...props} />
	);
}

/** RC-SES-6.2 — it rolls in every workflow state; a player preview cannot roll as the DM. */
function DiceTray({ widget, data, onCommand }: WidgetTemplateProps) {
	const runtime = useRuntime();
	const { run } = useWidgetCommandRunner(widget);
	const [expr, setExpr] = useState('1d20+7');
	const [label, setLabel] = useState('');
	const canRoll = !!onCommand && declares(widget, 'dice.roll');
	return (
		<DicePanel
			rolls={detailOf(data, 'dice')?.rolls ?? []}
			previewing={!!runtime.preview || !canRoll}
			expr={expr}
			onExpr={setExpr}
			label={label}
			onLabel={setLabel}
			onRoll={(expression, rollLabel) => {
				if (!canRoll) return;
				void run('dice.roll', { expression, ...(rollLabel ? { label: rollLabel } : {}) }).then(
					(outcome) => {
						if (!outcome.ok) Toaster.error(outcome.message);
					},
				);
			}}
		/>
	);
}

function QuickRolls({ widget, data, onCommand }: WidgetTemplateProps) {
	const { t } = useI18n();
	const formulas = (cfg<string>(widget, 'formulas') ?? 'd20')
		.split(',')
		.map((f) => f.trim())
		.filter(Boolean);

	// The last session roll matching one of this widget's formulas (actor-filtered history). The
	// engine records the CANONICAL expression ('d20' → '1d20'), so canonicalize before comparing.
	const canonical = (f: string): string => {
		const parsed = parseDiceExpression(f);
		return parsed.ok ? parsed.expression.source : f;
	};
	const rolls = detailOf(data, 'dice')?.rolls ?? [];
	const formulaSet = new Set(formulas.map(canonical));
	let lastRoll = null;
	for (let i = rolls.length - 1; i >= 0; i -= 1) {
		const roll = rolls[i]!;
		if (formulaSet.has(roll.expression)) {
			lastRoll = roll;
			break;
		}
	}

	// Only a widget whose definition DECLARES dice.roll gets a live affordance. RC-SES-6.2 — it rolls
	// in every workflow state; a roll outside a live session is kept but stays out of the session log.
	const canRoll = !!onCommand && declares(widget, 'dice.roll') && formulas.length > 0;
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
				{formulas.map((f) => (
					<Chip key={f} tone="accent">
						{f}
					</Chip>
				))}
			</div>
			<div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
				<OpChip
					icon="dice"
					label={t('widgetBody.dice.roll')}
					ariaLabel={t('widgetBody.dice.rollAria', {
						expression: formulas[0] ?? t('widgetBody.dice.dice'),
					})}
					onPress={canRoll ? () => onCommand('dice.roll', { expression: formulas[0] }) : undefined}
				/>
				{/* The readout used to be a bare <span> carrying an `aria-label`. `role=generic`
				    PROHIBITS an accessible name, so the careful "Last result for 1d20: 15" wording
				    reached nobody — and mutating the text in place announced nothing either, so
				    pressing Roll produced no output at all for a screen-reader user. The region is
				    mounted permanently (empty before the first roll): a live region inserted TOGETHER
				    with its text is routinely dropped. The number appears exactly ONCE in the DOM —
				    only the descriptive prefix is visually hidden — so no locator becomes ambiguous. */}
				<span
					role="status"
					style={{
						font: '700 var(--text-sm) var(--font-mono)',
						color: 'var(--color-text-primary)',
					}}
				>
					{lastRoll && (
						<>
							<span style={SR_ONLY}>
								{t('widgetBody.dice.lastResult', { expression: lastRoll.expression })}{' '}
							</span>
							= {lastRoll.total}
						</>
					)}
				</span>
			</div>
		</div>
	);
}
