import { useEffect, useMemo, useRef, useState } from 'react';
import {
	validateDraftStep,
	DRAFT_BACKGROUND_OPTIONS,
	DRAFT_CLASS_OPTIONS,
	type CommandResult,
} from '@dndtools/core';
import {
	AbilityScore,
	Avatar,
	Badge,
	Button,
	Icon,
	IconButton,
	Input,
	Select,
	Textarea,
	Toaster,
	VisibilityChip,
} from '../ds';
import { Seg, T, eb, mono } from './screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { pickTextFile } from '../platform/filePick';
import { parseCharacterImport, type ImportPlan } from './charImport/ddbJson';

/**
 * CharBuilder — the full-screen guided character-creation overlay, ported from the online
 * prototype's `views/character-builder.jsx` (entry choice → 6-step wizard: identity / class &
 * level / ability scores / kit / bio / review, with StepRail + selectable Tiles + numeric
 * Steppers and standard-array / point-buy / manual score methods). Mounted from the Characters
 * screen; no route of its own.
 *
 * Where the prototype dispatched a mock `char/create`, this port drives the REAL core:
 *   - kind PC → the guided draft flow exactly as `runtime/demo-seed.ts` seeds PCs:
 *     `character.create-draft` (DM, assigns a player owner) → 3× `character.update-draft-step`
 *     (identity / abilities / class, dispatched AS the owning player — owner-only in core) →
 *     `character.finalize-draft` (owner) → `character.set-combat` (DM: HP/AC) →
 *     `permission.grant-capability-set` (DM grants the owner set — finalize doesn't, PERM-004) →
 *     sheet extras (race / alignment / speed / level / bio / portrait tone) via validated
 *     `character.edit-field` `data.*` writes.
 *   - kind NPC / Monster / Sidekick → one `character.quick-create` (its `kind` enum excludes
 *     `pc` — CHAR-001), carrying ability scores, attacks, combat block, and free-form data;
 *     DM notes land in `data.dmNotes` marked `dmOnlyFields` so they never reach players.
 *
 * Honest deviations from the design source (each forced by the core model, labeled in-UI):
 *   - PC classes/backgrounds are limited to the core guided flow's options (CHAR-002
 *     `DRAFT_CLASS_OPTIONS` / `DRAFT_BACKGROUND_OPTIONS`) — anything else is rejected at finalize.
 *   - PC ability scores must satisfy the core's 27-point-buy rule (each 8–15); the wizard surfaces
 *     the core's own `validateDraftStep` issues instead of letting finalize reject.
 *   - A PC needs a player OWNER (create-draft rejects otherwise) — an "Owned by" select is added.
 *   - PC visibility is forced `shared`-with-owner by finalize; the visibility tiles are replaced
 *     with a note (the DM widens sharing post-create from the sheet via `character.set-sharing`).
 *     DM-only notes still have no post-create marking command for a PC — noted, not faked.
 *   - PC custom attacks ride the draft's optional `kit` step: `character.finalize-draft` carries
 *     the saved kit attacks (and AC/HP) onto the finalized character.
 *
 * "Import character file (JSON)" is REAL: the pure mapper (`./charImport/ddbJson`) accepts a
 * D&D Beyond character export or the simple native JSON shape and produces a PLAN of core
 * dispatches (`character.quick-create` → `set-proficiencies` → `set-spell` ×N → `update-attacks`).
 * FAIL-CLOSED: the plan's mapped/unmapped field report is shown as an import PREVIEW and nothing
 * is created until the user confirms — unrecognized fields are listed, never silently dropped.
 */

// ── Builder rules kit — inlined from the design prototype's `campaign-extras.js` (DNDX.builder).
// Static 5e reference data (not campaign mock): races, classes, backgrounds, score methods, and the
// point-buy cost table (which matches the core's CHAR-002 POINT_BUY_COST exactly).
interface BuilderRace { id: string; name: string; sub: string; traits: string }
interface BuilderClass { id: string; name: string; hd: string; primary: string; saves: string; sub: string }
interface BuilderBackground { id: string; name: string; skills: string }
type ScoreMethod = 'standard' | 'pointbuy' | 'manual';
interface BuilderMethod { id: ScoreMethod; label: string; note: string }
type AbilityKey = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

const BUILDER: {
	races: BuilderRace[];
	classes: BuilderClass[];
	backgrounds: BuilderBackground[];
	abilityKeys: AbilityKey[];
	methods: BuilderMethod[];
	standardArray: number[];
	pointCost: Record<number, number>;
} = {
	races: [
		{ id: 'human', name: 'Human', sub: '+1 to all abilities', traits: 'Versatile, extra skill & feat (variant).' },
		{ id: 'dwarf', name: 'Dwarf', sub: '+2 CON', traits: 'Darkvision, poison resilience, stonecunning.' },
		{ id: 'elf', name: 'Elf', sub: '+2 DEX', traits: 'Darkvision, fey ancestry, trance.' },
		{ id: 'half-elf', name: 'Half-elf', sub: '+2 CHA, +1 ×2', traits: 'Darkvision, fey ancestry, two skills.' },
		{ id: 'halfling', name: 'Halfling', sub: '+2 DEX', traits: 'Lucky, brave, nimble.' },
		{ id: 'tiefling', name: 'Tiefling', sub: '+2 CHA, +1 INT', traits: 'Darkvision, hellish resistance, infernal legacy.' },
		{ id: 'dragonborn', name: 'Dragonborn', sub: '+2 STR, +1 CHA', traits: 'Breath weapon, damage resistance.' },
		{ id: 'gnome', name: 'Gnome', sub: '+2 INT', traits: 'Darkvision, gnome cunning.' },
	],
	classes: [
		{ id: 'fighter', name: 'Fighter', hd: 'd10', primary: 'STR or DEX', saves: 'STR, CON', sub: 'Battle Master, Champion, Eldritch Knight' },
		{ id: 'cleric', name: 'Cleric', hd: 'd8', primary: 'WIS', saves: 'WIS, CHA', sub: 'Life, Light, War, Tempest' },
		{ id: 'rogue', name: 'Rogue', hd: 'd8', primary: 'DEX', saves: 'DEX, INT', sub: 'Thief, Assassin, Arcane Trickster' },
		{ id: 'wizard', name: 'Wizard', hd: 'd6', primary: 'INT', saves: 'INT, WIS', sub: 'Evocation, Abjuration, Divination' },
		{ id: 'ranger', name: 'Ranger', hd: 'd10', primary: 'DEX & WIS', saves: 'STR, DEX', sub: 'Hunter, Beast Master' },
		{ id: 'barbarian', name: 'Barbarian', hd: 'd12', primary: 'STR', saves: 'STR, CON', sub: 'Berserker, Totem Warrior' },
		{ id: 'bard', name: 'Bard', hd: 'd8', primary: 'CHA', saves: 'DEX, CHA', sub: 'Lore, Valor' },
		{ id: 'paladin', name: 'Paladin', hd: 'd10', primary: 'STR & CHA', saves: 'WIS, CHA', sub: 'Devotion, Vengeance' },
		{ id: 'druid', name: 'Druid', hd: 'd8', primary: 'WIS', saves: 'INT, WIS', sub: 'Land, Moon' },
		{ id: 'warlock', name: 'Warlock', hd: 'd8', primary: 'CHA', saves: 'WIS, CHA', sub: 'Fiend, Archfey, Great Old One' },
		{ id: 'sorcerer', name: 'Sorcerer', hd: 'd6', primary: 'CHA', saves: 'CON, CHA', sub: 'Draconic, Wild Magic' },
		{ id: 'monk', name: 'Monk', hd: 'd8', primary: 'DEX & WIS', saves: 'STR, DEX', sub: 'Open Hand, Shadow' },
	],
	backgrounds: [
		{ id: 'acolyte', name: 'Acolyte', skills: 'Insight, Religion' },
		{ id: 'soldier', name: 'Soldier', skills: 'Athletics, Intimidation' },
		{ id: 'criminal', name: 'Criminal', skills: 'Deception, Stealth' },
		{ id: 'sage', name: 'Sage', skills: 'Arcana, History' },
		{ id: 'folk-hero', name: 'Folk Hero', skills: 'Animal Handling, Survival' },
		{ id: 'charlatan', name: 'Charlatan', skills: 'Deception, Sleight of Hand' },
		{ id: 'noble', name: 'Noble', skills: 'History, Persuasion' },
		{ id: 'sailor', name: 'Sailor', skills: 'Athletics, Perception' },
	],
	abilityKeys: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'],
	methods: [
		{ id: 'standard', label: 'Standard array', note: '15 · 14 · 13 · 12 · 10 · 8 — assign each once.' },
		{ id: 'pointbuy', label: 'Point buy', note: '27 points; scores 8–15 before racial bonuses.' },
		{ id: 'manual', label: 'Manual', note: 'Type any scores — for rolled stats or imports.' },
	],
	standardArray: [15, 14, 13, 12, 10, 8],
	// 5e point-buy cost: score → points (matches the core's CHAR-002 table).
	pointCost: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 },
};

