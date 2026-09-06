import { Button, Field, Icon, Select, VisibilityChip } from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import { type Actor, type Character, type CharacterView } from '@dndtools/core';
import { Panel, T } from '../../../app/screen-kit';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { visChip } from '../shared';
import { useI18n } from '../../../i18n';

/** The DM-only sharing editor — entity visibility plus the explicit `sharedWith` delivery list.
 * Fail-closed: nothing here widens by default. Extracted from Characters.tsx unchanged
 * (RC-STB-2.6). */
export function SharingPanel({
	view,
	record,
	players,
	shareDraft,
	setShareDraft,
	applySharing,
}: {
	view: CharacterView;
	record: Character;
	players: Actor[];
	shareDraft: { visibility: string; sharedWith: string[] } | null;
	setShareDraft: (
		next:
			| ({ visibility: string; sharedWith: string[] } | null)
			| ((
					previous: { visibility: string; sharedWith: string[] } | null,
			  ) => { visibility: string; sharedWith: string[] } | null),
	) => void;
	applySharing: () => Promise<void>;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	return (
		<>
			{/* Sharing — the DM-only `character.set-sharing` (entity visibility + the explicit
					    `sharedWith` delivery list). Fail-closed: nothing here widens by default; the DM
					    states the audience and applies it in one command. */}
			<Panel
				title={t('characters.sharing')}
				action={
					shareDraft === null ? (
						<Button
							variant="secondary"
							size="sm"
							icon="visibility-players"
							onClick={() =>
								setShareDraft({
									visibility: record.visibility,
									sharedWith: [...record.sharedWith],
								})
							}
						>
							{t('characters.change')}
						</Button>
					) : undefined
				}
			>
				{shareDraft ? (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Field label={t('characters.whoCanSee')}>
							<Select
								value={shareDraft.visibility}
								onChange={(e: DSChangeEvent) =>
									setShareDraft((d) => ({ ...d!, visibility: e.target.value }))
								}
								options={[
									{ value: 'dm-only', label: t('common.visibility.dmOnly') },
									{ value: 'player-visible', label: t('characters.allPlayers') },
									{ value: 'shared', label: t('characters.specificPlayers') },
								]}
							/>
						</Field>
						{shareDraft.visibility === 'shared' &&
							(players.length > 0 ? (
								<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
									{players.map((p) => {
										const on = shareDraft.sharedWith.includes(p.id);
										return (
											<button
												key={p.id}
												type="button"
												aria-pressed={on}
												onClick={() =>
													setShareDraft((d) => ({
														...d!,
														sharedWith: on
															? d!.sharedWith.filter((x) => x !== p.id)
															: [...d!.sharedWith, p.id],
													}))
												}
												style={{
													display: 'inline-flex',
													alignItems: 'center',
													gap: 5,
													padding: '4px 10px',
													borderRadius: 16,
													cursor: 'pointer',
													font: `12px ${T.sans}`,
													border: `1px solid ${on ? T.accBd : T.bd}`,
													background: on ? T.accSub : T.surf,
													color: on ? T.acc : T.ter,
												}}
											>
												{on && <Icon name="check" size={12} />}
												{p.displayName}
											</button>
										);
									})}
								</div>
							) : (
								<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
									{t('characters.noPlayersYet')}
								</div>
							))}
						<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
							<Button variant="ghost" size="sm" onClick={() => setShareDraft(null)}>
								{t('common.action.cancel')}
							</Button>
							<Button variant="primary" size="sm" onClick={applySharing}>
								{t('characters.applySharing')}
							</Button>
						</div>
					</div>
				) : (
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
						<VisibilityChip level={visChip(view.visibility)} />
						<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
							{view.visibility === 'dm-only'
								? t('characters.shareHidden')
								: view.visibility === 'shared'
									? record.sharedWith.length > 0
										? t('characters.sharedWith', {
												names: record.sharedWith
													.map((aid) => runtime.state.permissions.actors[aid]?.displayName ?? aid)
													.join(', '),
											})
										: t('characters.sharedWithNobody')
									: t('characters.shareAllPlayers')}
						</span>
					</div>
				)}
			</Panel>
		</>
	);
}
