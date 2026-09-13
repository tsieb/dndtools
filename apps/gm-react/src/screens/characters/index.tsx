import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { listCharactersForActor } from '@dndtools/core';
import {
	abilityModifier,
	Button,
	EmptyState,
	Icon,
	IconButton,
	Select,
	Tabs,
	tabPanelProps,
} from '../../ds';
import { CharBuilder } from '../../app/charBuilder';
import { Page, T, srOnly } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { CharCard } from './CharCard';
import { CharacterSheet } from './CharacterSheet';
import {
	OWNER_ANY,
	OWNER_NONE,
	TAG_ANY,
	buildRosterEntries,
	gridTargetIndex,
	matchesRosterFilter,
	rosterFacets,
} from './roster';
import { useI18n } from '../../i18n';

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
 * Roster information scent (RC-CHR-5.3): each card shows class · level, an HP bar, conditions, the
 * owning player (a live `owner` grant), tags (`data.tags`, authored on the sheet) and the last session
 * the character took part in (session archives + the running combat) — all derived in `roster.ts`.
 * The kind tabs combine with Owner and Tag filters. The card grid is ONE tab stop with a roving
 * `tabIndex`: arrows move by row and column as laid out, Home/End jump to the ends, Enter opens.
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

/** Keys the card grid handles itself; everything else (Enter/Space, Tab) keeps its default. */
const GRID_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']);
const GRID_HINT_ID = 'characters-grid-hint';

const filterField = {
	display: 'flex',
	flexDirection: 'column',
	gap: T.space.one,
	minWidth: 0,
	maxWidth: '100%',
} as const;
const filterLabel = { font: `600 12px ${T.sans}`, color: T.ter } as const;

