import { useMemo, useState } from 'react';
import {
	advancementStateOf,
	checkAdvancementEligibility,
	computeEncumbrance,
	effectiveProficiencyBonus,
	getActiveSystemForActor,
	getCharacterForActor,
	getCharacterJournalForActor,
	getPartyOverviewForActor,
	hasGrantedCapability,
	inventoryOf,
	listCharactersForActor,
	passivePerception,
	resourcesOf,
	CHARACTER_ENTITY_TYPE,
} from '@dndtools/core';
import {
	Avatar,
	Badge,
	Chip,
	ConditionBadge,
	Icon,
	IconButton,
	Select,
	Stat,
	Tabs,
	tabPanelProps,
} from '../../ds';
import type { DSChangeEvent } from '../../ds';
import { Page, Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useViewport } from '../../app/useViewport';
import { cap, condKey, type PlayerData } from './shared';
import { PrintableSheet } from '../../app/character/PrintableSheet';
import { PlayerSheet } from './Sheet';
import { PlayerResources } from './Vitals';
import { PlayerParty } from './Party';
import { PlayerLevelUp } from './Advancement';
import { PlayerJournal } from './Journal';
import { CharacterHistoryTimeline } from '../../app/character/History';
import { PartyStash } from '../../app/character/PartyStash';

