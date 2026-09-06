import { Button, Field, Icon, Select, VisibilityChip } from '../../../ds';
import { type Actor, type Character, type CharacterView } from '@dndtools/core';
import { Panel, T } from '../../../app/screen-kit';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { visChip } from '../shared';

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
	const runtime = useRuntime();
	return (
		<>
			{/* Sharing — the DM-only `character.set-sharing` (entity visibility + the explicit
					    `sharedWith` delivery list). Fail-closed: nothing here widens by default; the DM
					    states the audience and applies it in one command. */}
			<Panel
				title="Sharing"
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
							Change
						</Button>
					) : undefined
				}
			>
				{shareDraft ? (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Field label="Who can see this character">
							<Select
								value={shareDraft.visibility}
								onChange={(e: any) => setShareDraft((d) => ({ ...d!, visibility: e.target.value }))}
								options={[
									{ value: 'dm-only', label: 'DM only' },
									{ value: 'player-visible', label: 'All players' },
									{ value: 'shared', label: 'Specific players' },
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
									No players yet — add a player in Settings first.
								</div>
							))}
						<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
							<Button variant="ghost" size="sm" onClick={() => setShareDraft(null)}>
								Cancel
							</Button>
							<Button variant="primary" size="sm" onClick={applySharing}>
								Apply
							</Button>
						</div>
					</div>
				) : (
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
						<VisibilityChip level={visChip(view.visibility)} />
						<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
							{view.visibility === 'dm-only'
								? 'Hidden from players until you share it.'
								: view.visibility === 'shared'
									? record.sharedWith.length > 0
										? `Shared with ${record.sharedWith.map((aid) => runtime.state.permissions.actors[aid]?.displayName ?? aid).join(', ')}.`
										: 'Shared, but delivered to no one yet.'
									: 'Visible to all players.'}
						</span>
					</div>
				)}
			</Panel>
		</>
	);
}