type CharKind = 'pc' | 'npc' | 'monster' | 'sidekick';
const KINDS: { id: CharKind; label: string; icon: string }[] = [
	{ id: 'pc', label: 'PC', icon: 'characters-person' },
	{ id: 'npc', label: 'NPC', icon: 'group' },
	{ id: 'monster', label: 'Monster', icon: 'sword' },
	{ id: 'sidekick', label: 'Sidekick', icon: 'heart' },
];
const KIND_LABEL: Record<CharKind, string> = { pc: 'PC', npc: 'NPC', monster: 'Monster', sidekick: 'Sidekick' };
const KIND_TONE: Record<CharKind, string> = { pc: 'success', npc: 'info', monster: 'error', sidekick: 'warning' };
const ALIGNMENTS = [
	'Lawful good', 'Neutral good', 'Chaotic good', 'Lawful neutral', 'Neutral', 'Chaotic neutral',
	'Lawful evil', 'Neutral evil', 'Chaotic evil', 'Unaligned',
];

// The class/background ids the core guided PC flow accepts (CHAR-002); everything else is rejected
// at finalize, so the PC path only offers these.
const CORE_PC_CLASSES = new Set(DRAFT_CLASS_OPTIONS.map((o) => o.value));
const CORE_PC_BACKGROUNDS = new Set(DRAFT_BACKGROUND_OPTIONS.map((o) => o.value));

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const modOf = (n: number) => {
	const m = Math.floor((Number(n) - 10) / 2);
	return (m >= 0 ? '+' : '') + m;
};

interface AttackRow { name: string; kind: string; hit: string; dmg: string; type: string }

const STEPS = [
	{ id: 'identity', title: 'Identity', icon: 'characters-person' },
	{ id: 'class', title: 'Class & level', icon: 'shield' },
	{ id: 'stats', title: 'Ability scores', icon: 'dice' },
	{ id: 'kit', title: 'Attacks & kit', icon: 'sword' },
	{ id: 'bio', title: 'Bio & notes', icon: 'note-edit' },
	{ id: 'review', title: 'Review', icon: 'check' },
] as const;

/** Pull a string field off the first emitted event of a given kind (mirrors demo-seed). */
function eventField(result: CommandResult, kind: string, field: string): string | null {
	if (result.status !== 'accepted') return null;
	for (const event of result.events) {
		if ((event as { kind?: string }).kind === kind) {
			const value = (event as Record<string, unknown>)[field];
			if (typeof value === 'string') return value;
		}
	}
	return null;
}

/* shared step-rail (mirrors onboarding) */
function StepRail({ steps, i }: { steps: readonly { id: string; title: string; icon: string }[]; i: number }) {
	return (
		<div style={{ width: 240, flex: '0 0 240px', background: `linear-gradient(180deg, ${T.accSub}, ${T.surf})`, borderRight: `1px solid ${T.bd}`, padding: '24px 20px', display: 'flex', flexDirection: 'column' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 24 }}>
				<span style={{ width: 30, height: 30, borderRadius: 7, background: T.acc, color: T.accFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="new-character" size="sm" /></span>
				<div style={{ font: `700 14px ${T.disp}`, letterSpacing: '.01em' }}>New character</div>
			</div>
			<ol style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, listStyle: 'none', margin: 0, padding: 0 }}>
				{steps.map((s, j) => {
					const done = j < i, on = j === i;
					return (
						<li key={s.id} aria-current={on ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 9, background: on ? T.raised : 'transparent', border: `1px solid ${on ? T.accBd : 'transparent'}` }}>
							<span style={{ width: 26, height: 26, borderRadius: '50%', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done ? T.ok : (on ? T.acc : T.alt), color: done || on ? T.accFg : T.ter }}>
								{done ? <Icon name="check" size={13} /> : <Icon name={s.icon} size={14} />}
							</span>
							<span style={{ font: `${on ? 600 : 500} 13px ${T.sans}`, color: on ? T.ink : T.sub }}>{s.title}</span>
						</li>
					);
				})}
			</ol>
			<div style={{ display: 'flex', alignItems: 'center', gap: 7, font: `11.5px ${T.sans}`, color: T.ter }}>
				<Icon name="dm-only" size={13} /> Saved to your local vault
			</div>
		</div>
	);
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
	return (
		<div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
			<span style={eb}>{children}</span>
			{hint && <span style={{ font: `11px ${T.sans}`, color: T.ter }}>{hint}</span>}
		</div>
	);
}

