import { useMemo, useState } from 'react';
import {
	advancementStateOf,
	checkAdvancementEligibility,
	computeEncumbrance,
	effectiveProficiencyBonus,
	getCharacterForActor,
	getCharacterJournalForActor,
	getPartyOverviewForActor,
	hasGrantedCapability,
	inventoryOf,
	listCharactersForActor,
	passivePerception,
	resourcesOf,
	availableSlots,
	validateAdvancement,
	xpForLevel,
	CHARACTER_ENTITY_TYPE,
	type AdvancementState,
	type CharacterInventory,
	type CharacterResources,
	type CharacterView,
	type EligibilityResult,
	type EncumbranceState,
	type EquipmentItem,
	type JournalEntryView,
	type PartyOverview,
} from '@dndtools/core';
import { ABILITY_IDS, SKILLS } from '../app/charImport/skills';
import {
	Avatar,
	Badge,
	Button,
	Chip,
	ConditionBadge,
	CONDITIONS,
	DefinitionList,
	EmptyState,
	Field,
	HPBar,
	Icon,
	IconButton,
	Input,
	ProgressMeter,
	Select,
	SpellSlots,
	Stat,
	Tabs,
	tabPanelProps,
	Textarea,
	Toaster,
} from '../ds';
import { Page, Panel, T, eb } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { useViewport } from '../app/useViewport';

/**
 * Player — the second-persona character surface, fully core-backed (the last `DNDPlayer` mock
 * remnants are gone). The active actor is `runtime.defaultActorId` (the device owner / view-as
 * actor, exactly like CommandCenter): when that is the DM (or a granted character owner) the writes
 * below succeed; if the DM is previewing as a player, the Core faithfully rejects them read-only.
 *
 * REAL (actor-filtered) reads: the player's PC via {@link getCharacterForActor} (name, HP, AC,
 * conditions, ability scores, attacks, `data.*` sheet fields), its resource block via
 * {@link resourcesOf}, the advancement standing via {@link advancementStateOf} +
 * {@link checkAdvancementEligibility}, the party via {@link getPartyOverviewForActor}, and the
 * character journal via {@link getCharacterJournalForActor}.
 *
 * REAL writes (dispatched as the active actor): HP (`character.update-combat-resource`), spell-slot /
 * class-resource / prepared-spell toggles + rest (`character.set-spell-slots` /
 * `character.set-class-resource` / `character.set-spell` / `character.rest`), the STAGED LEVEL-UP
 * (`character.open-advancement` / `set-advancement-choices` / `commit-advancement` /
 * `cancel-advancement` — the same CHAR-009 flow as /characters), sheet identity fields through
 * `character.edit-field` (`data.race/subclass/background/speed/init/backstory/inspiration` — string
 * fields the core model carries generically), the journal (`character.add/update/remove-journal-entry`
 * + `set-journal-entry-visibility`, including the `personal-quest` / `session-highlight` entry kinds
 * that feed the side panels), and DM-only party logistics (`character.set-marching-order` /
 * `upsert-party-inventory-item` / `remove-party-inventory-item`).
 *
 * WS-4: the sheet mirrors the roster's proficiency panels — skills / saves / hit dice / passive
 * perception from the view's structured `proficiencies` block, with the PURE core queries
 * `effectiveProficiencyBonus` / `passivePerception` (derived on read after the visibility gate, the
 * same player-safe pattern as `resourcesOf`). A signed-in player may control MULTIPLE PCs: the
 * vitals bar carries a PC switcher (the actor-filtered PC list; the hardcoded first-PC pick is gone).
 *
 * I10 S10.1.3 / S10.4.2: the structured EQUIPMENT / CURRENCY / ENCUMBRANCE panel is now REAL — items
 * (name/qty/weight/equipped) and the five-coin purse are read from the durable character's `inventory`
 * via {@link inventoryOf}, the encumbrance band + carry capacity are DERIVED on read via
 * {@link computeEncumbrance}, and every mutation dispatches a `character.upsert/remove-equipment-item`
 * / `character.set-currency` command (owner-or-DM authority, re-enforced by the core).
 */

const ABIL_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABIL_LABEL: Record<string, string> = {
	str: 'STR',
	dex: 'DEX',
	con: 'CON',
	int: 'INT',
	wis: 'WIS',
	cha: 'CHA',
};
const ABIL_FULL: Record<string, string> = {
	STR: 'Strength',
	DEX: 'Dexterity',
	CON: 'Constitution',
	INT: 'Intelligence',
	WIS: 'Wisdom',
	CHA: 'Charisma',
};
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
const sgn = (n: number) => (n >= 0 ? '+' : '') + n;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const abilMod = (score: number) => Math.floor((score - 10) / 2);
function condKey(s: string): string | null {
	const C = (CONDITIONS as any) || {};
	const k = String(s).toLowerCase();
	return COND_ALIAS[k] || (C[k] ? k : null);
}

/** The journal-entry kinds the core accepts (schemas/commands.ts `journalEntryKindSchema`). */
const JOURNAL_KINDS = [
	{ value: 'note', label: 'Note' },
	{ value: 'bookmark', label: 'Bookmark' },
	{ value: 'npc-impression', label: 'NPC impression' },
	{ value: 'personal-quest', label: 'Personal quest' },
	{ value: 'session-highlight', label: 'Session highlight' },
];

/** Core data resolved for the active actor, plus the chosen PC id used by every write below. */
interface PlayerData {
	characterId: string | null;
	view: CharacterView | null;
	resources: CharacterResources | null;
	/** Every PC this actor may see (the switcher's options — a player may control multiple PCs). */
	pcs: { id: string; name: string }[];
	/** Pure derived reads (after the visibility gate): passive perception + effective prof bonus. */
	passive: number | null;
	profBonus: number | null;
	journal: JournalEntryView[];
	canAuthorJournal: boolean;
	/** I10 S10.1.3 / S10.4.2 — the durable structured inventory + the DERIVED encumbrance read model. */
	inventory: CharacterInventory | null;
	encumbrance: EncumbranceState | null;
	/** Owner-or-DM: whether the active actor may mutate this character's equipment/currency. */
	canManageInventory: boolean;
	party: PartyOverview;
	/** Real advancement standing from the CHAR-009 model (level, xp, staged draft). */
	advancement: AdvancementState | null;
	xpEligible: EligibilityResult | null;
	milestoneEligible: EligibilityResult | null;
	/** DM, or a granted character `owner` — the CHAR-009 command authority (re-checked by the core). */
	canAdvance: boolean;
	isDm: boolean;
}

