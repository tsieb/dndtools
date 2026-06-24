import { useMemo, useState } from 'react';
import {
	listCharactersForActor,
	getCharacterForActor,
	resourcesOf,
	availableSlots,
	availableClassResource,
	advancementStateOf,
	checkAdvancementEligibility,
	validateAdvancement,
	xpForLevel,
	type CharacterView,
} from '@dndtools/core';
import {
	AbilityScore,
	abilityModifier,
	Avatar,
	Badge,
	Button,
	Card,
	Chip,
	ConditionBadge,
	CONDITIONS,
	DataTable,
	DefinitionList,
	Dialog,
	EmptyState,
	Field,
	HPBar,
	Icon,
	IconButton,
	Input,
	Select,
	SpellSlots,
	Stat,
	Tabs,
	Textarea,
	VisibilityChip,
} from '../ds';
import { Page, Panel, T, eb, mono } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Characters — the roster library, now wired to the live Processing Core (was static `mockCampaign`).
 * The roster is the actor-filtered `listCharactersForActor` read model (a player/observer sees only
 * what the core permits — a dm-only NPC is omitted, never redacted-but-listed); opening a character
 * loads the redacted `getCharacterForActor` view bound to a real sheet (ability scores, combat vitals,
 * attacks, spell slots, level/XP). New character dispatches the durable `character.quick-create`
 * command; the DM edit mode dispatches `character.set-combat` (HP/AC/conditions) and `character.edit-field`
 * (name); the level-up panel runs the staged `character.{set-xp,open/set-choices/commit/cancel-advancement}`
 * flow. Every mutation flows through the single `runtime.dispatch` write choke point — the GUI never
 * writes core state directly (Architecture Contract 1).
 *
 * Honest gaps (no backing command after checking commands/ + the Svelte route):
 *   - "Import from D&D Beyond" — no content/character import command exists in core. Honest stub.
 *   - Skills & saves, race/subclass/background, hit dice, passive perception, proficiency — the
 *     simplified core character has no such fields. Those mock-only panels are dropped, not faked.
 *   - "Start combat" — `combat.start` is DM + active-session gated and is authoritatively driven from
 *     the Session / Combat Tracker surfaces; it is dispatched here as a convenience and surfaces the
 *     core rejection (e.g. "start a session first") rather than silently no-op-ing.
 *   - The guided PLAYER draft flow (`character.create-draft` / `update-draft-step` / `finalize-draft`)
 *     is a larger separate surface; the DM quick-create dialog is the create path wired here.
 */

const KIND_LABEL: Record<string, string> = { pc: 'PC', npc: 'NPC', monster: 'Monster', sidekick: 'Sidekick' };
const KIND_TONE: Record<string, string> = { pc: 'success', npc: 'info', monster: 'error', sidekick: 'warning' };
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const STANDARD_CONDITIONS = [
	'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
	'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const COND_ALIAS: Record<string, string> = {
	concentrating: 'concentration', blessed: 'blessed', prone: 'prone', poisoned: 'poisoned', stunned: 'stunned',
	frightened: 'frightened', restrained: 'restrained', grappled: 'grappled', invisible: 'invisible', paralyzed: 'paralyzed',
	unconscious: 'unconscious', charmed: 'charmed', blinded: 'blinded', deafened: 'deafened', petrified: 'petrified',
	incapacitated: 'incapacitated', exhaustion: 'exhaustion',
};
function condKey(s: string): string | null {
	const k = String(s).toLowerCase();
	return COND_ALIAS[k] || ((CONDITIONS as any)[k] ? k : null);
}

/** A stable card gradient angle derived from the character id (real characters carry no `grad`). */
function gradFor(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
	return h;
}

/** Map the core visibility level onto the VisibilityChip's players/dm-only axis. */
function visChip(visibility: string) {
	return visibility === 'dm-only' ? 'dm-only' : 'players';
}

/** A human subtitle from whatever the sheet `data` actually carries, else the kind label. */
function subtitleOf(view: CharacterView, level: number | null): string {
	const cls = typeof view.data.class === 'string' ? (view.data.class as string) : null;
	const bg = typeof view.data.background === 'string' ? (view.data.background as string) : null;
	const parts: string[] = [];
	if (cls) parts.push(level ? `${cls} ${level}` : cls);
	if (bg) parts.push(bg);
	return parts.join(' · ') || KIND_LABEL[view.kind] || view.kind;
}

