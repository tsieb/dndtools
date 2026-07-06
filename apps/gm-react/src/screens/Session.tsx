import { useEffect, useMemo, useState } from 'react';
import {
	addDays,
	allowedTransitionsFrom,
	daysInMonth,
	getCalendarContinuityForActor,
	getCombatTrackerForActor,
	getDiceHistoryForActor,
	getHandoutsForActor,
	getHandoutStatusForDm,
	getSessionAudioView,
	listAudioAssetsForActor,
	listAudioSourceClassificationsForActor,
	listCharactersForActor,
	listMapsForActor,
	listScenesForActor,
	type CalendarDefinition,
	type CombatTrackerView,
	type CustomDate,
	type SessionWorkflowState,
} from '@dndtools/core';
import {
	Avatar,
	Badge,
	Button,
	Card,
	CONDITIONS,
	ConditionBadge,
	DiceResult,
	Dialog,
	EmptyState,
	Field,
	HPBar,
	Icon,
	IconButton,
	Input,
	Select,
	Slider,
	StatPill,
	StatusDot,
	Textarea,
	VisibilityChip,
} from '../ds';
import { Toaster } from '../ds';
import { EncounterDialog } from '../app/EncounterBuilder';
import { Page, Panel, Seg, SetRow, T, eb, mono } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Session — the live-play console, wired to the real Processing Core (was a local-reducer mock).
 * It runs the session lifecycle (`session.set-workflow`), the encounter builder (a composition
 * dialog over the real character roster dispatching `encounter.build` → `combat.start`), the combat
 * tracker (`combat.advance-turn/previous-turn/apply-resource/end` plus the mid-fight roster ops
 * `combat.add-combatants/remove-combatant/reorder-combatant/set-combatant-visibility` over
 * `getCombatTrackerForActor`), the dice roller (`dice.roll` over `getDiceHistoryForActor`), handout
 * delivery (`session.deliver-handout/revoke-handout/acknowledge-handout`), now-playing session audio
 * (`session.audio.pause/resume/stop/set-volume`), the active-map stage
 * (`session.set-active-map/project-active-map`), and the campaign date (`session.set-campaign-date`
 * over `getCalendarContinuityForActor` — the control the Campaign timeline points at). Combat, dice,
 * and delivery are Processing-Core gated to the live (`active`) workflow, so the console guides the
 * DM to go live first. Reads are actor-filtered, so previewing as a player projects the player-safe
 * view; every durable write is rejected read-only while previewing. Tracker rows follow the DS
 * InitiativeRow anatomy (mono initiative · avatar with gold turn ring · gold active left rail ·
 * HPBar) with per-condition ConditionBadge chips from the CONDITIONS registry (distinct icon per
 * condition — the grayscale-safe contract). The spatial widget board lives on `/board` and
 * `/scene/:id`; this screen is the combat hot path.
 */

type HandoutView = ReturnType<typeof getHandoutsForActor>[number];
type HandoutStatusView = ReturnType<typeof getHandoutStatusForDm>[number];
type SessionAudioView = ReturnType<typeof getSessionAudioView>;
type MapEntry = ReturnType<typeof listMapsForActor>[number];
type ContinuityDate = NonNullable<ReturnType<typeof getCalendarContinuityForActor>['currentDate']>;
type CombatantRow = CombatTrackerView['combatants'][number];

