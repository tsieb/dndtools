import { listCharactersForActor } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import type { BoardWidget } from '../../board-helpers';
import { Chip, Muted, StatPill, bodyWrap, cfg } from '../../widget-body-kit';

/**
 * The `characters` Command Center widget (RC-WID-4.1) — the party roster at a glance. `showVitals`
 * turns the per-character chip from a bare name into a name with its HP, and it is the DM's choice
 * because a shared GM Screen tile is read over a table.
 *
 * `listCharactersForActor` already redacts per viewer, so a player reading this tile sees the
 * characters the core cleared for them and nothing else.
 */
export function CharactersBody({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const showVitals = cfg<boolean>(widget, 'showVitals') ?? true;
	const characters = listCharactersForActor(
		runtime.state.characters,
		runtime.state.permissions,
		runtime.defaultActorId,
	);
	const party = characters.filter((character) => character.kind === 'pc');
	if (characters.length === 0) return <Muted>{t('widgetBody.characters.empty')}</Muted>;
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill label={t('widgetBody.characters.party')} value={String(party.length)} />
				<StatPill
					label={t('widgetBody.characters.others')}
					value={String(characters.length - party.length)}
				/>
			</div>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
				{characters.slice(0, 6).map((character) => (
					<Chip key={character.id}>
						{showVitals
							? `${character.name} ${character.combat.hp}/${character.combat.maxHp}`
							: character.name}
					</Chip>
				))}
			</div>
		</div>
	);
}
