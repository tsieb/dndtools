import { useMemo, useState } from 'react';
import {
	advancementStateOf,
	getCharacterForActor,
	getCharacterJournalForActor,
	getPartyOverviewForActor,
	listCharactersForActor,
	resourcesOf,
	availableSlots,
	type CharacterResources,
	type CharacterView,
	type JournalEntryView,
	type PartyOverview,
} from '@dndtools/core';
import { Avatar, Badge, Button, Chip, ConditionBadge, CONDITIONS, HPBar, Icon, IconButton, ProgressMeter, Stat, Tabs } from '../ds';
import { Page, Panel, T, eb } from '../app/screen-kit';
import { DNDPlayer } from '../runtime/mockCampaign';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Player — the second-persona character surface, now WIRED to the live Processing Core (was a 100%
 * static `DNDPlayer` port). The active actor is `runtime.defaultActorId` (the device owner / view-as
 * actor, exactly like CommandCenter): when that is the DM, the owner-managed writes below succeed; if
 * the DM is previewing as a player, the Core faithfully rejects them read-only.
 *
 * REAL (actor-filtered) reads: the player's PC via {@link getCharacterForActor} (name, HP, AC,
 * conditions, ability scores), its resource block via {@link resourcesOf} (spell slots, class
 * resources, concentration, death saves, prepared spells), the party via {@link getPartyOverviewForActor}
 * (PCs only — DM-only NPCs never leak), and the character journal via {@link getCharacterJournalForActor}.
 *
 * REAL writes (dispatched as the active actor): HP (`character.update-combat-resource`), spell-slot &
 * class-resource toggles + rest (`character.set-spell-slots` / `character.set-class-resource` /
 * `character.rest`), and journal add / visibility (`character.add-journal-entry` /
 * `character.set-journal-entry-visibility`).
 *
 * HONEST-LOCAL only where the Core has NO home for the field — the rich sheet taxonomy the
 * quick-create character model does not carry (race/subclass/speed/skills/passives/features/equipment/
 * currency/inspiration/profBonus/hitDice) and the bespoke level-up checklist. These read `data.<key>`
 * first (light up if ever populated) and fall back to the mock, each tagged `// no core field`.
 */

