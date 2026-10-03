import { useState } from 'react';
import { happenedLive, type DiceRollView, type EvaluatedDiceTerm } from '@dndtools/core';
import { Badge, DiceResult, Icon, IconButton } from '../../ds';
import { Seg, T, eb } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { sgn } from '../../app/character/abilities';
import { InitiativeCallCard, Panel, PvPage, SectionHead } from './shared';
import type { InitiativeCallView } from '../../net/viewModels';
import { useI18n } from '../../i18n';

// 3 · DICE — the REAL table roller: every roll dispatches `dice.roll` AS the player actor and is
// recorded in the shared, durable session log (the same history the DM's /session panel reads). The
// log below is the actor-filtered `getDiceHistoryForActor` view — the player's own rolls plus every
// session-visible roll at the table. RC-SES-7.1 — the dice roll in Standby too: the Core records the
// roll stamped with the workflow it was made in, the result shows here, and a one-line note says that
// only rolls made during a live session reach the table log.
const DICE = [20, 12, 10, 8, 6, 4];

/** Natural 20/1 detection on a RECORDED roll: exactly one d20 term keeping a single die. */
export function critOf(roll: DiceRollView): 'success' | 'fail' | undefined {
	const diceTerms = roll.terms.filter((t): t is EvaluatedDiceTerm => t.kind === 'dice');
	if (diceTerms.length !== 1) return undefined;
	const term = diceTerms[0];
	if (term.sides !== 20 || term.kept.length !== 1) return undefined;
	return term.kept[0] === 20 ? 'success' : term.kept[0] === 1 ? 'fail' : undefined;
}

export function DiceSection({
	rolls,
	sessionActive,
	viewer,
	actorName,
	onRoll,
	initiativeCall,
	onRollInitiative,
}: {
	rolls: DiceRollView[];
	sessionActive: boolean;
	viewer: string;
	actorName: (id: string) => string;
	onRoll: (expression: string, label: string) => Promise<DiceRollView | null>;
	/** RC-SES-5.1 — the DM's open initiative call (null when none is open). */
	initiativeCall: InitiativeCallView | null;
	onRollInitiative: () => Promise<void>;
}) {
	const { t } = useI18n();
	const viewport = useViewport();
	const [mode, setMode] = useState<'normal' | 'adv' | 'dis'>('normal');
	const [mod, setMod] = useState(0);
	// Compose the core dice expression: advantage/disadvantage use the parser's keep syntax
	// (`2d20kh1` / `2d20kl1`) so the RECORDED roll carries both faces and the kept one.
	const rollOne = (faces: number) => {
		const term =
			faces === 20 && mode === 'adv'
				? '2d20kh1'
				: faces === 20 && mode === 'dis'
					? '2d20kl1'
					: `1d${faces}`;
		const expression = `${term}${mod !== 0 ? (mod > 0 ? `+${mod}` : String(mod)) : ''}`;
		const label = `d${faces}${
			faces === 20 && mode !== 'normal'
				? ` · ${t(mode === 'adv' ? 'play.dice.advantageLabel' : 'play.dice.disadvantageLabel')}`
				: ''
		}`;
		void onRoll(expression, label);
	};
	// Newest first for display; the query returns the durable log oldest-first.
	const recent = [...rolls].reverse().slice(0, 16);
	return (
		<PvPage max={920}>
			<SectionHead title={t('play.dice.title')} sub={t('play.dice.sub')} />
			{!sessionActive && (
				<div
					data-testid="play-dice-standby-note"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: T.space.two,
						marginBottom: T.space.four,
						font: `12.5px ${T.sans}`,
						color: T.sub,
					}}
				>
					<Icon name="info" size={14} color={T.ter} />
					<span>{t('play.dice.standbyNote')}</span>
				</div>
			)}
			{initiativeCall && (
				<div style={{ marginBottom: T.space.four }}>
					<InitiativeCallCard call={initiativeCall} onRoll={onRollInitiative} />
				</div>
			)}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns:
						viewport === 'phone' ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)',
					gap: T.space.four,
					alignItems: 'start',
				}}
			>
				<Panel title={t('play.dice.roll')} pad={16}>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: T.space.two }}>
						{DICE.map((f) => (
							<button
								key={f}
								type="button"
								onClick={() => rollOne(f)}
								style={{
									padding: `${T.space.four} ${T.space.zero}`,
									borderRadius: T.radius.lg,
									cursor: 'pointer',
									border: `1px solid ${T.bd}`,
									background: T.alt,
									color: T.ink,
									font: `700 17px ${T.mono}`,
								}}
							>
								d{f}
							</button>
						))}
					</div>
					<div style={{ marginTop: T.space.three }}>
						<div style={{ ...eb, marginBottom: T.space.oneHalf }}>{t('play.dice.d20Mode')}</div>
						<Seg
							ariaLabel={t('play.dice.d20Mode')}
							value={mode}
							onChange={(v) => setMode(v as 'normal' | 'adv' | 'dis')}
							options={[
								{ value: 'dis', label: t('play.dice.disadvantage') },
								{ value: 'normal', label: t('play.dice.normal') },
								{ value: 'adv', label: t('play.dice.advantage') },
							]}
						/>
					</div>
					<div
						style={{
							marginTop: T.space.three,
							display: 'flex',
							alignItems: 'center',
							gap: T.space.two,
						}}
					>
						<span style={eb}>{t('play.dice.modifier')}</span>
						<IconButton
							icon="chevron-down"
							label={t('play.dice.decrement')}
							variant="ghost"
							size="sm"
							onClick={() => setMod((m) => m - 1)}
						/>
						<span
							style={{
								font: `700 16px ${T.mono}`,
								color: T.acc,
								minWidth: 34,
								textAlign: 'center',
							}}
						>
							{sgn(mod)}
						</span>
						<IconButton
							icon="chevron-up"
							label={t('play.dice.increment')}
							variant="ghost"
							size="sm"
							onClick={() => setMod((m) => m + 1)}
						/>
					</div>
				</Panel>
				<Panel
					title={t('play.dice.log')}
					pad={14}
					action={
						<Badge status="neutral">{t('play.dice.recorded', { count: rolls.length })}</Badge>
					}
				>
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: T.space.two,
							maxHeight: 460,
							overflow: 'auto',
						}}
					>
						{recent.length === 0 && (
							<div
								style={{
									font: `12.5px ${T.sans}`,
									color: T.ter,
									padding: `${T.space.three} ${T.space.zero}`,
									textAlign: 'center',
								}}
							>
								{t('play.dice.noRolls')}
							</div>
						)}
						{recent.map((d) => (
							<div key={d.id}>
								<div style={{ font: `10.5px ${T.sans}`, color: T.ter, marginBottom: T.space.half }}>
									{d.actorId === viewer ? t('play.dice.you') : actorName(d.actorId)}
									{!happenedLive(d) ? ` · ${t('session.dice.outsideSession')}` : ''}
									{d.label ? ` · ${d.label}` : ''}
								</div>
								<DiceResult
									notation={d.expression}
									total={d.total}
									rolls={d.dice}
									modifier={d.modifier}
									crit={critOf(d)}
								/>
							</div>
						))}
					</div>
				</Panel>
			</div>
		</PvPage>
	);
}
