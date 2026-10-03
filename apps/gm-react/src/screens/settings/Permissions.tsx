import { SettingsSection } from './Experience';
import { useState } from 'react';
import {
	describeCapabilitySet,
	listGrantableCapabilitySets,
	type CommandResult,
} from '@dndtools/core';
import { Badge, Button, DataTable, Select, Toaster } from '../../ds';
import { Panel, Seg, T, srOnly, useSingleColumn } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { errMsg, humanizeEntity } from './shared';
/* ---- Permissions (REAL — real grant list + grant/revoke commands; DM-authored, fail-closed in core) -- */
export function SettingsPermissions() {
	const { t, formatDate } = useI18n();
	const runtime = useRuntime();
	const singleColumn = useSingleColumn();
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
	const roleCards: { id: string; name: MessageKey; desc: MessageKey; tone: string }[] = [
		{
			id: 'dm',
			name: 'settings.permissions.role.dm',
			desc: 'settings.permissions.role.dmDesc',
			tone: 'accent',
		},
		{
			id: 'co-dm',
			name: 'settings.permissions.role.coDm',
			desc: 'settings.permissions.role.coDmDesc',
			tone: 'accent',
		},
		{
			id: 'player',
			name: 'settings.permissions.role.player',
			desc: 'settings.permissions.role.playerDesc',
			tone: 'info',
		},
		{
			id: 'observer',
			name: 'settings.permissions.role.observer',
			desc: 'settings.permissions.role.observerDesc',
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

	// A grant names its target by id; the table names it the way the rest of the app does. An id the
	// vault no longer resolves reads as an unnamed item rather than printing the raw UUID.
	const entityName = (entityType: string, entityId: string): string =>
		(entityType === 'scene'
			? runtime.state.scenes.scenes[entityId]?.name
			: entityType === 'character'
				? runtime.state.characters.characters[entityId]?.name
				: runtime.state.content.items[entityId]?.title) || t('settings.permissions.unnamedItem');
	const grantRows = grants.map((g) => {
		const set = describeCapabilitySet(g.entityType, g.capabilitySet)?.label ?? g.capabilitySet;
		const entity = entityName(g.entityType, g.entityId);
		const to = actors[g.playerActorId]?.displayName ?? t('settings.permissions.thePlayer');
		return {
			grantId: g.id,
			set,
			type: humanizeEntity(g.entityType),
			entity,
			to,
			expires: g.expiresAt ? formatDate(new Date(g.expiresAt)) : null,
			revokeLabel: t('settings.permissions.revokeFor', { access: set, item: entity, name: to }),
		};
	});
	/** One row of the active-grants table; `DataTable`'s props are untyped, so `rowKey` says so. */
	type GrantRow = (typeof grantRows)[number];

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
				const who = g
					? (actors[g.playerActorId]?.displayName ?? g.playerActorId)
					: t('settings.permissions.thePlayer');
				Toaster.success(t('settings.permissions.revoked', { name: who }), {
					action: g ? t('common.action.undo') : undefined,
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
										if (r2.status === 'accepted')
											Toaster.success(t('settings.permissions.regranted', { name: who }));
										else Toaster.error(r2.rejection.message);
									});
							}
						: undefined,
				});
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.permissions.revokeFailed'))));
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
				if (res.status === 'accepted')
					Toaster.success(t('settings.permissions.granted', { name: who }));
				else Toaster.error(res.rejection.message);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.permissions.grantFailed'))));
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.four }}>
			<SettingsSection gateKey="settings.permissions.roles">
				<Panel title={t('settings.permissions.roles')}>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
							gap: T.space.three,
						}}
					>
						{roleCards.map((r) => (
							<div
								key={r.id}
								style={{
									padding: T.space.three,
									borderRadius: T.radius.md,
									border: `1px solid ${r.tone === 'accent' ? T.accBd : T.bd}`,
									background: T.surf,
								}}
							>
								<div
									style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
								>
									<span
										style={{
											font: `600 var(--text-sm) ${T.sans}`,
											color: r.tone === 'accent' ? T.acc : T.ink,
										}}
									>
										{t(r.name)}
									</span>
									<span style={{ font: `var(--text-xs) ${T.mono}`, color: T.sub }}>
										×{roleCounts[r.id] ?? 0}
									</span>
								</div>
								<div
									style={{
										font: `var(--text-xs)/1.5 ${T.sans}`,
										color: T.sub,
										marginTop: T.space.one,
									}}
								>
									{t(r.desc)}
								</div>
							</div>
						))}
					</div>
				</Panel>
			</SettingsSection>

			<SettingsSection gateKey="settings.permissions.grantTitle">
				<Panel title={t('settings.permissions.grantTitle')}>
					<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
						{t('settings.permissions.grantIntro')}
					</div>
					{players.length === 0 || scenes.length === 0 ? (
						<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>
							{t(
								players.length === 0
									? 'settings.permissions.needPlayer'
									: 'settings.permissions.needScene',
							)}
						</div>
					) : (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: T.space.three,
								flexWrap: 'wrap',
							}}
						>
							<span style={{ flex: 1, minWidth: 140 }}>
								<Select
									aria-label={t('settings.permissions.player')}
									value={selectedGrantPlayer}
									onChange={(e: { target: { value: string } }) => setGrantPlayer(e.target.value)}
									options={players.map((pl) => ({ value: pl.id, label: pl.displayName }))}
								/>
							</span>
							<span style={{ flex: 1, minWidth: 140 }}>
								<Select
									aria-label={t('settings.permissions.scene')}
									value={selectedGrantScene}
									onChange={(e: { target: { value: string } }) => setGrantScene(e.target.value)}
									options={scenes.map((sc) => ({ value: sc.id, label: sc.name }))}
								/>
							</span>
							<Seg
								ariaLabel={t('settings.permissions.capabilitySet')}
								value={grantSet}
								onChange={setGrantSet}
								options={sceneSets.map((s) => ({ value: s.capabilitySet, label: s.label }))}
							/>
							<Button variant="primary" size="sm" icon="check" onClick={grant}>
								{t('settings.permissions.grant')}
							</Button>
						</div>
					)}
				</Panel>
			</SettingsSection>

			<SettingsSection gateKey="settings.permissions.activeGrants">
				<Panel
					title={t('settings.permissions.activeGrants')}
					action={<Badge status="neutral">{grants.length}</Badge>}
				>
					{singleColumn ? (
						// A six-column table cannot fit a phone: "Granted to" and Revoke were cut off the
						// right edge. The phone reads one grant per row instead.
						grantRows.length === 0 ? (
							<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>
								{t('settings.permissions.noGrants')}
							</div>
						) : (
							<ul
								aria-label={t('settings.permissions.activeGrants')}
								style={{ listStyle: 'none', margin: T.space.zero, padding: T.space.zero }}
							>
								{grantRows.map((row, i) => (
									<li
										key={row.grantId}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: T.space.three,
											padding: `${T.space.three} ${T.space.zero}`,
											borderTop: i ? `1px solid ${T.bd}` : 'none',
										}}
									>
										<div style={{ flex: 1, minWidth: 0 }}>
											<div style={{ font: `600 var(--text-sm) ${T.sans}`, color: T.ink }}>
												{row.entity}
											</div>
											<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
												{t('settings.permissions.grantLine', {
													access: row.set,
													type: row.type,
													name: row.to,
												})}
												{row.expires ? ` · ${row.expires}` : ''}
											</div>
										</div>
										<Button
											variant="ghost"
											size="sm"
											icon="trash"
											aria-label={row.revokeLabel}
											onClick={() => revoke(row.grantId)}
										>
											{t('settings.permissions.revoke')}
										</Button>
									</li>
								))}
							</ul>
						)
					) : (
						<DataTable
							ariaLabel={t('settings.permissions.activeGrants')}
							columns={[
								{ key: 'set', header: t('settings.permissions.colAccess'), strong: true },
								{ key: 'type', header: t('settings.permissions.colType') },
								{ key: 'entity', header: t('settings.permissions.colEntity') },
								{ key: 'to', header: t('settings.permissions.colGrantedTo') },
								{
									key: 'expires',
									header: t('settings.permissions.colExpires'),
									align: 'right',
									render: (v: string | null) => v || '—',
								},
								{
									key: 'grantId',
									header: <span style={srOnly}>{t('settings.permissions.colActions')}</span>,
									align: 'right',
									render: (id: string, row: GrantRow) => (
										<Button
											variant="ghost"
											size="sm"
											icon="trash"
											aria-label={row.revokeLabel}
											onClick={() => revoke(id)}
										>
											{t('settings.permissions.revoke')}
										</Button>
									),
								},
							]}
							rows={grantRows}
							rowKey={(r: GrantRow) => r.grantId}
							empty={t('settings.permissions.noGrants')}
						/>
					)}
				</Panel>
			</SettingsSection>
		</div>
	);
}