function CharCard({ view, onOpen }: { view: CharacterView; onOpen: () => void }) {
	const grad = gradFor(view.id);
	const conditions = view.combat.conditions;
	return (
		<Card elevation="flat" interactive padding="none" onClick={onOpen} style={{ overflow: 'hidden' }}>
			<div style={{ height: 84, background: `linear-gradient(${grad}deg,#2a2117,#14100b)`, position: 'relative' }}>
				<div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--map-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--map-grid-line) 1px,transparent 1px)', backgroundSize: '20px 20px' }} />
				<div style={{ position: 'absolute', left: 14, bottom: -18 }}>
					<Avatar name={view.name} ring="turn" />
				</div>
				<div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
					<Badge status={KIND_TONE[view.kind] || 'neutral'}>{KIND_LABEL[view.kind] || view.kind}</Badge>
				</div>
			</div>
			<div style={{ padding: '24px 14px 14px' }}>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
					<span style={{ font: `600 14.5px ${T.sans}` }}>{view.name}</span>
					<VisibilityChip level={visChip(view.visibility)} compact />
				</div>
				<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 2 }}>{subtitleOf(view, null)}</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 11 }}>
					<span style={{ display: 'flex', alignItems: 'center', gap: 5, font: `12px ${T.mono}`, color: T.sub }}>
						<Icon name="heart" size={14} color={T.err} />
						{view.combat.hp}/{view.combat.maxHp}
					</span>
					<span style={{ display: 'flex', alignItems: 'center', gap: 5, font: `12px ${T.mono}`, color: T.sub }}>
						<Icon name="shield" size={14} color={T.info} />
						{view.combat.ac}
					</span>
					{conditions.length > 0 && <span style={{ font: `12px ${T.mono}`, color: T.ter }}>{conditions.length} cond.</span>}
				</div>
			</div>
		</Card>
	);
}

function BackBar({ onBack }: { onBack: () => void }) {
	return (
		<nav aria-label="Breadcrumb" style={{ marginBottom: 14 }}>
			<button
				type="button"
				onClick={onBack}
				style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: T.ter, font: `600 12px ${T.sans}`, letterSpacing: '.04em', textTransform: 'uppercase' }}
			>
				<Icon name="chevron-left" size={14} />
				Characters
			</button>
		</nav>
	);
}