export function Session() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const workflow = runtime.state.session.workflow;
	const isLive = workflow === 'active';
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';

	const {
		tracker,
		dice,
		characters,
		party,
		activeSceneName,
		activeSceneId,
		handouts,
		handoutStatus,
		audio,
		audioLabel,
		maps,
		activeMapId,
		players,
		calendar,
		campaignDate,
	} = useMemo(() => {
		const session = runtime.state.session;
		const perms = runtime.state.permissions;
		const tracker = getCombatTrackerForActor(session.combat, perms, actorId);
		const dice = getDiceHistoryForActor(session, perms, actorId);
		const characters = listCharactersForActor(runtime.state.characters, perms, actorId);
		const scenes = listScenesForActor(runtime.state.scenes, perms, actorId);
		const activeSceneId = session.activeSceneId;
		const audioView = getSessionAudioView(runtime.state.audio, session.audioPlayback, perms, actorId);
		// Resolve the now-playing track to a friendly title (asset title, else source display name) — the
		// track view carries only ids, so a raw uuid would otherwise show in the "Now playing" strip.
		const aTrack = audioView.track;
		const audioLabel = aTrack
			? ((aTrack.assetId
					? listAudioAssetsForActor(runtime.state.audio, perms, actorId).find((a) => a.id === aTrack.assetId)?.title
					: undefined) ??
				listAudioSourceClassificationsForActor(runtime.state.audio, perms, actorId).find((s) => s.sourceId === aTrack.sourceId)?.displayName ??
				aTrack.assetId ??
				aTrack.sourceId)
			: null;
		// SES-012 — the campaign calendar + current date (the Campaign timeline reads the same view).
		const calendar = (Object.values(runtime.state.content.calendars)[0] ?? null) as CalendarDefinition | null;
		const campaignDate = getCalendarContinuityForActor(
			session,
			runtime.state.content,
			runtime.state.maps,
			perms,
			actorId,
			'long',
		).currentDate;
		return {
			tracker,
			dice,
			characters,
			party: characters.filter((c) => c.kind === 'pc'),
			activeSceneName: scenes.find((s) => s.id === activeSceneId)?.name ?? null,
			activeSceneId,
			handouts: getHandoutsForActor(session, perms, actorId),
			handoutStatus: getHandoutStatusForDm(session, perms, actorId),
			audio: audioView,
			audioLabel,
			maps: listMapsForActor(runtime.state.maps, perms, actorId),
			activeMapId: session.activeMap?.mapId ?? null,
			players: Object.values(perms.actors).filter((a) => a.role === 'player'),
			calendar,
			campaignDate,
		};
	}, [runtime.state, actorId]);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [diceExpr, setDiceExpr] = useState('1d20+7');
	const [handoutTitle, setHandoutTitle] = useState('');
	const [handoutBody, setHandoutBody] = useState('');
	// The encounter-composition dialog: 'start' builds `encounter.build` → `combat.start`;
	// 'reinforce' adds to running combat via `combat.add-combatants`.
	const [builderMode, setBuilderMode] = useState<'start' | 'reinforce' | null>(null);
	// The combatant id the condition-picker dialog is open for (the design-b condPick modal pattern).
	const [condPickFor, setCondPickFor] = useState<string | null>(null);

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0], ok?: string): Promise<boolean> {
		const result = await runtime.dispatch(command);
		if (result.status === 'accepted') {
			if (ok) Toaster.success(ok);
			return true;
		}
		Toaster.error(result.rejection.message);
		return false;
	}

	async function goLive(): Promise<void> {
		const sceneId =
			runtime.state.session.activeSceneId ??
			runtime.state.commandCenter.homeSceneId ??
			listScenesForActor(runtime.state.scenes, runtime.state.permissions, actorId).filter((s) => !s.isTemplate)[0]?.id;
		if (!sceneId) {
			Toaster.warning('Create a scene first.');
			return;
		}
		await dispatch(
			{ type: 'session.set-workflow', actorId, payload: { workflow: 'active', activeSceneId: sceneId } },
			'You are live — combat & dice are open',
		);
	}

	async function deliverHandout(): Promise<void> {
		const title = handoutTitle.trim();
		if (!title) return;
		if (!activeSceneId) {
			Toaster.warning('Go live with a scene first.');
			return;
		}
		if (players.length === 0) {
			Toaster.warning('No players to deliver to.');
			return;
		}
		const ok = await dispatch(
			{
				type: 'session.deliver-handout',
				actorId,
				payload: {
					title,
					sections: [{ heading: title, body: handoutBody.trim(), visibility: 'player-visible' as const }],
					sceneId: activeSceneId,
					recipientActorIds: players.map((p) => p.id),
				},
			},
			`Pushed “${title}” to ${players.length} player${players.length === 1 ? '' : 's'}`,
		);
		if (ok) {
			setHandoutTitle('');
			setHandoutBody('');
		}
	}

	const selected = tracker.combatants.find((c) => c.id === selectedId) ?? null;
	const condPickTarget = tracker.combatants.find((c) => c.id === condPickFor) ?? null;
	const canDeliver = isDm && isLive && !!activeSceneId && players.length > 0;

	return (
		<Page max={1280}>
			<SessionHeader workflow={workflow} sceneName={activeSceneName} onSetWorkflow={(w) => setWorkflow(w)} />

			{!isLive && (
				<Card elevation="flat" padding="md" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, borderColor: T.accBd, background: T.accSub }}>
					<Icon name="info" size="md" color={T.acc} />
					<div style={{ flex: 1 }}>
						<div style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>Session is in standby</div>
						<div style={{ font: `12px ${T.sans}`, color: T.sub }}>Go live to open combat, dice, handouts, and what players see.</div>
					</div>
					<Button variant="primary" size="sm" icon="visibility-players" disabled={previewing || !isDm} onClick={goLive}>
						Go live
					</Button>
				</Card>
			)}

			<div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
				<CombatPanel
					tracker={tracker}
					isLive={isLive}
					isDm={isDm}
					selectedId={selectedId}
					selected={selected}
					previewing={previewing}
					onStart={() => setBuilderMode('start')}
					onAdd={() => setBuilderMode('reinforce')}
					onSelect={setSelectedId}
					onAdvance={() => dispatch({ type: 'combat.advance-turn', actorId, payload: {} })}
					onPrevious={() => dispatch({ type: 'combat.previous-turn', actorId, payload: {} })}
					onEnd={() => dispatch({ type: 'combat.end', actorId, payload: {} }, 'Combat ended')}
					onHp={(combatantId, delta) =>
						dispatch({ type: 'combat.apply-resource', actorId, payload: { combatantId, kind: 'hp', delta } })
					}
					onCondition={(combatantId, condition, present) =>
						dispatch({ type: 'combat.apply-resource', actorId, payload: { combatantId, kind: 'condition', condition, present } })
					}
					onPickCondition={(combatantId) => setCondPickFor(combatantId)}
					onRemove={(combatantId, name) =>
						dispatch({ type: 'combat.remove-combatant', actorId, payload: { combatantId } }, `${name} removed from combat`)
					}
					onReorder={(combatantId, direction) =>
						dispatch({ type: 'combat.reorder-combatant', actorId, payload: { combatantId, direction } })
					}
					onVisibility={(combatantId, hidden) =>
						dispatch(
							{ type: 'combat.set-combatant-visibility', actorId, payload: { combatantId, hidden } },
							hidden ? 'Hidden from players' : 'Revealed to players',
						)
					}
				/>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<DicePanel
						rolls={dice.rolls}
						isLive={isLive}
						previewing={previewing}
						expr={diceExpr}
						onExpr={setDiceExpr}
						onRoll={(expression) => dispatch({ type: 'dice.roll', actorId, payload: { expression } })}
					/>
					<HandoutsPanel
						handouts={handouts}
						status={handoutStatus}
						isDm={isDm}
						isLive={isLive}
						previewing={previewing}
						canDeliver={canDeliver}
						title={handoutTitle}
						body={handoutBody}
						onTitle={setHandoutTitle}
						onBody={setHandoutBody}
						onDeliver={deliverHandout}
						onRevoke={(id) => dispatch({ type: 'session.revoke-handout', actorId, payload: { handoutId: id } }, 'Handout revoked')}
						onAcknowledge={(id) => dispatch({ type: 'session.acknowledge-handout', actorId, payload: { handoutId: id } }, 'Marked read')}
					/>
					<AudioPanel
						audio={audio}
						trackLabel={audioLabel}
						isDm={isDm}
						previewing={previewing}
						onPause={() => dispatch({ type: 'session.audio.pause', actorId, payload: {} })}
						onResume={() => dispatch({ type: 'session.audio.resume', actorId, payload: {} })}
						onStop={() => dispatch({ type: 'session.audio.stop', actorId, payload: {} }, 'Audio stopped')}
						onVolume={(volume) => dispatch({ type: 'session.audio.set-volume', actorId, payload: { volume } })}
					/>
					<StagePanel
						maps={maps}
						activeMapId={activeMapId}
						isDm={isDm}
						isLive={isLive}
						previewing={previewing}
						onSelect={(mapId) => dispatch({ type: 'session.set-active-map', actorId, payload: { mapId } }, 'Active map set')}
						onProject={() => {
							if (players.length === 0) {
								Toaster.warning('No players connected.');
								return;
							}
							void dispatch(
								{ type: 'session.project-active-map', actorId, payload: { playerActorIds: players.map((p) => p.id) } },
								'Map shown to players',
							);
						}}
					/>
					{isDm && (
						<CampaignDatePanel
							calendar={calendar}
							current={campaignDate}
							previewing={previewing}
							onSet={(date, ok) => void dispatch({ type: 'session.set-campaign-date', actorId, payload: { date } }, ok)}
						/>
					)}
					<PartyPanel party={party} />
				</div>
			</div>

			<EncounterDialog
				mode={builderMode}
				onClose={() => setBuilderMode(null)}
				characters={characters}
				party={party}
				defaultTitle={`${activeSceneName ?? 'Skirmish'} — encounter`}
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
		</Page>
	);

	function setWorkflow(target: 'prep' | 'active' | 'recap' | 'idle') {
		if (target === 'active') return void goLive();
		void dispatch({ type: 'session.set-workflow', actorId, payload: { workflow: target } });
	}
}