const MOCK = DNDPlayer as any;
const MOCK_C = MOCK.character;
const ABIL_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABIL_LABEL: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const ABIL_FULL: Record<string, string> = { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' };
const MOOD_TONE: Record<string, string> = { wary: 'warning', curious: 'info', afraid: 'error', friendly: 'success' };
const COND_ALIAS: Record<string, string> = {
	concentrating: 'concentration', blessed: 'blessed', prone: 'prone', poisoned: 'poisoned', stunned: 'stunned',
	frightened: 'frightened', restrained: 'restrained', grappled: 'grappled', invisible: 'invisible', paralyzed: 'paralyzed',
	unconscious: 'unconscious', charmed: 'charmed', blinded: 'blinded', deafened: 'deafened', petrified: 'petrified',
	incapacitated: 'incapacitated', exhaustion: 'exhaustion',
};
const sgn = (n: number) => (n >= 0 ? '+' : '') + n;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const abilMod = (score: number | undefined) => Math.floor(((score ?? 10) - 10) / 2);
function condKey(s: string): string | null {
	const C = (CONDITIONS as any) || {};
	const k = String(s).toLowerCase();
	return COND_ALIAS[k] || (C[k] ? k : null);
}

/** Core data resolved for the active actor, plus the chosen PC id used by every write below. */
interface PlayerData {
	characterId: string | null;
	view: CharacterView | null;
	resources: CharacterResources | null;
	journal: JournalEntryView[];
	canAuthorJournal: boolean;
	party: PartyOverview;
	/** Real character level from the advancement model (CHAR-007), or null when unavailable. */
	level: number | null;
}

export function Player() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const state = runtime.state;

	const data = useMemo<PlayerData>(() => {
		// The player's PC: the first player-visible PC the actor may see (no owner grant is seeded, so
		// "mine" can't be resolved from ownership — the first PC stands in as the device's character).
		const pcs = listCharactersForActor(state.characters, state.permissions, actorId).filter((c) => c.kind === 'pc');
		const chosen = pcs[0] ?? null;
		const view = chosen ? getCharacterForActor(state.characters, state.permissions, actorId, chosen.id) : null;
		const record = chosen ? state.characters.characters[chosen.id] : undefined;
		const resources = record ? resourcesOf(record) : null;
		const journalView = chosen
			? getCharacterJournalForActor(state.characters, state.permissions, actorId, chosen.id)
			: null;
		// The active actor may author the journal when it is the DM (administrator) — there is no owner
		// grant seeded, so a player actor cannot. Mirrors the command-layer authority (re-checked there).
		const canAuthorJournal = state.permissions.actors[actorId]?.role === 'dm';
		const party = getPartyOverviewForActor(state.characters, state.permissions, actorId);
		return {
			characterId: chosen?.id ?? null,
			view,
			resources,
			journal: journalView?.entries ?? [],
			canAuthorJournal,
			party,
			level: record ? advancementStateOf(record).level : null,
		};
	}, [state, actorId]);

	const C = data.view;
	const [tab, setTab] = useState('sheet');
	const [insp, setInsp] = useState<boolean>(MOCK_C.inspiration); // no core field — inspiration
	const [err, setErr] = useState<string | null>(null);

	// Field with no Processing-Core home: read `data.<key>` first, else the mock sheet. // no core field
	const df = <V,>(key: string, fallback: V): V => (C?.data?.[key] as V) ?? fallback;

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
						This persona has no player character in the vault. Create a PC from the roster to populate the sheet.
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

	const tabs = [
		{ id: 'sheet', label: 'Sheet', icon: 'characters-person' },
		{ id: 'resources', label: 'Resources', icon: 'sparkle' },
		{ id: 'party', label: 'Party', icon: 'players' },
		{ id: 'levelup', label: 'Level up', icon: 'flag' },
		{ id: 'journal', label: 'Journal', icon: 'note-edit' },
	];

	// Real HP write: the only HP path is the combat-resource command, which the Core gates on an ACTIVE
	// session. In the idle seed it is rejected read-only — the value snaps back and the reason surfaces.
	const stepHp = (delta: number) =>
		dispatch({ type: 'character.update-combat-resource', actorId, payload: { characterId: charId, kind: 'hp', delta } });

	return (
		<div>
			{/* persistent vitals bar */}
			<div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 18, padding: '13px 28px', background: 'color-mix(in srgb, var(--color-surface) 94%, transparent)', backdropFilter: 'blur(6px)', borderBottom: `1px solid ${T.bd}`, flexWrap: 'wrap' }}>
				<Avatar name={name} size="md" ring="active" />
				<div style={{ minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<span style={{ font: `700 17px ${T.disp}` }}>{name}</span>
						<Badge status="success">PC</Badge>
					</div>
					{/* class + level come from core (draft `data.class`, advancement level); race/subclass have
					    no core home yet, so they fall back to the mock sheet. */}
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{df('race', MOCK_C.race)} · {cap(df<string>('class', MOCK_C.cls))} {data.level ?? df('level', MOCK_C.level)} ({df('subclass', MOCK_C.subclass)})
					</div>
				</div>
				{/* HP stepper — real combat-resource write */}
				<div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px', borderRadius: 11, background: T.alt, border: `1px solid ${T.bd}` }}>
					<IconButton icon="chevron-down" label="Damage" variant="ghost" size="sm" onClick={() => stepHp(-1)} />
					<div style={{ textAlign: 'center', minWidth: 74 }}>
						<div style={{ font: `700 18px ${T.mono}`, color: maxHp > 0 && hp / maxHp < 0.3 ? T.err : T.ink, lineHeight: 1 }}>{hp}<span style={{ font: `13px ${T.mono}`, color: T.ter }}> / {maxHp}</span></div>
						<div style={{ font: `9.5px ${T.sans}`, letterSpacing: '.08em', color: T.ter }}>HIT POINTS</div>
					</div>
					<IconButton icon="chevron-up" label="Heal" variant="ghost" size="sm" onClick={() => stepHp(1)} />
				</div>
				<Stat label="AC" value={String(C.combat.ac)} icon="shield" />
				{/* no core field — speed/initiative live on the quick-create sheet, not the Core combat block */}
				<Stat label="Speed" value={`${df('speed', MOCK_C.speed)}ft`} icon="travel" />
				<Stat label="Init" value={sgn(df('init', MOCK_C.init))} icon="session-bolt" />
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					{conditions.map((c: string) => {
						const k = condKey(c);
						return k ? <ConditionBadge key={c} condition={k} compact /> : <Chip key={c} tone="accent">{c}</Chip>;
					})}
				</div>
				<button
					type="button"
					onClick={() => setInsp((v) => !v)} // no core field — inspiration is a local toggle
					style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${insp ? T.accBd : T.bd}`, background: insp ? T.accSub : T.surf, color: insp ? T.acc : T.ter, font: `600 12px ${T.sans}` }}
				>
					<Icon name="sparkle" size={15} />{insp ? 'Inspiration' : 'No inspiration'}
				</button>
			</div>

			{err && (
				<div style={{ padding: '8px 28px', background: 'var(--color-status-warning-subtle)', borderBottom: `1px solid var(--color-status-warning-border)` }}>
					<span style={{ font: `12px ${T.sans}`, color: 'var(--color-status-warning-text)' }}>
						<Icon name="hidden" size={13} /> {err}
					</span>
				</div>
			)}

			<Page max={1180}>
				<div style={{ marginBottom: 18 }}><Tabs value={tab} onChange={setTab} tabs={tabs} /></div>
				{tab === 'sheet' && <PlayerSheet C={C} df={df} />}
				{tab === 'resources' && <PlayerResources charId={charId} resources={data.resources} actorId={actorId} dispatch={dispatch} />}
				{tab === 'party' && <PlayerParty party={data.party} selfId={charId} />}
				{tab === 'levelup' && <PlayerLevelUp />}
				{tab === 'journal' && <PlayerJournal charId={charId} actorId={actorId} entries={data.journal} canAuthor={data.canAuthorJournal} dispatch={dispatch} />}
			</Page>
		</div>
	);
}

function PlayerSheet({ C, df }: { C: CharacterView; df: <V>(key: string, fallback: V) => V }) {
	// Abilities — REAL ability scores from the Core character view; the modifier is derived.
	const abilities = ABIL_ORDER.map((key) => {
		const score = (C.abilityScores as Record<string, number | undefined>)[key];
		const mock = (MOCK_C.abilities as any[]).find((a) => a.key === ABIL_LABEL[key]);
		return {
			key: ABIL_LABEL[key],
			score: score ?? mock?.score ?? 10,
			mod: score !== undefined ? abilMod(score) : (mock?.mod ?? 0),
			save: mock?.save ?? false, // no core field — save proficiency
		};
	});
	// no core field — the structured sheet (skills/passives/currency/features/equipment) has no Core home.
	const skills = df<any[]>('skills', MOCK_C.skills);
	const passives = df<Record<string, number>>('passives', MOCK_C.passives);
	const currency = df<Record<string, number>>('currency', MOCK_C.currency);
	const features = df<any[]>('features', MOCK_C.features);
	const equipment = df<any[]>('equipment', MOCK_C.equipment);
	const profBonus = df('profBonus', MOCK_C.profBonus);
	const hitDice = df<string>('hitDice', MOCK_C.hitDice);
	const hitDiceLeft = df('hitDiceLeft', MOCK_C.hitDiceLeft);
	const carried = df('carried', MOCK_C.carried);
	const carryMax = df('carryMax', MOCK_C.carryMax);

	return (
		<div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'start' }}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 120 }}>
				{abilities.map((a) => (
					<div key={a.key} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 11, border: `1px solid ${a.save ? T.accBd : T.bd}`, background: a.save ? T.accSub : T.surf }}>
						<div style={{ ...eb, color: T.ter }}>{ABIL_FULL[a.key]}</div>
						<div style={{ font: `700 24px ${T.mono}`, lineHeight: 1 }}>{sgn(a.mod)}</div>
						<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: 2 }}>{a.score}</div>
						{a.save && <div style={{ font: `9.5px ${T.sans}`, color: T.acc, marginTop: 3 }}>save prof</div>}
					</div>
				))}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, alignItems: 'start' }}>
					<Panel title="Skills" pad={14}>
						<div style={{ display: 'flex', flexDirection: 'column' }}>
							{skills.map((s: any, i: number) => (
								<div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 2px', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
									<span style={{ width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto', background: s.prof ? T.acc : 'transparent', border: `1.5px solid ${s.prof ? T.acc : T.bdS}` }} />
									<span style={{ flex: 1, font: `12.5px ${T.sans}`, color: s.prof ? T.ink : T.sub }}>{s.name}</span>
									<span style={{ font: `10.5px ${T.sans}`, color: T.ter }}>{s.abil}</span>
									<span style={{ font: `12.5px ${T.mono}`, color: s.prof ? T.acc : T.sub, width: 26, textAlign: 'right' }}>{sgn(s.mod)}</span>
								</div>
							))}
						</div>
					</Panel>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
						<Panel title="Passives" pad={14}>
							{Object.entries(passives).map(([k, v]) => (
								<div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
									<span style={{ font: `12.5px ${T.sans}`, color: T.sub, textTransform: 'capitalize' }}>Passive {k}</span>
									<span style={{ font: `14px ${T.mono}`, color: T.ink }}>{v as number}</span>
								</div>
							))}
							<div style={{ display: 'flex', gap: 14, marginTop: 6, paddingTop: 8, borderTop: `1px solid ${T.bd}` }}>
								<Stat label="Prof bonus" value={sgn(profBonus)} icon="check" />
								<Stat label="Hit dice" value={`${hitDiceLeft}/${hitDice.split('d')[0]}`} icon="dice" />
							</div>
						</Panel>
						<Panel title="Currency" pad={14}>
							<div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
								{Object.entries(currency).filter(([, v]) => (v as number) > 0).map(([k, v]) => (
									<span key={k} style={{ font: `12.5px ${T.mono}`, padding: '4px 9px', borderRadius: 7, background: T.alt, border: `1px solid ${T.bd}` }}><span style={{ color: T.acc }}>{v as number}</span> {k}</span>
								))}
							</div>
							<div style={{ marginTop: 8 }}><ProgressMeter value={carried} max={carryMax} label={`Carried ${carried} / ${carryMax} lb`} /></div>
						</Panel>
					</div>
				</div>
				<Panel title="Features & traits">
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						{features.map((f: any, i: number) => (
							<div key={i} style={{ padding: 12, border: `1px solid ${T.bd}`, borderRadius: 10, background: T.surf }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}><span style={{ font: `600 13.5px ${T.sans}` }}>{f.name}</span><Badge status="neutral">{f.src} · L{f.lvl}</Badge></div>
								<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.sub }}>{f.note}</div>
							</div>
						))}
					</div>
				</Panel>
				<Panel title="Equipment">
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{equipment.map((e: any, i: number) => (
							<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
								<Icon name={e.equipped ? 'shield' : 'tag'} size={15} color={e.equipped ? T.acc : T.ter} />
								<span style={{ flex: 1, font: `12.5px ${T.sans}`, color: e.equipped ? T.ink : T.sub }}>{e.name}</span>
								{e.linked && <Badge status="info">linked</Badge>}
								{e.equipped && <Badge status="success" icon="check">equipped</Badge>}
								<span style={{ font: `11.5px ${T.mono}`, color: T.ter, width: 54, textAlign: 'right' }}>{e.qty}× · {e.wt}lb</span>
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
	dispatch,
}: {
	charId: string;
	resources: CharacterResources | null;
	actorId: string;
	dispatch: (command: any) => Promise<boolean>;
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
		return dispatch({ type: 'character.set-spell-slots', actorId, payload: { characterId: charId, level, max, expended: nextExpended } });
	};
	// Real class-resource toggle: set `expended` directly.
	const toggleResource = (res: CharacterResources['classResources'][string], idx: number) => {
		const cur = res.max - res.expended;
		const isFilled = idx < cur;
		const nextExpended = isFilled ? res.expended + 1 : Math.max(0, res.expended - 1);
		return dispatch({
			type: 'character.set-class-resource',
			actorId,
			payload: { characterId: charId, id: res.id, name: res.name, max: res.max, recharge: res.recharge, expended: nextExpended },
		});
	};
	const rest = (kind: 'short' | 'long') => dispatch({ type: 'character.rest', actorId, payload: { characterId: charId, rest: kind } });
	const dropConcentration = () =>
		dispatch({ type: 'character.update-combat-resource', actorId, payload: { characterId: charId, kind: 'concentration', effect: null } });

	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				{con && (
					<div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 12, background: T.accSub, border: `1px solid ${T.accBd}` }}>
						<Icon name="concentration" size="lg" color={T.acc} />
						<div style={{ flex: 1 }}><div style={{ font: `700 14px ${T.disp}` }}>Concentrating · {con.effect}</div><div style={{ font: `12px ${T.sans}`, color: T.sub }}>Maintained effect</div></div>
						<Button variant="ghost" size="sm" onClick={dropConcentration}>Drop</Button>
					</div>
				)}
				<Panel title="Spell slots">
					{slots.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No spell slots tracked for this character.</div>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
							{slots.map((s) => {
								const avail = availableSlots(s);
								return (
									<div key={s.level} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
										<span style={{ font: `600 12px ${T.sans}`, color: T.sub, width: 48 }}>Level {s.level}</span>
										<div style={{ display: 'flex', gap: 7, flex: 1 }}>
											{Array.from({ length: s.max }).map((_, i) => (
												<button key={i} type="button" onClick={() => toggleSlot(s.level, s.max, s.expended, i)} aria-label="Toggle slot" style={{ width: 22, height: 22, flex: '0 0 auto', cursor: 'pointer', border: 'none', background: 'transparent', padding: 0 }}>
													<span style={{ display: 'block', width: '100%', height: '100%', transform: 'rotate(45deg)', borderRadius: 3, background: i < avail ? T.acc : 'transparent', border: `1.5px solid ${i < avail ? T.acc : T.bdS}` }} />
												</button>
											))}
										</div>
										<span style={{ font: `12px ${T.mono}`, color: T.ter }}>{avail}/{s.max}</span>
									</div>
								);
							})}
						</div>
					)}
				</Panel>
				<Panel title="Class resources">
					{classResources.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No class resources tracked.</div>
					) : (
						classResources.map((res, i) => {
							const cur = res.max - res.expended;
							return (
								<div key={res.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
									<Icon name="sparkle" size={17} color={T.acc} />
									<div style={{ flex: 1 }}><div style={{ font: `600 12.5px ${T.sans}` }}>{res.name}</div><div style={{ font: `10.5px ${T.sans}`, color: T.ter }}>Recovers on {res.recharge} rest</div></div>
									<div style={{ display: 'flex', gap: 5 }}>
										{Array.from({ length: res.max }).map((_, j) => (
											<button key={j} type="button" aria-label="Toggle resource" onClick={() => toggleResource(res, j)} style={{ width: 13, height: 13, padding: 0, borderRadius: '50%', cursor: 'pointer', background: j < cur ? T.acc : 'transparent', border: `1.5px solid ${j < cur ? T.acc : T.bdS}` }} />
										))}
									</div>
									<span style={{ font: `12px ${T.mono}`, color: T.ter, width: 30, textAlign: 'right' }}>{cur}/{res.max}</span>
								</div>
							);
						})
					)}
				</Panel>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<Panel title="Death saves" action={<Badge status={death.stable ? 'success' : 'neutral'}>{death.stable ? 'Stable' : 'Conscious'}</Badge>}>
					<div style={{ display: 'flex', gap: 24 }}>
						{(['successes', 'failures'] as const).map((k) => (
							<div key={k}>
								<div style={{ ...eb, color: k === 'failures' ? T.err : T.ok, marginBottom: 6 }}>{k}</div>
								<div style={{ display: 'flex', gap: 7 }}>{Array.from({ length: 3 }).map((_, i) => (
									<span key={i} style={{ width: 18, height: 18, borderRadius: '50%', background: i < death[k] ? (k === 'failures' ? T.err : T.ok) : 'transparent', border: `1.5px solid ${k === 'failures' ? T.err : T.ok}` }} />
								))}</div>
							</div>
						))}
					</div>
				</Panel>
				<Panel title="Rest" action={<div style={{ display: 'flex', gap: 7 }}><Button variant="secondary" size="sm" icon="recent" onClick={() => rest('short')}>Short rest</Button><Button variant="primary" size="sm" icon="theme" onClick={() => rest('long')}>Long rest</Button></div>}>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>A short rest recovers short-rest resources; a long rest restores spell slots, long-rest resources, and clears conditions.</div>
				</Panel>
				<Panel title={`Prepared spells (${spells.filter((s) => s.prepared).length})`}>
					{spells.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No spells tracked for this character.</div>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
							{spells.map((s) => (
								<div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, border: `1px solid ${T.bd}`, background: T.surf }}>
									<span style={{ width: 24, height: 24, borderRadius: 6, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 12px ${T.mono}`, background: T.alt, color: T.acc }}>{s.level}</span>
									<div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ font: `600 12.5px ${T.sans}` }}>{s.name}</span>{s.prepared && <Badge status="accent" icon="check">prepared</Badge>}</div></div>
								</div>
							))}
						</div>
					)}
				</Panel>
			</div>
		</div>
	);
}

