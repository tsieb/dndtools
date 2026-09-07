import { useState } from 'react';
import { rollExpression } from '@dndtools/core';
import { Icon } from '../../ds';
import { T, srOnly } from '../screen-kit';
import type { MessageKey, MessageValues } from '../../i18n';

/**
 * RC-SES-2.2 — the control an inline `[[roll:1d20+5|Stealth check]]` renders as, wherever the prose
 * is read: the DM's Knowledge note, the public wiki reader, a player's handout.
 *
 * WHY THE SEED IS DRAWN HERE. The outcome must be computed exactly once and must be the SAME number
 * in the chip the presser sees and in the session log everyone else sees. So this component draws a
 * 32-bit seed, evaluates the expression locally with the core's own `rollExpression`, and hands the
 * SAME seed to the host's logger. `dice.roll` re-evaluates from that seed in the Processing Core and
 * — by the determinism contract this expression/seed pair is built on — lands on the same total. The
 * chip is never a guess at what the log will say.
 *
 * WHEN THERE IS NO SESSION. A note is read out of session at least as often as in one. The press
 * still rolls, and the chip says plainly that the result was not recorded, rather than refusing the
 * control (a dead button) or claiming a log entry that does not exist. A malformed expression gets
 * an honest error chip, not a number.
 */

type Translate = (key: MessageKey, values?: MessageValues) => string;

/**
 * Record an inline roll in the session log with `source: 'inline'`. Given the drawn seed so the log
 * and the chip cannot disagree. Resolves `true` when the roll was recorded, `false` when it was not
 * (no live session, or the command was refused) — never throws a toast at the reader for the latter,
 * because reading a note outside a session is normal, not an error.
 */
export type InlineRollLogger = (roll: {
	expression: string;
	seed: number;
	label?: string;
}) => Promise<boolean> | boolean;

/** A resolved press: the number, how it was made, and whether anyone else can see it. */
interface RollChip {
	total: number;
	dice: number[];
	logged: boolean;
}

/** Draw a 32-bit seed. `crypto` is present in every runtime this app ships to (browser + Electron). */
function drawSeed(): number {
	const buffer = new Uint32Array(1);
	crypto.getRandomValues(buffer);
	return buffer[0]!;
}

export function RollButton({
	expression,
	label,
	t,
	log,
}: {
	expression: string;
	label?: string;
	t: Translate;
	log?: InlineRollLogger;
}) {
	const [chip, setChip] = useState<RollChip | null>(null);
	const [invalid, setInvalid] = useState(false);
	const [busy, setBusy] = useState(false);

	const text = label ?? expression;

	async function roll(): Promise<void> {
		if (busy) return;
		setBusy(true);
		try {
			const seed = drawSeed();
			const rolled = rollExpression(expression, seed);
			if (!rolled.ok) {
				setChip(null);
				setInvalid(true);
				return;
			}
			setInvalid(false);
			const logged = (await log?.({ expression, seed, ...(label ? { label } : {}) })) ?? false;
			setChip({ total: rolled.result.total, dice: rolled.result.kept, logged });
		} finally {
			setBusy(false);
		}
	}

	// The dice breakdown, for the title and the screen-reader line: `1d20+5 · 14 → 19`.
	const breakdown = chip ? `${expression} · ${chip.dice.join(' + ')}` : '';

	return (
		<span style={{ whiteSpace: 'nowrap' }}>
			<button
				type="button"
				onClick={() => void roll()}
				title={t('markdown.rollTitle', { expression })}
				style={{
					font: `inherit`,
					padding: '1px 6px',
					border: `1px solid ${T.bdS}`,
					borderRadius: 6,
					background: T.alt,
					color: T.acc,
					cursor: 'pointer',
					verticalAlign: 'baseline',
				}}
			>
				<Icon name="dice" size="sm" style={{ marginRight: 4, verticalAlign: '-2px' }} />
				<span style={{ whiteSpace: 'normal' }}>{text}</span>
				<span style={srOnly}> {t('markdown.rollAria', { expression })}</span>
			</button>
			{invalid && (
				<span
					role="status"
					style={{ font: `12px ${T.sans}`, color: T.warn, marginLeft: 6, fontStyle: 'italic' }}
				>
					{t('markdown.rollInvalid')}
				</span>
			)}
			{chip && (
				<span
					role="status"
					title={breakdown}
					style={{
						font: `600 12.5px ${T.mono}`,
						color: T.ink,
						background: T.alt,
						border: `1px solid ${chip.logged ? T.acc : T.bdS}`,
						borderRadius: 6,
						padding: '1px 6px',
						marginLeft: 6,
					}}
				>
					{chip.total}
					<span style={srOnly}>
						{' '}
						{breakdown}. {chip.logged ? t('markdown.rollRecorded') : t('markdown.rollNotRecorded')}
					</span>
					{!chip.logged && (
						<span
							aria-hidden="true"
							style={{ font: `11px ${T.sans}`, color: T.ter, marginLeft: 5, fontWeight: 400 }}
						>
							{t('markdown.rollLocal')}
						</span>
					)}
				</span>
			)}
		</span>
	);
}
