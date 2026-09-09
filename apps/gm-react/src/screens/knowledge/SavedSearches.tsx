import { useMemo, useState } from 'react';
import { actorCanAuthorContent, getSavedSearchesForActor, type SearchFilter } from '@dndtools/core';
import { Button, Checkbox, Chip, Field, Icon, Input, Select, Toaster } from '../../ds';
import { T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { VIS_CHIP, visibilityOptions } from './shared';
import { useI18n, type MessageKey } from '../../i18n';

/**
 * RC-KNW-2.1 — the saved-search half of the Knowledge filters panel: name the current criteria, pin
 * them to the Command Center, rename them, delete them, apply them back into the editor.
 *
 * A saved search stores the QUERY and never a result. `getSavedSearchesForActor` re-evaluates each
 * stored filter LIVE for the reading actor, so the count beside a saved search is that actor's own
 * visible matches — a `dm-only` saved search is absent from a player's list entirely (SRCH-004 AC2),
 * and a `player-visible` one can never serve an item that has since been hidden. Save/pin/rename/
 * delete are the real `content.*-saved-search` commands; a rejection is shown, never swallowed.
 */
export function SavedSearches({
	filter,
	onApply,
}: {
	/** The criteria currently in the filter editor — what "Save this search" persists. */
	filter: SearchFilter;
	/** Load a stored filter back into the editor. */
	onApply: (filter: SearchFilter) => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const canAuthor = actorCanAuthorContent(runtime.state.permissions, actorId);

	const [busy, setBusy] = useState(false);
	const [saveName, setSaveName] = useState('');
	const [saveVisibility, setSaveVisibility] = useState('dm-only');
	const [savePinned, setSavePinned] = useState(false);
	// Renaming happens inline — a modal prompt would take the list away from the DM mid-edit.
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState('');

	const saved = useMemo(
		() =>
			getSavedSearchesForActor(
				runtime.state.content,
				runtime.state.maps,
				runtime.state.permissions,
				runtime.state.session,
				actorId,
			),
		[runtime.state, actorId],
	);
	// Pinned first (they are the Command Center's tiles), then the core's stable id order.
	const ordered = useMemo(
		() => [...saved.filter((s) => s.pinned), ...saved.filter((s) => !s.pinned)],
		[saved],
	);

	/** Dispatch one saved-search command, surfacing a rejection rather than reporting a false success. */
	async function run(
		type: string,
		payload: Record<string, unknown>,
		fallback: MessageKey,
	): Promise<boolean> {
		setBusy(true);
		try {
			const outcome = await runtime.dispatch({ type, actorId, payload } as Parameters<
				typeof runtime.dispatch
			>[0]);
			if (outcome.status === 'accepted') return true;
			Toaster.error(outcome.rejection.message);
			return false;
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : t(fallback));
			return false;
		} finally {
			setBusy(false);
		}
	}

	async function saveCurrent() {
		const ok = await run(
			'content.create-saved-search',
			{
				name: saveName.trim(),
				filter,
				visibility: saveVisibility,
				sharedWith: [],
				pinned: savePinned,
			},
			'knowledge.filters.saveFailed',
		);
		if (ok) {
			setSaveName('');
			setSavePinned(false);
		}
	}

	async function commitRename(searchId: string) {
		const name = renameValue.trim();
		if (name === '') return;
		const ok = await run(
			'content.update-saved-search',
			{ searchId, name },
			'knowledge.filters.renameFailed',
		);
		if (ok) setRenamingId(null);
	}

	return (
		<>
			{canAuthor && (
				<div style={{ display: 'grid', gap: 10, borderTop: `1px solid ${T.bd}`, paddingTop: 12 }}>
					<Field label={t('knowledge.filters.saveName')} required>
						<Input
							value={saveName}
							data-testid="filters-save-name"
							onChange={(e: { target: { value: string } }) => setSaveName(e.target.value)}
						/>
					</Field>
					<Field label={t('knowledge.filters.saveVisibility')}>
						<Select
							value={saveVisibility}
							data-testid="filters-save-visibility"
							options={visibilityOptions(t)}
							onChange={(e: { target: { value: string } }) => setSaveVisibility(e.target.value)}
						/>
					</Field>
					<Checkbox
						checked={savePinned}
						label={t('knowledge.filters.savePin')}
						data-testid="filters-save-pin"
						onChange={setSavePinned}
					/>
					<div>
						<Button
							variant="primary"
							size="sm"
							icon="check"
							disabled={busy || saveName.trim() === ''}
							data-testid="filters-save"
							onClick={saveCurrent}
						>
							{t('knowledge.filters.save')}
						</Button>
					</div>
				</div>
			)}

			<div style={{ display: 'grid', gap: 8, borderTop: `1px solid ${T.bd}`, paddingTop: 12 }}>
				<span style={{ font: `600 13px ${T.sans}` }}>{t('knowledge.filters.saved')}</span>
				{ordered.length === 0 ? (
					<p
						style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter, margin: 0 }}
						data-testid="filters-saved-empty"
					>
						{t('knowledge.filters.savedEmpty')}
					</p>
				) : (
					<ul
						style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}
						data-testid="filters-saved-list"
					>
						{ordered.map((entry) => (
							<li
								key={entry.id}
								data-testid={`filters-saved-${entry.id}`}
								style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
							>
								{entry.pinned && <Icon name="pin" size={14} color={T.acc} />}
								{renamingId === entry.id ? (
									<>
										<Input
											value={renameValue}
											data-testid="filters-rename-input"
											style={{ flex: 1, minWidth: 140 }}
											onChange={(e: { target: { value: string } }) =>
												setRenameValue(e.target.value)
											}
										/>
										<Button
											variant="primary"
											size="sm"
											icon="check"
											disabled={busy || renameValue.trim() === ''}
											data-testid="filters-rename-save"
											onClick={() => commitRename(entry.id)}
										>
											{t('common.action.save')}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											icon="close"
											onClick={() => setRenamingId(null)}
										>
											{t('common.action.cancel')}
										</Button>
									</>
								) : (
									<>
										<span style={{ font: `600 13px ${T.sans}`, flex: 1, minWidth: 120 }}>
											{entry.name}
										</span>
										{/* The count is the LIVE re-run of the stored filter for this actor. */}
										<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
											{t('knowledge.filters.matches', { count: entry.result.totalCount })}
										</span>
										<Chip tone="neutral">
											{t(
												VIS_CHIP[entry.visibility] === 'dm-only'
													? 'common.visibility.dmOnly'
													: 'knowledge.visPlayers',
											)}
										</Chip>
										<Button
											variant="ghost"
											size="sm"
											icon="search"
											data-testid={`filters-apply-${entry.id}`}
											onClick={() => onApply(entry.filter)}
										>
											{t('knowledge.filters.apply')}
										</Button>
										{canAuthor && (
											<>
												<Button
													variant="ghost"
													size="sm"
													icon="pin"
													disabled={busy}
													aria-pressed={entry.pinned}
													data-testid={`filters-pin-${entry.id}`}
													onClick={() =>
														run(
															'content.pin-saved-search',
															{ searchId: entry.id, pinned: !entry.pinned },
															'knowledge.filters.pinFailed',
														)
													}
												>
													{t(entry.pinned ? 'knowledge.filters.unpin' : 'knowledge.filters.pin')}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													icon="edit"
													disabled={busy}
													data-testid={`filters-rename-${entry.id}`}
													onClick={() => {
														setRenamingId(entry.id);
														setRenameValue(entry.name);
													}}
												>
													{t('knowledge.filters.rename')}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													icon="delete"
													disabled={busy}
													data-testid={`filters-delete-${entry.id}`}
													onClick={() =>
														run(
															'content.delete-saved-search',
															{ searchId: entry.id },
															'knowledge.filters.deleteFailed',
														)
													}
												>
													{t('common.action.delete')}
												</Button>
											</>
										)}
									</>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		</>
	);
}
