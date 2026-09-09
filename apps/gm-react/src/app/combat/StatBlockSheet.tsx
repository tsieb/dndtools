import { useMemo, useState } from 'react';
import { getActiveSystemForActor, getCharacterForActor } from '@dndtools/core';
import { Button, Sheet, StatBlock } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { T } from '../screen-kit';
import type { CombatantRow } from './HpKeypadSheet';

/**
 * RC-SES-3.3 — the stat-block quick reference a DM pulls from a tracker row mid-fight. A right
 * drawer on desktop and a bottom slab on a phone (the same `Sheet` geometry RC-SES-3.2's HP keypad
 * uses, so the tracker has ONE overlay language), rendering the DS `StatBlock`.
 *
 * Where the numbers come from, in order:
 *
 *   - The BOUND character, read through `getCharacterForActor` — the actor-filtered path, so a
 *     character the viewer may not see resolves to nothing rather than to a leaked card.
 *   - Failing that (a monster the DM typed straight into the encounter), the combatant's OWN
 *     stat-block preview from the tracker read model. That is genuinely all the data that exists
 *     for such a row, and the card says so instead of the button being dead.
 *
 * RC-SYS-2.5 — the ability cells are the ACTIVE package's `attributes[]`, and armour class is drawn
 * only when the package's creature schema declares it, so a system with three approaches and no AC
 * draws three cells and no AC. Nothing here invents a 5e concept the system has not declared.
 */

/** The creature-schema field key a package declares to say "my creatures have an armour class". */
const ARMOR_CLASS_FIELD_KEY = 'armorClass';

export function StatBlockSheet({
	target,
	side,
	onClose,
}: {
	target: CombatantRow | null;
	side: 'bottom' | 'right';
	onClose: () => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	// Collapsible actions (the story's one explicit affordance): a long action list pushes the
	// defences and the ability row off a phone screen, and mid-fight the DM usually wants the
	// numbers first. Open by default — the actions are why most people open the card.
	const [actionsOpen, setActionsOpen] = useState(true);

	const activePackage = useMemo(
		() =>
			getActiveSystemForActor(
				runtime.state.systems,
				runtime.state.permissions,
				runtime.defaultActorId,
			).activePackage,
		[runtime.state.systems, runtime.state.permissions, runtime.defaultActorId],
	);

	const characterId = target?.characterId ?? null;
	const character = useMemo(
		() =>
			characterId
				? getCharacterForActor(
						runtime.state.characters,
						runtime.state.permissions,
						runtime.defaultActorId,
						characterId,
						activePackage,
					)
				: null,
		[
			characterId,
			runtime.state.characters,
			runtime.state.permissions,
			runtime.defaultActorId,
			activePackage,
		],
	);

	const res = target?.resources ?? null;
	const hasAc = activePackage.creatureSchema.some((field) => field.key === ARMOR_CLASS_FIELD_KEY);
	const attributes = activePackage.attributes.map((attribute) => ({
		key: attribute.key,
		abbreviation: attribute.abbreviation || attribute.label,
	}));
	// The bound character's scores when there is one; otherwise whatever the encounter row itself
	// carries. Both are already actor-filtered by the query that produced them.
	const abilities = character ? character.attributes : (target?.statBlock.abilityScores ?? {});
	const ac = character ? character.combat.ac : target?.statBlock.ac;
	const actions = (character?.attacks ?? []).map((attack) => ({
		name: attack.name,
		text: attack.detail,
	}));
	const notes = character ? null : (target?.statBlock.notes ?? null);

	return (
		<Sheet
			open={!!target}
			onClose={onClose}
			side={side}
			size={side === 'bottom' ? 'min(620px, 88vh)' : 420}
			title={target ? t('session.combat.quickRef.title', { name: target.name }) : undefined}
			description={t('session.combat.quickRef.help')}
		>
			{target && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{/* Say where the card came from. "This is the whole character sheet" and "this is the
					    three numbers you typed into the encounter" look identical otherwise, and the DM
					    would read an absent trait as a trait the creature does not have. */}
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{character
							? t('session.combat.quickRef.fromCharacter', { name: character.name })
							: t('session.combat.quickRef.fromEncounter')}
					</div>
					{actions.length > 0 && (
						<Button
							variant="ghost"
							size="sm"
							icon={actionsOpen ? 'chevron-down' : 'chevron-right'}
							aria-expanded={actionsOpen}
							onClick={() => setActionsOpen((open) => !open)}
						>
							{t('session.combat.quickRef.actions', { count: actions.length })}
						</Button>
					)}
					<StatBlock
						name={character?.name ?? target.name}
						meta={activePackage.displayName}
						ac={hasAc ? (ac ?? undefined) : undefined}
						hp={res ? res.maxHp : undefined}
						attributes={attributes}
						abilities={abilities}
						live={res ? { current: res.hp, max: res.maxHp } : undefined}
						actions={actionsOpen ? actions : []}
						dmOnly={target.hidden}
					/>
					{notes && <p style={{ margin: 0, font: `12.5px ${T.sans}`, color: T.sub }}>{notes}</p>}
				</div>
			)}
		</Sheet>
	);
}
