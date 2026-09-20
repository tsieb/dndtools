/**
 * Character-builder orchestration: in-memory draft, validated PC score/owner constraints,
 * reviewed import plan and runtime-dispatch creation. WizardFrame owns the responsive shell;
 * create.ts owns the durable commands. Closing a draft never implies that it was saved.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getActiveSystemForActor, validateDraftStep } from '@dndtools/core';
import { Toaster } from '../../ds';
import { useViewport } from '../useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { registerBackHandler } from '../../platform/backNavigation';
import { pickTextFile } from '../../platform/filePick';
import {
	applySystemFit,
	parseCharacterImport,
	type ImportPlan,
	type SystemFitInput,
} from '../charImport/ddbJson';
import {
	BUILDER,
	CORE_PC_BACKGROUNDS,
	CORE_PC_CLASSES,
	KIND_LABEL,
	STEPS,
	clamp,
	type AbilityKey,
	type AttackRow,
	type CharKind,
	type ScoreMethod,
} from './data';
import {
	EMPTY_ASSIGNMENT,
	assignSlot,
	assignedScores,
	assignmentComplete,
	priorityFor,
	rollAbilityScores,
	suggestAssignment,
	type Assignment,
	type RolledScore,
} from './scores';
import { WizardFrame } from './WizardFrame';
import { ChoosePhase } from './Choose';
import { ImportPhase } from './Import';
import { createOther, createPc, runImport } from './create';
import type { Wizard } from './wizard';
import { useI18n } from '../../i18n';

export { portraitGradient } from './data';

type PoolMethod = Extract<ScoreMethod, 'standard' | 'roll'>;
const INITIAL_CLASS = 'fighter';

export function CharBuilder({
	onClose,
	onCreated,
	initialKind,
	initialAction,
}: {
	onClose: () => void;
	onCreated: (id: string) => void;
	/** Pre-select the character kind — lets "New NPC"-style launchers land on the right wizard. */
	initialKind?: string;
	/** `'import'` opens the file picker immediately — lets "Import character (JSON)" launchers skip
	 *  the entry choice (cancelling the picker lands on the choice screen as usual). */
	initialAction?: 'import';
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const isPhone = useViewport() === 'phone';
	const dmActorId = runtime.defaultActorId;
	const players = runtime.actors.filter((a) => a.role === 'player');
	// RC-SYS-2.5 — the active rules system. The class preview evaluates its resource formulas, and
	// the pure import mapper measures against it as plain data.
	const systemPackage = useMemo(
		() =>
			getActiveSystemForActor(runtime.state.systems, runtime.state.permissions, dmActorId)
				.activePackage,
		[runtime.state.systems, runtime.state.permissions, dmActorId],
	);
	const systemFit: SystemFitInput = useMemo(
		() => ({
			displayName: systemPackage.displayName,
			attributeKeys: systemPackage.attributes.map((a) => a.key),
			skillKeys: systemPackage.skills.map((sk) => sk.key),
			declaresSpellSlots: systemPackage.resources.some((r) => r.kind === 'slots'),
			declaresProficiencyBonus: systemPackage.derived.some((d) => d.key === 'proficiencyBonus'),
			abilityPlural: systemPackage.vocabulary.abilityPlural,
		}),
		[systemPackage],
	);

	const [phase, setPhase] = useState<'choose' | 'scratch' | 'import'>('choose');
	const [i, setI] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	// Dismiss-loses-work guard: backdrop/Escape on a DIRTY wizard shows this confirm instead of
	// silently discarding the multi-step draft. The Overlay itself is untouched — it just calls
	// requestClose, which decides whether closing needs a deliberate answer first.
	const [confirmDiscard, setConfirmDiscard] = useState(false);
	useEffect(() => {
		if (!confirmDiscard) return undefined;
		return registerBackHandler('overlay', () => {
			setConfirmDiscard(false);
			return true;
		});
	}, [confirmDiscard]);

	// A rail jump unmounts the button that had focus (the target becomes the current, non-button
	// row), which dropped focus to <body>. Land it on the new step's title instead.
	const titleRef = useRef<HTMLHeadingElement>(null);
	const focusTitle = useRef(false);
	useEffect(() => {
		if (!focusTitle.current) return;
		focusTitle.current = false;
		titleRef.current?.focus();
	}, [i]);

	// Import-from-file state: the parsed plan (with its mapped/unmapped field report) or the
	// parse failure, both rendered in the 'import' preview phase before anything is created.
	const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
	const [importError, setImportError] = useState<string | null>(null);

	// form state (design source shape)
	const isKind = (k: string | undefined): k is CharKind =>
		k === 'pc' || k === 'npc' || k === 'monster' || k === 'sidekick';
	const [kind, setKind] = useState<CharKind>(isKind(initialKind) ? initialKind : 'pc');
	const [name, setName] = useState('');
	const [race, setRace] = useState('human');
	const [align, setAlign] = useState('Neutral good');
	const [grad, setGrad] = useState(135);
	const [owner, setOwner] = useState(players[0]?.id ?? '');
	const ownerId = players.some((player) => player.id === owner) ? owner : (players[0]?.id ?? '');
	const [cls, setCls] = useState(INITIAL_CLASS);
	const [subclass, setSubclass] = useState('');
	const [level, setLevel] = useState(1);
	const [background, setBackground] = useState('soldier');
	const [pickedMethod, setMethod] = useState<ScoreMethod>('standard');
	const [scores, setScores] = useState<Record<AbilityKey, number>>({
		STR: 10,
		DEX: 10,
		CON: 10,
		INT: 10,
		WIS: 10,
		CHA: 10,
	});
	// The standard array starts DEALT in the class's priority order — a complete, 27-point-legal
	// spread the user rearranges — instead of six empty selects that blocked Continue by default.
	const [assignments, setAssignments] = useState<Record<PoolMethod, Assignment>>(() => ({
		standard: suggestAssignment(BUILDER.standardArray, priorityFor(INITIAL_CLASS)),
		roll: EMPTY_ASSIGNMENT,
	}));
	const [rolls, setRolls] = useState<RolledScore[] | null>(null);
	const [ac, setAc] = useState(13);
	const [hp, setHp] = useState(10);
	const [speed, setSpeed] = useState(30);
	const [attacks, setAttacks] = useState<AttackRow[]>([
		{ name: 'Longsword', kind: 'Melee', hit: '+4', dmg: '1d8+2', type: 'slashing' },
	]);
	const [bio, setBio] = useState('');
	const [dmNotes, setDmNotes] = useState('');
	const [vis, setVis] = useState<'players' | 'dm-only'>('players');

	const isPc = kind === 'pc';
	// PC drafts finalize against the core's CHAR-002 options only — narrow the tables for PCs.
	const clsChoices = isPc
		? BUILDER.classes.filter((c) => CORE_PC_CLASSES.has(c.id))
		: BUILDER.classes;
	const bgChoices = isPc
		? BUILDER.backgrounds.filter((b) => CORE_PC_BACKGROUNDS.has(b.id))
		: BUILDER.backgrounds;
	// Effective picks: a selection made under another kind may be illegal for a PC — fall back legal.
	const clsId = clsChoices.some((c) => c.id === cls) ? cls : clsChoices[0].id;
	const bgId = bgChoices.some((b) => b.id === background) ? background : bgChoices[0].id;
	// The CORE validates a guided PC's ability scores against 27-point buy, each 8–15 (CHAR-002), and
	// `finalize-draft` REJECTS anything else — there is no PC-side command that could carry a rolled
	// 16 or 7, so a 4d6 roll offered here would be a dead end the user can only escape by rerolling
	// until point buy happens to accept the dice. Roll is therefore offered for the kinds whose
	// scores the core takes as given (NPC / monster / sidekick). DEBT-2026-006 tracks the core work.
	const methodChoices = isPc ? BUILDER.methods.filter((m) => m.id !== 'roll') : BUILDER.methods;
	// A method picked under another kind may not exist for this one — fall back legal, as class and
	// background do above (switching NPC→PC with Roll selected must not strand the step).
	const method: ScoreMethod = methodChoices.some((m) => m.id === pickedMethod)
		? pickedMethod
		: 'standard';
	const raceObj = BUILDER.races.find((r) => r.id === race) ?? BUILDER.races[0];
	const clsObj = BUILDER.classes.find((c) => c.id === clsId) ?? BUILDER.classes[0];
	const bgObj = BUILDER.backgrounds.find((b) => b.id === bgId) ?? BUILDER.backgrounds[0];

	// pool (standard array / roll) bookkeeping — see `./scores`
	const poolMethod: PoolMethod | null = method === 'standard' || method === 'roll' ? method : null;
	const pool: readonly number[] | null =
		method === 'standard'
			? BUILDER.standardArray
			: method === 'roll'
				? (rolls?.map((r) => r.total) ?? [])
				: null;
	const assign = poolMethod ? assignments[poolMethod] : EMPTY_ASSIGNMENT;
	const setSlot = (k: AbilityKey, slot: string) => {
		if (!poolMethod) return;
		setAssignments((a) => ({ ...a, [poolMethod]: assignSlot(a[poolMethod], k, slot) }));
	};
	const rollScores = () => {
		const next = rollAbilityScores();
		setRolls(next);
		setAssignments((a) => ({
			...a,
			roll: suggestAssignment(
				next.map((r) => r.total),
				priorityFor(clsId),
			),
		}));
	};
	const suggestScores = () => {
		if (!poolMethod || !pool) return;
		setAssignments((a) => ({ ...a, [poolMethod]: suggestAssignment(pool, priorityFor(clsId)) }));
	};
	// point-buy bookkeeping
	const pointsSpent = BUILDER.abilityKeys.reduce(
		(s, k) => s + (BUILDER.pointCost[scores[k]] ?? 0),
		0,
	);
	const pointsLeft = 27 - pointsSpent;
	// effective scores (what the review/derived/dispatch uses)
	const effScores: Record<AbilityKey, number> = pool ? assignedScores(pool, assign) : scores;
	const coreAbilities = {
		str: effScores.STR,
		dex: effScores.DEX,
		con: effScores.CON,
		int: effScores.INT,
		wis: effScores.WIS,
		cha: effScores.CHA,
	};
	// The CORE's own abilities-step rule (27-point buy, each 8–15) gates the PC path — surface its
	// issues here instead of letting `finalize-draft` reject at the end.
	const abilityValidation = isPc ? validateDraftStep('abilities', coreAbilities) : null;
	// An unassigned pool ability resolves to 10 above — and all-10s passes the core's 27-point rule,
	// so an incomplete assignment used to create a character with every ability at 10, discarding
	// the array (or roll) it told the user to assign. That is wrong for every kind, not just PCs.
	const poolIncomplete = pool !== null && !assignmentComplete(pool, assign);

	const next = () => setI((x) => Math.min(STEPS.length - 1, x + 1));
	const back = () => {
		if (i === 0) setPhase('choose');
		else setI((x) => x - 1);
	};
	/** Revisit a completed step from the rail (forward jumps would skip the per-step gates). */
	const jumpTo = (j: number) => {
		if (j >= i) return;
		focusTitle.current = true;
		setI(j);
	};

	// The wizard is "dirty" once real work exists: any step past the first, or typed prose. Kind /
	// race / class tile picks alone are one click to redo and don't warrant a confirm.
	const dirty =
		phase === 'scratch' &&
		(i > 0 || name.trim() !== '' || bio.trim() !== '' || dmNotes.trim() !== '' || subclass !== '');
	function requestClose() {
		if (confirmDiscard) {
			setConfirmDiscard(false);
			return;
		} // Escape/backdrop on the confirm = stay
		if (dirty) {
			setConfirmDiscard(true);
			return;
		}
		onClose();
	}

	// Manual bounds tighten to the core's legal PC range so a PC's rolled scores can finalize.
	const scoreMin = method === 'pointbuy' || isPc ? 8 : 1;
	const scoreMax = method === 'pointbuy' || isPc ? 15 : 30;
	const setScore = (k: AbilityKey, v: number) =>
		setScores((s) => ({ ...s, [k]: clamp(v, scoreMin, scoreMax) }));
	const raiseBlocked = (k: AbilityKey) => {
		if (method !== 'pointbuy') return false;
		const nextCost = BUILDER.pointCost[scores[k] + 1];
		return nextCost === undefined || nextCost - (BUILDER.pointCost[scores[k]] ?? 0) > pointsLeft;
	};

	const identityOk = name.trim().length > 0 && (!isPc || !!ownerId);
	const subLine = useMemo(() => {
		if (kind === 'pc' || kind === 'sidekick')
			return `${raceObj.name} · ${clsObj.name} ${level}${subclass ? ` (${subclass})` : ''}`;
		return `${clsObj.name}-kin · ${t(KIND_LABEL[kind])}${subclass ? ` (${subclass})` : ''}`;
	}, [kind, raceObj, clsObj, level, subclass, t]);
	// ── The real create paths ─────────────────────────────────────────────────────────────────────

	const w: Wizard = {
		isPhone,
		isPc,
		players,
		kind,
		setKind,
		name,
		setName,
		align,
		setAlign,
		grad,
		setGrad,
		race,
		setRace,
		ownerId,
		setOwner,
		setCls,
		subclass,
		setSubclass,
		level,
		setLevel,
		setBackground,
		clsId,
		bgId,
		clsChoices,
		bgChoices,
		raceObj,
		clsObj,
		bgObj,
		method,
		setMethod,
		methodChoices,
		scores,
		pool,
		rolls,
		assign,
		setSlot,
		rollScores,
		suggestScores,
		pointsLeft,
		scoreMin,
		scoreMax,
		setScore,
		raiseBlocked,
		effScores,
		abilityValidation,
		poolIncomplete,
		systemPackage,
		ac,
		setAc,
		hp,
		setHp,
		speed,
		setSpeed,
		attacks,
		setAttacks,
		bio,
		setBio,
		dmNotes,
		setDmNotes,
		vis,
		setVis,
		subLine,
		error,
	};
	const createContext = { runtime, dmActorId, coreAbilities, w, setError };

	async function create() {
		setError(null);
		setSubmitting(true);
		// `SceneRuntime.dispatchNow` RETHROWS after a failed durable write, and creating a PC awaits
		// ~13 dispatches. Without the catch/finally, one storage failure left the primary reading
		// "Creating…" and `disabled` FOREVER with nothing on screen — and the only way out was Cancel,
		// which discards the whole multi-step draft.
		let id: string | null;
		try {
			id = isPc ? await createPc(createContext) : await createOther(createContext);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not save this character. Please try again.');
			return;
		} finally {
			setSubmitting(false);
		}
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
			// RC-SYS-2.5 — the file is 5e; the campaign may not be. Narrow the plan to what the active
			// package declares BEFORE the preview, so "Couldn't map" tells the truth about this system.
			setImportPlan(applySystemFit(result.plan, systemFit));
			setImportError(null);
		} else {
			setImportPlan(null);
			setImportError(`${picked.name}: ${result.error}`);
		}
		setError(null);
		setPhase('import');
	}

	// Import-intent launchers (the roster's "Import character (JSON)" button) skip the entry choice:
	// open the file picker once on mount. Consumed once — closing/cancelling behaves as usual.
	useEffect(() => {
		if (initialAction === 'import') void startImport();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only launcher intent
	}, []);

	/* ---- entry choice ---- */
	if (phase === 'choose') {
		return (
			<ChoosePhase
				isPhone={isPhone}
				onClose={onClose}
				onScratch={() => {
					setPhase('scratch');
					setI(0);
				}}
				onImport={() => void startImport()}
			/>
		);
	}

	/* ---- import preview: the mapper's field report, shown BEFORE anything is created ---- */
	if (phase === 'import') {
		return (
			<ImportPhase
				isPhone={isPhone}
				importPlan={importPlan}
				importError={importError}
				roster={Object.values(runtime.state.characters.characters)}
				error={error}
				submitting={submitting}
				onClose={onClose}
				onBack={() => {
					setPhase('choose');
					setImportPlan(null);
					setImportError(null);
					setError(null);
				}}
				onChooseFile={() => void startImport()}
				onConfirm={() =>
					void runImport({
						runtime,
						dmActorId,
						importPlan,
						setError,
						setSubmitting,
						onCreated,
					})
				}
			/>
		);
	}

	return (
		<WizardFrame
			{...{
				w,
				i,
				identityOk,
				abilityValidation,
				poolIncomplete,
				isPc,
				ownerId,
				isPhone,
				titleRef,
				requestClose,
				jumpTo,
				back,
				next,
				create,
				submitting,
				confirmDiscard,
				setConfirmDiscard,
				onClose,
			}}
		/>
	);
}