function PlayerParty({ party, selfId }: { party: PartyOverview; selfId: string }) {
	// Real party overview — members are the visible PCs only (DM-only NPCs never reach this list).
	const members = party.members.filter((m) => m.kind === 'pc');
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="The party" action={<Badge status="neutral">{members.length} members</Badge>}>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
					{members.map((p) => {
						const downed = p.hp === 0;
						const self = p.characterId === selfId;
						return (
							<div key={p.characterId} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 12, borderRadius: 11, border: `1px solid ${downed ? 'var(--color-status-error-border)' : self ? T.accBd : T.bd}`, background: downed ? 'var(--color-status-error-subtle)' : self ? T.accSub : T.surf }}>
								<Avatar name={p.name} size="sm" ring={downed ? 'danger' : self ? 'active' : 'none'} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ font: `600 13.5px ${T.sans}` }}>{p.name}</span>{self && <Badge status="accent">You</Badge>}<span style={{ font: `11px ${T.sans}`, color: T.ter }}>AC {p.ac}</span></div>
									<div style={{ marginTop: 5, maxWidth: 240 }}><HPBar current={p.hp} max={p.maxHp} size="sm" /></div>
									<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: 4 }}>{p.availableSpellSlots} slots · {p.availableClassResources} resources</div>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
									{p.conditions.length ? p.conditions.map((c) => { const k = condKey(c); return k ? <ConditionBadge key={c} condition={k} compact /> : <Chip key={c} tone="neutral">{c}</Chip>; }) : <span style={{ font: `11px ${T.sans}`, color: T.ter }}>—</span>}
								</div>
							</div>
						);
					})}
				</div>
			</Panel>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<Panel title="Marching order">
					{party.marchingOrder.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No marching order set.</div>
					) : (
						<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
							{party.marchingOrder.map((id, i) => {
								const m = party.members.find((x) => x.characterId === id);
								return <Chip key={id} tone="neutral">{i + 1}. {m?.name.split(' ')[0] ?? id}</Chip>;
							})}
						</div>
					)}
				</Panel>
				<Panel title="Shared stash">
					{party.inventory.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>The party stash is empty.</div>
					) : (
						party.inventory.map((s, i) => (
							<div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
								<Icon name="tag" size={14} color={T.ter} />
								<span style={{ flex: 1, font: `12.5px ${T.sans}` }}>{s.name}</span>
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>{s.detail}</span>
							</div>
						))
					)}
				</Panel>
			</div>
		</div>
	);
}

