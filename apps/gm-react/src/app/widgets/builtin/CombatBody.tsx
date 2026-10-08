import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCombatTrackerForActor, listEncountersForActor } from '@dndtools/core';
import { Toaster, useConditionCatalog } from '../../../ds';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import type { BoardWidget } from '../../board-helpers';
import { EncounterDialog } from '../../EncounterBuilder';
import { Chip, Muted, StatPill, bodyWrap, cfg } from '../../widget-body-kit';
import { CombatPanel } from '../../../screens/session/CombatTracker';
import { ConditionPickerDialog } from '../../../screens/session/ConditionPickerDialog';
import { EndCombatDialog } from '../../../screens/session/Lifecycle';
import {
	useCombatView,
	useRoster,
	useSessionDispatch,
	useSessionScenes,
	useSessionSeat,
} from '../../../screens/session/useSessionView';
import { LiveStats } from './live';

/**
 * The `combat` widget. Its default view is the Command Center glance (RC-WID-4.1): the live tracker
 * at a glance plus the most recently touched prepared encounter. Its `tracker` view is the Session
 * screen's combat tracker (RC-CAN-7.8, SCREENS_PARITY SE-07–SE-14, SE-33–SE-37, SE-42–SE-44).
 */
export function CombatBody({
	widget,
	interactive,
}: {
	widget: BoardWidget;
	/** View mode: the tracker binds its keys and writes. Edit mode keeps it inert. */
	interactive: boolean;
}) {
	return cfg<string>(widget, 'view') === 'tracker' ? (
		<CombatTrackerView interactive={interactive} />
	) : (
		<CombatGlance widget={widget} />
	);
}

/**
 * `showChallenge` only ever has something to show when the ACTIVE system package declares a
 * challenge budget: `EncounterView.challenge` is `null` under a package with no challenge ratings or
 * levels (RC-SYS-2.5), and the chip goes away with it rather than quoting 5e math at a system that
 * has neither. Encounters are DM-only in the core, so a player sees the tracker line and nothing
 * about the DM's prep.
 */