function SessionHeader({
	workflow,
	sceneName,
	onSetWorkflow,
}: {
	workflow: string;
	sceneName: string | null;
	onSetWorkflow: (w: 'prep' | 'active' | 'recap') => void;
}) {
	const phase = workflow === 'active' ? 'active' : workflow === 'recap' ? 'recap' : 'prep';
	// Only offer phases the core workflow table allows from here, so a click can't fire a rejected
	// transition + error toast (e.g. active→prep, recap→active are not legal). The current phase stays
	// enabled regardless (Seg keeps the checked option active).
	const allowed = new Set<string>(allowedTransitionsFrom(workflow as SessionWorkflowState));
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
			<div style={{ minWidth: 0 }}>
				<div style={eb}>Live session</div>
				<div style={{ font: `700 19px/1.1 ${T.disp}` }}>{sceneName ?? 'No active scene'}</div>
			</div>
			<Seg
				value={phase}
				ariaLabel="Session phase"
				onChange={(v) => onSetWorkflow(v as 'prep' | 'active' | 'recap')}
				options={[
					{ value: 'prep', label: 'Prep', disabled: !allowed.has('prep') },
					{ value: 'active', label: 'Live', disabled: !allowed.has('active') },
					{ value: 'recap', label: 'Recap', disabled: !allowed.has('recap') },
				]}
			/>
			<div style={{ flex: 1 }} />
			<span style={{ display: 'flex', alignItems: 'center', gap: 7, font: `12.5px ${T.sans}`, color: T.sub }}>
				<StatusDot status={workflow === 'active' ? 'live' : 'idle'} pulse={workflow === 'active'} />
				{workflow === 'active' ? (
					<>players see <strong style={{ color: T.ink }}>{sceneName ?? 'the scene'}</strong></>
				) : (
					<>standby</>
				)}
			</span>
		</div>
	);
}

