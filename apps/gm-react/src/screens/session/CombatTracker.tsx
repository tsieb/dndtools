import type { CombatTrackerView } from '@dndtools/core';
import {
	Avatar,
	Badge,
	Button,
	CONDITIONS,
	ConditionBadge,
	Dialog,
	EmptyState,
	HPBar,
	IconButton,
	StatPill,
	VisibilityChip,
} from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';

type CombatantRow = CombatTrackerView['combatants'][number];

// ── Combat tracker ────────────────────────────────────────────────────────────────────────────────

export function CombatPanel({
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
	const activeCombatant =
		tracker.combatants.find((c) => c.id === tracker.activeCombatantId) ?? null;
	const lowest = tracker.combatants
		.filter((c) => c.resources)
		.reduce<CombatantRow | null>(
			(m, c) =>
				!m ||
				c.resources!.hp / Math.max(1, c.resources!.maxHp) <
					m.resources!.hp / Math.max(1, m.resources!.maxHp)
					? c
					: m,
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
							<Button
								variant="secondary"
								size="sm"
								icon="add"
								disabled={previewing}
								onClick={onAdd}
							>
								Add
							</Button>
						)}
						<Button variant="ghost" size="sm" icon="close" disabled={previewing} onClick={onEnd}>
							End combat
						</Button>
					</div>
				) : (
					<Button
						variant="primary"
						size="sm"
						icon="sword"
						// aria-disabled, not disabled: this is where ⌘K's "Build encounter" lands, and a
						// natively disabled button leaves the tab order — so the DM arrived at a mute dead
						// control. The EmptyState below explains it, but only to sighted users who scroll;
						// the reason belongs on the control that refuses.
						aria-disabled={!isLive || previewing || !isDm || undefined}
						title={
							previewing
								? 'Exit player preview to build an encounter'
								: !isDm
									? 'Only the DM can build an encounter'
									: !isLive
										? 'Go live before building an encounter'
										: 'Build encounter'
						}
						aria-label={
							previewing
								? 'Build encounter (unavailable — exit player preview first)'
								: !isDm
									? 'Build encounter (unavailable — DM only)'
									: !isLive
										? 'Build encounter (unavailable — go live first)'
										: 'Build encounter'
						}
						onClick={onStart}
					>
						Build encounter
					</Button>
				)
			}
		>
			{/* Next turn / Previous turn / Heal / Damage / conditions are the four things a DM touches
			    every thirty seconds, and they were the ONLY durable writes on this screen that pass no
			    `ok` string to the dispatch helper — so no toast fires and nothing is announced.
			    `aria-current` moving between list items is not announced either. This region is
			    permanently mounted (a status node inserted together with its text is routinely
			    dropped) and sits OUTSIDE the `<ul>` so it cannot join the list's text. */}
			<div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
				{running && activeCombatant
					? `Round ${tracker.round}, turn ${tracker.turn + 1} — ${activeCombatant.name}. ${
							activeCombatant.resources
								? `${activeCombatant.resources.hp} of ${activeCombatant.resources.maxHp} hit points.`
								: ''
						}`
					: ''}
			</div>
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
							<StatPill
								label="Lowest HP"
								value={`${lowest.resources.hp}/${lowest.resources.maxHp}`}
								tone="error"
							/>
						)}
						<div style={{ flex: 1 }} />
						<IconButton
							icon="chevron-left"
							label="Previous turn"
							variant="ghost"
							size="sm"
							disabled={previewing}
							onClick={onPrevious}
						/>
						<Button
							variant="primary"
							size="sm"
							iconRight="skip"
							disabled={previewing}
							onClick={onAdvance}
						>
							Next turn
						</Button>
					</div>

					{/* The initiative order IS a list, and announcing "list, 4 items" is how a screen-reader
					    DM gets the shape of the turn order without walking every row. */}
					<ul
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 8,
							listStyle: 'none',
							margin: 0,
							padding: 0,
						}}
					>
						{tracker.combatants.map((c) => {
							const active = c.id === tracker.activeCombatantId;
							const sel = c.id === selectedId;
							const res = c.resources;
							return (
								// The DS InitiativeRow anatomy (mono initiative · avatar with gold turn ring · gold
								// 3px active left rail · HPBar · quick HP steps), hand-hosted so the row can also
								// carry selection, state badges, and per-condition ConditionBadge chips with the
								// distinct-icon grayscale contract (the plain component renders generic chips only).
								//
								// The row itself is NOT a control. It used to be `role="button"` with
								// `aria-label={`Select ${name}`}`, and an aria-label on a role=button REPLACES the
								// whole descendant subtree — so a screen-reader DM heard "Select Goblin, toggle
								// button" and lost the HP, the AC, the conditions and whose turn it was. It also
								// nested the condition-remove and Heal/Damage buttons inside a button, which is an
								// axe `nested-interactive` violation (serious). The name is now the control; the
								// row keeps its pointer target as a mouse-only convenience.
								<li
									key={c.id}
									aria-current={active ? 'true' : undefined}
									onClick={() => onSelect(c.id)}
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
									<span
										style={{
											minWidth: 28,
											textAlign: 'center',
											font: `700 14px ${T.mono}`,
											color: active ? T.acc : T.sub,
										}}
									>
										{c.statBlock.initiative ?? '—'}
									</span>
									<Avatar name={c.name} size="sm" ring={active ? 'turn' : undefined} />
									<div style={{ flex: 1, minWidth: 0 }}>
										{/* Wraps on purpose. On a 391px phone this row is left ~183px after the initiative
										    span, avatar, row actions and paddings, and "Active" + "Bloodied" alone exceed
										    that. Every child here is shrinkable, so the COMBATANT NAME was what collapsed to
										    an ellipsis while the badge text stacked one character per line. Let the badges
										    drop to their own line instead. */}
										<div
											style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}
										>
											{/* The row's one real control. `aria-pressed` carries the selection state that
											    used to sit on the row, so the toggle semantics survive the restructure. */}
											<button
												type="button"
												aria-pressed={sel}
												// The row also selects (mouse-only convenience), so stop the bubble
												// rather than letting one click run the same selection twice.
												onClick={(e) => {
													e.stopPropagation();
													onSelect(c.id);
												}}
												style={{
													font: `600 13.5px ${T.sans}`,
													color: T.ink,
													whiteSpace: 'nowrap',
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													background: 'none',
													border: 'none',
													padding: 0,
													textAlign: 'left',
													cursor: 'pointer',
													minWidth: 0,
												}}
											>
												{c.name}
											</button>
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
												<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
													AC {c.statBlock.ac ?? '—'}
												</span>
											</div>
										)}
										{res && res.conditions.length > 0 && (
											<div
												style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}
												onClick={(e) => e.stopPropagation()}
											>
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
										<div
											style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
											onClick={(e) => e.stopPropagation()}
										>
											{/* The combatant's name has to be IN the name: with six rows a screen
											    reader otherwise hears six identical "Heal 1" buttons that each
											    write durable HP to a different creature. "Heal 1"/"Damage 1"
											    stay as the PREFIX so combat.spec's substring match still hits. */}
											<IconButton
												icon="add"
												label={`Heal 1 HP — ${c.name}`}
												variant="ghost"
												size="sm"
												disabled={previewing}
												onClick={() => onHp(c.id, 1)}
											/>
											<IconButton
												icon="remove"
												label={`Damage 1 HP — ${c.name}`}
												variant="ghost"
												size="sm"
												disabled={previewing}
												onClick={() => onHp(c.id, -1)}
											/>
										</div>
									)}
								</li>
							);
						})}
					</ul>

					{selected && (
						<div
							style={{
								borderTop: `1px solid ${T.bd}`,
								paddingTop: 12,
								display: 'flex',
								flexDirection: 'column',
								gap: 10,
							}}
						>
							<div style={{ ...eb }}>Selected · {selected.name}</div>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
								{selected.resources && (
									<Button
										variant="secondary"
										size="sm"
										icon="add"
										disabled={previewing}
										onClick={() => onPickCondition(selected.id)}
									>
										Add condition
									</Button>
								)}
								{isDm && (
									<>
										<span
											aria-hidden="true"
											style={{ width: 1, height: 20, background: T.bd, margin: '0 4px' }}
										/>
										{/* Reaching either END of the order is the normal way to use these: press
										    "earlier" until the combatant is first and the button hard-disabled itself
										    under the finger that pressed it, dropping focus to <body>. The BOUND is now
										    soft (focusable, named, swallows the press); `previewing` stays hard. */}
										<IconButton
											icon="chevron-up"
											label={`Move ${selected.name} earlier in initiative`}
											variant="ghost"
											size="sm"
											disabled={previewing}
											aria-disabled={selectedIndex <= 0 || undefined}
											onClick={() => {
												if (selectedIndex <= 0) return;
												onReorder(selected.id, 'earlier');
											}}
										/>
										<IconButton
											icon="chevron-down"
											label={`Move ${selected.name} later in initiative`}
											variant="ghost"
											size="sm"
											disabled={previewing}
											aria-disabled={
												selectedIndex < 0 ||
												selectedIndex >= tracker.combatants.length - 1 ||
												undefined
											}
											onClick={() => {
												if (selectedIndex < 0 || selectedIndex >= tracker.combatants.length - 1)
													return;
												onReorder(selected.id, 'later');
											}}
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
										<Button
											variant="ghost"
											size="sm"
											icon="close"
											disabled={previewing}
											onClick={() => onRemove(selected.id, selected.name)}
										>
											Remove
										</Button>
									</>
								)}
							</div>
							{isDm && selected.hidden && (
								<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
									Players see this row as “Unknown creature”.
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

export function ConditionPickerDialog({
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
			description="Each condition has its own icon, so it stays readable at a glance."
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
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						Every condition is already applied.
					</div>
				)}
			</div>
		</Dialog>
	);
}