function CombatGlance({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const showChallenge = cfg<boolean>(widget, 'showChallenge') ?? true;
	const tracker = getCombatTrackerForActor(
		runtime.state.session.combat,
		runtime.state.permissions,
		actorId,
	);
	const running = tracker.status === 'running';
	const active =
		tracker.combatants.find((c) => c.isActive) ??
		tracker.combatants.find((c) => c.id === tracker.activeCombatantId) ??
		null;
	const encounters = listEncountersForActor(
		runtime.state.encounters,
		runtime.state.permissions,
		actorId,
		runtime.state.systems,
	);
	const latest = encounters.reduce<(typeof encounters)[number] | null>(
		(newest, encounter) =>
			newest === null || encounter.updatedAt > newest.updatedAt ? encounter : newest,
		null,
	);
	return (
		<div style={bodyWrap}>
			<LiveStats>
				<StatPill
					label={t('widgetBody.initiative.round')}
					value={running ? String(tracker.round) : '—'}
				/>
				<StatPill
					label={t('widgetBody.initiative.turn')}
					value={running ? (active?.name ?? `#${tracker.turn + 1}`) : '—'}
				/>
			</LiveStats>
			{latest ? (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					<Chip>{latest.title}</Chip>
					{showChallenge && latest.challenge && (
						<Chip tone="accent">
							{t(`widgetBody.combat.difficulty.${latest.challenge.difficulty}`)}
						</Chip>
					)}
				</div>
			) : (
				<Muted>{t('widgetBody.combat.noEncounter')}</Muted>
			)}
			{!running && <Muted>{t('widgetBody.combat.notRunning')}</Muted>}
		</div>
	);
}

/**
 * The combat tracker: `combat.advance-turn/previous-turn/apply-resource/end` plus the mid-fight
 * roster ops `combat.add-combatants/remove-combatant/reorder-combatant/set-combatant-visibility` over
 * `getCombatTrackerForActor`, and the encounter builder (`encounter.build` → `combat.start`, or
 * `combat.add-combatants` to reinforce). Rows follow the DS InitiativeRow anatomy with a
 * ConditionBadge per condition from the active package's registry.
 */
function CombatTrackerView({ interactive }: { interactive: boolean }) {
	const { t } = useI18n();
	const { actorId, isDm, previewing: viewingAs } = useSessionSeat();
	// Edit mode leaves the tracker on screen but out of play: no bare-key model on `window` while the
	// GM rearranges the screen, and no writes.
	const previewing = viewingAs || !interactive;
	const dispatch = useSessionDispatch();
	const { tracker, activeMapId, marchingOrder } = useCombatView();
	const { characters, party } = useRoster();
	const { activeSceneName } = useSessionScenes();
	// RC-SES-3.1 — names an expired condition for the round-tick toast, from the ACTIVE package.
	const conditionCatalog = useConditionCatalog();
	const runtime = useRuntime();

	const [selectedId, setSelectedId] = useState<string | null>(null);
	// 'start' builds `encounter.build` → `combat.start`; 'reinforce' adds to running combat.
	const [builderMode, setBuilderMode] = useState<'start' | 'reinforce' | null>(null);
	// The combatant the condition picker is open for.
	const [condPickFor, setCondPickFor] = useState<string | null>(null);
	// `combat.end` discards the round, the order, and every combatant's HP and conditions, and the
	// core has no restore command, so it confirms.
	const [endConfirmOpen, setEndConfirmOpen] = useState(false);

	// The "Build encounter" launchers (⌘K palette, the shell's Create menu) hand this widget an
	// intent rather than a bare navigation. Consumed once, then cleared.
	const location = useLocation();
	const navigate = useNavigate();
	useEffect(() => {
		if (!interactive) return;
		const intent = (location.state ?? null) as { createEncounter?: boolean } | null;
		if (intent?.createEncounter) {
			setBuilderMode('start');
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [interactive, location.state, location.pathname, navigate]);

	/**
	 * RC-SES-3.1 — advance the turn, and SAY what the round tick took off: a condition badge that
	 * silently disappears between rounds is indistinguishable from a bug. One expiry is named; several
	 * are counted.
	 */
	async function advanceTurn(): Promise<void> {
		const result = await runtime.dispatch({ type: 'combat.advance-turn', actorId, payload: {} });
		if (result.status !== 'accepted') {
			Toaster.error(result.rejection.message);
			return;
		}
		const expired = result.events.filter((e) => e.kind === 'combat.condition-expired');
		if (expired.length === 0) return;
		if (expired.length === 1) {
			const only = expired[0]!;
			Toaster.info(
				t('session.combat.conditionExpired', {
					condition: conditionCatalog.registry[only.condition]?.label ?? only.condition,
					name: tracker.combatants.find((c) => c.id === only.combatantId)?.name ?? '',
				}),
			);
			return;
		}
		Toaster.info(t('session.combat.conditionExpiredMany', { count: expired.length }));
	}

	const selected = tracker.combatants.find((c) => c.id === selectedId) ?? null;
	const condPickTarget = tracker.combatants.find((c) => c.id === condPickFor) ?? null;

	return (
		<div>
			<CombatPanel
				tracker={tracker}
				isDm={isDm}
				selectedId={selectedId}
				selected={selected}
				previewing={previewing}
				onStart={() => setBuilderMode('start')}
				onAdd={() => setBuilderMode('reinforce')}
				onSelect={setSelectedId}
				onAdvance={() => void advanceTurn()}
				onPrevious={() => dispatch({ type: 'combat.previous-turn', actorId, payload: {} })}
				onEnd={() => setEndConfirmOpen(true)}
				onHp={(combatantId, delta) =>
					dispatch({
						type: 'combat.apply-resource',
						actorId,
						payload: { combatantId, kind: 'hp', delta },
					})
				}
				// RC-SES-3.2 — the HP sheet's Temp action: `temp-hp` sets a VALUE (the core keeps the
				// higher of the two), unlike `hp`, which takes a delta.
				onTempHp={(combatantId, value) =>
					dispatch({
						type: 'combat.apply-resource',
						actorId,
						payload: { combatantId, kind: 'temp-hp', value },
					})
				}
				onCondition={(combatantId, condition, present) =>
					dispatch({
						type: 'combat.apply-resource',
						actorId,
						payload: { combatantId, kind: 'condition', condition, present },
					})
				}
				onPickCondition={(combatantId) => setCondPickFor(combatantId)}
				// RC-CHR-1.3 — the dying combatant's death-save track.
				onDeathSave={(combatantId, outcome) =>
					dispatch({
						type: 'combat.apply-resource',
						actorId,
						payload: { combatantId, kind: 'death-save', outcome },
					})
				}
				// RC-CHR-1.3 — report the concentration check damage raised. The toast says which answer
				// landed, because both are one press apart and both are durable.
				onConcentrationCheck={(combatantId, name, outcome) =>
					dispatch(
						{
							type: 'combat.apply-resource',
							actorId,
							payload: { combatantId, kind: 'concentration-check', outcome },
						},
						t(
							outcome === 'kept' ? 'session.combat.concKeptToast' : 'session.combat.concLostToast',
							{ name },
						),
					)
				}
				onRemove={(combatantId, name) =>
					dispatch(
						{ type: 'combat.remove-combatant', actorId, payload: { combatantId } },
						`${name} removed from combat`,
					)
				}
				onReorder={(combatantId, direction) =>
					dispatch({
						type: 'combat.reorder-combatant',
						actorId,
						payload: { combatantId, direction },
					})
				}
				onVisibility={(combatantId, hidden) =>
					dispatch(
						{
							type: 'combat.set-combatant-visibility',
							actorId,
							payload: { combatantId, hidden },
						},
						hidden ? 'Hidden from players' : 'Revealed to players',
					)
				}
			/>
			<EncounterDialog
				mode={builderMode}
				onClose={() => setBuilderMode(null)}
				characters={characters}
				party={party}
				defaultTitle={activeSceneName ? `${activeSceneName} — encounter` : 'Encounter'}
				activeMapId={activeMapId}
				marchingOrder={marchingOrder}
			/>
			<EndCombatDialog
				open={endConfirmOpen}
				round={tracker.round}
				onClose={() => setEndConfirmOpen(false)}
				onConfirm={() => {
					setEndConfirmOpen(false);
					void dispatch({ type: 'combat.end', actorId, payload: {} }, 'Combat ended');
				}}
			/>
			<ConditionPickerDialog
				target={condPickTarget}
				onClose={() => setCondPickFor(null)}
				onPick={(combatantId, condition) => {
					setCondPickFor(null);
					void dispatch({
						type: 'combat.apply-resource',
						actorId,
						payload: { combatantId, kind: 'condition', condition, present: true },
					});
				}}
			/>
		</div>
	);
}
