import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
	listCharactersForActor,
	getCharacterForActor,
	searchVaultForActor,
	resourcesOf,
	availableSlots,
	availableClassResource,
	advancementStateOf,
	checkAdvancementEligibility,
	validateAdvancement,
	xpForLevel,
	passivePerception,
	effectiveProficiencyBonus,
	type CharacterView,
	type PreparedSpell,
} from '@dndtools/core';
import {
	AbilityScore,
	abilityModifier,
	Avatar,
	Badge,
	Button,
	Card,
	ConditionTracker,
	CONDITIONS,
	DataTable,
	DefinitionList,
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
	VisibilityChip,
} from '../ds';
import { CharBuilder, portraitGradient } from '../app/CharBuilder';
import { ABILITY_IDS, SKILLS } from '../app/charImport/skills';
import { Page, Panel, T, eb, mono } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Characters — the roster library, wired to the live Processing Core.
 * The roster is the actor-filtered `listCharactersForActor` read model (a player/observer sees only
 * what the core permits — a dm-only NPC is omitted, never redacted-but-listed); opening a character
 * loads the redacted `getCharacterForActor` view bound to a real sheet (ability scores, combat vitals,
 * attacks, spells + spell slots, conditions, level/XP). "New character" opens the guided CharBuilder
 * overlay (`../app/CharBuilder` — the ported design-prototype wizard): a PC runs the REAL guided
 * draft flow (`character.create-draft` → `update-draft-step` ×3 → `finalize-draft` → DM `set-combat`),
 * everything else lands through the durable `character.quick-create`. The DM edit mode dispatches
 * `character.set-combat` (HP/AC/conditions) and `character.edit-field` (name); spell slots
 * spend/restore through `character.set-spell-slots`, prepared spells toggle/add through
 * `character.set-spell` (both DM-or-owner, CHAR-008 — no active-session gate); the level-up panel runs
 * the staged `character.{set-xp,open/set-choices/commit/cancel-advancement}` flow. Every mutation
 * flows through the single `runtime.dispatch` write choke point — the GUI never writes core state
 * directly (Architecture Contract 1).
 *
 * Sheet extension slices (WS-4, all core-backed — formerly listed here as honest gaps):
 *   - Skills & saves / hit dice / passive perception render from the structured
 *     `Character.proficiencies` block on the redacted view; the bonuses derive from the PURE core
 *     queries `effectiveProficiencyBonus` / `passivePerception` (computed on read, never stored).
 *     A character with no proficiency data gets an honest empty state, not a fabricated sheet.
 *   - Spell rows show the extended `PreparedSpell` detail fields (school / casting time / range /
 *     components / duration) when present; older `{id,name,level,prepared}` records render as before.
 *   - Attacks are DM/owner-editable post-create through `character.update-attacks` (full-replacement
 *     semantics: the saved rows ARE the new list).
 *   - The Sharing panel widens visibility through the DM-only `character.set-sharing`
 *     (entity level + explicit `sharedWith` delivery list — fail-closed, never widened by default).
 *   - "Import character (JSON)" is REAL (WS-4): the toolbar button opens the CharBuilder's import
 *     path (D&D Beyond export / native JSON with a fail-closed field-mapping preview).
 *
 * Honest gaps (no backing command after checking commands/ + the Svelte route):
 *   - "Start combat" — `combat.start` is DM + active-session gated and is authoritatively driven from
 *     the Session / Combat Tracker surfaces; it is dispatched here as a convenience and surfaces the
 *     core rejection (e.g. "start a session first") rather than silently no-op-ing.
 */

const KIND_LABEL: Record<string, string> = {
	pc: 'PC',
	npc: 'NPC',
	monster: 'Monster',
	sidekick: 'Sidekick',
};
const KIND_TONE: Record<string, string> = {
	pc: 'success',
	npc: 'info',
	monster: 'error',
	sidekick: 'warning',
};
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const STANDARD_CONDITIONS = [
	'Blinded',
	'Charmed',
	'Deafened',
	'Frightened',
	'Grappled',
	'Incapacitated',
	'Invisible',
	'Paralyzed',
	'Petrified',
	'Poisoned',
	'Prone',
	'Restrained',
	'Stunned',
	'Unconscious',
];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const sgn = (n: number) => (n >= 0 ? `+${n}` : String(n));

const COND_ALIAS: Record<string, string> = {
	concentrating: 'concentration',
	blessed: 'blessed',
	prone: 'prone',
	poisoned: 'poisoned',
	stunned: 'stunned',
	frightened: 'frightened',
	restrained: 'restrained',
	grappled: 'grappled',
	invisible: 'invisible',
	paralyzed: 'paralyzed',
	unconscious: 'unconscious',
	charmed: 'charmed',
	blinded: 'blinded',
	deafened: 'deafened',
	petrified: 'petrified',
	incapacitated: 'incapacitated',
	exhaustion: 'exhaustion',
};
function condKey(s: string): string | null {
	const k = String(s).toLowerCase();
	return COND_ALIAS[k] || ((CONDITIONS as any)[k] ? k : null);
}

/** A stable card gradient angle derived from the character id (fallback when no portrait tone). */
function gradFor(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
	return h;
}

/** The builder's "portrait tone" persists as `data.grad` (a validated `data.*` string field); older
 *  characters without one fall back to the id-derived angle. */