// ── Combat tracker ────────────────────────────────────────────────────────────────────────────────

function CombatPanel({
	tracker,
	isLive,
	isDm,
	selectedId,
	selected,
	previewing,
	onStart,
	onAdd,
	onSelect,
	onAdvance,
	onPrevious,
	onEnd,
	onHp,
	onCondition,
	onPickCondition,
	onRemove,
	onReorder,
	onVisibility,
}: {
	tracker: CombatTrackerView;
	isLive: boolean;
	isDm: boolean;
	selectedId: string | null;
	selected: CombatantRow | null;
	previewing: boolean;
	onStart: () => void;
	onAdd: () => void;
	onSelect: (id: string) => void;
	onAdvance: () => void;
	onPrevious: () => void;
	onEnd: () => void;
	onHp: (id: string, delta: number) => void;
	onCondition: (id: string, condition: string, present: boolean) => void;
	onPickCondition: (id: string) => void;
	onRemove: (id: string, name: string) => void;
	onReorder: (id: string, direction: 'earlier' | 'later') => void;
	onVisibility: (id: string, hidden: boolean) => void;
}) {
	const running = tracker.status === 'running';
	const lowest = tracker.combatants
		.filter((c) => c.resources)
		.reduce<CombatantRow | null>(
			(m, c) => (!m || (c.resources!.hp / Math.max(1, c.resources!.maxHp)) < (m.resources!.hp / Math.max(1, m.resources!.maxHp)) ? c : m),
			null,
		);
	const selectedIndex = selected ? tracker.combatants.findIndex((c) => c.id === selected.id) : -1;

	return (
		<Panel
			title="Combat"
			action={
				running ? (
					<div style={{ display: 'flex', gap: 7 }}>
						{isDm && (
							<Button variant="secondary" size="sm" icon="add" disabled={previewing} onClick={onAdd}>
								Add
							</Button>
						)}
						<Button variant="ghost" size="sm" icon="close" disabled={previewing} onClick={onEnd}>
							End combat
						</Button>
					</div>
				) : (
					<Button variant="primary" size="sm" icon="sword" disabled={!isLive || previewing || !isDm} onClick={onStart}>
						Build encounter
					</Button>
				)
			}
		>
			{!running ? (
				<EmptyState
					icon="sword"
					title={isLive ? 'No combat running' : 'Go live to start combat'}
					description={
						isLive
							? 'Compose an encounter from your roster — party, NPCs, monsters — set initiative, and run it.'
							: 'Combat is open only while the session is live.'
					}
				/>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					<div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
						<StatPill label="Round" value={String(tracker.round)} tone="accent" />
						<StatPill label="Turn" value={String(tracker.turn + 1)} />
						{lowest && lowest.resources && (
							<StatPill label="Lowest HP" value={`${lowest.resources.hp}/${lowest.resources.maxHp}`} tone="error" />
						)}
						<div style={{ flex: 1 }} />
						<IconButton icon="chevron-left" label="Previous turn" variant="ghost" size="sm" disabled={previewing} onClick={onPrevious} />
						<Button variant="primary" size="sm" iconRight="skip" disabled={previewing} onClick={onAdvance}>
							Next turn
						</Button>
					</div>

					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						{tracker.combatants.map((c) => {
							const active = c.id === tracker.activeCombatantId;
							const sel = c.id === selectedId;
							const res = c.resources;
							return (
								// The DS InitiativeRow anatomy (mono initiative · avatar with gold turn ring · gold
								// 3px active left rail · HPBar · quick HP steps), hand-hosted so the row can also
								// carry selection, state badges, and per-condition ConditionBadge chips with the
								// distinct-icon grayscale contract (the plain component renders generic chips only).
								<div
									key={c.id}
									role="button"
									tabIndex={0}
									aria-pressed={sel}
									aria-label={`Select ${c.name}`}
									onClick={() => onSelect(c.id)}
									onKeyDown={(e) => {
										// Only when the ROW itself is focused — Enter/Space bubbling from the nested
										// Heal/Damage/condition buttons must keep their native activation.
										if (e.target !== e.currentTarget) return;
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											onSelect(c.id);
										}
									}}
									style={{
										cursor: 'pointer',
										display: 'flex',
										alignItems: 'center',
										gap: 12,
										padding: '9px 12px',
										borderRadius: 9,
										border: `1px solid ${active ? T.accBd : sel ? T.bdS : T.bd}`,
										borderLeft: `3px solid ${active ? T.acc : 'transparent'}`,
										background: active ? T.accSub : T.surf,
										opacity: c.hidden ? 0.75 : 1,
									}}
								>
									<span style={{ minWidth: 28, textAlign: 'center', font: `700 14px ${T.mono}`, color: active ? T.acc : T.sub }}>
										{c.statBlock.initiative ?? '—'}
									</span>
									<Avatar name={c.name} size="sm" ring={active ? 'turn' : undefined} />
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
											<span style={{ font: `600 13.5px ${T.sans}`, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
											{c.hidden && <VisibilityChip level="dm-only" compact />}
											{active && <Badge status="success">Active</Badge>}
											{c.isBloodied && <Badge status="warning">Bloodied</Badge>}
											{c.isDefeated && <Badge status="error">Down</Badge>}
										</div>
										{res && (
											<div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
												<div style={{ flex: 1, minWidth: 0 }}>
													<HPBar current={res.hp} max={res.maxHp} size="sm" />
												</div>
												<span style={{ font: `11px ${T.mono}`, color: T.ter }}>AC {c.statBlock.ac ?? '—'}</span>
											</div>
										)}
										{res && res.conditions.length > 0 && (
											<div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
												{res.conditions.map((cond) => (
													<ConditionBadge
														key={cond}
														condition={cond}
														compact
														onRemove={previewing ? undefined : () => onCondition(c.id, cond, false)}
													/>
												))}
											</div>
										)}
									</div>
									{res && (
										<div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} onClick={(e) => e.stopPropagation()}>
											<IconButton icon="add" label="Heal 1" variant="ghost" size="sm" disabled={previewing} onClick={() => onHp(c.id, 1)} />
											<IconButton icon="remove" label="Damage 1" variant="ghost" size="sm" disabled={previewing} onClick={() => onHp(c.id, -1)} />
										</div>
									)}
								</div>
							);
						})}
					</div>

					{selected && (
						<div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
							<div style={{ ...eb }}>Selected · {selected.name}</div>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
								{selected.resources && (
									<Button variant="secondary" size="sm" icon="add" disabled={previewing} onClick={() => onPickCondition(selected.id)}>
										Add condition
									</Button>
								)}
								{isDm && (
									<>
										<span aria-hidden="true" style={{ width: 1, height: 20, background: T.bd, margin: '0 4px' }} />
										<IconButton
											icon="chevron-up"
											label={`Move ${selected.name} earlier in initiative`}
											variant="ghost"
											size="sm"
											disabled={previewing || selectedIndex <= 0}
											onClick={() => onReorder(selected.id, 'earlier')}
										/>
										<IconButton
											icon="chevron-down"
											label={`Move ${selected.name} later in initiative`}
											variant="ghost"
											size="sm"
											disabled={previewing || selectedIndex < 0 || selectedIndex >= tracker.combatants.length - 1}
											onClick={() => onReorder(selected.id, 'later')}
										/>
										<Button
											variant="secondary"
											size="sm"
											icon={selected.hidden ? 'visibility-players' : 'visibility-hidden'}
											disabled={previewing}
											onClick={() => onVisibility(selected.id, !selected.hidden)}
										>
											{selected.hidden ? 'Reveal' : 'Hide'}
										</Button>
										<Button variant="ghost" size="sm" icon="close" disabled={previewing} onClick={() => onRemove(selected.id, selected.name)}>
											Remove
										</Button>
									</>
								)}
							</div>
							{isDm && selected.hidden && (
								<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
									Players see an “Unknown creature” placeholder for this row.
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</Panel>
	);
}

// ── Condition picker (design-b condPick modal, wired to combat.apply-resource) ────────────────────

function ConditionPickerDialog({
	target,
	onClose,
	onPick,
}: {
	target: CombatantRow | null;
	onClose: () => void;
	onPick: (combatantId: string, condition: string) => void;
}) {
	const present = new Set(target?.resources?.conditions ?? []);
	const keys = Object.keys(CONDITIONS).filter((k) => !present.has(k));
	return (
		<Dialog
			open={!!target}
			onClose={onClose}
			title={`Add condition${target ? ` — ${target.name}` : ''}`}
			description="Each condition keeps a distinct icon so it stays readable at the table (and in grayscale)."
			icon="cond-poisoned"
			size="md"
		>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
				{keys.map((k) => (
					<button
						key={k}
						type="button"
						aria-label={`Add ${(CONDITIONS as Record<string, { label: string }>)[k].label}`}
						onClick={() => target && onPick(target.id, k)}
						style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
					>
						<ConditionBadge condition={k} />
					</button>
				))}
				{keys.length === 0 && (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Every catalog condition is already applied.</div>
				)}
			</div>
		</Dialog>
	);
}

// ── Campaign date (SES-012 — the control the Campaign timeline points at) ─────────────────────────

function CampaignDatePanel({
	calendar,
	current,
	previewing,
	onSet,
}: {
	calendar: CalendarDefinition | null;
	current: ContinuityDate | null;
	previewing: boolean;
	onSet: (date: CustomDate, ok: string) => void;
}) {
	const [year, setYear] = useState(1);
	const [month, setMonth] = useState(1);
	const [day, setDay] = useState(1);

	// Keep the form anchored to the canonical current date (e.g. after “+1 day” or a set elsewhere).
	const currentIso = current?.isoLike ?? null;
	useEffect(() => {
		if (!current) return;
		setYear(current.value.year);
		setMonth(current.value.month);
		setDay(current.value.day);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- sync from the canonical date only
	}, [currentIso]);

	if (!calendar) {
		return (
			<Panel title="Campaign date">
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					No campaign calendar defined in this vault yet, so there is no date to set.
				</div>
			</Panel>
		);
	}

	const maxDay = daysInMonth(calendar, month) ?? 1;

	function setDate() {
		if (!calendar) return;
		onSet(
			{ calendarId: calendar.id, year: Math.trunc(year), month, day: Math.min(maxDay, Math.max(1, Math.trunc(day))) },
			'Campaign date set',
		);
	}

	function advanceDay() {
		if (!calendar || !current) return;
		const next = addDays(calendar, current.value, 1);
		if (next) onSet(next, 'A new day dawns');
	}

	return (
		<Panel title="Campaign date">
			<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
				<Icon name="recent" size="sm" color={current ? T.acc : T.ter} />
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ font: `600 13px ${T.sans}`, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
						{current ? current.display : 'No date set'}
					</div>
					<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{calendar.name} · drives the Campaign timeline</div>
				</div>
				<Button variant="secondary" size="sm" icon="skip" disabled={previewing || !current} onClick={advanceDay}>
					+1 day
				</Button>
			</div>
			<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
				<Field label="Month" style={{ flex: '1 1 120px' }}>
					<Select
						value={String(month)}
						disabled={previewing}
						options={calendar.months.map((m, i) => ({ value: String(i + 1), label: m.name }))}
						onChange={(e: { target: { value: string } }) => {
							const next = Math.max(1, Math.trunc(Number(e.target.value) || 1));
							setMonth(next);
							const cap = daysInMonth(calendar, next) ?? 1;
							setDay((d) => Math.min(cap, Math.max(1, d)));
						}}
					/>
				</Field>
				<Field label="Day" style={{ width: 70 }}>
					<Input
						type="number"
						min={1}
						max={maxDay}
						value={day}
						disabled={previewing}
						onChange={(e: { target: { value: string } }) => setDay(Math.min(maxDay, Math.max(1, Math.trunc(Number(e.target.value) || 1))))}
					/>
				</Field>
				<Field label="Year" style={{ width: 84 }}>
					<Input
						type="number"
						value={year}
						disabled={previewing}
						onChange={(e: { target: { value: string } }) => setYear(Math.trunc(Number(e.target.value) || 0))}
					/>
				</Field>
				<Button variant="primary" size="sm" icon="check" disabled={previewing} onClick={setDate}>
					Set date
				</Button>
			</div>
		</Panel>
	);
}

// ── Dice ──────────────────────────────────────────────────────────────────────────────────────────

function DicePanel({
	rolls,
	isLive,
	previewing,
	expr,
	onExpr,
	onRoll,
}: {
	rolls: { id: string; expression: string; total: number; label: string | null; dice: number[]; modifier: number }[];
	isLive: boolean;
	previewing: boolean;
	expr: string;
	onExpr: (v: string) => void;
	onRoll: (expression: string) => void;
}) {
	const presets = ['1d20', '1d20+5', '2d6+3', '1d8+2', '4d6'];
	// `getDiceHistoryForActor` returns rolls oldest-first (appended), so the newest is the LAST element.
	const recent = [...rolls].reverse();
	const last = recent[0];
	const disabled = !isLive || previewing;
	return (
		<Panel title="Dice">
			{!isLive && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>Dice rolls record to the live session — go live to roll.</div>
			)}
			<div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
				{presets.map((p) => (
					<Button key={p} variant="secondary" size="sm" disabled={disabled} onClick={() => onRoll(p)}>
						{p}
					</Button>
				))}
			</div>
			<div style={{ display: 'flex', gap: 8 }}>
				<Input value={expr} onChange={(e: { target: { value: string } }) => onExpr(e.target.value)} placeholder="e.g. 3d6+2" style={{ flex: 1 }} />
				<Button variant="accent" icon="dice" disabled={disabled || !expr.trim()} onClick={() => onRoll(expr.trim())}>
					Roll
				</Button>
			</div>
			{last && <DiceResult notation={last.expression} total={last.total} rolls={last.dice} modifier={last.modifier} />}
			{recent.length > 1 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
					{recent.slice(1, 6).map((d) => (
						<div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12px ${T.sans}`, color: T.ter }}>
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

function HandoutsPanel({
	handouts,
	status,
	isDm,
	isLive,
	previewing,
	canDeliver,
	title,
	body,
	onTitle,
	onBody,
	onDeliver,
	onRevoke,
	onAcknowledge,
}: {
	handouts: HandoutView[];
	status: HandoutStatusView[];
	isDm: boolean;
	isLive: boolean;
	previewing: boolean;
	canDeliver: boolean;
	title: string;
	body: string;
	onTitle: (v: string) => void;
	onBody: (v: string) => void;
	onDeliver: () => void;
	onRevoke: (id: string) => void;
	onAcknowledge: (id: string) => void;
}) {
	const statusById = new Map(status.map((s) => [s.handoutId, s]));
	return (
		<Panel title="Handouts">
			{isDm ? (
				<>
					{!isLive && (
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
							Handouts deliver to the live session — go live to push to players.
						</div>
					)}
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						<Input value={title} onChange={(e: { target: { value: string } }) => onTitle(e.target.value)} placeholder="Handout title" />
						<Textarea
							value={body}
							onChange={(e: { target: { value: string } }) => onBody(e.target.value)}
							placeholder="What the players read…"
							rows={3}
						/>
						<Button variant="primary" size="sm" icon="send" disabled={!canDeliver || !title.trim()} onClick={onDeliver}>
							Push to players
						</Button>
					</div>
				</>
			) : (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>Handouts the DM has shared with you appear here.</div>
			)}

			{handouts.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No handouts delivered yet.</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{handouts.map((h) => {
						const st = statusById.get(h.id);
						const delivered = st ? st.recipients.length : 0;
						const opened = st ? st.recipients.filter((r) => r.acknowledged).length : 0;
						return (
							<div
								key={h.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '8px 10px',
									borderRadius: 9,
									border: `1px solid ${T.bd}`,
									background: T.surf,
								}}
							>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}`, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
										{h.title}
									</div>
									<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
										{h.handoutKind} · {h.sections.length} {h.sections.length === 1 ? 'section' : 'sections'}
										{isDm ? ` · ${opened}/${delivered} opened` : ''}
									</div>
								</div>
								{isDm ? (
									<IconButton icon="close" label="Revoke handout" variant="ghost" size="sm" disabled={previewing} onClick={() => onRevoke(h.id)} />
								) : h.acknowledged ? (
									<Badge status="success">Read</Badge>
								) : (
									<Button variant="secondary" size="sm" disabled={previewing} onClick={() => onAcknowledge(h.id)}>
										Mark read
									</Button>
								)}
							</div>
						);
					})}
				</div>
			)}
		</Panel>
	);
}

function AudioPanel({
	audio,
	trackLabel,
	isDm,
	previewing,
	onPause,
	onResume,
	onStop,
	onVolume,
}: {
	audio: SessionAudioView;
	trackLabel: string | null;
	isDm: boolean;
	previewing: boolean;
	onPause: () => void;
	onResume: () => void;
	onStop: () => void;
	onVolume: (volume: number) => void;
}) {
	const track = audio.track;
	return (
		<Panel title="Now playing">
			{!track ? (
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, font: `12.5px ${T.sans}`, color: T.ter }}>
					<Icon name="audio" size="sm" color={T.ter} />
					Nothing playing. Start ambience from the Audio library.
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
						<Icon name="audio" size="sm" color={track.status === 'playing' ? T.acc : T.sub} />
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={{ font: `600 13px ${T.sans}`, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
								{trackLabel ?? track.assetId ?? track.sourceId}
							</div>
							<div style={{ font: `11px ${T.sans}`, color: T.ter }}>session audio</div>
						</div>
						<Badge status={track.status === 'playing' ? 'success' : 'neutral'}>
							{track.status === 'playing' ? 'Playing' : 'Paused'}
						</Badge>
					</div>
					{isDm && (
						<>
							<div style={{ display: 'flex', gap: 7 }}>
								{track.status === 'playing' ? (
									<Button variant="secondary" size="sm" icon="pause" disabled={previewing} onClick={onPause}>
										Pause
									</Button>
								) : (
									<Button variant="secondary" size="sm" icon="play" disabled={previewing} onClick={onResume}>
										Resume
									</Button>
								)}
								<Button variant="ghost" size="sm" icon="close" disabled={previewing} onClick={onStop}>
									Stop
								</Button>
							</div>
							<Slider
								label="Volume"
								min={0}
								max={1}
								step={0.05}
								value={track.volume}
								valueLabel={`${Math.round(track.volume * 100)}%`}
								disabled={previewing}
								onChange={(v: number) => onVolume(v)}
							/>
						</>
					)}
				</div>
			)}
		</Panel>
	);
}

function StagePanel({
	maps,
	activeMapId,
	isDm,
	isLive,
	previewing,
	onSelect,
	onProject,
}: {
	maps: MapEntry[];
	activeMapId: string | null;
	isDm: boolean;
	isLive: boolean;
	previewing: boolean;
	onSelect: (mapId: string) => void;
	onProject: () => void;
}) {
	if (!isDm) return null;
	return (
		<Panel title="Stage">
			{maps.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No maps yet — create one in the Atlas.</div>
			) : (
				<>
					<SetRow
						label="Active map"
						help="What you stage for the table."
						control={
							<Select
								value={activeMapId ?? ''}
								disabled={previewing}
								options={[{ value: '', label: '— none —' }, ...maps.map((m) => ({ value: m.id, label: m.name }))]}
								onChange={(e: { target: { value: string } }) => {
									if (e.target.value) onSelect(e.target.value);
								}}
							/>
						}
					/>
					<Button
						variant="secondary"
						size="sm"
						icon="visibility-players"
						disabled={!isLive || previewing || !activeMapId}
						onClick={onProject}
					>
						Show players the map
					</Button>
				</>
			)}
		</Panel>
	);
}

function PartyPanel({ party }: { party: { id: string; name: string; combat?: { hp: number; maxHp: number } }[] }) {
	return (
		<Panel title="Party">
			{party.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No player characters yet.</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{party.map((p) => (
						<div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
							<div style={{ flex: 1, minWidth: 0 }}>
								<HPBar current={p.combat?.hp ?? 0} max={p.combat?.maxHp ?? 1} label={p.name} size="sm" />
							</div>
						</div>
					))}
				</div>
			)}
		</Panel>
	);
}