export function Player() {
	const runtime = useRuntime();
	const viewport = useViewport();
	const actorId = runtime.defaultActorId;
	const state = runtime.state;

	// The switcher's selection — null falls back to the first visible PC. A signed-in player may
	// control multiple PCs (multiple `owner` grants / shared PCs), so the pick is theirs, not `pcs[0]`.
	const [pcChoice, setPcChoice] = useState<string | null>(null);

	const data = useMemo<PlayerData>(() => {
		// The player's PCs: every player-visible PC the actor may see (finalized PCs are `shared`
		// with their owning player actor, so a player sees their own; the DM sees the whole roster).
		const pcs = listCharactersForActor(state.characters, state.permissions, actorId).filter(
			(c) => c.kind === 'pc',
		);
		const chosen = pcs.find((c) => c.id === pcChoice) ?? pcs[0] ?? null;
		const view = chosen
			? getCharacterForActor(state.characters, state.permissions, actorId, chosen.id)
			: null;
		const record = chosen ? state.characters.characters[chosen.id] : undefined;
		const resources = record ? resourcesOf(record) : null;
		const journalView = chosen
			? getCharacterJournalForActor(state.characters, state.permissions, actorId, chosen.id)
			: null;
		const actor = state.permissions.actors[actorId] ?? null;
		const isDm = actor?.role === 'dm';
		// Journal + advancement authority: the DM, or a granted character `owner` (mirrors the
		// command-layer checks in character-journal.ts / character-advancement.ts — re-enforced there).
		const isOwner = !!(
			actor &&
			chosen &&
			!isDm &&
			hasGrantedCapability(state.permissions, actor, CHARACTER_ENTITY_TYPE, chosen.id, 'owner')
		);
		const party = getPartyOverviewForActor(state.characters, state.permissions, actorId);
		return {
			characterId: chosen?.id ?? null,
			view,
			resources,
			pcs: pcs.map((c) => ({ id: c.id, name: c.name })),
			// Pure derived queries, computed AFTER the actor-filtered gate passed (same pattern as
			// `resourcesOf` above) — they read only abilityScores / proficiencies / data.level.
			passive: record ? passivePerception(record) : null,
			profBonus: record ? effectiveProficiencyBonus(record) : null,
			journal: journalView?.entries ?? [],
			canAuthorJournal: isDm || isOwner,
			// Structured inventory + encumbrance from the durable record (same post-gate pattern as
			// `resourcesOf`); encumbrance is derived on read so it can never drift from items/coins/STR.
			inventory: record ? inventoryOf(record) : null,
			encumbrance: record ? computeEncumbrance(record) : null,
			canManageInventory: isDm || isOwner,
			party,
			advancement: record ? advancementStateOf(record) : null,
			xpEligible: record ? checkAdvancementEligibility(record, 'xp') : null,
			milestoneEligible: record ? checkAdvancementEligibility(record, 'milestone') : null,
			canAdvance: isDm || isOwner,
			isDm,
		};
	}, [state, actorId, pcChoice]);

	const C = data.view;
	const [tab, setTab] = useState('sheet');
	const [err, setErr] = useState<string | null>(null);
	// The HP stepper was ±1-only, so taking 27 damage meant 27 separate durable commands (each one a
	// full-state persist + op-log entry), and a SUCCESSFUL write announced nothing at all — the number
	// changed silently for anyone not looking at it. The amount is a string draft so backspacing to
	// empty doesn't snap to a coerced value mid-edit.
	const [hpAmount, setHpAmount] = useState('1');
	const [hpNote, setHpNote] = useState<string | null>(null);

	// A `data.<key>` sheet string authored through `character.edit-field` (draft flow / advancement /
	// the identity editor below). Null when the field was never written — rendered honestly as absent.
	const ds = (key: string): string | null => {
		const v = C?.data?.[key];
		return typeof v === 'string' && v.trim() !== '' ? v : null;
	};

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		const result = await runtime.dispatch(command);
		setErr(result.status === 'rejected' ? result.rejection.message : null);
		return result.status === 'accepted';
	}

	if (!C || !data.characterId) {
		return (
			<Page max={1180}>
				<Panel title="No character yet">
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						No player character is available in this view yet. Create one in Characters to get
						started.
					</div>
				</Panel>
			</Page>
		);
	}

	const charId = data.characterId;
	const hp = C.combat.hp;
	const maxHp = C.combat.maxHp;
	const conditions = C.combat.conditions;
	const name = C.name;
	const level = data.advancement?.level ?? null;
	// Real inspiration flag, persisted as the `data.inspiration` sheet string ('yes' when inspired).
	const insp = ds('inspiration') === 'yes';

	const tabs = [
		{ id: 'sheet', label: 'Sheet', icon: 'characters-person' },
		{ id: 'resources', label: 'Resources', icon: 'sparkle' },
		{ id: 'party', label: 'Party', icon: 'players' },
		// The level-up tab drives the REAL staged advancement — shown only to an actor the core would
		// authorize (DM / granted owner), so it is never a dead surface.
		...(data.canAdvance ? [{ id: 'levelup', label: 'Level up', icon: 'flag' }] : []),
		{ id: 'journal', label: 'Journal', icon: 'note-edit' },
	];
	const activeTab = tabs.some((t) => t.id === tab) ? tab : 'sheet';

	// Real HP write: the only HP path is the combat-resource command, which the Core gates on an ACTIVE
	// session. In the idle seed it is rejected read-only — the value snaps back and the reason surfaces.
	const hpStep = () => {
		const n = Math.trunc(Number(hpAmount));
		return Number.isFinite(n) && n > 0 ? n : 1;
	};
	const stepHp = async (sign: 1 | -1) => {
		const amount = hpStep();
		setHpNote(null);
		if (
			await dispatch({
				type: 'character.update-combat-resource',
				actorId,
				payload: { characterId: charId, kind: 'hp', delta: sign * amount },
			})
		)
			setHpNote(
				sign < 0
					? `Took ${amount} damage.`
					: `Healed ${amount} hit point${amount === 1 ? '' : 's'}.`,
			);
	};
	// Real inspiration toggle: `character.edit-field` on the `data.inspiration` sheet string.
	const toggleInspiration = () =>
		dispatch({
			type: 'character.edit-field',
			actorId,
			payload: { characterId: charId, path: 'data.inspiration', value: insp ? '' : 'yes' },
		});

	// Identity line — composed ONLY from real fields (class/level/background/subclass from the draft
	// flow + advancement commits; race authored via the identity editor). Absent pieces are omitted.
	const cls = ds('class');
	const identityLine = [
		ds('race'),
		`${cls ? cap(cls) : 'Adventurer'}${level != null ? ` ${level}` : ''}${ds('subclass') ? ` (${cap(ds('subclass')!)})` : ''}`,
		ds('background') ? `${cap(ds('background')!)} background` : null,
	]
		.filter(Boolean)
		.join(' · ');

	return (
		<div>
			{/* persistent vitals bar */}
			<div
				style={{
					position: 'sticky',
					top: 0,
					zIndex: 5,
					display: 'flex',
					alignItems: 'center',
					gap: viewport === 'phone' ? 10 : 18,
					padding: viewport === 'phone' ? '10px 14px' : '13px 28px',
					background: 'color-mix(in srgb, var(--color-surface) 94%, transparent)',
					backdropFilter: 'blur(6px)',
					borderBottom: `1px solid ${T.bd}`,
					flexWrap: 'wrap',
				}}
			>
				<Avatar name={name} size="md" ring="active" />
				<div style={{ minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<span style={{ font: `700 17px ${T.disp}` }}>{name}</span>
						<Badge status="success">PC</Badge>
					</div>
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{identityLine}</div>
				</div>
				{/* PC switcher — a signed-in player may control multiple PCs (the actor-filtered list);
				    the whole surface (sheet/resources/level-up/journal) follows the selection. */}
				{data.pcs.length > 1 && (
					<Select
						value={charId}
						onChange={(e: any) => {
							// The error banner is screen-level and was only ever cleared by the NEXT
							// successful dispatch, so a rejected write kept accusing the user from the top
							// of an unrelated character or tab.
							setErr(null);
							setHpNote(null);
							setPcChoice(e.target.value);
						}}
						options={data.pcs.map((p) => ({ value: p.id, label: p.name }))}
						aria-label="Switch character"
					/>
				)}
				{/* HP stepper — real combat-resource write */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 9,
						padding: '7px 12px',
						borderRadius: 11,
						background: T.alt,
						border: `1px solid ${T.bd}`,
					}}
				>
					<IconButton
						icon="chevron-down"
						label={`Damage ${hpStep()}`}
						variant="ghost"
						size="sm"
						onClick={() => void stepHp(-1)}
					/>
					<div style={{ textAlign: 'center', minWidth: 74 }}>
						<div
							style={{
								font: `700 18px ${T.mono}`,
								color: maxHp > 0 && hp / maxHp < 0.3 ? T.err : T.ink,
								lineHeight: 1,
							}}
						>
							{hp}
							<span style={{ font: `13px ${T.mono}`, color: T.ter }}> / {maxHp}</span>
						</div>
						<div style={{ font: `9.5px ${T.sans}`, letterSpacing: '.08em', color: T.ter }}>
							HIT POINTS
						</div>
					</div>
					<IconButton
						icon="chevron-up"
						label={`Heal ${hpStep()}`}
						variant="ghost"
						size="sm"
						onClick={() => void stepHp(1)}
					/>
					<input
						type="text"
						inputMode="numeric"
						aria-label="Hit point change amount"
						value={hpAmount}
						onChange={(e) => setHpAmount(e.target.value)}
						onBlur={() => setHpAmount(String(hpStep()))}
						style={{
							width: 38,
							textAlign: 'center',
							font: `600 13px ${T.mono}`,
							color: T.ink,
							background: T.surf,
							border: `1px solid ${T.bd}`,
							borderRadius: 7,
							padding: '4px 2px',
						}}
					/>
				</div>
				<Stat label="AC" value={String(C.combat.ac)} icon="shield" />
				{/* speed / initiative — `data.*` sheet strings (edited on the Sheet tab); '—' until authored */}
				<Stat label="Speed" value={ds('speed') ? `${ds('speed')}ft` : '—'} icon="travel" />
				<Stat label="Init" value={ds('init') ?? '—'} icon="session-bolt" />
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					{conditions.map((c: string) => {
						const k = condKey(c);
						return k ? (
							<ConditionBadge key={c} condition={k} compact />
						) : (
							<Chip key={c} tone="accent">
								{c}
							</Chip>
						);
					})}
				</div>
				<button
					type="button"
					aria-pressed={insp}
					onClick={toggleInspiration}
					style={{
						marginLeft: 'auto',
						display: 'inline-flex',
						alignItems: 'center',
						gap: 7,
						padding: '7px 12px',
						borderRadius: 20,
						cursor: 'pointer',
						border: `1px solid ${insp ? T.accBd : T.bd}`,
						background: insp ? T.accSub : T.surf,
						color: insp ? T.acc : T.ter,
						font: `600 12px ${T.sans}`,
					}}
				>
					<Icon name="sparkle" size={15} />
					{insp ? 'Inspiration' : 'No inspiration'}
				</button>
			</div>

			{/* A successful HP write used to change only the number, which announces nothing. */}
			<div role="status" className="visually-hidden">
				{hpNote ?? ''}
			</div>

			{err && (
				<div
					role="alert"
					aria-live="assertive"
					style={{
						padding: '8px 28px',
						background: 'var(--color-status-warning-subtle)',
						borderBottom: `1px solid var(--color-status-warning-border)`,
					}}
				>
					<span style={{ font: `12px ${T.sans}`, color: 'var(--color-status-warning-text)' }}>
						<Icon name="warning" size={13} /> {err}
					</span>
				</div>
			)}

			<Page max={1180}>
				<div style={{ marginBottom: 18 }}>
					<Tabs
						aria-label="Character sections"
						value={activeTab}
						onChange={(next: string) => {
							setErr(null);
							setHpNote(null);
							setTab(next);
						}}
						tabs={tabs}
						idBase="player"
					/>
				</div>
				{/* One panel element, re-labelled per active tab — only one body is ever mounted. */}
				<div {...tabPanelProps('player', activeTab)}>
					{/* Keyed by charId on purpose. The PC picker in the vitals bar stays mounted across a
				    switch, so without a key these bodies kept the PREVIOUS character's draft state —
				    and `saveEdit` diffs those drafts against the NEW `C`, writing person A's race,
				    subclass, background and speed onto person B with no warning and no undo. */}
					{activeTab === 'sheet' && (
						<PlayerSheet
							key={charId}
							C={C}
							level={level}
							isDm={data.isDm}
							charId={charId}
							actorId={actorId}
							passive={data.passive}
							profBonus={data.profBonus}
							inventory={data.inventory}
							encumbrance={data.encumbrance}
							canManageInventory={data.canManageInventory}
							dispatch={dispatch}
						/>
					)}
					{activeTab === 'resources' && (
						<PlayerResources
							key={charId}
							charId={charId}
							resources={data.resources}
							actorId={actorId}
							compact={viewport === 'phone'}
							dispatch={dispatch}
						/>
					)}
					{activeTab === 'party' && (
						<PlayerParty
							party={data.party}
							selfId={charId}
							isDm={data.isDm}
							actorId={actorId}
							compact={viewport === 'phone'}
							dispatch={dispatch}
						/>
					)}
					{activeTab === 'levelup' && data.canAdvance && (
						<PlayerLevelUp
							key={charId}
							charId={charId}
							actorId={actorId}
							advancement={data.advancement}
							xpEligible={data.xpEligible}
							milestoneEligible={data.milestoneEligible}
							dispatch={dispatch}
						/>
					)}
					{activeTab === 'journal' && (
						<PlayerJournal
							key={charId}
							charId={charId}
							actorId={actorId}
							entries={data.journal}
							canAuthor={data.canAuthorJournal}
							compact={viewport === 'phone'}
							dispatch={dispatch}
						/>
					)}
				</div>
			</Page>
		</div>
	);
}