// no core command — the advancement lifecycle (character.open/set/commit-advancement) exists but the
// bespoke step checklist below has no reachable advancement draft in the demo vault, so the choices
// and Finish are an honest-local preview rather than a real staged commit.
function PlayerLevelUp() {
	const L = MOCK.levelUp;
	const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(L.steps.map((s: any) => [s.id, s.done])));
	const allDone = Object.values(done).every(Boolean);
	return (
		<div style={{ maxWidth: 680, margin: '0 auto' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderRadius: 14, background: `linear-gradient(135deg, ${T.accSub}, ${T.surf})`, border: `1px solid ${T.accBd}`, marginBottom: 18 }}>
				<span style={{ width: 50, height: 50, borderRadius: 12, background: T.acc, color: T.accFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: `700 20px ${T.mono}` }}>{L.to}</span>
				<div style={{ flex: 1 }}><div style={{ font: `700 18px ${T.disp}` }}>Level {L.from} → {L.to}</div><div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>{L.mode} advancement · {L.steps.filter((s: any) => done[s.id]).length}/{L.steps.length} choices made</div></div>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
				{L.steps.map((s: any, i: number) => (
					<div key={s.id} style={{ display: 'flex', gap: 13, padding: 14, borderRadius: 11, border: `1px solid ${done[s.id] ? T.bd : T.accBd}`, background: T.surf }}>
						<span style={{ width: 28, height: 28, borderRadius: '50%', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done[s.id] ? T.ok : T.alt, color: done[s.id] ? '#fff' : T.ter }}>{done[s.id] ? <Icon name="check" size={15} /> : <span style={{ font: `700 12px ${T.mono}` }}>{i + 1}</span>}</span>
						<div style={{ flex: 1 }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}><span style={{ font: `600 13.5px ${T.sans}` }}>{s.label}</span><Badge status="neutral">{s.kind}</Badge></div>
							<div style={{ font: `12.5px ${T.sans}`, color: T.acc }}>{s.choice}</div>
							<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, marginTop: 2 }}>{s.detail}</div>
						</div>
						{!done[s.id] && <Button variant="secondary" size="sm" onClick={() => setDone((d) => ({ ...d, [s.id]: true }))}>Choose</Button>}
					</div>
				))}
			</div>
			<div style={{ marginTop: 16, textAlign: 'center' }}>
				<Button variant="primary" size="md" icon="flag" disabled={!allDone}>{allDone ? `Finish — become level ${L.to}` : 'Make all choices to finish'}</Button>
			</div>
		</div>
	);
}

