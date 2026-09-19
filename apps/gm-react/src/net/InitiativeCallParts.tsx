import type { CombatTrackerView } from '@dndtools/core';
import { useId, useState } from 'react';
import { Badge, Button, Chip, Input, Toaster } from '../ds';
import type { CombatantRow } from '../app/combat/HpKeypadSheet';
import { T, eb } from '../app/screen-kit';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { useSession } from './SessionContext';

/**
 * RC-SES-5.1 — the DM's half of the initiative call the player companion answers. The DM opens a
 * "roll for initiative" call, watches each player's roll land on the tracker rows, adjusts any number
 * and starts round 1; outside combat, the per-player "ready" chips show who has said they are ready.
 *
 * `screens/session/CombatTracker.tsx` renders these pieces into its rows and panels. They live here,
 * beside the command-request path and the host roster they drive (as `SessionPanelParts.tsx` holds the
 * host/join UI), which also keeps the tracker under the RC-STB-2.7 file-size limit.
 *
 * Import as a namespace: `import * as Initiative from '../../net/InitiativeCallParts'`.
 */

/**
 * Where a row's initiative came from, read off the encounter log: a roll (the player's, or one the DM
 * made for them) is a `roll` entry, and a DM adjustment is a reorder that carries the value (an
 * earlier/later nudge carries none). During a call, a character row with neither still owes a roll.
 */
export type InitiativeSource = 'awaiting' | 'rolled' | 'adjusted' | null;

export function initiativeSource(
	tracker: CombatTrackerView,
	row: CombatantRow,
	calling: boolean,
): InitiativeSource {
	let source: InitiativeSource = null;
	for (const entry of tracker.log) {
		if (entry.combatantId !== row.id) continue;
		if (entry.kind === 'roll') source = 'rolled';
		else if (entry.kind === 'combatant-reordered' && entry.delta !== null) source = 'adjusted';
	}
	if (source) return source;
	return calling && row.kind === 'character' ? 'awaiting' : null;
}

/** What the tracker needs to paint the call, plus the two writes it makes. */
export interface InitiativeCall {
	/** A running fight whose round 1 has not begun: rolls are still arriving and nobody is active. */
	calling: boolean;
	tracker: CombatTrackerView;
	isDm: boolean;
	isLive: boolean;
	previewing: boolean;
	sourceOf: (row: CombatantRow) => InitiativeSource;
	/** The number a row shows: its initiative, or a dash while it still holds the placeholder 0. */
	initiativeText: (row: CombatantRow) => string | number;
	/** Open the fight with every player character in it, owing a roll, before round 1. */
	callInitiative: () => Promise<void>;
	/** The DM's adjustment: an explicit initiative, which moves the row to where the value puts it. */
	setInitiative: (row: CombatantRow, value: number) => Promise<void>;
}

/**
 * The call for this tracker. `screens/session/index.tsx` wires every other tracker callback; the call
 * and the adjustment dispatch from here as the DM, beside the rows they paint.
 */
export function useCall(
	tracker: CombatTrackerView,
	gate: { isDm: boolean; isLive: boolean; previewing: boolean },
): InitiativeCall {
	const { t } = useI18n();
	const runtime = useRuntime();
	const calling = tracker.status === 'running' && tracker.round === 0;
	const sourceOf = (row: CombatantRow) => initiativeSource(tracker, row, calling);

	async function callInitiative(): Promise<void> {
		if (gate.previewing || !gate.isDm || !gate.isLive) return;
		const party = Object.values(runtime.state.characters.characters).filter((c) => c.kind === 'pc');
		if (party.length === 0) {
			Toaster.warning(t('session.combat.initiative.needsParty'));
			return;
		}
		const result = await runtime.dispatch({
			type: 'combat.start',
			actorId: runtime.defaultActorId,
			payload: {
				rollForInitiative: true,
				combatants: party.map((c) => ({
					kind: 'character',
					name: c.name,
					characterId: c.id,
					ac: c.combat.ac,
					maxHp: c.combat.maxHp,
				})),
			},
		});
		if (result.status === 'accepted') Toaster.success(t('session.combat.initiative.called'));
		else Toaster.error(result.rejection.message);
	}

	async function setInitiative(row: CombatantRow, value: number): Promise<void> {
		const result = await runtime.dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.defaultActorId,
			payload: { combatantId: row.id, kind: 'initiative', value },
		});
		if (result.status === 'accepted') {
			Toaster.success(t('session.combat.initiative.setToast', { name: row.name, value }));
		} else {
			Toaster.error(result.rejection.message);
		}
	}

	return {
		calling,
		tracker,
		...gate,
		sourceOf,
		initiativeText: (row) =>
			sourceOf(row) === 'awaiting' ? '—' : (row.statBlock.initiative ?? '—'),
		callInitiative,
		setInitiative,
	};
}

/**
 * The call replaces the round/turn strip: there is no round yet, and the one thing to do is start it
 * once the rolls are in.
 */