/* a selectable tile used for kind / race / class / background / visibility */
function Tile({ on, onClick, title, sub, icon, badge, compact }: {
	on: boolean;
	onClick: () => void;
	title: React.ReactNode;
	sub?: React.ReactNode;
	icon?: string;
	badge?: React.ReactNode;
	compact?: boolean;
}) {
	return (
		<button type="button" onClick={onClick} aria-pressed={on}
			style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, padding: compact ? '10px 12px' : '13px 14px', borderRadius: 11, cursor: 'pointer',
				border: `1px solid ${on ? T.accBd : T.bd}`, background: on ? T.accSub : T.surf, boxShadow: on ? T.smd : 'none',
				transition: 'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)' }}>
			{icon && <span style={{ width: 34, height: 34, borderRadius: 9, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? T.acc : T.alt, color: on ? T.accFg : T.acc }}><Icon name={icon} size="sm" /></span>}
			<span style={{ flex: 1, minWidth: 0 }}>
				<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ font: `600 13.5px ${T.sans}`, color: on ? T.acc : T.ink }}>{title}</span>{badge}</span>
				{sub && <span style={{ display: 'block', font: `11.5px/1.4 ${T.sans}`, color: T.sub, marginTop: 1 }}>{sub}</span>}
			</span>
			{on && <Icon name="check" size={16} color={T.acc} />}
		</button>
	);
}

/** A muted dashed note for a step section the core model can't back (honest, never a silent no-op). */
function HonestNote({ children }: { children: React.ReactNode }) {
	return (
		<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, padding: '10px 12px', borderRadius: 10, border: `1.5px dashed ${T.bdS}` }}>
			{children}
		</div>
	);
}

function PathCard({ icon, title, desc, cta, onClick, primary, badge }: {
	icon: string; title: string; desc: string; cta: string; onClick: () => void; primary?: boolean; badge?: React.ReactNode;
}) {
	const [h, setH] = useState(false);
	return (
		<button type="button" onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
			style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14, padding: 24, borderRadius: 16, cursor: 'pointer',
				border: `1px solid ${primary || h ? T.accBd : T.bd}`, background: primary ? `linear-gradient(160deg, ${T.accSub}, ${T.surf})` : (h ? T.alt : T.surf), boxShadow: primary ? T.smd : 'none' }}>
			<span style={{ width: 48, height: 48, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: primary ? T.acc : T.accSub, color: primary ? T.accFg : T.acc }}><Icon name={icon} size="lg" /></span>
			<div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<span style={{ font: `700 18px ${T.disp}` }}>{title}</span>
					{badge}
				</div>
				<p style={{ margin: '6px 0 0', font: `13px/1.6 ${T.sans}`, color: T.sub }}>{desc}</p>
			</div>
			<span style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, font: `600 13px ${T.sans}`, color: T.acc }}>{cta}<Icon name="chevron-right" size={15} /></span>
		</button>
	);
}

