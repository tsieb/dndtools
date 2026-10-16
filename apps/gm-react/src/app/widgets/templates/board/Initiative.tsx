import type { CombatTrackerView, ResolvedTurnModel } from '@dndtools/core';
import { useI18n } from '../../../../i18n';
import { Muted, StatPill, bodyWrap, cfg } from '../../../widget-body-kit';
import { useViewport } from '../../../useViewport';
import { LiveStats } from '../../builtin/live';
import type { WidgetTemplateProps } from '../shared';
import { declares, detailOf, useWidgetCommandRunner } from './boardData';
import { InitiativeTrackerCompact } from './InitiativeCompact';
import { NextTurnControl } from './NextTurnControl';

/** No fight: what the tile draws before combat starts, or without a combat query to read. */
const NO_COMBAT: CombatTrackerView = {
	status: 'idle',
	encounterId: null,
	round: 0,
	turn: 0,
	combatants: [],
	activeCombatantId: null,
	log: [],
	hiddenCount: 0,
	revision: 0,
};

/** The turn model a tile without a combat query assumes: a counted, ordered round of turns. */
const ROUND_OF_TURNS: ResolvedTurnModel = {
	kind: 'initiative',
	ordered: true,
	spotlight: false,
	rounds: true,
	actionsPerTurn: null,
	initiativeFormula: null,
};

/**
 * `initiative` — the GM board's initiative tile (RC-WID-5.7; the `initiative-tracker` builtin body
 * until then, unchanged on screen). The order and the active system's turn model come from the
 * definition's `current-combatants` query, SES-002's actor-filtered tracker (hidden combatants
 * already redacted). Next turn, the HP keypad and hide/reveal run the declared `combat.*` commands.
 */
export function InitiativeTemplate({ widget, data, onCommand }: WidgetTemplateProps) {
	const { t } = useI18n();
	const viewport = useViewport();
	const showHp = cfg<boolean>(widget, 'showHp') ?? true;
	const combat = detailOf(data, 'combat');
	// RC-SYS-2.7 — the active package's turn model decides whether the tracker counts rounds at all
	// and whether the cursor means "whose turn" or "the spotlight" (RC-SYS-2.4's ResolvedTurnModel).
	const turnModel = combat?.turnModel ?? ROUND_OF_TURNS;
	// RC-CAN-5.3 — on a phone this tile IS the tracker, so it draws the order itself rather than a
	// three-pill summary the DM has to leave the board to act on. Hooks above run either way.
	const compact = viewport === 'phone';
	const tracker = combat?.tracker ?? NO_COMBAT;
	const { run } = useWidgetCommandRunner(widget);
	// VIEW mode only (`onCommand` present), and only for a command the definition declares.
	const runnable = (type: string) =>
		onCommand && declares(widget, type)
			? (payload: Record<string, unknown>) => run(type, payload)
			: undefined;
	const advance = runnable('combat.advance-turn');
	const running = tracker.status === 'running';
	const active =
		tracker.combatants.find((c) => c.isActive) ??
		tracker.combatants.find((c) => c.id === tracker.activeCombatantId) ??
		null;
	const orderNames = tracker.combatants.map((c) => c.name);
	if (compact)
		return (
			<InitiativeTrackerCompact
				tracker={tracker}
				isDm={data.isDm}
				showHp={showHp}
				interactive={!!onCommand}
				onAdvance={advance && (() => advance({}))}
				onApplyResource={runnable('combat.apply-resource')}
				onSetVisibility={runnable('combat.set-combatant-visibility')}
			/>
		);
	return (
		// Natural height, not the tile's: content past the tile edge scrolls in the frame's region.
		<div style={{ ...bodyWrap, height: 'auto', minHeight: '100%', overflow: 'visible' }}>
			{/* RC-CAN-5.5 — the readout and its one control share a row (wrapping only when the tile is
			    too narrow), so the default tile still has room for the combat-state line under them. */}
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 'var(--space-2)',
				}}
			>
				{/* RC-WID-4.4 — the round and whose turn it is ARE this tile's value: announce them. */}
				<LiveStats>
					{turnModel.rounds && (
						<StatPill
							label={t('widgetBody.initiative.round')}
							value={running ? String(tracker.round) : '—'}
						/>
					)}
					<StatPill
						label={
							turnModel.spotlight
								? t('widgetBody.initiative.spotlight')
								: t('widgetBody.initiative.turn')
						}
						value={running ? (active?.name ?? `#${tracker.turn + 1}`) : '—'}
					/>
					{running && showHp && active?.resources && (
						<StatPill
							label={t('widgetBody.initiative.hp')}
							value={`${active.resources.hp} / ${active.resources.maxHp}`}
						/>
					)}
				</LiveStats>
				{/* RC-WID-4.2 — the tile's own operate control; see `NextTurnControl.tsx`. It leads the
				    row when the readout wraps (RC-ENG-8.15): at Fit a rail tile shows about 50px of
				    body, and a Next turn wrapped under the readout rested out of view. */}
				<div style={{ display: 'flex', justifyContent: 'flex-end', marginLeft: 'auto', order: -1 }}>
					<NextTurnControl running={running} onAdvance={advance && (() => advance({}))} />
				</div>
			</div>
			{running && orderNames.length > 0 ? (
				<Muted>
					{orderNames.slice(0, 3).join(' · ')}
					{orderNames.length > 3 ? ` +${orderNames.length - 3}` : ''}
				</Muted>
			) : (
				<Muted>
					{showHp
						? t('widgetBody.initiative.noneHpShown')
						: t('widgetBody.initiative.noneHpHidden')}
				</Muted>
			)}
		</div>
	);
}