export function Characters() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	const location = useLocation();
	// URL-driven detail (`/characters/:id`) so Story cards, palette hits, and note mentions can
	// deep-link a specific sheet instead of dumping the user on the roster.
	const { id: detailId = null } = useParams<{ id: string }>();
	const actorId = runtime.defaultActorId;
	const [kind, setKind] = useState('all');
	const [owner, setOwner] = useState(OWNER_ANY);
	const [tag, setTag] = useState(TAG_ANY);
	// The card holding the grid's single tab stop; follows focus so Tab returns where the user left.
	const [activeId, setActiveId] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const [initialKind, setInitialKind] = useState<string | null>(null);
	// When set, the CharBuilder overlay opens straight into the file-import path (WS-4 JSON import).
	const [importIntent, setImportIntent] = useState(false);
	// A rejection ("Start a session first") used to render in the same accent-tinted success chip as
	// "Combat started", polite rather than assertive, so a refusal read as a confirmation.
	const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

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
		const entries = buildRosterEntries(
			characters,
			runtime.state.permissions,
			runtime.state.session,
		);
		return { isDm: actor?.role === 'dm', characters, entries, facets: rosterFacets(entries) };
	}, [runtime.state, actorId]);

	// `key` is load-bearing, not decoration. CharacterSheet holds a dozen pieces of per-character
	// draft state (shareDraft, attackRows, acDraft, xpInput, editMode, error) and has NO effect keyed
	// on `id`, so navigating sheet -> sheet (the command palette does exactly that) reused the
	// mounted component and carried A's drafts onto B — where `applySharing` and `saveAttacks`, both
	// full replacements, would happily write them. Remounting on id change is the fix.
	if (detailId)
		return <CharacterSheet key={detailId} id={detailId} onBack={() => navigate('/characters')} />;

	const list = data.entries.filter((entry) => matchesRosterFilter(entry, { kind, owner, tag }));
	const filtered = kind !== 'all' || owner !== OWNER_ANY || tag !== TAG_ANY;
	const tabStopId = list.some((entry) => entry.view.id === activeId)
		? activeId
		: (list[0]?.view.id ?? null);
	const tabs = [
		{ id: 'all', label: t('characters.filter.all') },
		{ id: 'pc', label: t('characters.filter.party') },
		{ id: 'npc', label: t('characters.filter.npcs') },
		{ id: 'monster', label: t('characters.filter.bestiary') },
	];
	const ownerOptions = [
		{ value: OWNER_ANY, label: t('characters.filter.anyOwner') },
		...data.facets.owners.map((o) => ({ value: o.id, label: o.name })),
		{ value: OWNER_NONE, label: t('characters.filter.noOwner') },
	];
	// A tag that is still selected after its last character lost it stays in the menu, so the select
	// never shows a value it has no option for.
	const tagValues =
		tag === TAG_ANY || data.facets.tags.includes(tag)
			? data.facets.tags
			: [...data.facets.tags, tag];
	const tagOptions = [
		{ value: TAG_ANY, label: t('characters.filter.anyTag') },
		...tagValues.map((value) => ({ value, label: value })),
	];

	function clearFilters() {
		setKind('all');
		setOwner(OWNER_ANY);
		setTag(TAG_ANY);
	}

	// Roving focus across a wrapped `auto-fill` grid: the column count is read from layout (cards
	// sharing the first card's top edge) because it changes with the viewport.
	function onGridKeyDown(e: KeyboardEvent<HTMLUListElement>) {
		if (!GRID_KEYS.has(e.key) || e.altKey || e.metaKey || e.shiftKey) return;
		const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-roster-card]'));
		const index = cards.indexOf(e.target as HTMLElement);
		if (index === -1) return;
		e.preventDefault();
		const firstTop = cards[0]?.getBoundingClientRect().top ?? 0;
		const columns = cards.filter(
			(card) => Math.abs(card.getBoundingClientRect().top - firstTop) < 1,
		).length;
		const next = gridTargetIndex(e.key, index, cards.length, columns);
		if (next !== null) cards[next]?.focus();
	}

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
					// Was a flat 0 for every PC, producing a degenerate all-tied order with no reroll
					// path. Use the same d20 + DEX roll EncounterBuilder already applies for exactly
					// this reason, so this convenience button can't start a fight of all-0 initiative.
					initiative:
						1 + Math.floor(Math.random() * 20) + abilityModifier(c.abilityScores.dex ?? 10),
				})),
			},
		});
		setNotice(
			result.status === 'rejected'
				? { tone: 'error', text: result.rejection.message }
				: { tone: 'ok', text: 'Combat started — open the Session screen to run it.' },
		);
	}

	return (
		<Page>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: T.space.three,
					marginBottom: T.space.three,
					flexWrap: 'wrap',
				}}
			>
				<Tabs
					value={kind}
					onChange={setKind}
					tabs={tabs}
					idBase="characters"
					aria-label={t('characters.rosterFilter')}
				/>
				<div style={{ flex: 1 }} />
				{data.isDm && partyPcs.length > 0 && (
					<Button variant="ghost" size="sm" icon="sword" onClick={startCombat}>
						{t('characters.startCombat')}
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
						{t('characters.importJson')}
					</Button>
				)}
				{data.isDm && (
					<Button
						variant="primary"
						size="sm"
						icon="new-character"
						onClick={() => setCreating(true)}
					>
						{t('characters.newCharacter')}
					</Button>
				)}
			</div>

			{data.characters.length > 0 && (
				<div
					role="group"
					aria-label={t('characters.filters')}
					style={{
						display: 'flex',
						alignItems: 'flex-end',
						gap: T.space.three,
						marginBottom: T.space.four,
						flexWrap: 'wrap',
					}}
				>
					{/* A sibling `<label htmlFor>` rather than a wrapping one: a label that CONTAINS a
					    select takes the select's option text into its own text content. */}
					<div style={filterField}>
						<label htmlFor="characters-filter-owner" style={filterLabel}>
							{t('characters.filter.owner')}
						</label>
						<Select
							id="characters-filter-owner"
							value={owner}
							onChange={(e: { target: { value: string } }) => setOwner(e.target.value)}
							options={ownerOptions}
							style={{ minWidth: 150, maxWidth: '100%' }}
						/>
					</div>
					{tagValues.length > 0 && (
						<div style={filterField}>
							<label htmlFor="characters-filter-tag" style={filterLabel}>
								{t('characters.filter.tag')}
							</label>
							<Select
								id="characters-filter-tag"
								value={tag}
								onChange={(e: { target: { value: string } }) => setTag(e.target.value)}
								options={tagOptions}
								style={{ minWidth: 130, maxWidth: '100%' }}
							/>
						</div>
					)}
					{filtered && (
						<Button variant="ghost" size="sm" icon="close" onClick={clearFilters}>
							{t('characters.filter.clear')}
						</Button>
					)}
					<div style={{ flex: 1 }} />
					<span role="status" style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{t('characters.resultCount', { shown: list.length, total: data.characters.length })}
					</span>
				</div>
			)}

			{notice && (
				<div
					role={notice.tone === 'error' ? 'alert' : 'status'}
					style={{
						marginBottom: 14,
						display: 'flex',
						alignItems: 'flex-start',
						gap: 8,
						font: `13px ${T.sans}`,
						color: notice.tone === 'error' ? 'var(--color-status-error-text)' : T.sub,
						background: notice.tone === 'error' ? 'var(--color-status-error-subtle)' : T.accSub,
						border: `1px solid ${
							notice.tone === 'error' ? 'var(--color-status-error-border)' : T.accBd
						}`,
						borderRadius: 8,
						padding: '8px 12px',
					}}
				>
					<Icon name={notice.tone === 'error' ? 'warning' : 'check'} size={14} />
					<span style={{ flex: 1, minWidth: 0 }}>{notice.text}</span>
					<IconButton
						icon="close"
						label={t('characters.dismissMessage')}
						variant="ghost"
						size="sm"
						onClick={() => setNotice(null)}
					/>
				</div>
			)}

			<div {...tabPanelProps('characters', kind)}>
				{list.length === 0 ? (
					<EmptyState
						icon="characters-person"
						title={t(
							data.characters.length === 0 ? 'characters.emptyRoster' : 'characters.noMatches',
						)}
						description={t(
							data.characters.length === 0
								? 'characters.emptyRosterBody'
								: 'characters.noMatchesBody',
						)}
						action={
							data.characters.length > 0 && filtered ? (
								<Button variant="ghost" size="sm" icon="close" onClick={clearFilters}>
									{t('characters.filter.clear')}
								</Button>
							) : data.isDm ? (
								<Button
									variant="primary"
									size="sm"
									icon="new-character"
									onClick={() => setCreating(true)}
								>
									{t('characters.newCharacter')}
								</Button>
							) : undefined
						}
					/>
				) : (
					<>
						<ul
							aria-label={t('characters.title')}
							onKeyDown={onGridKeyDown}
							style={{
								listStyle: 'none',
								margin: T.space.zero,
								padding: T.space.zero,
								display: 'grid',
								// `min()` retains the useful desktop card width without forcing horizontal
								// page scrolling on a 320px phone (292px after page gutters).
								gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 230px),1fr))',
								gap: T.space.four,
							}}
						>
							{list.map((entry) => {
								const isTabStop = entry.view.id === tabStopId;
								return (
									<li key={entry.view.id} style={{ display: 'flex', minWidth: 0 }}>
										<CharCard
											entry={entry}
											tabIndex={isTabStop ? 0 : -1}
											describedBy={isTabStop ? GRID_HINT_ID : undefined}
											onFocus={() => setActiveId(entry.view.id)}
											onOpen={() => navigate(`/characters/${entry.view.id}`)}
										/>
									</li>
								);
							})}
						</ul>
						<span id={GRID_HINT_ID} style={srOnly}>
							{t('characters.gridHint')}
						</span>
					</>
				)}
			</div>

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
