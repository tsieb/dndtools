import { getDiceHistoryForActor, parseDiceExpression } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import type { BoardWidget } from '../../board-helpers';
import { useI18n } from '../../../i18n';
import {
	Chip,
	OpChip,
	SR_ONLY,
	bodyWrap,
	cfg,
	useSessionOnlyReason,
	type WidgetCommandHandler,
} from '../../widget-body-kit';

/**
 * Moved from `app/widget-bodies.tsx` by RC-WID-4.1 — the file grew past what one module should
 * hold once every system widget type gained a body, so each hand-written body now lives in its own
 * file under `app/widgets/builtin/`. This is a pure move: the component below is byte-for-byte the
 * one that used to sit in `widget-bodies.tsx`.
 */

export function DiceBody({
	widget,
	onCommand,
}: {
	widget: BoardWidget;
	onCommand?: WidgetCommandHandler;
}) {
	const runtime = useRuntime();
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
	const history = getDiceHistoryForActor(
		runtime.state.session,
		runtime.state.permissions,
		runtime.defaultActorId,
	);
	const formulaSet = new Set(formulas.map(canonical));
	let lastRoll = null;
	for (let i = history.rolls.length - 1; i >= 0; i -= 1) {
		const roll = history.rolls[i];
		if (formulaSet.has(roll.expression)) {
			lastRoll = roll;
			break;
		}
	}

	// Only a widget whose definition DECLARES dice.roll gets a live affordance.
	const canRoll = !!onCommand && widget.commands.includes('dice.roll') && formulas.length > 0;
	const sessionOnly = useSessionOnlyReason();
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
					unavailableReason={sessionOnly}
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
