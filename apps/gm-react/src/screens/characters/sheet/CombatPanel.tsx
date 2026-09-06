import { type ReactNode } from 'react';
import { Button, ConditionTracker, Field, HPBar, Input, Select, Stat } from '../../../ds';
import { type CharacterResources, type CharacterView } from '@dndtools/core';
import { Panel, T, eb } from '../../../app/screen-kit';
import { STANDARD_CONDITIONS, condKey } from '../shared';

/** Hit points, AC, death saves and the condition tracker — the DM-only `character.set-combat`
 * surface. Extracted from Characters.tsx unchanged (RC-STB-2.6). */
export function CombatPanel({
	view,
	isDm,
	editMode,
	resources,
	hpDraft,
	setHpDraft,
	commitHpAmount,
	typedHpAmount,
	acDraft,
	setAcDraft,
	conditionInput,
	setConditionInput,
	applyHp,
	applyAc,
	setCondition,
	fieldError,
}: {
	view: CharacterView;
	isDm: boolean;
	editMode: boolean;
	resources: CharacterResources | null;
	hpDraft: string;
	setHpDraft: (next: string) => void;
	commitHpAmount: () => void;
	typedHpAmount: () => number;
	acDraft: string;
	setAcDraft: (next: string) => void;
	conditionInput: string;
	setConditionInput: (next: string) => void;
	applyHp: (delta: number) => Promise<void>;
	applyAc: () => Promise<void>;
	setCondition: (name: string, present: boolean) => Promise<void>;
	fieldError: (field: 'ac' | 'slots' | 'xp') => ReactNode;
}) {
	return (
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
							? (_key: string, idx: number) => setCondition(view!.combat.conditions[idx], false)
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
								// Coercing per keystroke snapped the field back to 1 the instant it was
								// cleared, so "12" could not be typed over "3". Hold the text, commit
								// on blur — the pattern EncounterBuilder's CR/quantity fields use.
								value={hpDraft}
								onChange={(e: any) => setHpDraft(e.target.value)}
								onBlur={commitHpAmount}
							/>
						</Field>
						<Button variant="secondary" size="sm" onClick={() => applyHp(-typedHpAmount())}>
							Damage
						</Button>
						<Button variant="secondary" size="sm" onClick={() => applyHp(typedHpAmount())}>
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
						{fieldError('ac')}
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
	);
}
