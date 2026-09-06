import { useState } from 'react';
import {
	describeCapabilitySet,
	listGrantableCapabilitySets,
	type CommandResult,
} from '@dndtools/core';
import { Badge, Button, DataTable, Select, Toaster } from '../../ds';
import { Panel, Seg, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { errMsg } from './shared';
/* ---- Permissions (REAL — real grant list + grant/revoke commands; DM-authored, fail-closed in core) -- */
export function SettingsPermissions() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const actors = runtime.state.permissions.actors as Record<
		string,
		{ id: string; role: string; displayName: string }
	>;
	const grants = runtime.state.permissions.grants;
	const scenes = Object.values(runtime.state.scenes.scenes) as { id: string; name: string }[];
	// Grant targets are players/observers only — a DM / Co-DM already has full authority, so granting to
	// them is meaningless (and a Co-DM must never be a grant target from this owner-only surface).
	const players = Object.values(actors).filter((a) => a.role !== 'dm' && a.role !== 'co-dm');
	const sceneSets = listGrantableCapabilitySets('scene');

	const roleCounts = { dm: 0, 'co-dm': 0, player: 0, observer: 0 } as Record<string, number>;
	for (const a of Object.values(actors)) roleCounts[a.role] = (roleCounts[a.role] ?? 0) + 1;
	const roleCards = [
		{
			id: 'dm',
			name: 'Dungeon Master',
			desc: 'Full authority — authors content, grants, and the live session.',
			tone: 'accent',
		},
		{
			id: 'co-dm',
			name: 'Co-DM',
			desc: 'Sees DM-only content and runs the table, but never manages roles, grants, invites, or the vault.',
			tone: 'accent',
		},
		{
			id: 'player',
			name: 'Player',
			desc: 'Owns their character; sees only what the DM shares.',
			tone: 'info',
		},
		{
			id: 'observer',
			name: 'Observer',
			desc: 'Read-only; never holds character data.',
			tone: 'neutral',
		},
	];

	const [grantPlayer, setGrantPlayer] = useState<string>(players[0]?.id ?? '');
	const [grantScene, setGrantScene] = useState<string>(scenes[0]?.id ?? '');
	const [grantSet, setGrantSet] = useState<string>(sceneSets[0]?.capabilitySet ?? 'viewer');
	const selectedGrantPlayer = players.some((player) => player.id === grantPlayer)
		? grantPlayer
		: (players[0]?.id ?? '');
	const selectedGrantScene = scenes.some((scene) => scene.id === grantScene)
		? grantScene
		: (scenes[0]?.id ?? '');

	const grantRows = grants.map((g) => ({
		grantId: g.id,
		set: describeCapabilitySet(g.entityType, g.capabilitySet)?.label ?? g.capabilitySet,
		type: g.entityType,
		entity: (runtime.state.scenes.scenes as any)[g.entityId]?.name ?? g.entityId,
		to: actors[g.playerActorId]?.displayName ?? g.playerActorId,
		expires: g.expiresAt ? new Date(g.expiresAt).toLocaleDateString() : null,
	}));

	// Revoke is recoverable here (the grant's full shape is in hand), so the toast carries an Undo
	// that re-dispatches the same `permission.grant-capability-set` — mirroring the scene-delete flow.
	const revoke = (grantId: string) => {
		const g = grants.find((x) => x.id === grantId);
		void runtime
			.dispatch({ type: 'permission.revoke-grant', actorId, payload: { grantId } })
			.then((res: CommandResult) => {
				if (res.status !== 'accepted') {
					Toaster.error(res.rejection.message);
					return;
				}
				const who = g ? (actors[g.playerActorId]?.displayName ?? g.playerActorId) : 'the player';
				Toaster.success(`Access revoked for ${who}.`, {
					action: g ? 'Undo' : undefined,
					onAction: g
						? () => {
								void runtime
									.dispatch({
										type: 'permission.grant-capability-set',
										actorId,
										payload: {
											entityType: g.entityType,
											entityId: g.entityId,
											playerActorId: g.playerActorId,
											capabilitySet: g.capabilitySet,
											expiresAt: g.expiresAt ?? null,
										},
									})
									.then((r2: CommandResult) => {
										if (r2.status === 'accepted') Toaster.success(`Access re-granted to ${who}.`);
										else Toaster.error(r2.rejection.message);
									});
							}
						: undefined,
				});
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not revoke that grant.')));
	};
	// Granting is the safety-critical half of this pair, and it used to discard its CommandResult
	// entirely: a REFUSED grant (role ceiling, missing scene, fail-closed core check) left the DM
	// believing a player could see a scene they cannot, and a persist failure was an unhandled
	// rejection. `revoke` above is the model.
	const grant = () => {
		if (!selectedGrantPlayer || !selectedGrantScene) return;
		const who = actors[selectedGrantPlayer]?.displayName ?? selectedGrantPlayer;
		void runtime
			.dispatch({
				type: 'permission.grant-capability-set',
				actorId,
				payload: {
					entityType: 'scene',
					entityId: selectedGrantScene,
					playerActorId: selectedGrantPlayer,
					capabilitySet: grantSet,
					expiresAt: null,
				},
			})
			.then((res: CommandResult) => {
				if (res.status === 'accepted') Toaster.success(`Access granted to ${who}.`);
				else Toaster.error(res.rejection.message);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not grant that access.')));
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Roles">
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
						gap: 12,
					}}
				>
					{roleCards.map((r) => (
						<div
							key={r.id}
							style={{
								padding: 13,
								borderRadius: 10,
								border: `1px solid ${r.tone === 'accent' ? T.accBd : T.bd}`,
								background: T.surf,
							}}
						>
							<div
								style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
							>
								<span
									style={{
										font: `600 13.5px ${T.sans}`,
										color: r.tone === 'accent' ? T.acc : T.ink,
									}}
								>
									{r.name}
								</span>
								<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
									×{roleCounts[r.id] ?? 0}
								</span>
							</div>
							<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginTop: 4 }}>{r.desc}</div>
						</div>
					))}
				</div>
			</Panel>

			<Panel title="Grant scene access">
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					Choose what a player can do in a specific scene. Their role still sets the maximum access
					they can receive, and only the DM can change these grants.
				</div>
				{players.length === 0 || scenes.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						{players.length === 0
							? 'Add a player before granting scene access.'
							: 'Create a scene before granting access.'}
					</div>
				) : (
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
						<span style={{ flex: 1, minWidth: 140 }}>
							<Select
								aria-label="Player"
								value={selectedGrantPlayer}
								onChange={(e: { target: { value: string } }) => setGrantPlayer(e.target.value)}
								options={players.map((pl) => ({ value: pl.id, label: pl.displayName }))}
							/>
						</span>
						<span style={{ flex: 1, minWidth: 140 }}>
							<Select
								aria-label="Scene"
								value={selectedGrantScene}
								onChange={(e: { target: { value: string } }) => setGrantScene(e.target.value)}
								options={scenes.map((sc) => ({ value: sc.id, label: sc.name }))}
							/>
						</span>
						<Seg
							ariaLabel="Capability set"
							value={grantSet}
							onChange={setGrantSet}
							options={sceneSets.map((s) => ({ value: s.capabilitySet, label: s.label }))}
						/>
						<Button variant="primary" size="sm" icon="check" onClick={grant}>
							Grant
						</Button>
					</div>
				)}
			</Panel>

			<Panel title="Active grants" action={<Badge status="neutral">{grants.length}</Badge>}>
				<DataTable
					ariaLabel="Active grants"
					columns={[
						{ key: 'set', header: 'Access', strong: true },
						{ key: 'type', header: 'Type' },
						{ key: 'entity', header: 'Entity' },
						{ key: 'to', header: 'Granted to' },
						{ key: 'expires', header: 'Expires', align: 'right', render: (v: any) => v || '—' },
						{
							key: 'grantId',
							header: '',
							align: 'right',
							render: (id: any) => (
								<Button variant="ghost" size="sm" icon="trash" onClick={() => revoke(id)}>
									Revoke
								</Button>
							),
						},
					]}
					rows={grantRows}
					rowKey={(r: any) => r.grantId}
					empty="No active grants. Use the form above to grant a player scene access."
				/>
			</Panel>
		</div>
	);
}