type Dispatch = (command: any) => Promise<boolean>;

// ── Sheet — real abilities, attacks, identity fields (edit-field) + one labeled honest gap ────────
const IDENTITY_FIELDS: { key: string; label: string; hint?: string }[] = [
	{ key: 'race', label: 'Race' },
	{ key: 'subclass', label: 'Subclass' },
	{ key: 'background', label: 'Background' },
	{ key: 'speed', label: 'Speed (ft)' },
	{ key: 'init', label: 'Initiative bonus', hint: 'e.g. +2' },
];

function PlayerSheet({
	C,
	level,
	isDm,
	charId,
	actorId,
	passive,
	profBonus,
	inventory,
	encumbrance,
	canManageInventory,
	dispatch,
}: {
	C: CharacterView;
	level: number | null;
	isDm: boolean;
	charId: string;
	actorId: string;
	/** Pure derived reads (passivePerception / effectiveProficiencyBonus), computed post-gate. */
	passive: number | null;
	profBonus: number | null;
	/** I10 S10.1.3 / S10.4.2 — structured inventory + derived encumbrance, plus the owner-or-DM gate. */
	inventory: CharacterInventory | null;
	encumbrance: EncumbranceState | null;
	canManageInventory: boolean;
	dispatch: Dispatch;
}) {
	const viewport = useViewport();
	const isPhone = viewport === 'phone';
	const [editing, setEditing] = useState(false);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [backstoryDraft, setBackstoryDraft] = useState<string | null>(null);

	const dataStr = (key: string): string | null => {
		const v = C.data?.[key];
		return typeof v === 'string' && v.trim() !== '' ? v : null;
	};

	const startEdit = () => {
		setDrafts(Object.fromEntries(IDENTITY_FIELDS.map((f) => [f.key, dataStr(f.key) ?? ''])));
		setEditing(true);
	};
	// Save each CHANGED identity field through the real `character.edit-field` data.* write path.
	const saveEdit = async () => {
		for (const f of IDENTITY_FIELDS) {
			const next = (drafts[f.key] ?? '').trim();
			if (next === (dataStr(f.key) ?? '')) continue;
			const ok = await dispatch({
				type: 'character.edit-field',
				actorId,
				payload: { characterId: charId, path: `data.${f.key}`, value: next },
			});
			if (!ok) return; // stop on the first rejection; the error banner explains why
		}
		setEditing(false);
	};
	const saveBackstory = async () => {
		if (backstoryDraft === null) return;
		if (
			await dispatch({
				type: 'character.edit-field',
				actorId,
				payload: { characterId: charId, path: 'data.backstory', value: backstoryDraft.trim() },
			})
		) {
			setBackstoryDraft(null);
		}
	};

	// Abilities — REAL scores from the Core character view only; an absent score renders as '—'.
	const abilities = ABIL_ORDER.map((key) => {
		const score = (C.abilityScores as Record<string, number | undefined>)[key];
		return { key: ABIL_LABEL[key], score };
	});
	const cls = dataStr('class');
	const backstory = dataStr('backstory');

	// Structured proficiencies from the (redacted, player-safe) view — mirrors the roster sheet's
	// panels. Honest empty state when the character carries no proficiency data at all.
	const prof = C.proficiencies;
	const hasProficiencyData =
		Object.keys(prof.skills).length > 0 ||
		prof.saves.length > 0 ||
		prof.proficiencyBonus !== null ||
		prof.hitDice.total > 0;
	const abilScore = (id: string) =>
		(C.abilityScores as Record<string, number | undefined>)[id] ?? 10;

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : 'auto 1fr',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<div
				style={{
					display: isPhone ? 'grid' : 'flex',
					gridTemplateColumns: isPhone ? 'repeat(3, 1fr)' : undefined,
					flexDirection: 'column',
					gap: 10,
					width: isPhone ? 'auto' : 120,
				}}
			>
				{abilities.map((a) => (
					<div
						key={a.key}
						style={{
							minWidth: 0,
							textAlign: 'center',
							padding: '10px 6px',
							borderRadius: 11,
							border: `1px solid ${T.bd}`,
							background: T.surf,
						}}
					>
						<div style={{ ...eb, color: T.ter, overflowWrap: 'anywhere' }}>{ABIL_FULL[a.key]}</div>
						<div style={{ font: `700 24px ${T.mono}`, lineHeight: 1 }}>
							{a.score !== undefined ? sgn(abilMod(a.score)) : '—'}
						</div>
						<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: 2 }}>
							{a.score ?? '—'}
						</div>
					</div>
				))}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: isPhone ? '1fr' : '1.1fr 1fr',
						gap: 16,
						alignItems: 'start',
					}}
				>
					<Panel
						title="Identity"
						pad={14}
						action={
							isDm ? (
								editing ? (
									<div style={{ display: 'flex', gap: 6 }}>
										<Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
											Cancel
										</Button>
										<Button variant="primary" size="sm" onClick={saveEdit}>
											Save
										</Button>
									</div>
								) : (
									<Button variant="secondary" size="sm" icon="note-edit" onClick={startEdit}>
										Edit
									</Button>
								)
							) : undefined
						}
					>
						{editing ? (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
								{IDENTITY_FIELDS.map((f) => (
									<Field key={f.key} label={f.label}>
										<Input
											value={drafts[f.key] ?? ''}
											placeholder={f.hint}
											onChange={(e: any) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
										/>
									</Field>
								))}
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
									Changes appear everywhere this character is used.
								</div>
							</div>
						) : (
							<DefinitionList
								layout={isPhone ? 'stacked' : 'rows'}
								items={[
									{ label: 'Class', value: cls ? cap(cls) : '—' },
									{ label: 'Level', value: level != null ? String(level) : '—', mono: true },
									...IDENTITY_FIELDS.map((f) => ({
										label: f.label,
										value: dataStr(f.key) ? cap(dataStr(f.key)!) : '—',
									})),
								]}
							/>
						)}
					</Panel>
					<Panel title="Attacks" pad={14}>
						{C.attacks.length === 0 ? (
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
								No attacks recorded — the DM adds them on the roster sheet.
							</div>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column' }}>
								{C.attacks.map((a: any, i: number) => (
									<div
										key={a.id ?? i}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 10,
											padding: '8px 2px',
											borderTop: i ? `1px solid ${T.bd}` : 'none',
										}}
									>
										<Icon name="session-bolt" size={15} color={T.acc} />
										<span style={{ flex: 1, font: `600 12.5px ${T.sans}` }}>{a.name}</span>
										<span style={{ font: `11.5px ${T.mono}`, color: T.sub }}>{a.detail}</span>
									</div>
								))}
							</div>
						)}
					</Panel>
				</div>
				<Panel
					title="Backstory"
					action={
						isDm && backstoryDraft === null ? (
							<Button
								variant="secondary"
								size="sm"
								icon="note-edit"
								onClick={() => setBackstoryDraft(backstory ?? '')}
							>
								Edit
							</Button>
						) : undefined
					}
				>
					{backstoryDraft !== null ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
							<Textarea
								rows={4}
								value={backstoryDraft}
								onChange={(e: any) => setBackstoryDraft(e.target.value)}
								placeholder="Where they came from, what they want…"
							/>
							<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
								<Button variant="ghost" size="sm" onClick={() => setBackstoryDraft(null)}>
									Cancel
								</Button>
								<Button variant="primary" size="sm" onClick={saveBackstory}>
									Save
								</Button>
							</div>
						</div>
					) : backstory ? (
						<div style={{ font: `13px/1.6 ${T.sans}`, color: T.sub, whiteSpace: 'pre-wrap' }}>
							{backstory}
						</div>
					) : (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No backstory written yet.</div>
					)}
				</Panel>
				{/* Skills / saves / hit dice / passive perception — the view's structured `proficiencies`
				    block (player-safe: read through the redacted view + post-gate pure queries), the same
				    slice the roster sheet renders. */}
				<Panel title="Skills & saves">
					{hasProficiencyData && profBonus !== null ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
							<div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
								<Stat label="Proficiency" value={sgn(profBonus)} />
								{passive !== null && (
									<Stat
										label="Passive Perception"
										value={String(passive)}
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
							<div>
								<div style={{ ...eb, marginBottom: 6 }}>Saving throws</div>
								<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
									{ABILITY_IDS.map((a) => {
										const proficient = prof.saves.includes(a);
										const bonus = abilMod(abilScore(a)) + (proficient ? profBonus : 0);
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
												<span style={{ font: `12px ${T.mono}` }}>{sgn(bonus)}</span>
											</span>
										);
									})}
								</div>
							</div>
							<div>
								<div style={{ ...eb, marginBottom: 6 }}>Skills</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 18px' }}>
									{SKILLS.map((s) => {
										const skillLevel = prof.skills[s.id] ?? 'none';
										const bonus =
											abilMod(abilScore(s.ability)) +
											(skillLevel === 'expertise'
												? profBonus * 2
												: skillLevel === 'proficient'
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
													color: skillLevel === 'none' ? T.ter : T.ink,
												}}
											>
												<span
													aria-hidden
													style={{
														width: 8,
														height: 8,
														borderRadius: '50%',
														flex: '0 0 auto',
														background: skillLevel === 'none' ? 'transparent' : T.acc,
														border: `1.5px solid ${skillLevel === 'none' ? T.bdS : T.acc}`,
													}}
												/>
												<span style={{ flex: 1, minWidth: 0 }}>
													{s.label}
													{skillLevel === 'expertise' ? ' ★' : ''}
												</span>
												<span style={{ font: `12px ${T.mono}` }}>{sgn(bonus)}</span>
											</div>
										);
									})}
								</div>
								<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 8 }}>
									● proficient · ★ expertise (double proficiency)
								</div>
							</div>
						</div>
					) : (
						// Honest empty state — no proficiency data on this character yet, nothing is faked.
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							No skills, saves, or hit dice recorded for this character yet — they're set on the
							roster sheet or arrive with a character-file import.
						</div>
					)}
				</Panel>
				{/* I10 S10.1.3 / S10.4.2 — REAL structured equipment / currency / encumbrance, core-backed. */}
				<PlayerEquipment
					charId={charId}
					actorId={actorId}
					inventory={inventory}
					encumbrance={encumbrance}
					canManage={canManageInventory}
					dispatch={dispatch}
				/>
			</div>
		</div>
	);
}