function PlayerJournal({
	charId,
	actorId,
	entries,
	canAuthor,
	dispatch,
}: {
	charId: string;
	actorId: string;
	entries: JournalEntryView[];
	canAuthor: boolean;
	dispatch: (command: any) => Promise<boolean>;
}) {
	const [title, setTitle] = useState('');
	const [body, setBody] = useState('');

	const add = async () => {
		if (!title.trim()) return;
		const ok = await dispatch({
			type: 'character.add-journal-entry',
			actorId,
			payload: { characterId: charId, kind: 'note', title: title.trim(), body: body.trim(), visibility: 'dm-only' },
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

	return (
		<div>
			<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--color-visibility-dm-subtle)', border: `1px solid var(--color-visibility-dm)`, marginBottom: 18 }}>
				<Icon name="hidden" size={16} color="var(--color-visibility-dm)" /><span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>Private journal — entries are owner-private until you explicitly share one with the table.</span>
			</div>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<Panel title={`Journal entries (${entries.length})`}>
						{entries.length === 0 ? (
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No entries yet.</div>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column' }}>
								{entries.map((im, i) => {
									const shared = im.visibility === 'player-visible';
									return (
										<div key={im.id} style={{ padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
											<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
												<span style={{ font: `600 13px ${T.sans}` }}>{im.title}</span><Badge status="neutral">{im.kind}</Badge>
												{canAuthor && (
													<button type="button" onClick={() => toggleShare(im)} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 16, cursor: 'pointer', font: `11px ${T.sans}`, border: `1px solid ${shared ? T.accBd : T.bd}`, background: shared ? T.accSub : T.surf, color: shared ? T.acc : T.ter }}>
														<Icon name={shared ? 'visibility-players' : 'hidden'} size={12} />{shared ? 'Shared' : 'Private'}
													</button>
												)}
											</div>
											{im.body && <div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>{im.body}</div>}
										</div>
									);
								})}
							</div>
						)}
						{canAuthor && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.bd}` }}>
								<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Entry title…" style={{ padding: '8px 11px', borderRadius: 8, border: `1px solid ${T.bd}`, background: T.alt, color: T.ink, font: `12.5px ${T.sans}`, outline: 'none' }} />
								<textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened…" rows={2} style={{ padding: '8px 11px', borderRadius: 8, border: `1px solid ${T.bd}`, background: T.alt, color: T.ink, font: `12.5px ${T.sans}`, outline: 'none', resize: 'vertical' }} />
								<div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button variant="secondary" size="sm" icon="add" onClick={add}>Add entry</Button></div>
							</div>
						)}
					</Panel>
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					{/* no core field — personal quests & session highlights have no Core home (honest-local). */}
					<Panel title="Personal quests">
						{MOCK.journal.quests.map((q: any, i: number) => (
							<div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
								<Icon name={q.status === 'completed' ? 'check' : 'flag'} size={15} color={q.status === 'completed' ? T.ok : T.acc} />
								<div style={{ flex: 1 }}>
									<div style={{ font: `12.5px ${T.sans}`, color: q.status === 'completed' ? T.ter : T.ink, textDecoration: q.status === 'completed' ? 'line-through' : 'none' }}>{q.goal}</div>
									{q.note && <div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 2 }}>{q.note}</div>}
								</div>
							</div>
						))}
					</Panel>
					<Panel title="Session highlights">
						{MOCK.journal.highlights.map((h: any, i: number) => (
							<div key={i} style={{ padding: '9px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}><Badge status="accent">{h.kind}</Badge><span style={{ marginLeft: 'auto', font: `10.5px ${T.mono}`, color: T.ter }}>{h.when}</span></div>
								<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.sub, fontStyle: h.kind === 'Memorable quote' ? 'italic' : 'normal' }}>{h.text}</div>
							</div>
						))}
					</Panel>
				</div>
			</div>
		</div>
	);
}