function gradOf(view: CharacterView): number {
	const raw = view.data?.grad;
	const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
	return Number.isFinite(n) ? ((n % 360) + 360) % 360 : gradFor(view.id);
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
	const grad = gradOf(view);
	const conditions = view.combat.conditions;
	return (
		<Card
			elevation="flat"
			interactive
			padding="none"
			onClick={onOpen}
			style={{ overflow: 'hidden' }}
		>
			<div style={{ height: 84, background: portraitGradient(grad), position: 'relative' }}>
				<div
					style={{
						position: 'absolute',
						inset: 0,
						backgroundImage:
							'linear-gradient(var(--map-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--map-grid-line) 1px,transparent 1px)',
						backgroundSize: '20px 20px',
					}}
				/>
				<div style={{ position: 'absolute', left: 14, bottom: -18 }}>
					<Avatar name={view.name} ring="turn" />
				</div>
				<div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
					<Badge status={KIND_TONE[view.kind] || 'neutral'}>
						{KIND_LABEL[view.kind] || view.kind}
					</Badge>
				</div>
			</div>
			<div style={{ padding: '24px 14px 14px' }}>
				<div
					style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
				>
					<span style={{ font: `600 14.5px ${T.sans}` }}>{view.name}</span>
					<VisibilityChip level={visChip(view.visibility)} compact />
				</div>
				<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 2 }}>
					{subtitleOf(view, null)}
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 11 }}>
					<span
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 5,
							font: `12px ${T.mono}`,
							color: T.sub,
						}}
					>
						<Icon name="heart" size={14} color={T.err} />
						{view.combat.hp}/{view.combat.maxHp}
					</span>
					<span
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 5,
							font: `12px ${T.mono}`,
							color: T.sub,
						}}
					>
						<Icon name="shield" size={14} color={T.info} />
						{view.combat.ac}
					</span>
					{conditions.length > 0 && (
						<span style={{ font: `12px ${T.mono}`, color: T.ter }}>{conditions.length} cond.</span>
					)}
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
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 6,
					border: 'none',
					background: 'transparent',
					cursor: 'pointer',
					color: T.ter,
					font: `600 12px ${T.sans}`,
					letterSpacing: '.04em',
					textTransform: 'uppercase',
				}}
			>
				<Icon name="chevron-left" size={14} />
				Characters
			</button>
		</nav>
	);
}