/** The numeric +/- stepper from the design source (local to the builder, not the DS progress Stepper). */
function NumStepper({ value, onChange, min = 0, max = 99, step = 1, mono: isMono, label }: {
	value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; mono?: boolean; label?: string;
}) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 4px 14px', borderRadius: 9, border: `1px solid ${T.bd}`, background: T.surf, width: 'fit-content' }}>
			<span style={{ font: `700 17px ${isMono ? T.mono : T.sans}`, color: T.ink, minWidth: 36, textAlign: 'center' }}>{value}</span>
			<IconButton icon="Minus" label={`Decrease ${label ?? 'value'}`} variant="outline" size="sm" onClick={() => onChange(clamp(value - step, min, max))} />
			<IconButton icon="add" label={`Increase ${label ?? 'value'}`} variant="outline" size="sm" onClick={() => onChange(clamp(value + step, min, max))} />
		</div>
	);
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The fixed full-screen scrim + panel, with the Dialog a11y contract (Escape, focus trap, restore). */
function Overlay({ children, onClose, wide, label }: { children: React.ReactNode; onClose: () => void; wide?: boolean; label: string }) {
	const panelRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef(onClose);
	closeRef.current = onClose;

	useEffect(() => {
		const previous = document.activeElement as HTMLElement | null;
		const panel = panelRef.current;
		const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
		(first ?? panel)?.focus();
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
			if (e.key !== 'Tab') return;
			const p = panelRef.current;
			if (!p) return;
			const nodes = Array.from(p.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
			if (nodes.length === 0) { e.preventDefault(); p.focus(); return; }
			const firstNode = nodes[0];
			const lastNode = nodes[nodes.length - 1];
			if (e.shiftKey && document.activeElement === firstNode) { e.preventDefault(); lastNode.focus(); }
			else if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); firstNode.focus(); }
		};
		document.addEventListener('keydown', onKey, true);
		return () => {
			document.removeEventListener('keydown', onKey, true);
			document.body.style.overflow = prevOverflow;
			previous?.focus?.();
		};
	}, []);

	return (
		<div onMouseDown={() => closeRef.current()} style={{ position: 'fixed', inset: 0, zIndex: 420, background: 'var(--color-backdrop)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-label={label}
				tabIndex={-1}
				onMouseDown={(e) => e.stopPropagation()}
				style={{ width: wide ? 1000 : 760, maxWidth: '96vw', height: 620, maxHeight: '92vh', display: 'flex', background: T.raised, border: `1px solid ${T.bdS}`, borderRadius: 18, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}
			>
				{children}
			</div>
		</div>
	);
}

export function CharBuilder({
	onClose,
	onCreated,
	initialKind,
}: {
	onClose: () => void;
	onCreated: (id: string) => void;
	/** Pre-select the character kind — lets "New NPC"-style launchers land on the right wizard. */
	initialKind?: string;
}) {
	const runtime = useRuntime();
	const dmActorId = runtime.defaultActorId;
	const players = runtime.actors.filter((a) => a.role === 'player');

	const [phase, setPhase] = useState<'choose' | 'scratch' | 'import'>('choose');
	const [i, setI] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	// Import-from-file state: the parsed plan (with its mapped/unmapped field report) or the
	// parse failure, both rendered in the 'import' preview phase before anything is created.
	const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
	const [importError, setImportError] = useState<string | null>(null);

	// form state (design source shape)
	const isKind = (k: string | undefined): k is CharKind => k === 'pc' || k === 'npc' || k === 'monster' || k === 'sidekick';
	const [kind, setKind] = useState<CharKind>(isKind(initialKind) ? initialKind : 'pc');
	const [name, setName] = useState('');
	const [race, setRace] = useState('human');
	const [align, setAlign] = useState('Neutral good');
	const [grad, setGrad] = useState(135);
	const [owner, setOwner] = useState(players[0]?.id ?? '');
	const [cls, setCls] = useState('fighter');
	const [subclass, setSubclass] = useState('');
	const [level, setLevel] = useState(1);
	const [background, setBackground] = useState('soldier');
	const [method, setMethod] = useState<ScoreMethod>('standard');
	const [scores, setScores] = useState<Record<AbilityKey, number>>({ STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 });
	const [assign, setAssign] = useState<Record<AbilityKey, string>>({ STR: '', DEX: '', CON: '', INT: '', WIS: '', CHA: '' });
	const [ac, setAc] = useState(13);
	const [hp, setHp] = useState(10);
	const [speed, setSpeed] = useState(30);
	const [attacks, setAttacks] = useState<AttackRow[]>([{ name: 'Longsword', kind: 'Melee', hit: '+4', dmg: '1d8+2', type: 'slashing' }]);
	const [bio, setBio] = useState('');
	const [dmNotes, setDmNotes] = useState('');
	const [vis, setVis] = useState<'players' | 'dm-only'>('players');

	const isPc = kind === 'pc';
	// PC drafts finalize against the core's CHAR-002 options only — narrow the tables for PCs.
	const clsChoices = isPc ? BUILDER.classes.filter((c) => CORE_PC_CLASSES.has(c.id)) : BUILDER.classes;
	const bgChoices = isPc ? BUILDER.backgrounds.filter((b) => CORE_PC_BACKGROUNDS.has(b.id)) : BUILDER.backgrounds;
	// Effective picks: a selection made under another kind may be illegal for a PC — fall back legal.
	const clsId = clsChoices.some((c) => c.id === cls) ? cls : clsChoices[0].id;
	const bgId = bgChoices.some((b) => b.id === background) ? background : bgChoices[0].id;
	const raceObj = BUILDER.races.find((r) => r.id === race) ?? BUILDER.races[0];
	const clsObj = BUILDER.classes.find((c) => c.id === clsId) ?? BUILDER.classes[0];
	const bgObj = BUILDER.backgrounds.find((b) => b.id === bgId) ?? BUILDER.backgrounds[0];

	// standard-array assignment bookkeeping
	const usedArrayVals = Object.values(assign).filter((v) => v !== '');
	const remainingArray = (forKey: AbilityKey) =>
		BUILDER.standardArray.filter((v) => !usedArrayVals.includes(String(v)) || String(v) === assign[forKey]);
	// point-buy bookkeeping
	const pointsSpent = BUILDER.abilityKeys.reduce((s, k) => s + (BUILDER.pointCost[scores[k]] ?? 0), 0);
	const pointsLeft = 27 - pointsSpent;
	// effective scores (what the review/derived/dispatch uses)
	const effScores: Record<AbilityKey, number> =
		method === 'standard'
			? (Object.fromEntries(BUILDER.abilityKeys.map((k) => [k, Number(assign[k] || 10)])) as Record<AbilityKey, number>)
			: scores;
	const coreAbilities = {
		str: effScores.STR, dex: effScores.DEX, con: effScores.CON,
		int: effScores.INT, wis: effScores.WIS, cha: effScores.CHA,
	};
	// The CORE's own abilities-step rule (27-point buy, each 8–15) gates the PC path — surface its
	// issues here instead of letting `finalize-draft` reject at the end.
	const abilityValidation = isPc ? validateDraftStep('abilities', coreAbilities) : null;

	const next = () => setI((x) => Math.min(STEPS.length - 1, x + 1));
	const back = () => { if (i === 0) setPhase('choose'); else setI((x) => x - 1); };

	// Manual bounds tighten to the core's legal PC range so a PC's rolled scores can finalize.
	const scoreMin = method === 'pointbuy' || isPc ? 8 : 1;
	const scoreMax = method === 'pointbuy' || isPc ? 15 : 30;
	const setScore = (k: AbilityKey, v: number) => setScores((s) => ({ ...s, [k]: clamp(v, scoreMin, scoreMax) }));
	const raiseBlocked = (k: AbilityKey) => {
		if (method !== 'pointbuy') return false;
		const nextCost = BUILDER.pointCost[scores[k] + 1];
		return nextCost === undefined || nextCost - (BUILDER.pointCost[scores[k]] ?? 0) > pointsLeft;
	};

	const identityOk = name.trim().length > 0 && (!isPc || !!owner);
	const subLine = useMemo(() => {
		if (kind === 'pc' || kind === 'sidekick') return `${raceObj.name} · ${clsObj.name} ${level}${subclass ? ` (${subclass})` : ''}`;
		return `${clsObj.name}-kin · ${KIND_LABEL[kind]}${subclass ? ` (${subclass})` : ''}`;
	}, [kind, raceObj, clsObj, level, subclass]);

	// ── The real create paths ─────────────────────────────────────────────────────────────────────

	/** Build the durable attack entries ({name, detail}) from the editor rows. */
	function attackEntries(): { name: string; detail: string }[] {
		return attacks
			.filter((a) => a.name.trim())
			.map((a) => ({
				name: a.name.trim(),
				detail: [
					a.kind.trim(),
					a.hit.trim() ? `${a.hit.trim()} to hit` : '',
					[a.dmg.trim(), a.type.trim()].filter(Boolean).join(' '),
				].filter(Boolean).join(' · '),
			}));
	}

	/** PC: the guided draft flow exactly as demo-seed §0★ — DM creates the draft for a player owner,
	 *  the OWNER fills identity/abilities/class (+ the optional `kit` step: AC/HP + custom attacks,
	 *  which `character.finalize-draft` carries onto the character) and finalizes, then the DM
	 *  applies extras. */
	async function createPc(): Promise<string | null> {
		const created = await runtime.dispatch({
			type: 'character.create-draft',
			actorId: dmActorId,
			payload: { ownerActorId: owner, name: name.trim() },
		});
		if (created.status === 'rejected') { setError(created.rejection.message); return null; }
		const draftId = eventField(created, 'character.draft-created', 'draftId');
		if (!draftId) { setError('The core did not return a draft id.'); return null; }

		const steps: [string, Record<string, unknown>][] = [
			['identity', { name: name.trim(), background: bgId }],
			['abilities', { ...coreAbilities }],
			['class', { class: clsId }],
			// The OPTIONAL kit step: finalize-draft reads it tolerantly and carries AC / HP / the
			// draft's CUSTOM ATTACKS onto the finalized character (it doesn't gate completeness).
			['kit', { attacks: attackEntries(), hp, maxHp: hp, ac }],
		];
		for (const [stepId, values] of steps) {
			const r = await runtime.dispatch({
				type: 'character.update-draft-step',
				actorId: owner,
				payload: { draftId, stepId, values },
			});
			if (r.status === 'rejected') { setError(r.rejection.message); return null; }
		}
		const finalized = await runtime.dispatch({
			type: 'character.finalize-draft',
			actorId: owner,
			payload: { draftId },
		});
		if (finalized.status === 'rejected') { setError(finalized.rejection.message); return null; }
		const characterId = eventField(finalized, 'character.created', 'characterId');
		if (!characterId) { setError('The core did not return the new character id.'); return null; }

		// finalize-draft consumed the kit step above (AC / HP / attacks land on the character).

		// finalize-draft does NOT auto-grant the `owner` capability set (PERM-004 grants are explicit) —
		// without this the owning player can't level up or journal on their own PC (demo-seed §0★).
		const grant = await runtime.dispatch({
			type: 'permission.grant-capability-set',
			actorId: dmActorId,
			payload: { entityType: 'character', entityId: characterId, playerActorId: owner, capabilitySet: 'owner', expiresAt: null },
		});
		if (grant.status === 'rejected') Toaster.warning(`Owner grant was not applied: ${grant.rejection.message}`);

		// Sheet extras through the validated field-edit surface (`data.*` holds strings; the DM may
		// edit any field). `data.level` is the same field the CHAR-009 advancement flow maintains.
		const extras: [string, string][] = [
			['data.race', raceObj.name],
			['data.alignment', align],
			['data.speed', String(speed)],
			['data.grad', String(grad)],
		];
		if (level > 1) extras.push(['data.level', String(level)]);
		if (subclass) extras.push(['data.subclass', subclass]);
		if (bio.trim()) extras.push(['data.bio', bio.trim()]);
		for (const [path, value] of extras) {
			const r = await runtime.dispatch({
				type: 'character.edit-field',
				actorId: dmActorId,
				payload: { characterId, path, value },
			});
			if (r.status === 'rejected') Toaster.warning(`${path} was not saved: ${r.rejection.message}`);
		}
		return characterId;
	}

	/** NPC / Monster / Sidekick: one durable `character.quick-create` (CHAR-001). */
	async function createOther(): Promise<string | null> {
		const attackRows = attackEntries();
		const data: Record<string, unknown> = {
			class: clsObj.name,
			background: bgObj.name,
			race: raceObj.name,
			alignment: align,
			level: String(level),
			speed: String(speed),
			grad: String(grad),
		};
		if (subclass) data.subclass = subclass;
		if (bio.trim()) data.bio = bio.trim();
		const dmOnlyFields: string[] = [];
		if (dmNotes.trim()) { data.dmNotes = dmNotes.trim(); dmOnlyFields.push('data.dmNotes'); }

		const result = await runtime.dispatch({
			type: 'character.quick-create',
			actorId: dmActorId,
			payload: {
				kind,
				name: name.trim(),
				visibility: vis === 'players' ? 'player-visible' : 'dm-only',
				abilityScores: { ...coreAbilities },
				attacks: attackRows,
				combat: { hp, maxHp: hp, ac },
				data,
				dmOnlyFields,
			},
		});
		if (result.status === 'rejected') { setError(result.rejection.message); return null; }
		return eventField(result, 'character.created', 'characterId');
	}

	async function create() {
		setError(null);
		setSubmitting(true);
		const id = isPc ? await createPc() : await createOther();
		setSubmitting(false);
		if (!id) return;
		Toaster.success(`${name.trim() || 'Character'} added to the roster`);
		onCreated(id);
	}

	// ── Import from a character file (JSON) ───────────────────────────────────────────────────────

	/** Pick a file, run the PURE mapper, and land on the preview phase (nothing is created yet). */
	async function startImport() {
		const picked = await pickTextFile('.json,application/json');
		if (!picked) return; // cancelled
		const result = parseCharacterImport(picked.text);
		if (result.ok) {
			setImportPlan(result.plan);
			setImportError(null);
		} else {
			setImportPlan(null);
			setImportError(`${picked.name}: ${result.error}`);
		}
		setError(null);
		setPhase('import');
	}

	/** Execute the reviewed plan: quick-create → set-proficiencies → set-spell ×N → update-attacks. */
	async function runImport() {
		if (!importPlan) return;
		setError(null);
		setSubmitting(true);
		try {
			const created = await runtime.dispatch({
				type: 'character.quick-create',
				actorId: dmActorId,
				payload: importPlan.quickCreate,
			});
			if (created.status === 'rejected') { setError(created.rejection.message); return; }
			const characterId = eventField(created, 'character.created', 'characterId');
			if (!characterId) { setError('The core did not return the new character id.'); return; }

			if (importPlan.proficiencies) {
				const r = await runtime.dispatch({
					type: 'character.set-proficiencies',
					actorId: dmActorId,
					payload: { characterId, ...importPlan.proficiencies },
				});
				if (r.status === 'rejected') Toaster.warning(`Proficiencies were not applied: ${r.rejection.message}`);
			}
			let spellFailures = 0;
			for (const spell of importPlan.spells) {
				const r = await runtime.dispatch({
					type: 'character.set-spell',
					actorId: dmActorId,
					payload: { characterId, id: runtime.newId(), ...spell },
				});
				if (r.status === 'rejected') spellFailures += 1;
			}
			if (spellFailures > 0) Toaster.warning(`${spellFailures} spell${spellFailures === 1 ? '' : 's'} could not be applied.`);
			if (importPlan.attacks.length > 0) {
				const r = await runtime.dispatch({
					type: 'character.update-attacks',
					actorId: dmActorId,
					payload: { characterId, attacks: importPlan.attacks },
				});
				if (r.status === 'rejected') Toaster.warning(`Attacks were not applied: ${r.rejection.message}`);
			}
			Toaster.success(`${importPlan.name} imported to the roster (DM-only)`);
			onCreated(characterId);
		} finally {
			setSubmitting(false);
		}
	}

	/* ---- entry choice ---- */
	if (phase === 'choose') {
		return (
			<Overlay onClose={onClose} label="Add a character">
				<div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 0' }}>
						<div>
							<h2 style={{ margin: 0, font: `700 24px ${T.disp}` }}>Add a character</h2>
							<p style={{ margin: '4px 0 0', font: `13px ${T.sans}`, color: T.ter }}>Build one from scratch with the guided 5e wizard.</p>
						</div>
						<IconButton icon="close" label="Close" variant="ghost" onClick={onClose} />
					</div>
					<div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, padding: '24px 28px 28px', alignItems: 'stretch' }}>
						<PathCard
							icon="new-character"
							title="Build from scratch"
							desc="A guided 5e wizard — identity, class, ability scores, kit, and notes. Standard array, point buy, or your own rolls."
							cta="Start building"
							onClick={() => { setPhase('scratch'); setI(0); }}
							primary
						/>
						<PathCard
							icon="import"
							title="Import character file (JSON)"
							desc="A D&D Beyond character export or a dndtools character JSON. You review exactly what maps — and what doesn't — before anything is created."
							cta="Choose a file"
							onClick={() => void startImport()}
						/>
					</div>
				</div>
			</Overlay>
		);
	}

	/* ---- import preview: the mapper's field report, shown BEFORE anything is created ---- */
	if (phase === 'import') {
		return (
			<Overlay onClose={onClose} label="Import character file">
				<div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 0' }}>
						<div>
							<h2 style={{ margin: 0, font: `700 24px ${T.disp}` }}>Import character file</h2>
							<p style={{ margin: '4px 0 0', font: `13px ${T.sans}`, color: T.ter }}>
								{importPlan ? 'Review what will be imported. Nothing is created until you confirm.' : 'The file could not be read.'}
							</p>
						</div>
						<IconButton icon="close" label="Close" variant="ghost" onClick={onClose} />
					</div>
					<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 28px' }}>
						{importError && (
							<div role="alert" style={{ font: `13px/1.6 ${T.sans}`, color: T.err, padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.err}` }}>
								{importError}
							</div>
						)}
						{importPlan && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
									<Avatar name={importPlan.name} size="lg" ring="turn" />
									<div style={{ minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
											<span style={{ font: `700 19px ${T.disp}` }}>{importPlan.name}</span>
											<Badge status={KIND_TONE[importPlan.quickCreate.kind]}>{KIND_LABEL[importPlan.quickCreate.kind]}</Badge>
											<VisibilityChip level={importPlan.quickCreate.visibility === 'dm-only' ? 'dm-only' : 'players'} compact />
											<Badge status="neutral">{importPlan.source === 'dndbeyond' ? 'D&D Beyond export' : 'dndtools JSON'}</Badge>
										</div>
										<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 3 }}>
											{[
												`${Object.keys(importPlan.quickCreate.abilityScores).length} ability scores`,
												importPlan.proficiencies?.skills ? `${Object.keys(importPlan.proficiencies.skills).length} skills` : null,
												importPlan.proficiencies?.saves ? `${importPlan.proficiencies.saves.length} saves` : null,
												`${importPlan.spells.length} spells`,
												`${importPlan.attacks.length} attacks`,
											].filter(Boolean).join(' · ')}
										</div>
									</div>
								</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
									<div style={{ padding: 14, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.surf }}>
										<div style={{ ...eb, marginBottom: 8, color: T.ok }}>Will import ({importPlan.mapped.length})</div>
										<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
											{importPlan.mapped.map((n, j) => (
												<div key={`${n.field}-${j}`} style={{ display: 'flex', gap: 7, font: `12px/1.45 ${T.sans}`, color: T.sub }}>
													<Icon name="check" size={13} color={T.ok} />
													<span style={{ minWidth: 0 }}><strong style={{ color: T.ink }}>{n.field}</strong> — {n.detail}</span>
												</div>
											))}
										</div>
									</div>
									<div style={{ padding: 14, borderRadius: 12, border: `1.5px dashed ${T.bdS}`, background: T.alt }}>
										<div style={{ ...eb, marginBottom: 8, color: T.warn }}>Couldn't map ({importPlan.unmapped.length})</div>
										{importPlan.unmapped.length === 0 ? (
											<div style={{ font: `12px ${T.sans}`, color: T.ter }}>Every field in the file mapped cleanly.</div>
										) : (
											<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
												{importPlan.unmapped.map((n, j) => (
													<div key={`${n.field}-${j}`} style={{ display: 'flex', gap: 7, font: `12px/1.45 ${T.sans}`, color: T.sub }}>
														<Icon name="hidden" size={13} color={T.warn} />
														<span style={{ minWidth: 0 }}><strong style={{ color: T.ink }}>{n.field}</strong> — {n.detail}</span>
													</div>
												))}
											</div>
										)}
										<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter, marginTop: 10 }}>
											These fields will NOT be imported — listed here so nothing is lost silently.
										</div>
									</div>
								</div>
								{error && (
									<div role="alert" style={{ font: `12.5px/1.5 ${T.sans}`, color: T.err, padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.err}` }}>
										{error}
									</div>
								)}
							</div>
						)}
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 28px', borderTop: `1px solid ${T.bd}` }}>
						<Button variant="ghost" icon="chevron-left" onClick={() => { setPhase('choose'); setImportPlan(null); setImportError(null); setError(null); }}>Back</Button>
						<div style={{ flex: 1 }} />
						<Button variant="secondary" onClick={() => void startImport()}>Choose another file</Button>
						{importPlan && (
							<Button variant="primary" icon="check" disabled={submitting} onClick={() => void runImport()}>
								{submitting ? 'Importing…' : 'Import character'}
							</Button>
						)}
					</div>
				</div>
			</Overlay>
		);
	}

	/* ---- the from-scratch wizard ---- */
	const step = STEPS[i];
	const statsOk = !abilityValidation || abilityValidation.valid;
	const canContinue = step.id === 'identity' ? identityOk : step.id === 'stats' ? statsOk : true;

	return (
		<Overlay onClose={onClose} wide label="New character wizard">
			<div style={{ display: 'flex', height: '100%', flex: 1 }}>
				<StepRail steps={STEPS} i={i} />
				<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px 0' }}>
						<div style={{ font: `700 19px ${T.disp}` }}>{step.title}</div>
						<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
					</div>
					<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 28px 20px' }}>

						{step.id === 'identity' && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
								<div>
									<FieldLabel>Kind</FieldLabel>
									<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
										{KINDS.map((k) => (
											<Tile key={k.id} on={kind === k.id} onClick={() => setKind(k.id)} title={k.label} compact icon={k.icon} />
										))}
									</div>
								</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
									<div>
										<FieldLabel>Name</FieldLabel>
										<Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="e.g. Sister Avelin" aria-label="Name" style={{ width: '100%' }} />
									</div>
									<div>
										<FieldLabel>Alignment</FieldLabel>
										<Select value={align} onChange={(e: any) => setAlign(e.target.value)} options={ALIGNMENTS.map((a) => ({ value: a, label: a }))} aria-label="Alignment" style={{ width: '100%' }} />
									</div>
								</div>
								{isPc && (
									<div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
										<div>
											{/* Core rule: a PC draft is owned by exactly ONE player (CHAR-013); the owner
											    fills and finalizes the guided steps. */}
											<FieldLabel hint="A PC belongs to a player — the guided draft is created in their name">Owned by</FieldLabel>
											{players.length > 0 ? (
												<Select value={owner} onChange={(e: any) => setOwner(e.target.value)} options={players.map((p) => ({ value: p.id, label: p.displayName }))} aria-label="Owned by" style={{ width: '100%' }} />
											) : (
												<HonestNote>No player actors are registered — add players in Settings before building a PC.</HonestNote>
											)}
										</div>
									</div>
								)}
								<div>
									<FieldLabel hint="Sets racial traits & ability bonuses">Ancestry / race</FieldLabel>
									<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10 }}>
										{BUILDER.races.map((r) => <Tile key={r.id} on={race === r.id} onClick={() => setRace(r.id)} title={r.name} sub={r.sub} compact />)}
									</div>
								</div>
								<div>
									<FieldLabel>Portrait tone</FieldLabel>
									<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
										<span style={{ width: 56, height: 56, borderRadius: 12, flex: '0 0 auto', position: 'relative', overflow: 'hidden', background: `linear-gradient(${grad}deg,#2a2117,#14100b)`, border: `1px solid ${T.bd}` }}>
											<span style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--map-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--map-grid-line) 1px,transparent 1px)', backgroundSize: '14px 14px' }} />
										</span>
										<input type="range" min="0" max="359" value={grad} onChange={(e) => setGrad(Number(e.target.value))} aria-label="Portrait tone" style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
										<span style={{ font: `12px ${T.mono}`, color: T.ter, width: 38, textAlign: 'right' }}>{grad}°</span>
									</div>
								</div>
							</div>
						)}

						{step.id === 'class' && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
								<div>
									<FieldLabel hint={`Hit die ${clsObj.hd} · primary ${clsObj.primary} · saves ${clsObj.saves}`}>Class</FieldLabel>
									<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
										{clsChoices.map((c) => <Tile key={c.id} on={clsId === c.id} onClick={() => { setCls(c.id); setSubclass(''); }} title={c.name} sub={`${c.hd} · ${c.primary}`} compact />)}
									</div>
									{isPc && (
										<div style={{ font: `11.5px ${T.sans}`, color: T.ter, marginTop: 8 }}>
											The guided PC flow supports these classes today — more land with later core rule packages.
										</div>
									)}
								</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
									<div>
										<FieldLabel hint="Optional at level 1">Subclass</FieldLabel>
										<Select
											value={subclass}
											onChange={(e: any) => setSubclass(e.target.value)}
											options={[{ value: '', label: '— none yet —' }, ...clsObj.sub.split(', ').map((s) => ({ value: s, label: s }))]}
											aria-label="Subclass"
											style={{ width: '100%' }}
										/>
									</div>
									<div>
										<FieldLabel>Level</FieldLabel>
										<NumStepper value={level} min={1} max={20} onChange={setLevel} mono label="level" />
									</div>
								</div>
								<div>
									<FieldLabel hint={`Grants ${bgObj.skills}`}>Background</FieldLabel>
									<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10 }}>
										{bgChoices.map((b) => <Tile key={b.id} on={bgId === b.id} onClick={() => setBackground(b.id)} title={b.name} sub={b.skills} compact />)}
									</div>
								</div>
							</div>
						)}

						{step.id === 'stats' && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
									<Seg value={method} onChange={(v) => setMethod(v as ScoreMethod)} options={BUILDER.methods.map((m) => ({ value: m.id, label: m.label }))} ariaLabel="Ability score method" />
									<span style={{ font: `12px ${T.sans}`, color: T.ter }}>{BUILDER.methods.find((m) => m.id === method)?.note}</span>
									{method === 'pointbuy' && (
										<span style={{ marginLeft: 'auto', font: `12px ${T.mono}`, color: pointsLeft < 0 ? T.err : T.acc, padding: '4px 10px', borderRadius: 20, background: T.accSub, border: `1px solid ${T.accBd}` }}>
											{pointsLeft} points left
										</span>
									)}
								</div>
								<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
									{BUILDER.abilityKeys.map((k) => (
										<div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 8px', borderRadius: 11, background: T.surf, border: `1px solid ${T.bd}` }}>
											<span style={{ ...eb }}>{k}</span>
											{method === 'standard' ? (
												<Select
													value={assign[k]}
													onChange={(e: any) => setAssign((s) => ({ ...s, [k]: e.target.value }))}
													options={[{ value: '', label: '—' }, ...remainingArray(k).map((v) => ({ value: String(v), label: String(v) }))]}
													aria-label={`${k} score`}
													style={{ width: '100%', textAlign: 'center' }}
												/>
											) : (
												<>
													<span style={{ font: `700 22px ${T.mono}`, color: T.ink }}>{scores[k]}</span>
													<div style={{ display: 'flex', gap: 4 }}>
														<IconButton icon="Minus" label={`Lower ${k}`} variant="outline" size="sm" onClick={() => setScore(k, scores[k] - 1)} />
														<IconButton icon="add" label={`Raise ${k}`} variant="outline" size="sm" onClick={() => { if (!raiseBlocked(k)) setScore(k, scores[k] + 1); }} />
													</div>
												</>
											)}
											<span style={{ font: `12px ${T.mono}`, color: T.sub, padding: '2px 9px', borderRadius: 20, background: T.alt }}>
												{modOf(method === 'standard' ? Number(assign[k] || 10) : scores[k])}
											</span>
										</div>
									))}
								</div>
								{abilityValidation && !abilityValidation.valid && (
									<ul role="alert" style={{ margin: 0, paddingLeft: 18, font: `12.5px ${T.sans}`, color: T.warn }}>
										{abilityValidation.issues.map((iss, j) => <li key={`${iss.fieldId ?? 'step'}-${j}`}>{iss.message}</li>)}
									</ul>
								)}
								{isPc && method === 'manual' && (
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										A guided PC finalizes against the core's point-buy rule — each score 8–15, 27 points total.
									</div>
								)}
								<div style={{ display: 'flex', gap: 14, padding: '12px 14px', borderRadius: 11, background: T.alt, border: `1px solid ${T.bd}`, flexWrap: 'wrap', alignItems: 'center' }}>
									<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>Derived suggestions</span>
									<span style={{ font: `12px ${T.mono}`, color: T.ter }}>Initiative {modOf(effScores.DEX)}</span>
									<span style={{ font: `12px ${T.mono}`, color: T.ter }}>Unarmored AC {10 + Math.floor((effScores.DEX - 10) / 2)}</span>
									<span style={{ font: `12px ${T.mono}`, color: T.ter }}>CON mod {modOf(effScores.CON)}</span>
									<button
										type="button"
										onClick={() => { setAc(10 + Math.floor((effScores.DEX - 10) / 2)); Toaster.info('AC set from DEX'); }}
										style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, font: `600 12px ${T.sans}`, color: T.acc }}
									>
										Apply to kit →
									</button>
								</div>
							</div>
						)}

						{step.id === 'kit' && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
								<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
									<div><FieldLabel>Armor class</FieldLabel><NumStepper value={ac} min={1} max={30} onChange={setAc} mono label="armor class" /></div>
									<div><FieldLabel>Hit points</FieldLabel><NumStepper value={hp} min={1} max={600} step={kind === 'monster' ? 5 : 1} onChange={setHp} mono label="hit points" /></div>
									<div><FieldLabel>Speed (ft)</FieldLabel><NumStepper value={speed} min={0} max={120} step={5} onChange={setSpeed} mono label="speed" /></div>
								</div>
								<div>
									<FieldLabel hint="Attacks, cantrips, and signature moves">Attacks &amp; actions</FieldLabel>
									{/* All kinds carry custom attacks now: NPC/monster/sidekick via quick-create,
									    a PC via the draft's kit step (finalize-draft carries kit attacks onto the PC). */}
									<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
										{attacks.map((at, idx) => (
											<div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr .8fr 1fr 28px', gap: 8, alignItems: 'center' }}>
												<Input value={at.name} aria-label="Attack name" onChange={(e: any) => setAttacks((a) => a.map((x, j) => j === idx ? { ...x, name: e.target.value } : x))} placeholder="Name" />
												<Input value={at.kind} aria-label="Attack type" onChange={(e: any) => setAttacks((a) => a.map((x, j) => j === idx ? { ...x, kind: e.target.value } : x))} placeholder="Type" />
												<Input value={at.hit} aria-label="Attack to-hit" onChange={(e: any) => setAttacks((a) => a.map((x, j) => j === idx ? { ...x, hit: e.target.value } : x))} placeholder="Hit" />
												<Input value={at.dmg} aria-label="Attack damage" onChange={(e: any) => setAttacks((a) => a.map((x, j) => j === idx ? { ...x, dmg: e.target.value } : x))} placeholder="Damage" />
												<IconButton icon="close" label="Remove attack" variant="ghost" size="sm" onClick={() => setAttacks((a) => a.filter((_, j) => j !== idx))} />
											</div>
										))}
										<button
											type="button"
											onClick={() => setAttacks((a) => [...a, { name: '', kind: 'Melee', hit: '+0', dmg: '1d6', type: '' }])}
											style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 10, borderRadius: 10, border: `1.5px dashed ${T.bdS}`, background: 'transparent', cursor: 'pointer', color: T.ter, font: `600 12.5px ${T.sans}` }}
										>
											<Icon name="add" size={14} />Add attack
										</button>
									</div>
								</div>
							</div>
						)}

						{step.id === 'bio' && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
								<div>
									<FieldLabel>Bio</FieldLabel>
									<Textarea value={bio} onChange={(e: any) => setBio(e.target.value)} rows={4} placeholder="Who are they, and why are they here?" style={{ width: '100%' }} />
								</div>
								<div>
									<FieldLabel hint="Never shown to players">DM notes</FieldLabel>
									{isPc ? (
										// quick-create can mark data.dmNotes dm-only at creation; a finalized PC has no
										// command to mark a field DM-only afterwards — hiding beats leaking to the owner.
										<HonestNote>
											DM-only notes aren't available on a guided PC yet — a PC is shared with its owning
											player, and the core has no command to mark a field DM-only after creation.
										</HonestNote>
									) : (
										<Textarea value={dmNotes} onChange={(e: any) => setDmNotes(e.target.value)} rows={3} placeholder="Secrets, leverage, how you'll play them." style={{ width: '100%' }} />
									)}
								</div>
								<div>
									<FieldLabel>Visibility</FieldLabel>
									{isPc ? (
										<HonestNote>
											A new PC starts <strong>shared with its owning player</strong> — the core's guided-flow
											rule (CHAR-002). The DM can widen who sees it afterwards from the character sheet's
											Sharing controls.
										</HonestNote>
									) : (
										<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
											<Tile on={vis === 'players'} onClick={() => setVis('players')} title="Players can see" sub="On the party roster and shared scenes" icon="visibility-players" compact />
											<Tile on={vis === 'dm-only'} onClick={() => setVis('dm-only')} title="DM only" sub="Hidden until you reveal them" icon="dm-only" compact />
										</div>
									)}
								</div>
							</div>
						)}

						{step.id === 'review' && (
							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
										<Avatar name={name || 'New'} size="xl" ring="turn" />
										<div style={{ minWidth: 0 }}>
											<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
												<span style={{ font: `700 20px ${T.disp}` }}>{name || 'Unnamed'}</span>
												<Badge status={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Badge>
												<VisibilityChip level={isPc ? 'shared' : vis === 'players' ? 'players' : 'dm-only'} compact />
											</div>
											<div style={{ font: `13px ${T.sans}`, color: T.sub, marginTop: 3 }}>{subLine}</div>
											<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{align} · {bgObj.name}</div>
											{isPc && (
												<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 2 }}>
													Owned by {players.find((p) => p.id === owner)?.displayName ?? '—'}
												</div>
											)}
										</div>
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
										{BUILDER.abilityKeys.map((k) => <AbilityScore key={k} label={k} score={effScores[k]} size="sm" />)}
									</div>
									{error && (
										<div role="alert" style={{ font: `12.5px/1.5 ${T.sans}`, color: T.err, padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.err}` }}>
											{error}
										</div>
									)}
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 12, background: T.surf, border: `1px solid ${T.accBd}`, boxShadow: T.smd }}>
									<div style={{ display: 'flex', gap: 18 }}>
										{([['AC', String(ac), 'shield'], ['HP', String(hp), 'heart'], ['Speed', `${speed}ft`, 'travel'], ['Init', modOf(effScores.DEX), 'session-bolt']] as const).map(([l, v, ic]) => (
											<div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
												<span style={{ display: 'flex', alignItems: 'center', gap: 5, ...eb }}><Icon name={ic} size={12} color={T.acc} />{l}</span>
												<span style={{ font: `700 16px ${T.mono}`, color: T.ink }}>{v}</span>
											</div>
										))}
									</div>
									<div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 10 }}>
										<div style={{ ...eb, marginBottom: 6 }}>Attacks ({attacks.filter((a) => a.name.trim()).length})</div>
										<div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
											{attacks.filter((a) => a.name.trim()).map((a, idx) => (
												<div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12.5px ${T.sans}`, color: T.sub }}>
													<Icon name="sword" size={13} color={T.ter} /><span style={{ flex: 1 }}>{a.name}</span><span style={mono}>{a.hit}</span><span style={{ ...mono, color: T.ter }}>{a.dmg}</span>
												</div>
											))}
											{!attacks.filter((a) => a.name.trim()).length && (
												<span style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No attacks added.</span>
											)}
										</div>
									</div>
									{bio && <div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub, borderTop: `1px solid ${T.bd}`, paddingTop: 10 }}>{bio}</div>}
								</div>
							</div>
						)}
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 28px', borderTop: `1px solid ${T.bd}` }}>
						<Button variant="ghost" onClick={back} icon="chevron-left">{i === 0 ? 'Back' : STEPS[i - 1].title}</Button>
						<div style={{ flex: 1 }} />
						<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>Step {i + 1} of {STEPS.length}</span>
						{i < STEPS.length - 1
							? <Button variant="primary" icon="chevron-right" disabled={!canContinue} onClick={next}>Continue</Button>
							: <Button variant="primary" icon="check" disabled={!identityOk || !statsOk || submitting} onClick={create}>{submitting ? 'Creating…' : 'Create character'}</Button>}
					</div>
				</div>
			</div>
		</Overlay>
	);
}