/**
 * Player — the second-persona character surface, fully core-backed (the last `DNDPlayer` mock
 * remnants are gone). The active actor is `runtime.defaultActorId` (the device owner / view-as
 * actor, exactly like CommandCenter): when that is the DM (or a granted character owner) the writes
 * below succeed; if the DM is previewing as a player, the Core faithfully rejects them read-only.
 *
 * RC-CHR-4.3 (DEBT-2026-005) — `runtime.readOnly` is ANDed into every `canAuthor…`/`canManage…` flag
 * (and the inline HP stepper / inspiration toggle) so the manage controls are HIDDEN or disabled the
 * moment a preview starts, rather than shown live and rejected on click: a preview blocks every write
 * regardless of the previewed role's authority, so leaving a control clickable there is always a dead
 * control (guardrail #8).
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

export function Player() {
	const { t } = useI18n();
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
		// RC-CHR-1.1 — the reads are package-scoped: `CharacterView.resources` is every resource the
		// ACTIVE package declares for this character, so a campaign on Generic reads a stress clock
		// where a 5e one reads ki, without either name appearing on this screen.
		const activePackage = getActiveSystemForActor(
			state.systems,
			state.permissions,
			actorId,
		).activePackage;
		const pcs = listCharactersForActor(
			state.characters,
			state.permissions,
			actorId,
			activePackage,
		).filter((c) => c.kind === 'pc');
		const chosen = pcs.find((c) => c.id === pcChoice) ?? pcs[0] ?? null;
		const view = chosen
			? getCharacterForActor(state.characters, state.permissions, actorId, chosen.id, activePackage)
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
		// RC-CHR-4.3 (DEBT-2026-005) — while the DM is previewing (any role), EVERY write is rejected
		// read-only by the runtime regardless of who would otherwise be authorized, so an authority check
		// alone leaves a dead control behind. Fold `runtime.readOnly` into every manage-capability flag so
		// the DM never sees a "canAuthor…" affordance the click can't actually honor.
		const readOnlyPreview = runtime.readOnly;
		const party = getPartyOverviewForActor(state.characters, state.permissions, actorId);
		// RC-CHR-3.2 — the party's aggregate STR (defaulting each member to 10), for the stash's
		// encumbrance BASELINE (`encumbranceLevelFor(stashWeight, partyStrength)`). `pcs` is the exact
		// same actor-filtered visible-PC set `party.members` derives from, so this never over-counts a
		// member the DM can see but the viewer cannot.
		const partyStrength = pcs.reduce((sum, c) => sum + (c.abilityScores.str ?? 10), 0) || 10;
		return {
			characterId: chosen?.id ?? null,
			view,
			resources,
			pcs: pcs.map((c) => ({ id: c.id, name: c.name })),
			partyStrength,
			// Pure derived queries, computed AFTER the actor-filtered gate passed (same pattern as
			// `resourcesOf` above) — they read only abilityScores / proficiencies / data.level.
			passive: record ? passivePerception(record) : null,
			profBonus: record ? effectiveProficiencyBonus(record) : null,
			journal: journalView?.entries ?? [],
			canAuthorJournal: (isDm || isOwner) && !readOnlyPreview,
			// Structured inventory + encumbrance from the durable record (same post-gate pattern as
			// `resourcesOf`); encumbrance is derived on read so it can never drift from items/coins/STR.
			inventory: record ? inventoryOf(record) : null,
			encumbrance: record ? computeEncumbrance(record) : null,
			canManageInventory: (isDm || isOwner) && !readOnlyPreview,
			// RC-CHR-1.1 — the package's own resource rules fused with this sheet's counters.
			resourceInstances: view?.resources ?? [],
			canManageResources: (isDm || isOwner) && !readOnlyPreview,
			party,
			advancement: record ? advancementStateOf(record) : null,
			xpEligible: record ? checkAdvancementEligibility(record, 'xp') : null,
			milestoneEligible: record ? checkAdvancementEligibility(record, 'milestone') : null,
			canAdvance: (isDm || isOwner) && !readOnlyPreview,
			isDm,
			readOnlyPreview,
		};
	}, [state, actorId, pcChoice, runtime.readOnly]);

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
				<Panel title={t('player.empty.title')}>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>{t('player.empty.body')}</div>
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
		{ id: 'sheet', label: t('player.tab.sheet'), icon: 'characters-person' },
		{ id: 'resources', label: t('player.tab.resources'), icon: 'sparkle' },
		{ id: 'party', label: t('player.tab.party'), icon: 'players' },
		// The level-up tab drives the REAL staged advancement — shown only to an actor the core would
		// authorize (DM / granted owner), so it is never a dead surface.
		...(data.canAdvance ? [{ id: 'levelup', label: t('player.tab.levelUp'), icon: 'flag' }] : []),
		{ id: 'journal', label: t('player.tab.journal'), icon: 'note-edit' },
		// RC-CHR-2.3 — the history timeline reads the SAME actor-filtered journal already fetched
		// above for the journal tab; no extra query.
		{ id: 'history', label: t('player.tab.history'), icon: 'recent' },
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
			setHpNote(t(sign < 0 ? 'player.hp.damaged' : 'player.hp.healed', { amount }));
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
		`${cls ? cap(cls) : t('player.identity.adventurer')}${level != null ? ` ${level}` : ''}${ds('subclass') ? ` (${cap(ds('subclass')!)})` : ''}`,
		ds('background') ? t('player.identity.background', { name: cap(ds('background')!) }) : null,
	]
		.filter(Boolean)
		.join(' · ');

	return (
		<div>
			<PrintableSheet character={C} inventory={data.inventory} level={level} />
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
						<Badge status="success">{t('player.pcBadge')}</Badge>
					</div>
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{identityLine}</div>
				</div>
				{/* PC switcher — a signed-in player may control multiple PCs (the actor-filtered list);
				    the whole surface (sheet/resources/level-up/journal) follows the selection. */}
				{data.pcs.length > 1 && (
					<Select
						value={charId}
						onChange={(e: DSChangeEvent) => {
							// The error banner is screen-level and was only ever cleared by the NEXT
							// successful dispatch, so a rejected write kept accusing the user from the top
							// of an unrelated character or tab.
							setErr(null);
							setHpNote(null);
							setPcChoice(e.target.value);
						}}
						options={data.pcs.map((p) => ({ value: p.id, label: p.name }))}
						aria-label={t('player.switchCharacter')}
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
						label={
							data.readOnlyPreview
								? t('player.blockedPreview')
								: t('player.hp.damageBy', { amount: hpStep() })
						}
						variant="ghost"
						size="sm"
						aria-disabled={data.readOnlyPreview}
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
							{t('player.hp.label')}
						</div>
					</div>
					<IconButton
						icon="chevron-up"
						label={
							data.readOnlyPreview
								? t('player.blockedPreview')
								: t('player.hp.healBy', { amount: hpStep() })
						}
						variant="ghost"
						size="sm"
						aria-disabled={data.readOnlyPreview}
						onClick={() => void stepHp(1)}
					/>
					<input
						type="text"
						inputMode="numeric"
						aria-label={t('player.hp.amountLabel')}
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
				<Stat label={t('player.stat.ac')} value={String(C.combat.ac)} icon="shield" />
				{/* speed / initiative — `data.*` sheet strings (edited on the Sheet tab); '—' until authored */}
				<Stat
					label={t('player.stat.speed')}
					value={ds('speed') ? t('player.stat.speedValue', { feet: ds('speed') ?? '' }) : '—'}
					icon="travel"
				/>
				<Stat label={t('player.stat.init')} value={ds('init') ?? '—'} icon="session-bolt" />
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
					aria-disabled={data.readOnlyPreview || undefined}
					title={data.readOnlyPreview ? t('player.blockedPreview') : undefined}
					onClick={data.readOnlyPreview ? undefined : toggleInspiration}
					style={{
						marginLeft: 'auto',
						display: 'inline-flex',
						alignItems: 'center',
						gap: 7,
						padding: '7px 12px',
						borderRadius: 20,
						cursor: data.readOnlyPreview ? 'not-allowed' : 'pointer',
						opacity: data.readOnlyPreview ? 0.6 : 1,
						border: `1px solid ${insp ? T.accBd : T.bd}`,
						background: insp ? T.accSub : T.surf,
						color: insp ? T.acc : T.ter,
						font: `600 12px ${T.sans}`,
					}}
				>
					<Icon name="sparkle" size={15} />
					{t(insp ? 'player.inspiration.on' : 'player.inspiration.off')}
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
						aria-label={t('player.sections')}
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
							resourceInstances={data.resourceInstances}
							canManageResources={data.canManageResources}
							actorId={actorId}
							compact={viewport === 'phone'}
							// RC-CHR-1.2 — what the rest dialog needs, all from the actor-scoped view: the
							// hit dice on the sheet, the hit-point pool a rest heals, the CON modifier the
							// core adds to each spent die, and the exhaustion a long rest steps down.
							restSubject={
								C
									? {
											id: charId,
											name: C.name,
											hp: C.combat.hp,
											maxHp: C.combat.maxHp,
											hitDice: C.proficiencies.hitDice,
											conMod: Math.floor(((C.abilityScores.con ?? 10) - 10) / 2),
											exhaustion: data.resources?.exhaustion ?? 0,
										}
									: null
							}
							dispatch={dispatch}
						/>
					)}
					{activeTab === 'party' && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
							<PlayerParty
								party={data.party}
								selfId={charId}
								isDm={data.isDm}
								actorId={actorId}
								compact={viewport === 'phone'}
								dispatch={dispatch}
							/>
							{/* RC-CHR-3.2 — party stash v2 supersedes the name/detail-only stash that used to
							    be embedded in PlayerParty (quantity/weight, claim-to-PC, deposit, baseline). */}
							<PartyStash
								key={charId}
								party={data.party}
								partyStrength={data.partyStrength}
								selfId={charId}
								selfName={name}
								selfInventory={data.inventory}
								isDm={data.isDm}
								canClaim={data.canManageInventory}
								actorId={actorId}
								dispatch={dispatch}
							/>
						</div>
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
					{activeTab === 'history' && (
						<CharacterHistoryTimeline key={charId} characterName={name} entries={data.journal} />
					)}
				</div>
			</Page>
		</div>
	);
}