// ── The live character sheet, bound to the redacted core view ───────────────────────────────────
function CharacterSheet({ id, onBack }: { id: string; onBack: () => void }) {
	const runtime = useRuntime();
	const navigate = useNavigate();
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

	// Spellcasting local inputs (edit mode): add a known spell / declare a slot level (CHAR-008).
	const [spellName, setSpellName] = useState('');
	const [spellLevel, setSpellLevel] = useState('1');
	const [slotLevel, setSlotLevel] = useState('1');
	const [slotMax, setSlotMax] = useState('');

	// Attack-list editor rows (null ⇒ not editing). Saved through `character.update-attacks`
	// (full-replacement: the submitted rows ARE the new list; a row without an id is a new attack).
	const [attackRows, setAttackRows] = useState<
		{ id?: string; name: string; detail: string }[] | null
	>(null);
	// Sharing editor draft (null ⇒ read-only). Applied through the DM-only `character.set-sharing`.
	const [shareDraft, setShareDraft] = useState<{ visibility: string; sharedWith: string[] } | null>(
		null,
	);

	// The redacted view gates visibility (null when this actor may not see the character); the raw
	// record is read ONLY after that gate passes, so its resources/advancement never leak (the same
	// pattern as party-overview + the Svelte combat/advancement surfaces).
	const view = getCharacterForActor(
		runtime.state.characters,
		runtime.state.permissions,
		actorId,
		id,
	);
	const actor = runtime.state.permissions.actors[actorId] ?? null;
	const isDm = actor?.role === 'dm';
	const record = view ? (runtime.state.characters.characters[id] ?? null) : null;
	const resources = record ? resourcesOf(record) : null;
	const advancement = record ? advancementStateOf(record) : null;
	const players = runtime.actors.filter((a) => a.role === 'player');

	// Structured proficiency slice (hydrated with safe defaults on the view) + the PURE derived
	// queries: the effective proficiency bonus (explicit override, else derived from `data.level` by
	// the standard 5e progression) and passive perception (10 + WIS mod + perception proficiency).
	// Both derive on read — they can never drift from the stored scores/proficiencies.
	const prof = view?.proficiencies ?? null;
	const profBonus = record ? effectiveProficiencyBonus(record) : null;
	const passivePer = record ? passivePerception(record) : null;
	const hasProficiencyData =
		!!prof &&
		(Object.keys(prof.skills).length > 0 ||
			prof.saves.length > 0 ||
			prof.proficiencyBonus !== null ||
			prof.hitDice.total > 0);

	// Cross-links: notes that mention this character by name (the same actor-filtered full-text
	// read the ⌘K palette uses), so the sheet connects to the lore written about it.
	const mentions = useMemo(() => {
		const name = view?.name.trim();
		if (!name) return [];
		const result = searchVaultForActor(
			runtime.state.content,
			runtime.state.maps,
			runtime.state.permissions,
			runtime.state.session,
			actorId,
			{ query: name },
		);
		return result.hits.filter((h) => h.type === 'note' || h.type === 'object').slice(0, 6);
	}, [runtime.state, actorId, view?.name]);

	if (!view) {
		return (
			<Page max={920}>
				<BackBar onBack={onBack} />
				<EmptyState
					icon="dm-only"
					title="Character unavailable"
					description="This character is not visible to you."
				/>
			</Page>
		);
	}

	async function dispatch(command: any): Promise<boolean> {
		setError(null);
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			setError(result.rejection.message);
			return false;
		}
		return true;
	}

	// DM HP/AC/condition edits go through the durable, DM-only `character.set-combat` (no active-session
	// gate — the granular session-gated in-play hot path lives on the Session / Combat surfaces).
	async function applyHp(delta: number) {
		const next = clamp(view!.combat.hp + delta, 0, view!.combat.maxHp);
		await dispatch({
			type: 'character.set-combat',
			actorId,
			payload: { characterId: id, hp: next },
		});
	}
	async function applyAc() {
		const n = Math.trunc(Number(acDraft));
		if (!Number.isFinite(n)) return;
		if (
			await dispatch({ type: 'character.set-combat', actorId, payload: { characterId: id, ac: n } })
		)
			setAcDraft('');
	}
	async function setCondition(name: string, present: boolean) {
		const trimmed = name.trim();
		if (present && !trimmed) return;
		const current = view!.combat.conditions;
		const next = present
			? current.some((c) => c.toLowerCase() === trimmed.toLowerCase())
				? current
				: [...current, trimmed]
			: current.filter((c) => c !== name);
		if (
			(await dispatch({
				type: 'character.set-combat',
				actorId,
				payload: { characterId: id, conditions: next },
			})) &&
			present
		) {
			setConditionInput('');
		}
	}
	async function saveName() {
		setEditingName(false);
		const next = nameDraft.trim();
		if (!next || next === view!.name) return;
		await dispatch({
			type: 'character.edit-field',
			actorId,
			payload: { characterId: id, path: 'name', value: next },
		});
	}

	// CHAR-008 spell/slot writes — DM or character owner, NOT session-gated (unlike CHAR-007's
	// `update-combat-resource`), so the DM sheet can spend/restore slots outside a live session.
	// Same command pattern as the /player resources tab.
	async function toggleSlot(level: number, max: number, expended: number, filled: boolean) {
		// Clicking a filled diamond expends a slot; a hollow one recovers it.
		const nextExpended = filled ? Math.min(max, expended + 1) : Math.max(0, expended - 1);
		await dispatch({
			type: 'character.set-spell-slots',
			actorId,
			payload: { characterId: id, level, max, expended: nextExpended },
		});
	}
	async function togglePrepared(s: PreparedSpell) {
		await dispatch({
			type: 'character.set-spell',
			actorId,
			payload: { characterId: id, id: s.id, name: s.name, level: s.level, prepared: !s.prepared },
		});
	}
	async function addSpell() {
		const trimmed = spellName.trim();
		if (!trimmed) return;
		const level = clamp(Math.trunc(Number(spellLevel) || 0), 0, 9);
		if (
			await dispatch({
				type: 'character.set-spell',
				actorId,
				payload: { characterId: id, id: runtime.newId(), name: trimmed, level, prepared: true },
			})
		) {
			setSpellName('');
		}
	}
	async function declareSlots() {
		const level = clamp(Math.trunc(Number(slotLevel) || 0), 0, 9);
		const max = Math.max(0, Math.trunc(Number(slotMax)));
		if (!Number.isFinite(Number(slotMax)) || slotMax.trim() === '') return;
		if (
			await dispatch({
				type: 'character.set-spell-slots',
				actorId,
				payload: { characterId: id, level, max },
			})
		) {
			setSlotMax('');
		}
	}

	// Post-create attack editing (owner-or-DM, `character.update-attacks`): the saved rows replace the
	// whole list in one validated step, so add/edit/remove all flow through the same command.
	async function saveAttacks() {
		if (!attackRows) return;
		const attacks = attackRows
			.filter((a) => a.name.trim())
			.map((a) => ({
				...(a.id ? { id: a.id } : {}),
				name: a.name.trim(),
				detail: a.detail.trim(),
			}));
		if (
			await dispatch({
				type: 'character.update-attacks',
				actorId,
				payload: { characterId: id, attacks },
			})
		) {
			setAttackRows(null);
		}
	}

	// Sharing (DM-only `character.set-sharing`): entity visibility + the explicit `sharedWith`
	// delivery list. `sharedWith` is always sent as-is so flipping the level never silently drops a
	// PC's owner from the delivery list (visibility never narrows/widens as a side effect).
	async function applySharing() {
		if (!shareDraft) return;
		if (
			await dispatch({
				type: 'character.set-sharing',
				actorId,
				payload: {
					characterId: id,
					visibility: shareDraft.visibility,
					sharedWith: shareDraft.sharedWith,
				},
			})
		) {
			setShareDraft(null);
		}
	}

	// Advancement (CHAR-009) — DM/owner only. set-combat authority differs (DM-only) from advancement
	// (DM or character owner); the core re-enforces both on dispatch.
	const canAdvance = isDm; // owner grants aren't surfaced on this screen; the DM is the default actor.
	const draft = advancement?.draft ?? null;
	const xpEligible = record ? checkAdvancementEligibility(record, 'xp') : null;
	const draftValidation = draft ? validateAdvancement(draft) : null;
	// `set-advancement-choices` requires at least one choice (schema `.refine`); guard the button so a
	// blank "Save choices" can't fire a rejected dispatch.
	const hasAdvancementChoice = !!(
		className.trim() ||
		hpGained.trim() ||
		subclass.trim() ||
		abilityOrFeat.trim()
	);

	async function setXp() {
		const n = Math.max(0, Math.trunc(Number(xpInput) || 0));
		if (await dispatch({ type: 'character.set-xp', actorId, payload: { characterId: id, xp: n } }))
			setXpInput('');
	}
	async function openAdvancement(mode: 'xp' | 'milestone') {
		await dispatch({
			type: 'character.open-advancement',
			actorId,
			payload: { characterId: id, mode },
		});
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
		if (
			await dispatch({
				type: 'character.commit-advancement',
				actorId,
				payload: { characterId: id },
			})
		) {
			setClassName('');
			setHpGained('');
			setSubclass('');
			setAbilityOrFeat('');
		}
	}
	async function cancelAdvancement() {
		await dispatch({ type: 'character.cancel-advancement', actorId, payload: { characterId: id } });
	}

	const abilityCells = ABILITIES.map((k) => ({
		key: k.toUpperCase(),
		val: view.abilityScores[k],
	})).filter((a) => typeof a.val === 'number') as { key: string; val: number }[];
	const slots = resources
		? Object.values(resources.spellSlots).sort((a, b) => a.level - b.level)
		: [];
	const classResources = resources ? Object.values(resources.classResources) : [];
	const spells = resources
		? [...resources.spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
		: [];
	// Show the panel whenever the character has ANY casting structure, or when the DM is editing (so
	// spells/slots can be declared on a character that has none yet).
	const hasSpellcasting =
		slots.length > 0 || classResources.length > 0 || spells.length > 0 || (editMode && isDm);

	return (
		<Page max={1000}>
			<BackBar onBack={onBack} />
			{error && (
				<div role="alert" style={{ marginBottom: 12, font: `13px ${T.sans}`, color: T.err }}>
					{error}
				</div>
			)}
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					gap: 16,
					marginBottom: 18,
					flexWrap: 'wrap',
				}}
			>
				<Avatar name={view.name} size="xl" ring="turn" />
				<div style={{ flex: 1, minWidth: 200 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
						{editingName ? (
							<Input
								value={nameDraft}
								autoFocus
								onChange={(e: any) => setNameDraft(e.target.value)}
								onBlur={saveName}
								onKeyDown={(e: any) => {
									if (e.key === 'Enter') saveName();
									if (e.key === 'Escape') setEditingName(false);
								}}
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
										onClick={() => {
											setNameDraft(view.name);
											setEditingName(true);
										}}
									/>
								)}
							</>
						)}
						<Badge status={KIND_TONE[view.kind] || 'neutral'}>
							{KIND_LABEL[view.kind] || view.kind}
						</Badge>
						<VisibilityChip level={visChip(view.visibility)} />
					</div>
					<div style={{ font: `13.5px ${T.sans}`, color: T.sub, marginTop: 4 }}>
						{subtitleOf(view, advancement?.level ?? null)}
					</div>
				</div>
				<div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
					<Stat label="AC" value={String(view.combat.ac)} icon="shield" />
					{advancement && <Stat label="Level" value={String(advancement.level)} />}
					{isDm && (
						<Button
							variant={editMode ? 'primary' : 'secondary'}
							size="sm"
							icon="note-edit"
							onClick={() => {
								setEditMode((v) => !v);
								setAttackRows(null);
								setShareDraft(null);
							}}
						>
							{editMode ? 'Done' : 'Edit'}
						</Button>
					)}
				</div>
			</div>

			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)',
					gap: 16,
					alignItems: 'start',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					{abilityCells.length > 0 ? (
						<Panel title="Ability scores">
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
								{abilityCells.map((a) => (
									<AbilityScore
										key={a.key}
										label={a.key}
										score={a.val}
										modifier={abilityModifier(a.val)}
									/>
								))}
							</div>
						</Panel>
					) : null}

					{/* Skills / saves / hit dice / passive perception — the structured `proficiencies` slice.
					    Bonuses derive from the pure core queries (effectiveProficiencyBonus / passivePerception)
					    plus the shared skill registry; nothing here is stored, so it can never drift. */}
					<Panel title="Skills & saves">
						{hasProficiencyData && prof && profBonus !== null ? (
							<>
								<div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
									<Stat label="Proficiency" value={sgn(profBonus)} />
									{passivePer !== null && (
										<Stat
											label="Passive Perception"
											value={String(passivePer)}
											icon="visibility-players"
										/>
									)}
									{prof.hitDice.total > 0 && (
										<Stat
											label="Hit dice"
											value={`${prof.hitDice.total - prof.hitDice.spent}/${prof.hitDice.total} ${prof.hitDice.die}`}
										/>
									)}
								</div>
								<div style={{ ...eb, marginBottom: 6 }}>Saving throws</div>
								<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
									{ABILITY_IDS.map((a) => {
										const proficient = prof.saves.includes(a);
										const bonus =
											abilityModifier(view.abilityScores[a] ?? 10) + (proficient ? profBonus : 0);
										return (
											<span
												key={a}
												style={{
													display: 'inline-flex',
													alignItems: 'center',
													gap: 6,
													padding: '4px 10px',
													borderRadius: 16,
													font: `12px ${T.sans}`,
													border: `1px solid ${proficient ? T.accBd : T.bd}`,
													background: proficient ? T.accSub : T.surf,
													color: proficient ? T.acc : T.ter,
												}}
											>
												{a.toUpperCase()}
												<span style={mono}>{sgn(bonus)}</span>
											</span>
										);
									})}
								</div>
								<div style={{ ...eb, marginBottom: 6 }}>Skills</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 18px' }}>
									{SKILLS.map((s) => {
										const level = prof.skills[s.id] ?? 'none';
										const bonus =
											abilityModifier(view.abilityScores[s.ability] ?? 10) +
											(level === 'expertise'
												? profBonus * 2
												: level === 'proficient'
													? profBonus
													: 0);
										return (
											<div
												key={s.id}
												style={{
													display: 'flex',
													alignItems: 'center',
													gap: 8,
													font: `12.5px ${T.sans}`,
													color: level === 'none' ? T.ter : T.ink,
												}}
											>
												<span
													aria-hidden
													style={{
														width: 8,
														height: 8,
														borderRadius: '50%',
														flex: '0 0 auto',
														background: level === 'none' ? 'transparent' : T.acc,
														border: `1.5px solid ${level === 'none' ? T.bdS : T.acc}`,
													}}
												/>
												<span style={{ flex: 1, minWidth: 0 }}>
													{s.label}
													{level === 'expertise' ? ' ★' : ''}
												</span>
												<span style={mono}>{sgn(bonus)}</span>
											</div>
										);
									})}
								</div>
								<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 8 }}>
									● proficient · ★ expertise (double proficiency)
								</div>
							</>
						) : (
							// Honest empty state — no fabricated skill sheet when the character carries no
							// proficiency data (older records, bare quick-creates).
							<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
								No skills, saves, or hit dice recorded for this character. Import a character file
								(JSON) or set proficiencies to see save/skill bonuses and passive perception here.
							</div>
						)}
					</Panel>

					<Panel
						title="Attacks"
						action={
							editMode && isDm && attackRows === null ? (
								<Button
									variant="secondary"
									size="sm"
									icon="note-edit"
									onClick={() =>
										setAttackRows(
											view.attacks.map((a: any) => ({
												id: a.id,
												name: a.name,
												detail: a.detail ?? '',
											})),
										)
									}
								>
									Edit attacks
								</Button>
							) : undefined
						}
					>
						{attackRows !== null ? (
							// Full-replacement editor: the saved rows become the attack list via
							// `character.update-attacks` (rows without an id are new attacks).
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								{attackRows.map((a, idx) => (
									<div
										key={a.id ?? `new-${idx}`}
										style={{
											display: 'grid',
											gridTemplateColumns: '1fr 1.5fr 28px',
											gap: 8,
											alignItems: 'center',
										}}
									>
										<Input
											value={a.name}
											aria-label="Attack name"
											placeholder="Name"
											onChange={(e: any) =>
												setAttackRows((rows) =>
													rows!.map((x, j) => (j === idx ? { ...x, name: e.target.value } : x)),
												)
											}
										/>
										<Input
											value={a.detail}
											aria-label="Attack detail"
											placeholder="e.g. Melee · +4 to hit · 1d8+2 slashing"
											onChange={(e: any) =>
												setAttackRows((rows) =>
													rows!.map((x, j) => (j === idx ? { ...x, detail: e.target.value } : x)),
												)
											}
										/>
										<IconButton
											icon="close"
											label="Remove attack"
											variant="ghost"
											size="sm"
											onClick={() => setAttackRows((rows) => rows!.filter((_, j) => j !== idx))}
										/>
									</div>
								))}
								{attackRows.length === 0 && (
									<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
										Saving with no rows clears the attack list.
									</div>
								)}
								<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
									<Button
										variant="secondary"
										size="sm"
										icon="add"
										onClick={() =>
											setAttackRows((rows) => [...(rows ?? []), { name: '', detail: '' }])
										}
									>
										Add attack
									</Button>
									<div style={{ flex: 1 }} />
									<Button variant="ghost" size="sm" onClick={() => setAttackRows(null)}>
										Cancel
									</Button>
									<Button variant="primary" size="sm" onClick={saveAttacks}>
										Save attacks
									</Button>
								</div>
							</div>
						) : view.attacks.length > 0 ? (
							<DataTable
								columns={[
									{ key: 'name', header: 'Name', strong: true },
									{ key: 'detail', header: 'Detail', mono: true },
								]}
								rows={view.attacks}
								rowKey={(r: any) => r.id}
							/>
						) : (
							<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
								No attacks recorded.{isDm ? ' Use Edit to add them.' : ''}
							</div>
						)}
					</Panel>

					{canAdvance && advancement && (
						<Panel title="Advancement">
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 14,
									flexWrap: 'wrap',
									font: `13px ${T.sans}`,
									color: T.sub,
								}}
							>
								<span style={mono}>Level {advancement.level}</span>
								<span style={mono}>XP {advancement.xp}</span>
								{advancement.level < 20 && (
									<span style={{ color: T.ter }}>
										next at {xpForLevel(advancement.level + 1) ?? '—'} XP
									</span>
								)}
							</div>
							{draft ? (
								<div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
									<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
										Advancing to level {draft.toLevel} ({draft.mode}).
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
										<Field label="Class gaining the level">
											<Input
												value={className}
												onChange={(e: any) => setClassName(e.target.value)}
											/>
										</Field>
										<Field label="Hit points gained">
											<Input
												type="number"
												value={hpGained}
												onChange={(e: any) => setHpGained(e.target.value)}
											/>
										</Field>
										<Field label="Subclass (if required)">
											<Input value={subclass} onChange={(e: any) => setSubclass(e.target.value)} />
										</Field>
										<Field label="Ability / feat (if required)">
											<Input
												value={abilityOrFeat}
												onChange={(e: any) => setAbilityOrFeat(e.target.value)}
											/>
										</Field>
									</div>
									{draftValidation && draftValidation.issues.length > 0 ? (
										<ul
											style={{
												margin: 0,
												paddingLeft: 18,
												font: `12.5px ${T.sans}`,
												color: T.warn ?? T.sub,
											}}
										>
											{draftValidation.issues.map((iss: any) => (
												<li key={iss.field}>{iss.message}</li>
											))}
										</ul>
									) : draftValidation?.complete ? (
										<div style={{ font: `12.5px ${T.sans}`, color: T.acc }}>
											All choices valid — ready to finalize.
										</div>
									) : null}
									<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
										<Button
											variant="secondary"
											size="sm"
											disabled={!hasAdvancementChoice}
											onClick={saveChoices}
										>
											Save choices
										</Button>
										<Button
											variant="primary"
											size="sm"
											disabled={!draftValidation?.complete}
											onClick={commitAdvancement}
										>
											Finalize level-up
										</Button>
										<Button variant="ghost" size="sm" onClick={cancelAdvancement}>
											Cancel
										</Button>
									</div>
								</div>
							) : (
								<div
									style={{
										marginTop: 12,
										display: 'flex',
										gap: 8,
										alignItems: 'flex-end',
										flexWrap: 'wrap',
									}}
								>
									<Field label="Set XP" style={{ width: 120 }}>
										<Input
											type="number"
											value={xpInput}
											onChange={(e: any) => setXpInput(e.target.value)}
										/>
									</Field>
									<Button variant="secondary" size="sm" onClick={setXp}>
										Set XP
									</Button>
									<Button
										variant="primary"
										size="sm"
										disabled={!xpEligible?.eligible}
										onClick={() => openAdvancement('xp')}
									>
										Level up (XP)
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onClick={() => openAdvancement('milestone')}
									>
										Level up (milestone)
									</Button>
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
								<Stat
									label="Death saves"
									value={`${resources.deathSaves.successes}✓ / ${resources.deathSaves.failures}✗`}
								/>
							)}
						</div>
						<div style={{ ...eb, marginTop: 10 }}>Conditions</div>
						{/* DS ConditionTracker — the character-sheet template's stacked condition set; each
						    registry key keeps its DISTINCT icon shape (grayscale-safe), unknown strings render
						    as labeled badges. Removal (edit mode) round-trips character.set-combat. The add
						    picker stays the Select below (addable=false avoids a second, dangling affordance). */}
						{view.combat.conditions.length ? (
							<ConditionTracker
								entries={view.combat.conditions.map((c) => condKey(c) ?? c)}
								compact={!editMode}
								addable={false}
								onRemove={
									editMode && isDm
										? (_key: string, idx: number) =>
												setCondition(view!.combat.conditions[idx], false)
										: undefined
								}
							/>
						) : (
							<span style={{ font: `13px ${T.sans}`, color: T.ter }}>None</span>
						)}

						{editMode && isDm && (
							<div
								style={{
									marginTop: 12,
									display: 'flex',
									flexDirection: 'column',
									gap: 10,
									borderTop: `1px solid ${T.bd}`,
									paddingTop: 12,
								}}
							>
								<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
									<Field label="Amount" style={{ width: 90 }}>
										<Input
											type="number"
											min={1}
											value={hpAmount}
											onChange={(e: any) =>
												setHpAmount(Math.max(1, Math.trunc(Number(e.target.value) || 1)))
											}
										/>
									</Field>
									<Button variant="secondary" size="sm" onClick={() => applyHp(-hpAmount)}>
										Damage
									</Button>
									<Button variant="secondary" size="sm" onClick={() => applyHp(hpAmount)}>
										Heal
									</Button>
								</div>
								<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
									<Field label="Set AC" style={{ width: 90 }}>
										<Input
											type="number"
											value={acDraft}
											placeholder={String(view.combat.ac)}
											onChange={(e: any) => setAcDraft(e.target.value)}
										/>
									</Field>
									<Button variant="secondary" size="sm" onClick={applyAc}>
										Set AC
									</Button>
								</div>
								<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
									<Field label="Add condition" style={{ minWidth: 160, flex: 1 }}>
										<Select
											value={conditionInput}
											onChange={(e: any) => setConditionInput(e.target.value)}
											options={[
												{ value: '', label: 'Choose…' },
												...STANDARD_CONDITIONS.map((c) => ({ value: c, label: c })),
											]}
										/>
									</Field>
									<Button
										variant="secondary"
										size="sm"
										disabled={!conditionInput}
										onClick={() => setCondition(conditionInput, true)}
									>
										Add
									</Button>
								</div>
							</div>
						)}
					</Panel>

					{hasSpellcasting && (
						<Panel title="Spellcasting">
							{slots.length > 0 && (
								// Live slot economy (character-sheet template: SpellSlots WITH onToggle) — a pip
								// click spends/recovers through character.set-spell-slots (CHAR-008, DM-or-owner,
								// no session gate). Read-only for any non-DM viewer of this DM sheet.
								<SpellSlots
									readOnly={!isDm}
									levels={slots.map((sl) => ({
										level: sl.level,
										total: sl.max,
										used: sl.max - availableSlots(sl),
									}))}
									onToggle={(level: number, _idx: number, filled: boolean) => {
										const sl = slots.find((s) => s.level === level);
										if (sl) toggleSlot(sl.level, sl.max, sl.max - availableSlots(sl), filled);
									}}
								/>
							)}
							{classResources.length > 0 && (
								<div
									style={{
										marginTop: slots.length ? 12 : 0,
										display: 'flex',
										flexDirection: 'column',
										gap: 6,
									}}
								>
									{classResources.map((r) => (
										<div
											key={r.id}
											style={{
												display: 'flex',
												justifyContent: 'space-between',
												font: `12.5px ${T.sans}`,
												color: T.sub,
											}}
										>
											<span>{r.name}</span>
											<span style={mono}>
												{availableClassResource(r)}/{r.max}
											</span>
										</div>
									))}
								</div>
							)}
							{spells.length > 0 && (
								<div style={{ marginTop: slots.length || classResources.length ? 12 : 0 }}>
									{/* WHAT the character can cast — resources.spells (CHAR-008 PreparedSpell).
									    The extended detail fields (school / casting time / range / components /
									    duration, set via character.set-spell) render as a meta line when present;
									    older {id,name,level,prepared} records show the name alone — no field is
									    ever fabricated. Prepared toggles via character.set-spell. */}
									<div style={{ ...eb, marginBottom: 6 }}>
										Spells ({spells.filter((s) => s.prepared).length} prepared)
									</div>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
										{spells.map((s) => (
											<div
												key={s.id}
												style={{
													display: 'flex',
													alignItems: 'center',
													gap: 10,
													padding: '7px 10px',
													borderRadius: 9,
													border: `1px solid ${T.bd}`,
													background: T.surf,
												}}
											>
												<span
													style={{
														width: 24,
														height: 24,
														borderRadius: 6,
														flex: '0 0 auto',
														display: 'flex',
														alignItems: 'center',
														justifyContent: 'center',
														font: `700 12px ${T.mono}`,
														background: T.alt,
														color: T.acc,
													}}
													title={s.level === 0 ? 'Cantrip' : `Level ${s.level}`}
												>
													{s.level}
												</span>
												<span style={{ flex: 1, minWidth: 0 }}>
													<span style={{ display: 'block', font: `600 12.5px ${T.sans}` }}>
														{s.name}
													</span>
													{(s.school || s.castingTime || s.range || s.components || s.duration) && (
														<span
															style={{
																display: 'block',
																font: `11px ${T.sans}`,
																color: T.ter,
																marginTop: 1,
															}}
														>
															{[s.school, s.castingTime, s.range, s.components, s.duration]
																.filter(Boolean)
																.join(' · ')}
														</span>
													)}
												</span>
												{isDm ? (
													<button
														type="button"
														aria-pressed={s.prepared}
														onClick={() => togglePrepared(s)}
														style={{
															display: 'inline-flex',
															alignItems: 'center',
															gap: 5,
															padding: '3px 9px',
															borderRadius: 14,
															cursor: 'pointer',
															font: `11px ${T.sans}`,
															border: `1px solid ${s.prepared ? T.accBd : T.bd}`,
															background: s.prepared ? T.accSub : T.surf,
															color: s.prepared ? T.acc : T.ter,
														}}
													>
														{s.prepared && <Icon name="check" size={12} />}
														{s.prepared ? 'Prepared' : 'Not prepared'}
													</button>
												) : (
													<Badge status={s.prepared ? 'success' : 'neutral'}>
														{s.prepared ? 'Prepared' : 'Known'}
													</Badge>
												)}
											</div>
										))}
									</div>
								</div>
							)}
							{editMode && isDm && (
								<div
									style={{
										marginTop: 12,
										display: 'flex',
										flexDirection: 'column',
										gap: 10,
										borderTop: `1px solid ${T.bd}`,
										paddingTop: 12,
									}}
								>
									<div
										style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
									>
										<Field label="Add spell" style={{ minWidth: 140, flex: 1 }}>
											<Input
												value={spellName}
												placeholder="Cure Wounds"
												onChange={(e: any) => setSpellName(e.target.value)}
											/>
										</Field>
										<Field label="Level" style={{ width: 70 }}>
											<Input
												type="number"
												min={0}
												max={9}
												value={spellLevel}
												onChange={(e: any) => setSpellLevel(e.target.value)}
											/>
										</Field>
										<Button
											variant="secondary"
											size="sm"
											disabled={!spellName.trim()}
											onClick={addSpell}
										>
											Add
										</Button>
									</div>
									<div
										style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
									>
										<Field label="Slot level" style={{ width: 90 }}>
											<Input
												type="number"
												min={0}
												max={9}
												value={slotLevel}
												onChange={(e: any) => setSlotLevel(e.target.value)}
											/>
										</Field>
										<Field label="Max slots" style={{ width: 90 }}>
											<Input
												type="number"
												min={0}
												value={slotMax}
												placeholder="0"
												onChange={(e: any) => setSlotMax(e.target.value)}
											/>
										</Field>
										<Button
											variant="secondary"
											size="sm"
											disabled={slotMax.trim() === ''}
											onClick={declareSlots}
										>
											Set slots
										</Button>
									</div>
								</div>
							)}
						</Panel>
					)}

					<Panel title="Reference">
						<DefinitionList
							items={[
								{ label: 'Type', value: KIND_LABEL[view.kind] || view.kind },
								// Builder-authored sheet fields (validated `data.*` writes) — rendered when present.
								...(typeof view.data.race === 'string'
									? [{ label: 'Race', value: String(view.data.race) }]
									: []),
								...(typeof view.data.subclass === 'string'
									? [{ label: 'Subclass', value: String(view.data.subclass) }]
									: []),
								...(typeof view.data.alignment === 'string'
									? [{ label: 'Alignment', value: String(view.data.alignment) }]
									: []),
								...(typeof view.data.speed === 'string'
									? [{ label: 'Speed', value: `${view.data.speed} ft`, mono: true }]
									: []),
								{ label: 'Armor class', value: String(view.combat.ac), mono: true },
								{
									label: 'Hit points',
									value: `${view.combat.hp} / ${view.combat.maxHp}`,
									mono: true,
								},
								...(view.combat.tempHp > 0
									? [{ label: 'Temp HP', value: String(view.combat.tempHp), mono: true }]
									: []),
								{
									label: 'Visible to',
									value: <VisibilityChip level={visChip(view.visibility)} compact />,
								},
								...(typeof view.data.dmNotes === 'string'
									? [{ label: 'DM notes', value: String(view.data.dmNotes) }]
									: []),
							]}
						/>
					</Panel>

					{/* Sharing — the DM-only `character.set-sharing` (entity visibility + the explicit
					    `sharedWith` delivery list). Fail-closed: nothing here widens by default; the DM
					    states the audience and applies it in one command. */}
					{isDm && record && (
						<Panel
							title="Sharing"
							action={
								shareDraft === null ? (
									<Button
										variant="secondary"
										size="sm"
										icon="visibility-players"
										onClick={() =>
											setShareDraft({
												visibility: record.visibility,
												sharedWith: [...record.sharedWith],
											})
										}
									>
										Change
									</Button>
								) : undefined
							}
						>
							{shareDraft ? (
								<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
									<Field label="Who can see this character">
										<Select
											value={shareDraft.visibility}
											onChange={(e: any) =>
												setShareDraft((d) => ({ ...d!, visibility: e.target.value }))
											}
											options={[
												{ value: 'dm-only', label: 'DM only' },
												{ value: 'player-visible', label: 'All players' },
												{ value: 'shared', label: 'Specific players' },
											]}
										/>
									</Field>
									{shareDraft.visibility === 'shared' &&
										(players.length > 0 ? (
											<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
												{players.map((p) => {
													const on = shareDraft.sharedWith.includes(p.id);
													return (
														<button
															key={p.id}
															type="button"
															aria-pressed={on}
															onClick={() =>
																setShareDraft((d) => ({
																	...d!,
																	sharedWith: on
																		? d!.sharedWith.filter((x) => x !== p.id)
																		: [...d!.sharedWith, p.id],
																}))
															}
															style={{
																display: 'inline-flex',
																alignItems: 'center',
																gap: 5,
																padding: '4px 10px',
																borderRadius: 16,
																cursor: 'pointer',
																font: `12px ${T.sans}`,
																border: `1px solid ${on ? T.accBd : T.bd}`,
																background: on ? T.accSub : T.surf,
																color: on ? T.acc : T.ter,
															}}
														>
															{on && <Icon name="check" size={12} />}
															{p.displayName}
														</button>
													);
												})}
											</div>
										) : (
											<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
												No players yet — add a player in Settings first.
											</div>
										))}
									<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
										<Button variant="ghost" size="sm" onClick={() => setShareDraft(null)}>
											Cancel
										</Button>
										<Button variant="primary" size="sm" onClick={applySharing}>
											Apply
										</Button>
									</div>
								</div>
							) : (
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
									<VisibilityChip level={visChip(view.visibility)} />
									<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
										{view.visibility === 'dm-only'
											? 'Hidden from players until you share it.'
											: view.visibility === 'shared'
												? record.sharedWith.length > 0
													? `Shared with ${record.sharedWith.map((aid) => runtime.state.permissions.actors[aid]?.displayName ?? aid).join(', ')}.`
													: 'Shared, but delivered to no one yet.'
												: 'Visible to all players.'}
									</span>
								</div>
							)}
						</Panel>
					)}

					{typeof view.data.bio === 'string' && view.data.bio.trim() !== '' && (
						<Panel title="Bio">
							<div style={{ font: `13px/1.6 ${T.sans}`, color: T.sub }}>
								{String(view.data.bio)}
							</div>
						</Panel>
					)}

					{mentions.length > 0 && (
						<Panel title="Mentioned in">
							{mentions.map((hit) => (
								<button
									key={`${hit.type}:${hit.id}`}
									type="button"
									onClick={() =>
										navigate(hit.type === 'note' ? `/knowledge/${hit.id}` : '/campaign')
									}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										padding: '6px 0',
										width: '100%',
										border: 'none',
										background: 'transparent',
										textAlign: 'left',
										cursor: 'pointer',
										font: `12.5px ${T.sans}`,
										color: T.acc,
									}}
									onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
									onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
								>
									<Icon
										name={hit.type === 'note' ? 'knowledge-book' : 'flag'}
										size={14}
										color={T.ter}
									/>
									<span
										style={{
											flex: 1,
											minWidth: 0,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										}}
									>
										{hit.title}
									</span>
									<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
										{hit.type === 'note' ? 'Note' : 'Dossier'}
									</span>
								</button>
							))}
						</Panel>
					)}
				</div>
			</div>
		</Page>
	);
}