// ── DM quick-create (CHAR-001) — mirrors apps/gm CharacterQuickCreate.svelte ────────────────────
function QuickCreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [kind, setKind] = useState<'npc' | 'monster' | 'sidekick'>('npc');
	const [name, setName] = useState('');
	const [hp, setHp] = useState(10);
	const [ac, setAc] = useState(12);
	const [visibility, setVisibility] = useState<'dm-only' | 'shared' | 'player-visible'>('dm-only');
	const [attackName, setAttackName] = useState('');
	const [attackDetail, setAttackDetail] = useState('');
	const [dmNotes, setDmNotes] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	function reset() {
		setName(''); setHp(10); setAc(12); setVisibility('dm-only');
		setAttackName(''); setAttackDetail(''); setDmNotes(''); setError(null);
	}

	async function submit() {
		const trimmed = name.trim();
		if (!trimmed) { setError('Enter a character name.'); return; }
		// DM notes stay dm-only so the core's actor-filtered view never leaks them to a player (CHAR-014).
		const data: Record<string, unknown> = dmNotes.trim() ? { dmNotes: dmNotes.trim() } : {};
		const dmOnlyFields = dmNotes.trim() ? ['data.dmNotes'] : [];
		const attacks = attackName.trim() ? [{ name: attackName.trim(), detail: attackDetail.trim() }] : [];
		setSubmitting(true);
		const result = await runtime.dispatch({
			type: 'character.quick-create',
			actorId,
			payload: { kind, name: trimmed, visibility, combat: { hp, maxHp: hp, ac }, attacks, data, dmOnlyFields },
		});
		setSubmitting(false);
		if (result.status === 'rejected') { setError(result.rejection.message); return; }
		const created = result.events.find((e) => e.kind === 'character.created');
		const id = created && created.kind === 'character.created' ? created.characterId : '';
		reset();
		onClose();
		if (id) onCreated(id);
	}

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="New character"
			description="An NPC, monster, or sidekick with just enough stats to run. New creations stay DM-only until you share them."
			size="md"
			footer={
				<>
					<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
					<Button variant="primary" size="sm" icon="new-character" disabled={submitting} onClick={submit}>
						{submitting ? 'Creating…' : `Create ${KIND_LABEL[kind]}`}
					</Button>
				</>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
				<Field label="Kind">
					<Select value={kind} onChange={(e: any) => setKind(e.target.value)} options={[
						{ value: 'npc', label: 'NPC' }, { value: 'monster', label: 'Monster' }, { value: 'sidekick', label: 'Sidekick' },
					]} />
				</Field>
				<Field label="Name" error={error ?? undefined}>
					<Input value={name} invalid={!!error} autoFocus onChange={(e: any) => { setName(e.target.value); if (error) setError(null); }} placeholder="Vorlag" />
				</Field>
				<div style={{ display: 'flex', gap: 12 }}>
					<Field label="HP" style={{ flex: 1 }}>
						<Input type="number" min={0} value={hp} onChange={(e: any) => setHp(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
					</Field>
					<Field label="AC" style={{ flex: 1 }}>
						<Input type="number" min={0} value={ac} onChange={(e: any) => setAc(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
					</Field>
				</div>
				<Field label="Visibility" help="Defaults to DM only — a player never sees a fresh NPC.">
					<Select value={visibility} onChange={(e: any) => setVisibility(e.target.value)} options={[
						{ value: 'dm-only', label: 'DM only' }, { value: 'shared', label: 'Shared' }, { value: 'player-visible', label: 'Player visible' },
					]} />
				</Field>
				<div style={{ display: 'flex', gap: 12 }}>
					<Field label="Attack name" style={{ flex: 1 }}>
						<Input value={attackName} onChange={(e: any) => setAttackName(e.target.value)} placeholder="Cutlass" />
					</Field>
					<Field label="Attack detail" style={{ flex: 1 }}>
						<Input value={attackDetail} onChange={(e: any) => setAttackDetail(e.target.value)} placeholder="+5 to hit, 1d8+3 slashing" />
					</Field>
				</div>
				<Field label="DM notes (DM only)">
					<Textarea rows={2} value={dmNotes} onChange={(e: any) => setDmNotes(e.target.value)} placeholder="Visible only to you — never shown to players (CHAR-014)." />
				</Field>
			</div>
		</Dialog>
	);
}

// ── The live character sheet, bound to the redacted core view ───────────────────────────────────
function CharacterSheet({ id, onBack }: { id: string; onBack: () => void }) {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [editMode, setEditMode] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hpAmount, setHpAmount] = useState(1);
	const [acDraft, setAcDraft] = useState('');
	const [conditionInput, setConditionInput] = useState('');
	const [nameDraft, setNameDraft] = useState('');
	const [editingName, setEditingName] = useState(false);

	// XP / advancement local inputs.
	const [xpInput, setXpInput] = useState('');
	const [className, setClassName] = useState('');
	const [hpGained, setHpGained] = useState('');
	const [subclass, setSubclass] = useState('');
	const [abilityOrFeat, setAbilityOrFeat] = useState('');

	// The redacted view gates visibility (null when this actor may not see the character); the raw
	// record is read ONLY after that gate passes, so its resources/advancement never leak (the same
	// pattern as party-overview + the Svelte combat/advancement surfaces).
	const view = getCharacterForActor(runtime.state.characters, runtime.state.permissions, actorId, id);
	const actor = runtime.state.permissions.actors[actorId] ?? null;
	const isDm = actor?.role === 'dm';
	const record = view ? runtime.state.characters.characters[id] ?? null : null;
	const resources = record ? resourcesOf(record) : null;
	const advancement = record ? advancementStateOf(record) : null;

	if (!view) {
		return (
			<Page max={920}>
				<BackBar onBack={onBack} />
				<EmptyState icon="dm-only" title="Character unavailable" description="This character is not visible to you." />
			</Page>
		);
	}

	async function dispatch(command: any): Promise<boolean> {
		setError(null);
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') { setError(result.rejection.message); return false; }
		return true;
	}

	// DM HP/AC/condition edits go through the durable, DM-only `character.set-combat` (no active-session
	// gate — the granular session-gated in-play hot path lives on the Session / Combat surfaces).
	async function applyHp(delta: number) {
		const next = clamp(view!.combat.hp + delta, 0, view!.combat.maxHp);
		await dispatch({ type: 'character.set-combat', actorId, payload: { characterId: id, hp: next } });
	}
	async function applyAc() {
		const n = Math.trunc(Number(acDraft));
		if (!Number.isFinite(n)) return;
		if (await dispatch({ type: 'character.set-combat', actorId, payload: { characterId: id, ac: n } })) setAcDraft('');
	}
	async function setCondition(name: string, present: boolean) {
		const trimmed = name.trim();
		if (present && !trimmed) return;
		const current = view!.combat.conditions;
		const next = present
			? (current.some((c) => c.toLowerCase() === trimmed.toLowerCase()) ? current : [...current, trimmed])
			: current.filter((c) => c !== name);
		if (await dispatch({ type: 'character.set-combat', actorId, payload: { characterId: id, conditions: next } }) && present) {
			setConditionInput('');
		}
	}
	async function saveName() {
		setEditingName(false);
		const next = nameDraft.trim();
		if (!next || next === view!.name) return;
		await dispatch({ type: 'character.edit-field', actorId, payload: { characterId: id, path: 'name', value: next } });
	}

	// Advancement (CHAR-009) — DM/owner only. set-combat authority differs (DM-only) from advancement
	// (DM or character owner); the core re-enforces both on dispatch.
	const canAdvance = isDm; // owner grants aren't surfaced on this screen; the DM is the default actor.
	const draft = advancement?.draft ?? null;
	const xpEligible = record ? checkAdvancementEligibility(record, 'xp') : null;
	const draftValidation = draft ? validateAdvancement(draft) : null;
	// `set-advancement-choices` requires at least one choice (schema `.refine`); guard the button so a
	// blank "Save choices" can't fire a rejected dispatch.
	const hasAdvancementChoice = !!(className.trim() || hpGained.trim() || subclass.trim() || abilityOrFeat.trim());

	async function setXp() {
		const n = Math.max(0, Math.trunc(Number(xpInput) || 0));
		if (await dispatch({ type: 'character.set-xp', actorId, payload: { characterId: id, xp: n } })) setXpInput('');
	}
	async function openAdvancement(mode: 'xp' | 'milestone') {
		await dispatch({ type: 'character.open-advancement', actorId, payload: { characterId: id, mode } });
	}
	async function saveChoices() {
		const payload: Record<string, unknown> = { characterId: id };
		if (className.trim()) payload.className = className.trim();
		if (hpGained.trim()) payload.hitPointsGained = Math.trunc(Number(hpGained));
		if (subclass.trim()) payload.subclass = subclass.trim();
		if (abilityOrFeat.trim()) payload.abilityOrFeat = abilityOrFeat.trim();
		await dispatch({ type: 'character.set-advancement-choices', actorId, payload });
	}
	async function commitAdvancement() {
		if (await dispatch({ type: 'character.commit-advancement', actorId, payload: { characterId: id } })) {
			setClassName(''); setHpGained(''); setSubclass(''); setAbilityOrFeat('');
		}
	}
	async function cancelAdvancement() {
		await dispatch({ type: 'character.cancel-advancement', actorId, payload: { characterId: id } });
	}

	const abilityCells = ABILITIES
		.map((k) => ({ key: k.toUpperCase(), val: view.abilityScores[k] }))
		.filter((a) => typeof a.val === 'number') as { key: string; val: number }[];
	const slots = resources ? Object.values(resources.spellSlots).sort((a, b) => a.level - b.level) : [];
	const classResources = resources ? Object.values(resources.classResources) : [];
	const hasSpellcasting = slots.length > 0 || classResources.length > 0;

	return (
		<Page max={1000}>
			<BackBar onBack={onBack} />
			{error && (
				<div role="alert" style={{ marginBottom: 12, font: `13px ${T.sans}`, color: T.err }}>{error}</div>
			)}
			<div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
				<Avatar name={view.name} size="xl" ring="turn" />
				<div style={{ flex: 1, minWidth: 200 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
						{editingName ? (
							<Input
								value={nameDraft}
								autoFocus
								onChange={(e: any) => setNameDraft(e.target.value)}
								onBlur={saveName}
								onKeyDown={(e: any) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
								style={{ font: `700 22px ${T.disp}`, width: 260 }}
							/>
						) : (
							<>
								<h2 style={{ margin: 0, font: `700 24px ${T.disp}` }}>{view.name}</h2>
								{isDm && (
									<IconButton
										icon="note-edit"
										label="Rename character"
										variant="ghost"
										size="sm"
										onClick={() => { setNameDraft(view.name); setEditingName(true); }}
									/>
								)}
							</>
						)}
						<Badge status={KIND_TONE[view.kind] || 'neutral'}>{KIND_LABEL[view.kind] || view.kind}</Badge>
						<VisibilityChip level={visChip(view.visibility)} />
					</div>
					<div style={{ font: `13.5px ${T.sans}`, color: T.sub, marginTop: 4 }}>{subtitleOf(view, advancement?.level ?? null)}</div>
				</div>
				<div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
					<Stat label="AC" value={String(view.combat.ac)} icon="shield" />
					{advancement && <Stat label="Level" value={String(advancement.level)} />}
					{isDm && (
						<Button variant={editMode ? 'primary' : 'secondary'} size="sm" icon="note-edit" onClick={() => setEditMode((v) => !v)}>
							{editMode ? 'Done' : 'Edit'}
						</Button>
					)}
				</div>
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					{abilityCells.length > 0 ? (
						<Panel title="Ability scores">
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
								{abilityCells.map((a) => <AbilityScore key={a.key} label={a.key} score={a.val} modifier={abilityModifier(a.val)} />)}
							</div>
						</Panel>
					) : null}

					<Panel title="Attacks">
						{view.attacks.length > 0 ? (
							<DataTable
								columns={[
									{ key: 'name', header: 'Name', strong: true },
									{ key: 'detail', header: 'Detail', mono: true },
								]}
								rows={view.attacks}
								rowKey={(r: any) => r.id}
							/>
						) : (
							<div style={{ font: `13px ${T.sans}`, color: T.ter }}>No attacks recorded.</div>
						)}
					</Panel>

					{canAdvance && advancement && (
						<Panel title="Advancement">
							<div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', font: `13px ${T.sans}`, color: T.sub }}>
								<span style={mono}>Level {advancement.level}</span>
								<span style={mono}>XP {advancement.xp}</span>
								{advancement.level < 20 && <span style={{ color: T.ter }}>next at {xpForLevel(advancement.level + 1) ?? '—'} XP</span>}
							</div>
							{draft ? (
								<div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
									<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>Advancing to level {draft.toLevel} ({draft.mode}).</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
										<Field label="Class gaining the level"><Input value={className} onChange={(e: any) => setClassName(e.target.value)} /></Field>
										<Field label="Hit points gained"><Input type="number" value={hpGained} onChange={(e: any) => setHpGained(e.target.value)} /></Field>
										<Field label="Subclass (if required)"><Input value={subclass} onChange={(e: any) => setSubclass(e.target.value)} /></Field>
										<Field label="Ability / feat (if required)"><Input value={abilityOrFeat} onChange={(e: any) => setAbilityOrFeat(e.target.value)} /></Field>
									</div>
									{draftValidation && draftValidation.issues.length > 0 ? (
										<ul style={{ margin: 0, paddingLeft: 18, font: `12.5px ${T.sans}`, color: T.warn ?? T.sub }}>
											{draftValidation.issues.map((iss: any) => <li key={iss.field}>{iss.message}</li>)}
										</ul>
									) : draftValidation?.complete ? (
										<div style={{ font: `12.5px ${T.sans}`, color: T.acc }}>All choices valid — ready to finalize.</div>
									) : null}
									<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
										<Button variant="secondary" size="sm" disabled={!hasAdvancementChoice} onClick={saveChoices}>Save choices</Button>
										<Button variant="primary" size="sm" disabled={!draftValidation?.complete} onClick={commitAdvancement}>Finalize level-up</Button>
										<Button variant="ghost" size="sm" onClick={cancelAdvancement}>Cancel</Button>
									</div>
								</div>
							) : (
								<div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
									<Field label="Set XP" style={{ width: 120 }}>
										<Input type="number" value={xpInput} onChange={(e: any) => setXpInput(e.target.value)} />
									</Field>
									<Button variant="secondary" size="sm" onClick={setXp}>Set XP</Button>
									<Button variant="primary" size="sm" disabled={!xpEligible?.eligible} onClick={() => openAdvancement('xp')}>Level up (XP)</Button>
									<Button variant="secondary" size="sm" onClick={() => openAdvancement('milestone')}>Level up (milestone)</Button>
								</div>
							)}
						</Panel>
					)}
				</div>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<Panel accent title="Combat">
						<HPBar current={view.combat.hp} max={view.combat.maxHp} label="Hit points" />
						<div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
							<Stat label="AC" value={String(view.combat.ac)} icon="shield" />
							{view.combat.tempHp > 0 && <Stat label="Temp" value={String(view.combat.tempHp)} />}
							{resources && resources.deathSaves.successes + resources.deathSaves.failures > 0 && (
								<Stat label="Death saves" value={`${resources.deathSaves.successes}✓ / ${resources.deathSaves.failures}✗`} />
							)}
						</div>
						<div style={{ ...eb, marginTop: 10 }}>Conditions</div>
						<div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
							{view.combat.conditions.length ? view.combat.conditions.map((c) => {
								const k = condKey(c);
								return editMode && isDm ? (
									<Chip key={c} tone="neutral" onRemove={() => setCondition(c, false)}>{c}</Chip>
								) : k ? <ConditionBadge key={c} condition={k} compact /> : <Chip key={c} tone="neutral">{c}</Chip>;
							}) : <span style={{ font: `13px ${T.sans}`, color: T.ter }}>None</span>}
						</div>

						{editMode && isDm && (
							<div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${T.bd}`, paddingTop: 12 }}>
								<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
									<Field label="Amount" style={{ width: 90 }}>
										<Input type="number" min={1} value={hpAmount} onChange={(e: any) => setHpAmount(Math.max(1, Math.trunc(Number(e.target.value) || 1)))} />
									</Field>
									<Button variant="secondary" size="sm" onClick={() => applyHp(-hpAmount)}>Damage</Button>
									<Button variant="secondary" size="sm" onClick={() => applyHp(hpAmount)}>Heal</Button>
								</div>
								<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
									<Field label="Set AC" style={{ width: 90 }}>
										<Input type="number" value={acDraft} placeholder={String(view.combat.ac)} onChange={(e: any) => setAcDraft(e.target.value)} />
									</Field>
									<Button variant="secondary" size="sm" onClick={applyAc}>Set AC</Button>
								</div>
								<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
									<Field label="Add condition" style={{ minWidth: 160, flex: 1 }}>
										<Select value={conditionInput} onChange={(e: any) => setConditionInput(e.target.value)} options={[{ value: '', label: 'Choose…' }, ...STANDARD_CONDITIONS.map((c) => ({ value: c, label: c }))]} />
									</Field>
									<Button variant="secondary" size="sm" disabled={!conditionInput} onClick={() => setCondition(conditionInput, true)}>Add</Button>
								</div>
							</div>
						)}
					</Panel>

					{hasSpellcasting && (
						<Panel title="Spellcasting">
							{slots.length > 0 && (
								<SpellSlots readOnly levels={slots.map((sl) => ({ level: sl.level, total: sl.max, used: sl.max - availableSlots(sl) }))} />
							)}
							{classResources.length > 0 && (
								<div style={{ marginTop: slots.length ? 12 : 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
									{classResources.map((r) => (
										<div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', font: `12.5px ${T.sans}`, color: T.sub }}>
											<span>{r.name}</span>
											<span style={mono}>{availableClassResource(r)}/{r.max}</span>
										</div>
									))}
								</div>
							)}
						</Panel>
					)}

					<Panel title="Reference">
						<DefinitionList
							items={[
								{ label: 'Type', value: KIND_LABEL[view.kind] || view.kind },
								{ label: 'Armor class', value: String(view.combat.ac), mono: true },
								{ label: 'Hit points', value: `${view.combat.hp} / ${view.combat.maxHp}`, mono: true },
								...(view.combat.tempHp > 0 ? [{ label: 'Temp HP', value: String(view.combat.tempHp), mono: true }] : []),
								{ label: 'Visible to', value: <VisibilityChip level={visChip(view.visibility)} compact /> },
								...(typeof view.data.dmNotes === 'string' ? [{ label: 'DM notes', value: String(view.data.dmNotes) }] : []),
							]}
						/>
					</Panel>
				</div>
			</div>
		</Page>
	);
}

export function Characters() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [kind, setKind] = useState('all');
	const [detailId, setDetailId] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	const data = useMemo(() => {
		const actor = runtime.state.permissions.actors[actorId] ?? null;
		const characters = listCharactersForActor(runtime.state.characters, runtime.state.permissions, actorId);
		return { isDm: actor?.role === 'dm', characters };
	}, [runtime.state, actorId]);

	if (detailId) return <CharacterSheet id={detailId} onBack={() => setDetailId(null)} />;

	const list = data.characters.filter((c) => {
		if (kind === 'all') return true;
		if (kind === 'npc') return c.kind === 'npc' || c.kind === 'sidekick';
		return c.kind === kind;
	});
	const tabs = [
		{ id: 'all', label: 'All' },
		{ id: 'pc', label: 'Party' },
		{ id: 'npc', label: 'NPCs' },
		{ id: 'monster', label: 'Bestiary' },
	];

	const partyPcs = data.characters.filter((c) => c.kind === 'pc');

	// `combat.start` is DM + active-session gated and authoritatively driven from the Session / Combat
	// Tracker. Dispatched here as a convenience over the party; the core rejection is surfaced (e.g.
	// "start a session first" / "combat already running") rather than silently swallowed.
	async function startCombat() {
		setNotice(null);
		const result = await runtime.dispatch({
			type: 'combat.start',
			actorId,
			payload: {
				// SES-002 combatant rows: a PC seeds as kind `character` (resources flow from its combat
				// block) — `combatantKindSchema` is character/npc/monster, not the roster's `pc`.
				combatants: partyPcs.map((c) => ({ kind: 'character', name: c.name, characterId: c.id, ac: c.combat.ac, maxHp: c.combat.maxHp, initiative: 0 })),
			},
		});
		setNotice(result.status === 'rejected' ? result.rejection.message : 'Combat started — open the Session screen to run it.');
	}

	return (
		<Page>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
				<Tabs value={kind} onChange={setKind} tabs={tabs} />
				<div style={{ flex: 1 }} />
				{data.isDm && partyPcs.length > 0 && (
					<Button variant="ghost" size="sm" icon="sword" onClick={startCombat}>Start combat</Button>
				)}
				{/* no core command — there is no D&D Beyond / character import command in the Processing Core. */}
				<Button variant="ghost" size="sm" icon="import" onClick={() => setNotice('Import from D&D Beyond is not yet available — no import command exists in the core.')}>
					Import from D&amp;D Beyond
				</Button>
				{data.isDm && (
					<Button variant="primary" size="sm" icon="new-character" onClick={() => setCreating(true)}>
						New character
					</Button>
				)}
			</div>

			{notice && (
				<div role="status" style={{ marginBottom: 14, font: `13px ${T.sans}`, color: T.sub, background: T.accSub, border: `1px solid ${T.accBd}`, borderRadius: 8, padding: '8px 12px' }}>
					{notice}
				</div>
			)}

			{list.length === 0 ? (
				<EmptyState
					icon="characters-person"
					title={data.characters.length === 0 ? 'Your roster is empty' : 'Nothing in this view'}
					description={data.characters.length === 0 ? 'Add the party’s heroes, then the NPCs they’ll meet.' : 'No characters match this filter.'}
					action={data.isDm ? <Button variant="primary" size="sm" icon="new-character" onClick={() => setCreating(true)}>New character</Button> : undefined}
				/>
			) : (
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 16 }}>
					{list.map((c) => (
						<CharCard key={c.id} view={c} onOpen={() => setDetailId(c.id)} />
					))}
				</div>
			)}

			<QuickCreateDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => setDetailId(id)} />
		</Page>
	);
}