export function Banner({ call, onStart }: { call: InitiativeCall; onStart: () => void }) {
	const { t } = useI18n();
	const owed = call.tracker.combatants.filter((c) => c.kind === 'character');
	const rolled = owed.filter((c) => call.sourceOf(c) !== 'awaiting').length;
	return (
		<div
			data-testid="initiative-call-banner"
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: T.space.two,
				flexWrap: 'wrap',
				padding: `${T.space.two} ${T.space.three}`,
				borderRadius: T.radius.lg,
				background: T.accSub,
				border: `1px solid ${T.accBd}`,
			}}
		>
			<div style={{ flex: 1, minWidth: 200 }}>
				<div style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>
					{t('session.combat.initiative.banner')}
				</div>
				<div style={{ marginTop: T.space.half, font: `12px ${T.sans}`, color: T.sub }}>
					{t('session.combat.initiative.help')}
				</div>
				{/* Mounted with the banner and only its text changes, so each arriving roll is announced
				    to a screen-reader DM. */}
				<div
					role="status"
					aria-live="polite"
					aria-atomic="true"
					style={{ marginTop: T.space.one, font: `600 12px ${T.sans}`, color: T.acc }}
				>
					{t('session.combat.initiative.progress', { rolled, total: owed.length })}
				</div>
			</div>
			<Button variant="primary" size="sm" icon="sword" disabled={call.previewing} onClick={onStart}>
				{t('session.combat.initiative.start')}
			</Button>
		</div>
	);
}

/**
 * During the call each character row says where its number stands, in text: owed, rolled by the
 * player, or adjusted by the DM. Once the fight runs only an unrolled row keeps its badge.
 */
export function Badges({ call, row }: { call: InitiativeCall; row: CombatantRow }) {
	const { t } = useI18n();
	const source = call.sourceOf(row);
	if (source === 'awaiting') {
		return <Badge status="neutral">{t('session.combat.initiative.awaiting')}</Badge>;
	}
	if (!call.calling || source === null) return null;
	return source === 'rolled' ? (
		<Badge status="info">
			{t('session.combat.initiative.rolled', { value: row.statBlock.initiative ?? 0 })}
		</Badge>
	) : (
		<Badge status="neutral">{t('session.combat.initiative.adjusted')}</Badge>
	);
}

/**
 * The DM's "adjust" in the selected-combatant panel: accept a roll as it landed, or type the number the
 * table agreed on. Keyed by the current value, so an arriving roll resets the draft instead of leaving
 * a stale number in the field.
 */
export function Adjust({ call, row }: { call: InitiativeCall; row: CombatantRow }) {
	if (!call.isDm) return null;
	return <AdjustField key={`${row.id}:${row.statBlock.initiative ?? ''}`} call={call} row={row} />;
}

/** The field itself. Enter or "Set" applies it. */
function AdjustField({ call, row }: { call: InitiativeCall; row: CombatantRow }) {
	const { t } = useI18n();
	const id = useId();
	const [draft, setDraft] = useState(String(row.statBlock.initiative ?? 0));
	const value = Number(draft);
	const valid = draft.trim() !== '' && Number.isInteger(value) && value >= -99 && value <= 999;
	const apply = () => {
		if (valid && !call.previewing) void call.setInitiative(row, value);
	};
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: T.space.two, flexWrap: 'wrap' }}>
			<label htmlFor={id} style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
				{t('session.combat.initiative.label')}
			</label>
			<Input
				id={id}
				type="number"
				inputMode="numeric"
				value={draft}
				disabled={call.previewing}
				aria-label={t('session.combat.initiative.adjustFor', { name: row.name })}
				aria-invalid={!valid || undefined}
				onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
				onKeyDown={(e: { key: string; preventDefault: () => void }) => {
					if (e.key !== 'Enter') return;
					e.preventDefault();
					apply();
				}}
				style={{ width: 84 }}
			/>
			<Button variant="secondary" size="sm" disabled={call.previewing || !valid} onClick={apply}>
				{t('session.combat.initiative.set')}
			</Button>
		</div>
	);
}

/**
 * Below the idle tracker: the DM's "Roll for initiative" (offered only when it can work — the empty
 * state above already says why combat is closed), and the per-player "ready" chips. Readiness is the
 * presence beat a joined player's "I'm ready" toggle already sends (a side channel by design, never a
 * command), so only a hosting DM has a roster to show.
 */
export function Idle({ call }: { call: InitiativeCall }) {
	const { t } = useI18n();
	const session = useSession();
	const canCall = call.isDm && call.isLive && !call.previewing;
	const readiness =
		session.role === 'host' ? session.peers.filter((p) => p.connected && p.role === 'player') : [];
	if (!canCall && readiness.length === 0) return null;
	return (
		<div
			style={{
				marginTop: T.space.three,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'flex-start',
				gap: T.space.three,
			}}
		>
			{canCall && (
				<Button
					variant="secondary"
					size="sm"
					icon="dice"
					title={t('session.combat.initiative.callTitle')}
					onClick={() => void call.callInitiative()}
				>
					{t('session.combat.initiative.call')}
				</Button>
			)}
			{readiness.length > 0 && (
				<div data-testid="table-readiness">
					<div style={{ ...eb, marginBottom: T.space.oneHalf }}>
						{t('session.combat.ready.title')}
					</div>
					<ul
						style={{
							display: 'flex',
							flexWrap: 'wrap',
							gap: T.space.oneHalf,
							listStyle: 'none',
							margin: T.space.zero,
							padding: T.space.zero,
						}}
					>
						{readiness.map((p) => (
							<li key={p.peerId}>
								<Chip icon={p.ready ? 'check' : undefined} tone={p.ready ? 'accent' : 'neutral'}>
									{t(p.ready ? 'session.combat.ready.ready' : 'session.combat.ready.notReady', {
										name: p.displayName,
									})}
								</Chip>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