export function Characters() {
	const runtime = useRuntime();
	const navigate = useNavigate();
	const location = useLocation();
	// URL-driven detail (`/characters/:id`) so Story cards, palette hits, and note mentions can
	// deep-link a specific sheet instead of dumping the user on the roster.
	const { id: detailId = null } = useParams<{ id: string }>();
	const actorId = runtime.defaultActorId;
	const [kind, setKind] = useState('all');
	const [creating, setCreating] = useState(false);
	const [initialKind, setInitialKind] = useState<string | null>(null);
	// When set, the CharBuilder overlay opens straight into the file-import path (WS-4 JSON import).
	const [importIntent, setImportIntent] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	// Create-intent handoff: "New character" launchers elsewhere (home hub, ⌘K) navigate here with
	// router state instead of leaving the user to re-find the button. Consumed once, then cleared.
	useEffect(() => {
		const intent = (location.state ?? null) as { create?: boolean; kind?: string } | null;
		if (intent?.create) {
			setCreating(true);
			setInitialKind(typeof intent.kind === 'string' ? intent.kind : null);
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.state, location.pathname, navigate]);

	const data = useMemo(() => {
		const actor = runtime.state.permissions.actors[actorId] ?? null;
		const characters = listCharactersForActor(
			runtime.state.characters,
			runtime.state.permissions,
			actorId,
		);
		return { isDm: actor?.role === 'dm', characters };
	}, [runtime.state, actorId]);

	if (detailId) return <CharacterSheet id={detailId} onBack={() => navigate('/characters')} />;

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
				combatants: partyPcs.map((c) => ({
					kind: 'character',
					name: c.name,
					characterId: c.id,
					ac: c.combat.ac,
					maxHp: c.combat.maxHp,
					initiative: 0,
				})),
			},
		});
		setNotice(
			result.status === 'rejected'
				? result.rejection.message
				: 'Combat started — open the Session screen to run it.',
		);
	}

	return (
		<Page>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					marginBottom: 18,
					flexWrap: 'wrap',
				}}
			>
				<Tabs value={kind} onChange={setKind} tabs={tabs} />
				<div style={{ flex: 1 }} />
				{data.isDm && partyPcs.length > 0 && (
					<Button variant="ghost" size="sm" icon="sword" onClick={startCombat}>
						Start combat
					</Button>
				)}
				{/* REAL import (WS-4): opens the CharBuilder's file-import path — a D&D Beyond export or
				    native JSON, previewed field-by-field (fail closed) before anything is created. */}
				{data.isDm && (
					<Button
						variant="ghost"
						size="sm"
						icon="import"
						onClick={() => {
							setImportIntent(true);
							setCreating(true);
						}}
					>
						Import character (JSON)
					</Button>
				)}
				{data.isDm && (
					<Button
						variant="primary"
						size="sm"
						icon="new-character"
						onClick={() => setCreating(true)}
					>
						New character
					</Button>
				)}
			</div>

			{notice && (
				<div
					role="status"
					style={{
						marginBottom: 14,
						font: `13px ${T.sans}`,
						color: T.sub,
						background: T.accSub,
						border: `1px solid ${T.accBd}`,
						borderRadius: 8,
						padding: '8px 12px',
					}}
				>
					{notice}
				</div>
			)}

			{list.length === 0 ? (
				<EmptyState
					icon="characters-person"
					title={data.characters.length === 0 ? 'Your roster is empty' : 'Nothing in this view'}
					description={
						data.characters.length === 0
							? 'Add the party’s heroes, then the NPCs they’ll meet.'
							: 'No characters match this filter.'
					}
					action={
						data.isDm ? (
							<Button
								variant="primary"
								size="sm"
								icon="new-character"
								onClick={() => setCreating(true)}
							>
								New character
							</Button>
						) : undefined
					}
				/>
			) : (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))',
						gap: 16,
					}}
				>
					{list.map((c) => (
						<CharCard key={c.id} view={c} onOpen={() => navigate(`/characters/${c.id}`)} />
					))}
				</div>
			)}

			{/* The guided creation overlay (ported design-prototype wizard): PC → real core draft flow;
			    NPC/Monster/Sidekick → character.quick-create. Created characters open their sheet. */}
			{creating && data.isDm && (
				<CharBuilder
					initialKind={initialKind ?? undefined}
					initialAction={importIntent ? 'import' : undefined}
					onClose={() => {
						setCreating(false);
						setInitialKind(null);
						setImportIntent(false);
					}}
					onCreated={(id) => {
						setCreating(false);
						setInitialKind(null);
						setImportIntent(false);
						navigate(`/characters/${id}`);
					}}
				/>
			)}
		</Page>
	);
}