// ── Equipment / currency / encumbrance — REAL structured inventory (I10 S10.1.3 / S10.4.2) ────────
const COIN_ORDER: { key: 'pp' | 'gp' | 'ep' | 'sp' | 'cp'; label: string }[] = [
	{ key: 'pp', label: 'PP' },
	{ key: 'gp', label: 'GP' },
	{ key: 'ep', label: 'EP' },
	{ key: 'sp', label: 'SP' },
	{ key: 'cp', label: 'CP' },
];
const ENCUMBRANCE_META: Record<
	EncumbranceState['level'],
	{ label: string; status: 'success' | 'warning' | 'error' }
> = {
	unencumbered: { label: 'Unencumbered', status: 'success' },
	encumbered: { label: 'Encumbered', status: 'warning' },
	'heavily-encumbered': { label: 'Heavily encumbered', status: 'warning' },
	overloaded: { label: 'Overloaded', status: 'error' },
};

function PlayerEquipment({
	charId,
	actorId,
	inventory,
	encumbrance,
	canManage,
	dispatch,
}: {
	charId: string;
	actorId: string;
	inventory: CharacterInventory | null;
	encumbrance: EncumbranceState | null;
	canManage: boolean;
	dispatch: Dispatch;
}) {
	const viewport = useViewport();
	const [name, setName] = useState('');
	const [qty, setQty] = useState('1');
	const [weight, setWeight] = useState('');
	const items = inventory?.items ?? [];
	const currency = inventory?.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

	// Every write is a durable `character.*` command; the core re-checks owner-or-DM authority and the
	// error banner surfaces any rejection (so a non-owner preview never silently mutates).
	const addItem = async () => {
		if (!name.trim()) return;
		// A cleared Qty box used to coerce to 0 and create a phantom "x0" item with no feedback; an
		// item you are adding is at least one of a thing, so blank (and any sub-1 value) means 1.
		const quantity = Math.max(1, Math.trunc(Number(qty) || 1));
		const w = weight.trim() === '' ? 0 : Math.max(0, Number(weight) || 0);
		const ok = await dispatch({
			type: 'character.upsert-equipment-item',
			actorId,
			payload: { characterId: charId, name: name.trim(), quantity, weight: w },
		});
		if (ok) {
			setName('');
			setQty('1');
			setWeight('');
		}
	};
	const removeItem = (item: EquipmentItem) =>
		dispatch({
			type: 'character.remove-equipment-item',
			actorId,
			payload: { characterId: charId, itemId: item.id },
		});
	// Quantity step / equipped toggle both go through the PATCH-semantics upsert (id preserves the item;
	// `name` is required by the schema so the existing name is re-sent).
	const stepQty = (item: EquipmentItem, delta: number) =>
		dispatch({
			type: 'character.upsert-equipment-item',
			actorId,
			payload: {
				characterId: charId,
				id: item.id,
				name: item.name,
				quantity: Math.max(0, item.quantity + delta),
			},
		});
	const toggleEquipped = (item: EquipmentItem) =>
		dispatch({
			type: 'character.upsert-equipment-item',
			actorId,
			payload: { characterId: charId, id: item.id, name: item.name, equipped: !item.equipped },
		});
	// Currency: signed per-coin adjust (fail-closed on overspend in the core — the banner explains).
	const adjustCoin = (coin: string, delta: number) =>
		dispatch({
			type: 'character.set-currency',
			actorId,
			payload: { characterId: charId, mode: 'adjust', currency: { [coin]: delta } },
		});
	const consolidate = () =>
		dispatch({
			type: 'character.set-currency',
			actorId,
			payload: { characterId: charId, consolidate: true },
		});

	const enc = encumbrance;
	const encMeta = enc ? ENCUMBRANCE_META[enc.level] : null;

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: viewport === 'phone' ? '1fr' : '1.4fr 1fr',
				gap: 16,
				alignItems: 'start',
			}}
		>
			<Panel title={`Equipment (${items.length})`}>
				{items.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No equipment carried yet.</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{items.map((item, i) => (
							<div
								key={item.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '8px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<Icon
									name={item.equipped ? 'shield' : 'tag'}
									size={14}
									color={item.equipped ? T.acc : T.ter}
								/>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 12.5px ${T.sans}` }}>
										{item.name}
										{item.equipped && (
											<span style={{ marginLeft: 6 }}>
												<Badge status="accent">equipped</Badge>
											</span>
										)}
									</div>
									<div style={{ font: `11px ${T.mono}`, color: T.ter }}>
										{item.weight} lb each ·{' '}
										{(item.quantity * item.weight).toFixed(item.weight % 1 ? 1 : 0)} lb total
										{item.notes ? ` · ${item.notes}` : ''}
									</div>
								</div>
								{canManage ? (
									<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
										<IconButton
											icon="chevron-down"
											// At 1, stepping down clamped to 0 and left a `×0` ghost row that stayed in
											// the list and kept accepting presses. Removing the item is a different,
											// already-present action — so say so instead of pretending to work.
											label={
												item.quantity <= 1
													? `Cannot go below one ${item.name} — use Remove ${item.name}`
													: `One fewer ${item.name}`
											}
											aria-disabled={item.quantity <= 1 ? true : undefined}
											variant="ghost"
											size="sm"
											onClick={() => void stepQty(item, -1)}
										/>
										<span style={{ font: `700 12px ${T.mono}`, minWidth: 22, textAlign: 'center' }}>
											{item.quantity}
										</span>
										<IconButton
											icon="chevron-up"
											label={`One more ${item.name}`}
											variant="ghost"
											size="sm"
											onClick={() => void stepQty(item, 1)}
										/>
										<button
											type="button"
											aria-pressed={item.equipped}
											onClick={() => void toggleEquipped(item)}
											style={{
												// 3px + an 11px line + 3px is a ~21px target, under the WCAG 2.5.8
												// floor, wedged between icon buttons that DO meet it.
												padding: '6px 10px',
												minHeight: 24,
												boxSizing: 'border-box',
												borderRadius: 14,
												cursor: 'pointer',
												font: `11px ${T.sans}`,
												border: `1px solid ${item.equipped ? T.accBd : T.bd}`,
												background: item.equipped ? T.accSub : T.surf,
												color: item.equipped ? T.acc : T.ter,
											}}
										>
											{item.equipped ? 'Equipped' : 'Equip'}
										</button>
										<IconButton
											icon="close"
											label={`Remove ${item.name}`}
											variant="ghost"
											size="sm"
											onClick={() => void removeItem(item)}
										/>
									</div>
								) : (
									<span style={{ font: `12px ${T.mono}`, color: T.ter }}>×{item.quantity}</span>
								)}
							</div>
						))}
					</div>
				)}
				{canManage && (
					<div
						style={{
							display: 'flex',
							gap: 8,
							marginTop: 12,
							paddingTop: 12,
							borderTop: `1px solid ${T.bd}`,
							alignItems: 'flex-end',
							flexWrap: 'wrap',
						}}
					>
						<Field label="Item">
							<Input
								value={name}
								onChange={(e: any) => setName(e.target.value)}
								placeholder="Longsword…"
							/>
						</Field>
						<Field label="Qty">
							<Input
								type="number"
								value={qty}
								onChange={(e: any) => setQty(e.target.value)}
								style={{ width: 70 }}
							/>
						</Field>
						<Field label="Weight (lb)">
							<Input
								type="number"
								value={weight}
								onChange={(e: any) => setWeight(e.target.value)}
								placeholder="0"
								style={{ width: 90 }}
							/>
						</Field>
						<Button
							variant="secondary"
							size="sm"
							icon="add"
							disabled={!name.trim()}
							onClick={addItem}
						>
							Add
						</Button>
					</div>
				)}
			</Panel>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<Panel title="Encumbrance">
					{enc && encMeta ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
								<Badge status={encMeta.status}>{encMeta.label}</Badge>
								{enc.speedPenalty !== 0 && (
									<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										Speed {enc.speedPenalty} ft
									</span>
								)}
							</div>
							<ProgressMeter
								value={Math.min(enc.carriedWeight, enc.carryCapacity)}
								max={enc.carryCapacity || 1}
								label={`${enc.carriedWeight.toFixed(enc.carriedWeight % 1 ? 1 : 0)} / ${enc.carryCapacity} lb`}
							/>
							<div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
								<Stat
									label="Items"
									value={`${enc.itemWeight.toFixed(enc.itemWeight % 1 ? 1 : 0)} lb`}
								/>
								<Stat
									label="Coins"
									value={`${enc.coinWeight.toFixed(enc.coinWeight % 1 ? 1 : 0)} lb`}
								/>
								<Stat label="Capacity" value={`${enc.carryCapacity} lb`} />
							</div>
						</div>
					) : (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No encumbrance data.</div>
					)}
				</Panel>
				<Panel
					title="Currency"
					action={
						canManage ? (
							<Button variant="ghost" size="sm" onClick={() => void consolidate()}>
								Consolidate
							</Button>
						) : undefined
					}
				>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
						{COIN_ORDER.map((coin) => (
							<div
								key={coin.key}
								style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}
							>
								<span style={{ font: `700 12px ${T.mono}`, color: T.acc, width: 26 }}>
									{coin.label}
								</span>
								<span style={{ flex: 1, font: `13px ${T.mono}` }}>{currency[coin.key]}</span>
								{canManage && (
									<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
										<IconButton
											icon="chevron-down"
											label={`Spend one ${coin.label}`}
											variant="ghost"
											size="sm"
											onClick={() => void adjustCoin(coin.key, -1)}
										/>
										<IconButton
											icon="chevron-up"
											label={`Add one ${coin.label}`}
											variant="ghost"
											size="sm"
											onClick={() => void adjustCoin(coin.key, 1)}
										/>
									</div>
								)}
							</div>
						))}
					</div>
				</Panel>
			</div>
		</div>
	);
}

function PlayerResources({
	charId,
	resources,
	actorId,
	compact,
	dispatch,
}: {
	charId: string;
	resources: CharacterResources | null;
	actorId: string;
	compact: boolean;
	dispatch: Dispatch;
}) {
	const r = resources;
	const slots = r ? Object.values(r.spellSlots).sort((a, b) => a.level - b.level) : [];
	const classResources = r ? Object.values(r.classResources) : [];
	const spells = r?.spells ?? [];
	const con = r?.concentration?.effect ? r.concentration : null;
	const death = r?.deathSaves ?? { successes: 0, failures: 0, stable: false };

	// Real spell-slot toggle: set the level's `expended` directly (manage path, not session-gated).
	const toggleSlot = (level: number, max: number, expended: number, idx: number) => {
		const avail = max - expended;
		const isFilled = idx < avail; // clicking a filled diamond expends it; an empty one recovers it
		const nextExpended = isFilled ? expended + 1 : Math.max(0, expended - 1);
		return dispatch({
			type: 'character.set-spell-slots',
			actorId,
			payload: { characterId: charId, level, max, expended: nextExpended },
		});
	};
	// Real class-resource toggle: set `expended` directly.
	const toggleResource = (res: CharacterResources['classResources'][string], idx: number) => {
		const cur = res.max - res.expended;
		const isFilled = idx < cur;
		const nextExpended = isFilled ? res.expended + 1 : Math.max(0, res.expended - 1);
		return dispatch({
			type: 'character.set-class-resource',
			actorId,
			payload: {
				characterId: charId,
				id: res.id,
				name: res.name,
				max: res.max,
				recharge: res.recharge,
				expended: nextExpended,
			},
		});
	};
	// Real prepared toggle: `character.set-spell` upserts the spell with the flipped flag (CHAR-008).
	const togglePrepared = (s: { id: string; name: string; level: number; prepared: boolean }) =>
		dispatch({
			type: 'character.set-spell',
			actorId,
			payload: {
				characterId: charId,
				id: s.id,
				name: s.name,
				level: s.level,
				prepared: !s.prepared,
			},
		});
	const rest = (kind: 'short' | 'long') =>
		dispatch({ type: 'character.rest', actorId, payload: { characterId: charId, rest: kind } });
	const dropConcentration = () =>
		dispatch({
			type: 'character.update-combat-resource',
			actorId,
			payload: { characterId: charId, kind: 'concentration', effect: null },
		});

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				{con && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							padding: '13px 16px',
							borderRadius: 12,
							background: T.accSub,
							border: `1px solid ${T.accBd}`,
						}}
					>
						<Icon name="concentration" size="lg" color={T.acc} />
						<div style={{ flex: 1 }}>
							<div style={{ font: `700 14px ${T.disp}` }}>Concentrating · {con.effect}</div>
							<div style={{ font: `12px ${T.sans}`, color: T.sub }}>Maintained effect</div>
						</div>
						<Button variant="ghost" size="sm" onClick={dropConcentration}>
							Drop
						</Button>
					</div>
				)}
				<Panel title="Spell slots">
					{slots.length === 0 ? (
						<EmptyState
							inset
							icon="sparkle"
							title="No spell slots"
							description="No spell slots are tracked for this character yet."
						/>
					) : (
						// The DS SpellSlots economy (same component as the roster sheet) — a pip click
						// spends/recovers through the same character.set-spell-slots write as before.
						<SpellSlots
							levels={slots.map((s) => ({
								level: s.level,
								total: s.max,
								used: s.max - availableSlots(s),
							}))}
							onToggle={(level: number, idx: number) => {
								const s = slots.find((x) => x.level === level);
								if (s) void toggleSlot(s.level, s.max, s.expended, idx);
							}}
						/>
					)}
				</Panel>
				<Panel title="Class resources">
					{classResources.length === 0 ? (
						<EmptyState
							inset
							icon="sparkle"
							title="No class resources"
							description="Resources like Rage or Ki appear here once the sheet tracks them."
						/>
					) : (
						// Named resources keep round pips (the DS SpellSlots row is hard-labeled "Lvl N", which
						// misreads for a named resource) — but each pip mirrors SpellSlots' a11y contract.
						classResources.map((res, i) => {
							const cur = res.max - res.expended;
							return (
								<div
									key={res.id}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 11,
										padding: '9px 0',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
									}}
								>
									<Icon name="sparkle" size={17} color={T.acc} />
									<div style={{ flex: 1 }}>
										<div style={{ font: `600 12.5px ${T.sans}` }}>{res.name}</div>
										<div style={{ font: `10.5px ${T.sans}`, color: T.ter }}>
											Recovers on {res.recharge} rest
										</div>
									</div>
									{/* 13px pips failed WCAG 2.5.8 (24px minimum). Growing them is only safe together
									    with wrapping: `setClassResourceInput.max` is unbounded, the phone budget is
									    ~253px for name + pips, and 24N + 5(N−1) passes that at N=6. These are
									    contentless <button>s, so their min-content width was ~3px and they silently
									    SHRANK INTO SLIVERS instead of overflowing — which is why the responsive
									    clipped-control audit never flagged them. */}
									<div
										style={{
											display: 'flex',
											gap: 5,
											flexWrap: 'wrap',
											justifyContent: 'flex-end',
										}}
									>
										{Array.from({ length: res.max }).map((_, j) => (
											<button
												key={j}
												type="button"
												aria-label={`${res.name} use ${j + 1} ${j < cur ? 'available' : 'expended'}`}
												aria-pressed={j < cur}
												onClick={() => toggleResource(res, j)}
												style={{
													width: 24,
													height: 24,
													flex: '0 0 auto',
													padding: 0,
													borderRadius: '50%',
													cursor: 'pointer',
													background: j < cur ? T.acc : 'transparent',
													border: `1.5px solid ${j < cur ? T.acc : T.bdS}`,
												}}
											/>
										))}
									</div>
									<span
										style={{ font: `12px ${T.mono}`, color: T.ter, width: 30, textAlign: 'right' }}
									>
										{cur}/{res.max}
									</span>
								</div>
							);
						})
					)}
				</Panel>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<Panel
					title="Death saves"
					action={
						<Badge status={death.stable ? 'success' : 'neutral'}>
							{death.stable ? 'Stable' : 'Conscious'}
						</Badge>
					}
				>
					<div style={{ display: 'flex', gap: 24 }}>
						{(['successes', 'failures'] as const).map((k) => (
							<div key={k}>
								<div style={{ ...eb, color: k === 'failures' ? T.err : T.ok, marginBottom: 6 }}>
									{k}
								</div>
								{/* The pips were filled-vs-transparent ONLY: colour as the sole carrier of the
								    state (WCAG 1.4.1), with no text equivalent anywhere (1.1.1), so the count
								    was simply unavailable to assistive tech and invisible under
								    forced-colors, which flattens both tints. One `role="img"` names the whole
								    group; the visible `n/3` gives every reader the number. */}
								<div
									role="img"
									aria-label={`${death[k]} of 3 ${k}`}
									style={{ display: 'flex', gap: 7, alignItems: 'center' }}
								>
									{Array.from({ length: 3 }).map((_, i) => (
										<span
											key={i}
											style={{
												width: 18,
												height: 18,
												borderRadius: '50%',
												background:
													i < death[k] ? (k === 'failures' ? T.err : T.ok) : 'transparent',
												border: `1.5px solid ${k === 'failures' ? T.err : T.ok}`,
											}}
										/>
									))}
									<span aria-hidden="true" style={{ font: `12px ${T.mono}`, color: T.ter }}>
										{death[k]}/3
									</span>
								</div>
							</div>
						))}
					</div>
				</Panel>
				<Panel
					title="Rest"
					action={
						<div style={{ display: 'flex', gap: 7 }}>
							<Button variant="secondary" size="sm" icon="recent" onClick={() => rest('short')}>
								Short rest
							</Button>
							<Button variant="primary" size="sm" icon="theme" onClick={() => rest('long')}>
								Long rest
							</Button>
						</div>
					}
				>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
						A short rest recovers short-rest resources; a long rest restores spell slots, long-rest
						resources, and clears conditions.
					</div>
				</Panel>
				<Panel title={`Prepared spells (${spells.filter((s) => s.prepared).length})`}>
					{spells.length === 0 ? (
						<EmptyState
							inset
							icon="knowledge-book"
							title="No spells tracked"
							description="Spells the character learns show up here with a prepared toggle."
						/>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
							{spells.map((s) => (
								<div
									key={s.id}
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
									>
										{s.level}
									</span>
									<div style={{ flex: 1, minWidth: 0 }}>
										<span style={{ display: 'block', font: `600 12.5px ${T.sans}` }}>{s.name}</span>
										{/* extended PreparedSpell detail fields — shown only when the record carries them */}
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
									</div>
									{/* real prepared toggle → character.set-spell */}
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
								</div>
							))}
						</div>
					)}
				</Panel>
			</div>
		</div>
	);
}

// ── Party — real overview + DM-only logistics (marching order / shared stash, CHAR-011) ──────────
function PlayerParty({
	party,
	selfId,
	isDm,
	actorId,
	compact,
	dispatch,
}: {
	party: PartyOverview;
	selfId: string;
	isDm: boolean;
	actorId: string;
	compact: boolean;
	dispatch: Dispatch;
}) {
	// Real party overview — members are the visible PCs only (DM-only NPCs never reach this list).
	const members = party.members.filter((m) => m.kind === 'pc');
	const [itemName, setItemName] = useState('');
	const [itemDetail, setItemDetail] = useState('');

	const setOrder = (order: string[]) =>
		dispatch({ type: 'character.set-marching-order', actorId, payload: { order } });
	const moveUp = (index: number) => {
		if (index <= 0) return;
		const next = [...party.marchingOrder];
		[next[index - 1], next[index]] = [next[index], next[index - 1]];
		void setOrder(next);
	};
	const addItem = async () => {
		if (!itemName.trim()) return;
		// Authored on the player surface, so it's shared with the party (not the dm-only default).
		const ok = await dispatch({
			type: 'character.upsert-party-inventory-item',
			actorId,
			payload: {
				name: itemName.trim(),
				detail: itemDetail.trim(),
				visibility: 'player-visible',
				sharedWith: [],
			},
		});
		if (ok) {
			setItemName('');
			setItemDetail('');
		}
	};
	// Removal is instant with an UNDO toast — the undo re-creates the item through the same upsert
	// command, preserving its id via the schema's optional `id` (same pattern as scene delete).
	const removeItem = async (item: PartyOverview['inventory'][number]) => {
		const ok = await dispatch({
			type: 'character.remove-party-inventory-item',
			actorId,
			payload: { itemId: item.id },
		});
		if (!ok) return;
		Toaster.success(`“${item.name}” removed from the stash`, {
			action: 'Undo',
			onAction: () => {
				void dispatch({
					type: 'character.upsert-party-inventory-item',
					actorId,
					payload: {
						id: item.id,
						name: item.name,
						detail: item.detail,
						visibility: item.visibility,
						sharedWith: [],
					},
				}).then((restored) => {
					if (restored) Toaster.success(`“${item.name}” restored`);
				});
			},
		});
	};

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'minmax(0,1.4fr) minmax(0,1fr)',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<Panel title="The party" action={<Badge status="neutral">{members.length} members</Badge>}>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
					{members.map((p) => {
						const downed = p.hp === 0;
						const self = p.characterId === selfId;
						return (
							<div
								key={p.characterId}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 13,
									padding: 12,
									borderRadius: 11,
									border: `1px solid ${downed ? 'var(--color-status-error-border)' : self ? T.accBd : T.bd}`,
									background: downed
										? 'var(--color-status-error-subtle)'
										: self
											? T.accSub
											: T.surf,
								}}
							>
								<Avatar
									name={p.name}
									size="sm"
									ring={downed ? 'danger' : self ? 'active' : 'none'}
								/>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
										<span style={{ font: `600 13.5px ${T.sans}` }}>{p.name}</span>
										{self && <Badge status="accent">You</Badge>}
										<span style={{ font: `11px ${T.sans}`, color: T.ter }}>AC {p.ac}</span>
									</div>
									<div style={{ marginTop: 5, maxWidth: 240 }}>
										<HPBar current={p.hp} max={p.maxHp} size="sm" />
									</div>
									<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: 4 }}>
										{p.availableSpellSlots} slots · {p.availableClassResources} resources
									</div>
								</div>
								<div
									style={{
										display: 'flex',
										flexDirection: 'column',
										gap: 5,
										alignItems: 'flex-end',
									}}
								>
									{p.conditions.length ? (
										p.conditions.map((c) => {
											const k = condKey(c);
											return k ? (
												<ConditionBadge key={c} condition={k} compact />
											) : (
												<Chip key={c} tone="neutral">
													{c}
												</Chip>
											);
										})
									) : (
										<span style={{ font: `11px ${T.sans}`, color: T.ter }}>—</span>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</Panel>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<Panel
					title="Marching order"
					action={
						isDm && party.marchingOrder.length > 0 ? (
							<Button variant="ghost" size="sm" onClick={() => setOrder([])}>
								Clear
							</Button>
						) : undefined
					}
				>
					{party.marchingOrder.length === 0 ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No marching order set.</div>
							{isDm && members.length > 0 && (
								<Button
									variant="secondary"
									size="sm"
									icon="players"
									onClick={() => setOrder(members.map((m) => m.characterId))}
								>
									Set from roster
								</Button>
							)}
						</div>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column' }}>
							{party.marchingOrder.map((id, i) => {
								const m = party.members.find((x) => x.characterId === id);
								return (
									<div
										key={id}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 9,
											padding: '5px 0',
											borderTop: i ? `1px solid ${T.bd}` : 'none',
										}}
									>
										<span
											style={{
												font: `700 12px ${T.mono}`,
												color: T.acc,
												width: 18,
												textAlign: 'center',
											}}
										>
											{i + 1}
										</span>
										<span style={{ flex: 1, font: `12.5px ${T.sans}` }}>{m?.name ?? id}</span>
										{isDm && i > 0 && (
											<IconButton
												icon="chevron-up"
												label={`Move ${m?.name ?? 'member'} up`}
												variant="ghost"
												size="sm"
												onClick={() => moveUp(i)}
											/>
										)}
									</div>
								);
							})}
						</div>
					)}
				</Panel>
				<Panel title="Shared stash">
					{party.inventory.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>The party stash is empty.</div>
					) : (
						party.inventory.map((s, i) => (
							<div
								key={s.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '7px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<Icon name="tag" size={14} color={T.ter} />
								<span style={{ flex: 1, font: `12.5px ${T.sans}` }}>{s.name}</span>
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>{s.detail}</span>
								{isDm && s.visibility === 'dm-only' && (
									<Badge status="neutral" icon="hidden">
										dm-only
									</Badge>
								)}
								{isDm && (
									<IconButton
										icon="close"
										label={`Remove ${s.name}`}
										variant="ghost"
										size="sm"
										onClick={() => void removeItem(s)}
									/>
								)}
							</div>
						))
					)}
					{isDm && (
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 8,
								marginTop: 10,
								paddingTop: 12,
								borderTop: `1px solid ${T.bd}`,
							}}
						>
							<div style={{ display: 'flex', gap: 8 }}>
								<Input
									value={itemName}
									aria-label="Item name"
									onChange={(e: any) => setItemName(e.target.value)}
									placeholder="Item name…"
									style={{ flex: 1 }}
								/>
								<Input
									value={itemDetail}
									aria-label="Item detail"
									onChange={(e: any) => setItemDetail(e.target.value)}
									placeholder="Detail (optional)"
									style={{ flex: 1 }}
								/>
							</div>
							<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
								<Button
									variant="secondary"
									size="sm"
									icon="add"
									disabled={!itemName.trim()}
									onClick={addItem}
								>
									Add to stash
								</Button>
							</div>
						</div>
					)}
				</Panel>
			</div>
		</div>
	);
}

// ── Level up — the REAL staged CHAR-009 advancement flow (same commands as /characters) ──────────
const STEP_META: Record<string, { label: string; kind: string; detail: string; number?: boolean }> =
	{
		className: { label: 'Class', kind: 'class', detail: 'Which class gains this level.' },
		hitPointsGained: {
			label: 'Hit points',
			kind: 'hp',
			detail: 'HP gained at this level — roll your hit die or take the average.',
			number: true,
		},
		subclass: { label: 'Subclass', kind: 'choice', detail: 'This level unlocks your subclass.' },
		abilityOrFeat: {
			label: 'Ability or feat',
			kind: 'choice',
			detail: 'Choose an ability score improvement or a feat.',
		},
	};

function PlayerLevelUp({
	charId,
	actorId,
	advancement,
	xpEligible,
	milestoneEligible,
	dispatch,
}: {
	charId: string;
	actorId: string;
	advancement: AdvancementState | null;
	xpEligible: EligibilityResult | null;
	milestoneEligible: EligibilityResult | null;
	dispatch: Dispatch;
}) {
	const [inputs, setInputs] = useState<Record<string, string>>({});
	const draft = advancement?.draft ?? null;
	const level = advancement?.level ?? 1;
	const xp = advancement?.xp ?? 0;
	const nextXp = level < 20 ? xpForLevel(level + 1) : null;

	const open = (mode: 'xp' | 'milestone') =>
		dispatch({
			type: 'character.open-advancement',
			actorId,
			payload: { characterId: charId, mode },
		});
	const cancel = () =>
		dispatch({ type: 'character.cancel-advancement', actorId, payload: { characterId: charId } });
	const finish = async () => {
		if (
			await dispatch({
				type: 'character.commit-advancement',
				actorId,
				payload: { characterId: charId },
			})
		)
			setInputs({});
	};
	// Per-step save through the real merge path (`set-advancement-choices` merges into the draft).
	const saveChoice = (field: string) => {
		const raw = (inputs[field] ?? '').trim();
		if (!raw) return;
		const value = STEP_META[field]?.number ? Math.trunc(Number(raw)) : raw;
		if (STEP_META[field]?.number && !Number.isFinite(value as number)) return;
		return dispatch({
			type: 'character.set-advancement-choices',
			actorId,
			payload: { characterId: charId, [field]: value },
		});
	};

	if (!draft) {
		return (
			<div style={{ maxWidth: 680, margin: '0 auto' }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 16,
						padding: '16px 20px',
						borderRadius: 14,
						background: `linear-gradient(135deg, ${T.accSub}, ${T.surf})`,
						border: `1px solid ${T.accBd}`,
						marginBottom: 18,
					}}
				>
					<span
						style={{
							width: 50,
							height: 50,
							borderRadius: 12,
							background: T.acc,
							color: T.accFg,
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							font: `700 20px ${T.mono}`,
						}}
					>
						{level}
					</span>
					<div style={{ flex: 1 }}>
						<div style={{ font: `700 18px ${T.disp}` }}>Level {level}</div>
						<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
							{level >= 20 ? 'Maximum level reached.' : `Next: level ${level + 1}`}
						</div>
					</div>
				</div>
				{nextXp !== null && (
					<Panel title="Experience" pad={14} style={{ marginBottom: 16 }}>
						<ProgressMeter
							value={Math.min(xp, nextXp)}
							max={nextXp}
							label={`${xp} / ${nextXp} XP`}
						/>
						{xpEligible && !xpEligible.eligible && (
							<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 6 }}>
								{xpEligible.message}
							</div>
						)}
					</Panel>
				)}
				<div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
					<Button
						variant="primary"
						size="md"
						icon="flag"
						disabled={!xpEligible?.eligible}
						onClick={() => open('xp')}
					>
						Level up (XP)
					</Button>
					<Button
						variant="secondary"
						size="md"
						disabled={!milestoneEligible?.eligible}
						onClick={() => open('milestone')}
					>
						Level up (milestone)
					</Button>
				</div>
				{milestoneEligible && !milestoneEligible.eligible && (
					<div style={{ font: `12px ${T.sans}`, color: T.ter, textAlign: 'center', marginTop: 10 }}>
						{milestoneEligible.message}
					</div>
				)}
			</div>
		);
	}

	// The steps this level actually requires, derived from the core validator itself (an empty-choices
	// validation lists every required field; the current validation marks which are still open).
	const required = validateAdvancement({ ...draft, choices: {} }).issues.filter(
		(i) => i.field !== 'mode',
	);
	const openIssues = validateAdvancement(draft);
	const pending = new Map(openIssues.issues.map((i) => [i.field as string, i.message]));
	const doneCount = required.filter((i) => !pending.has(i.field as string)).length;

	return (
		<div style={{ maxWidth: 680, margin: '0 auto' }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 16,
					padding: '16px 20px',
					borderRadius: 14,
					background: `linear-gradient(135deg, ${T.accSub}, ${T.surf})`,
					border: `1px solid ${T.accBd}`,
					marginBottom: 18,
				}}
			>
				<span
					style={{
						width: 50,
						height: 50,
						borderRadius: 12,
						background: T.acc,
						color: T.accFg,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						font: `700 20px ${T.mono}`,
					}}
				>
					{draft.toLevel}
				</span>
				<div style={{ flex: 1 }}>
					<div style={{ font: `700 18px ${T.disp}` }}>
						Level {draft.fromLevel} → {draft.toLevel}
					</div>
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
						{draft.mode} advancement · {doneCount}/{required.length} choices made
					</div>
				</div>
				<Button variant="ghost" size="sm" onClick={cancel}>
					Cancel
				</Button>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
				{required.map((req, i) => {
					const field = req.field as string;
					const meta = STEP_META[field] ?? { label: field, kind: 'choice', detail: '' };
					const saved = (draft.choices as Record<string, unknown>)[field];
					const done = !pending.has(field);
					return (
						<div
							key={field}
							style={{
								display: 'flex',
								gap: 13,
								padding: 14,
								borderRadius: 11,
								border: `1px solid ${done ? T.bd : T.accBd}`,
								background: T.surf,
							}}
						>
							<span
								style={{
									width: 28,
									height: 28,
									borderRadius: '50%',
									flex: '0 0 auto',
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: done ? T.ok : T.alt,
									color: done ? T.accFg : T.ter,
								}}
							>
								{done ? (
									<Icon name="check" size={15} />
								) : (
									<span style={{ font: `700 12px ${T.mono}` }}>{i + 1}</span>
								)}
							</span>
							<div style={{ flex: 1 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
									<span style={{ font: `600 13.5px ${T.sans}` }}>{meta.label}</span>
									<Badge status="neutral">{meta.kind}</Badge>
								</div>
								{done ? (
									<div style={{ font: `12.5px ${T.sans}`, color: T.acc }}>{String(saved)}</div>
								) : (
									<div style={{ font: `12px ${T.sans}`, color: T.warn }}>{pending.get(field)}</div>
								)}
								<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, marginTop: 2 }}>
									{meta.detail}
								</div>
								<div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
									<Input
										type={meta.number ? 'number' : 'text'}
										value={inputs[field] ?? ''}
										placeholder={done ? String(saved) : meta.label}
										aria-label={meta.label}
										onChange={(e: any) => setInputs((v) => ({ ...v, [field]: e.target.value }))}
										style={{ maxWidth: 220 }}
									/>
									<Button
										variant="secondary"
										size="sm"
										disabled={!(inputs[field] ?? '').trim()}
										onClick={() => saveChoice(field)}
									>
										{done ? 'Change' : 'Choose'}
									</Button>
								</div>
							</div>
						</div>
					);
				})}
			</div>
			<div style={{ marginTop: 16, textAlign: 'center' }}>
				<Button
					variant="primary"
					size="md"
					icon="flag"
					disabled={!openIssues.complete}
					onClick={finish}
				>
					{openIssues.complete
						? `Finish — become level ${draft.toLevel}`
						: 'Make all choices to finish'}
				</Button>
			</div>
		</div>
	);
}

// ── Journal — real entries with add / edit / remove / share; quests + highlights are entry KINDS ──
function PlayerJournal({
	charId,
	actorId,
	entries,
	canAuthor,
	compact,
	dispatch,
}: {
	charId: string;
	actorId: string;
	entries: JournalEntryView[];
	canAuthor: boolean;
	compact: boolean;
	dispatch: Dispatch;
}) {
	const [title, setTitle] = useState('');
	const [body, setBody] = useState('');
	const [kind, setKind] = useState('note');
	const [editId, setEditId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState('');
	const [editBody, setEditBody] = useState('');

	const add = async () => {
		if (!title.trim()) return;
		const ok = await dispatch({
			type: 'character.add-journal-entry',
			actorId,
			payload: {
				characterId: charId,
				kind,
				title: title.trim(),
				body: body.trim(),
				visibility: 'dm-only',
			},
		});
		if (ok) {
			setTitle('');
			setBody('');
		}
	};
	// Real visibility toggle: flip between owner-private (`dm-only`) and shared-with-players.
	const toggleShare = (entry: JournalEntryView) =>
		dispatch({
			type: 'character.set-journal-entry-visibility',
			actorId,
			payload: {
				characterId: charId,
				entryId: entry.id,
				visibility: entry.visibility === 'player-visible' ? 'dm-only' : 'player-visible',
				sharedWith: [],
			},
		});
	// Real edit path (CHAR-012 `character.update-journal-entry`).
	const startEdit = (entry: JournalEntryView) => {
		setEditId(entry.id);
		setEditTitle(entry.title);
		setEditBody(entry.body);
	};
	const saveEdit = async () => {
		if (!editId || !editTitle.trim()) return;
		const ok = await dispatch({
			type: 'character.update-journal-entry',
			actorId,
			payload: { characterId: charId, entryId: editId, title: editTitle.trim(), body: editBody },
		});
		if (ok) setEditId(null);
	};
	// Delete is instant with an UNDO toast — the undo re-authors the captured entry through the
	// same add command (kind/title/body/visibility preserved; the restored entry gets a fresh id).
	const remove = async (entry: JournalEntryView) => {
		const ok = await dispatch({
			type: 'character.remove-journal-entry',
			actorId,
			payload: { characterId: charId, entryId: entry.id },
		});
		if (!ok) return;
		const { kind: entryKind, title: entryTitle, body: entryBody, visibility } = entry;
		Toaster.success(`“${entryTitle}” deleted`, {
			action: 'Undo',
			onAction: () => {
				void dispatch({
					type: 'character.add-journal-entry',
					actorId,
					payload: {
						characterId: charId,
						kind: entryKind,
						title: entryTitle,
						body: entryBody,
						visibility,
						sharedWith: [],
					},
				}).then((restored) => {
					if (restored) Toaster.success(`“${entryTitle}” restored`);
				});
			},
		});
	};

	// Quests + highlights are REAL journal-entry kinds (core `journalEntryKindSchema`), projected into
	// their own side panels; the main list carries every entry (the editable source of truth).
	const quests = entries.filter((e) => e.kind === 'personal-quest');
	const highlights = entries.filter((e) => e.kind === 'session-highlight');

	return (
		<div>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					padding: '10px 14px',
					borderRadius: 10,
					background: 'var(--color-dm-only-subtle)',
					border: `1px solid var(--color-dm-only-badge)`,
					marginBottom: 18,
				}}
			>
				<Icon name="hidden" size={16} color="var(--color-dm-only-badge)" />
				<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
					Private journal — entries are owner-private until you explicitly share one with the table.
				</span>
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
					gap: 18,
					alignItems: 'start',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<Panel title={`Journal entries (${entries.length})`}>
						{entries.length === 0 ? (
							<EmptyState
								inset
								icon="note-edit"
								title="No entries yet"
								description="Write the first journal entry below — it stays private until shared."
							/>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column' }}>
								{entries.map((im, i) => {
									const shared = im.visibility === 'player-visible';
									const isEditing = editId === im.id;
									return (
										<div
											key={im.id}
											style={{ padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}
										>
											{isEditing ? (
												<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
													<Input
														value={editTitle}
														aria-label="Entry title"
														onChange={(e: any) => setEditTitle(e.target.value)}
													/>
													<Textarea
														rows={2}
														value={editBody}
														aria-label="Entry body"
														onChange={(e: any) => setEditBody(e.target.value)}
													/>
													<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
														<Button variant="ghost" size="sm" onClick={() => setEditId(null)}>
															Cancel
														</Button>
														<Button
															variant="primary"
															size="sm"
															disabled={!editTitle.trim()}
															onClick={saveEdit}
														>
															Save
														</Button>
													</div>
												</div>
											) : (
												<>
													<div
														style={{
															display: 'flex',
															alignItems: 'center',
															gap: 8,
															marginBottom: 4,
														}}
													>
														<span style={{ font: `600 13px ${T.sans}` }}>{im.title}</span>
														<Badge status="neutral">{im.kind}</Badge>
														{canAuthor && (
															<span
																style={{
																	marginLeft: 'auto',
																	display: 'inline-flex',
																	alignItems: 'center',
																	gap: 4,
																}}
															>
																<button
																	type="button"
																	// The only toggle in this file without it; every sibling
																	// (inspiration, equipped, prepared) already announces state.
																	aria-pressed={shared}
																	// Every entry rendered an identically-named toggle, so
																	// browsing by control gave no way to tell which journal
																	// entry was about to be shared with the whole table.
																	aria-label={`${shared ? 'Shared' : 'Private'} — ${im.title}`}
																	onClick={() => toggleShare(im)}
																	style={{
																		display: 'inline-flex',
																		alignItems: 'center',
																		gap: 5,
																		// ~21px before (3px round an 11px line) — under WCAG
																		// 2.5.8. Grown with padding, as the Equip pill was.
																		padding: '6px 10px',
																		minHeight: 24,
																		boxSizing: 'border-box',
																		borderRadius: 16,
																		cursor: 'pointer',
																		font: `11px ${T.sans}`,
																		border: `1px solid ${shared ? T.accBd : T.bd}`,
																		background: shared ? T.accSub : T.surf,
																		color: shared ? T.acc : T.ter,
																	}}
																>
																	<Icon name={shared ? 'visibility-players' : 'hidden'} size={12} />
																	{shared ? 'Shared' : 'Private'}
																</button>
																<IconButton
																	icon="note-edit"
																	label={`Edit ${im.title}`}
																	variant="ghost"
																	size="sm"
																	onClick={() => startEdit(im)}
																/>
																<IconButton
																	icon="close"
																	label={`Delete ${im.title}`}
																	variant="ghost"
																	size="sm"
																	onClick={() => void remove(im)}
																/>
															</span>
														)}
													</div>
													{im.body && (
														<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
															{im.body}
														</div>
													)}
												</>
											)}
										</div>
									);
								})}
							</div>
						)}
						{canAuthor && (
							<div
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 8,
									marginTop: 14,
									paddingTop: 14,
									borderTop: `1px solid ${T.bd}`,
								}}
							>
								<div style={{ display: 'flex', gap: 8 }}>
									<Input
										value={title}
										aria-label="Entry title"
										onChange={(e: any) => setTitle(e.target.value)}
										placeholder="Entry title…"
										style={{ flex: 1 }}
									/>
									<Select
										value={kind}
										onChange={(e: any) => setKind(e.target.value)}
										options={JOURNAL_KINDS}
										aria-label="Entry kind"
										style={{ width: 170 }}
									/>
								</div>
								<Textarea
									value={body}
									aria-label="Entry body"
									onChange={(e: any) => setBody(e.target.value)}
									placeholder="What happened…"
									rows={2}
								/>
								<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
									<Button
										variant="secondary"
										size="sm"
										icon="add"
										disabled={!title.trim()}
										onClick={add}
									>
										Add entry
									</Button>
								</div>
							</div>
						)}
					</Panel>
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					{/* Real projections of the journal's `personal-quest` / `session-highlight` entry kinds. */}
					<Panel title={`Personal quests (${quests.length})`}>
						{quests.length === 0 ? (
							<EmptyState
								inset
								icon="flag"
								title="No personal quests"
								description='Add a journal entry with the "Personal quest" kind to track one here.'
							/>
						) : (
							quests.map((q, i) => (
								<div
									key={q.id}
									style={{
										display: 'flex',
										gap: 10,
										padding: '9px 0',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
									}}
								>
									<Icon name="flag" size={15} color={T.acc} />
									<div style={{ flex: 1 }}>
										<div style={{ font: `12.5px ${T.sans}`, color: T.ink }}>{q.title}</div>
										{q.body && (
											<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 2 }}>
												{q.body}
											</div>
										)}
									</div>
								</div>
							))
						)}
					</Panel>
					<Panel title={`Session highlights (${highlights.length})`}>
						{highlights.length === 0 ? (
							<EmptyState
								inset
								icon="sparkle"
								title="No highlights yet"
								description='Add a journal entry with the "Session highlight" kind to capture one.'
							/>
						) : (
							highlights.map((h, i) => (
								<div
									key={h.id}
									style={{ padding: '9px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}
								>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
										<Badge status="accent">highlight</Badge>
										<span style={{ marginLeft: 'auto', font: `10.5px ${T.mono}`, color: T.ter }}>
											{new Date(h.updatedAt).toLocaleDateString()}
										</span>
									</div>
									<div style={{ font: `600 12.5px ${T.sans}` }}>{h.title}</div>
									{h.body && (
										<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.sub }}>{h.body}</div>
									)}
								</div>
							))
						)}
					</Panel>
				</div>
			</div>
		</div>
	);
}
