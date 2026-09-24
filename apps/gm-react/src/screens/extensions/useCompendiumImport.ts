import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	getActiveSystemForActor,
	getContentItemsForActor,
	listCharactersForActor,
	VAULT_OBJECT_SUBTYPE_KEY,
} from '@dndtools/core';
import { Toaster } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	monsterFieldReport,
	monsterToQuickCreatePayload,
	spellToCreateObjectPayload,
	type ImportSourceMeta,
} from '../../app/compendium/import';
import type {
	CompendiumKind,
	CompendiumMonster,
	CompendiumSpell,
} from '../../app/compendium/types';
import { useI18n } from '../../i18n';
import type { EntryImportProps } from './CompendiumEntry';
import { eventField } from './shared';

/**
 * Importing a compendium entry through the real core commands: a monster dispatches
 * `character.quick-create` into the active system's creature schema, a spell dispatches
 * `content.create-object`. Names already in the vault are known up front, so the row can ask before
 * a re-import instead of silently duplicating.
 */
export function useCompendiumImport(
	kind: CompendiumKind,
	sourceMeta: ImportSourceMeta | null,
): EntryImportProps {
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	const dmId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !runtime.preview;
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [confirmKey, setConfirmKey] = useState<string | null>(null);

	// Duplicate guards — what is ALREADY in the vault, by (case-insensitive) name.
	const rosterNames = useMemo(
		() =>
			new Set(
				listCharactersForActor(runtime.state.characters, runtime.state.permissions, dmId).map((c) =>
					c.name.trim().toLowerCase(),
				),
			),
		[runtime.state.characters, runtime.state.permissions, dmId],
	);
	const spellTitles = useMemo(
		() =>
			new Set(
				getContentItemsForActor(runtime.state.content, runtime.state.permissions, dmId)
					.filter(
						(item) => item.kind === 'object' && item.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'spell',
					)
					.map((item) => item.title.trim().toLowerCase()),
			),
		[runtime.state.content, runtime.state.permissions, dmId],
	);
	const inVault = (name: string) =>
		(kind === 'monster' ? rosterNames : spellTitles).has(name.trim().toLowerCase());

	// RC-SYS-2.5 — a monster is imported into the ACTIVE system's creature schema, so the schema
	// decides what fits. The report drives both the preview's unmapped-field list and the refusal.
	const creatureSchema = useMemo(
		() =>
			getActiveSystemForActor(
				runtime.state.systems,
				runtime.state.permissions,
				dmId,
			).activePackage.creatureSchema.map((field) => ({
				key: field.key,
				label: field.label,
				required: field.required,
			})),
		[runtime.state.systems, runtime.state.permissions, dmId],
	);
	const monsterFit = (monster: CompendiumMonster) => monsterFieldReport(monster, creatureSchema);

	const importEntry = async (entry: CompendiumMonster | CompendiumSpell) => {
		if (!canWrite || busyKey !== null || !sourceMeta) return;
		setBusyKey(entry.key);
		try {
			if (kind === 'monster') {
				const monster = entry as CompendiumMonster;
				// Fail closed: the active system requires creature fields a 5e statblock cannot answer.
				const fit = monsterFit(monster);
				if (!fit.canHold) {
					Toaster.error(
						t('extensions.compendium.importFailed', {
							name: monster.name,
							reason: t('extensions.compendium.fitMissing', {
								fields: fit.missingRequired.map((f) => f.label).join(', '),
							}),
						}),
					);
					return;
				}
				const res = await runtime.dispatch({
					type: 'character.quick-create',
					actorId: dmId,
					payload: monsterToQuickCreatePayload(monster, sourceMeta),
				});
				if (res.status === 'rejected') {
					Toaster.error(
						t('extensions.compendium.importFailed', {
							name: monster.name,
							reason: res.rejection.message,
						}),
					);
					return;
				}
				const id = eventField(res, 'character.created', 'characterId');
				Toaster.success(
					t('extensions.compendium.monsterImported', { name: monster.name }),
					id
						? {
								action: t('extensions.compendium.open'),
								onAction: () => navigate(`/characters/${id}`),
							}
						: undefined,
				);
			} else {
				const spell = entry as CompendiumSpell;
				const res = await runtime.dispatch({
					type: 'content.create-object',
					actorId: dmId,
					payload: spellToCreateObjectPayload(spell, sourceMeta),
				});
				if (res.status === 'rejected') {
					Toaster.error(
						t('extensions.compendium.importFailed', {
							name: spell.name,
							reason: res.rejection.message,
						}),
					);
					return;
				}
				const id = eventField(res, 'content.object-changed', 'itemId');
				Toaster.success(
					t('extensions.compendium.spellImported', { name: spell.name }),
					id
						? {
								action: t('extensions.compendium.open'),
								onAction: () => navigate(`/knowledge/${id}`),
							}
						: undefined,
				);
			}
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusyKey(null);
			setConfirmKey(null);
		}
	};

	return { inVault, busyKey, confirmKey, setConfirmKey, importEntry, canWrite, monsterFit };
}
