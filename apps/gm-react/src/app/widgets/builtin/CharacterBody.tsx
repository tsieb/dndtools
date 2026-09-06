import { useMemo } from 'react';
import { getActiveSystemForActor, getCharacterForActor } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import type { BoardWidget } from '../../board-helpers';
import { useI18n } from '../../../i18n';
import { Chip, Muted, StatPill, bodyWrap, cfg } from '../../widget-body-kit';

/**
 * Moved from `app/widget-bodies.tsx` by RC-WID-4.1 — the file grew past what one module should
 * hold once every system widget type gained a body, so each hand-written body now lives in its own
 * file under `app/widgets/builtin/`. This is a pure move: the component below is byte-for-byte the
 * one that used to sit in `widget-bodies.tsx`.
 */

/** The creature-schema field key a package declares to say "my characters have an armor class" —
 * same convention `systemDeclaresChallenge` uses for challenge rating (RC-SYS-2.5). */
const ARMOR_CLASS_FIELD_KEY = 'armorClass';

export function CharacterBody({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const showAbilities = cfg<boolean>(widget, 'showAbilities') ?? true;
	// RC-SYS-2.7 — the active package decides which sheet concepts exist: a package with no
	// `attributes` (Generic) has no ability row to show, and armor class only appears when the
	// package's creature schema declares it, so a Generic character shows hp+stress and nothing
	// borrowed from 5e.
	const activePackage = useMemo(
		() =>
			getActiveSystemForActor(
				runtime.state.systems,
				runtime.state.permissions,
				runtime.defaultActorId,
			).activePackage,
		[runtime.state.systems, runtime.state.permissions, runtime.defaultActorId],
	);
	if (widget.requiresBinding && widget.status !== 'available') {
		return <Muted>{t('widgetBody.character.noBinding')}</Muted>;
	}
	// Resolve the BOUND character through the actor-filtered query (redacted per viewer).
	const boundId = widget.bindingRef?.entityType === 'character' ? widget.bindingRef.entityId : null;
	const view = boundId
		? getCharacterForActor(
				runtime.state.characters,
				runtime.state.permissions,
				runtime.defaultActorId,
				boundId,
				activePackage,
			)
		: null;
	const hasAc = activePackage.creatureSchema.some((field) => field.key === ARMOR_CLASS_FIELD_KEY);
	const attributes = activePackage.attributes;
	// Simple counters the package declares beyond hit points — a Generic stress clock, a 5e
	// inspiration point — rendered generically by the label/counts the package itself declares.
	// Expendable pools (ki, spell slots, …) belong on the full character sheet, not this small body.
	const extraResources = (view?.resources ?? []).filter((resource) => resource.kind === 'track');
	return (
		<div style={bodyWrap}>
			{view && (
				<div
					style={{
						font: '700 var(--text-sm) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					{view.name}
				</div>
			)}
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill
					label={t('widgetBody.initiative.hp')}
					value={view ? `${view.combat.hp} / ${view.combat.maxHp}` : '— / —'}
				/>
				{hasAc && (
					<StatPill
						label={t('widgetBody.character.ac')}
						value={view ? String(view.combat.ac) : '—'}
					/>
				)}
			</div>
			{showAbilities && attributes.length > 0 && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{attributes.map((attribute) => {
						const label = attribute.abbreviation || attribute.label;
						const score = view?.attributes[attribute.key];
						return (
							<Chip key={attribute.key}>{score !== undefined ? `${label} ${score}` : label}</Chip>
						);
					})}
				</div>
			)}
			{extraResources.length > 0 && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{extraResources.map((resource) => (
						<Chip key={resource.key} tone="accent">
							{resource.label} {resource.available}/{resource.max}
						</Chip>
					))}
				</div>
			)}
		</div>
	);
}
