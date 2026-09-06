import { useState } from 'react';
import { countCoDmActors, type CommandResult } from '@dndtools/core';
import { Avatar, Badge, Button, Select, Toaster } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { Panel, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useAuth } from '../../cloud/AuthContext';
import { isAccountApiConfigured } from '../../cloud/config';
import { coDmSeatsForPlan, useEntitlements } from '../../cloud/entitlements';
import { errMsg } from './shared';
import { InvitesPanel } from './PlayerInvites';
/* ---- Players (REAL — the live actor roster the Core enforces visibility against) ---------------- */
const ROLE_LABEL: Record<string, MessageKey> = {
	dm: 'settings.players.role.dm',
	'co-dm': 'settings.players.role.coDm',
	player: 'settings.players.role.player',
	observer: 'settings.players.role.observer',
};
/** Badge tone per role — the Co-DM shares the DM's accent (elevated), players `info`, observers neutral. */
const roleBadgeTone = (role: string): 'accent' | 'info' | 'neutral' =>
	role === 'dm' || role === 'co-dm' ? 'accent' : role === 'observer' ? 'neutral' : 'info';

export function SettingsPlayers() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const auth = useAuth();
	const ent = useEntitlements();
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	const [inviteOpen, setInviteOpen] = useState(false);
	const actors = Object.values(runtime.state.permissions.actors) as {
		id: string;
		role: string;
		displayName: string;
	}[];
	const sorted = [...actors].sort((a, b) =>
		a.role === 'dm' ? -1 : b.role === 'dm' ? 1 : a.displayName.localeCompare(b.displayName),
	);

	// Co-DM seat entitlement — the plan's seats vs. the live co-DM headcount. The Core `assign-role`
	// command re-checks this and fails closed; the UI mirrors it so the affordance is honest.
	const coDmSeats = coDmSeatsForPlan(ent.plan);
	const coDmInUse = countCoDmActors(runtime.state.permissions);
	const dmActorId = runtime.defaultActorId;
	// The seat count is emphasised mid-sentence, so format the whole sentence and split it around
	// that value rather than freezing English word order into two fragments.
	const seatsUsed = t('settings.players.coDmSeatsUsed', { used: coDmInUse, total: coDmSeats });
	const seatsSentence = t('settings.players.coDmSeats', { seats: seatsUsed });
	const [seatsBefore, seatsAfter = ''] = seatsSentence.split(seatsUsed);

	const assignRole = (
		targetActorId: string,
		role: 'co-dm' | 'player' | 'observer',
		displayName: string,
	) => {
		void runtime
			.dispatch({
				type: 'permission.assign-role',
				actorId: dmActorId,
				payload: { targetActorId, role, coDmSeatLimit: coDmSeats },
			})
			.then((res: CommandResult) => {
				if (res.status !== 'accepted') {
					Toaster.error(res.rejection.message);
					return;
				}
				Toaster.success(
					t('settings.players.roleChanged', { name: displayName, role: t(ROLE_LABEL[role]) }),
				);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.players.roleChangeFailed'))));
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel
				title={t('settings.players.title')}
				action={
					<Button
						variant="primary"
						size="sm"
						icon="add"
						onClick={() => {
							if (cloudReady) setInviteOpen(true);
							else if (isAccountApiConfigured) auth.openAuthModal();
							else Toaster.info(t('settings.players.inviteUnavailable'));
						}}
					>
						{t('settings.players.invite')}
					</Button>
				}
			>
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					{t('settings.players.count', { count: sorted.length })}
				</div>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
					{coDmSeats > 0 ? (
						<>
							{seatsBefore}
							<strong style={{ color: T.ink }}>{seatsUsed}</strong>
							{seatsAfter}
						</>
					) : (
						<>
							{t('settings.players.noCoDmSeats')}{' '}
							{t(
								ent.canChangePlan
									? 'settings.players.tryPlanPreview'
									: 'settings.players.planChangesUnavailable',
							)}
						</>
					)}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{sorted.map((a, i) => {
						const promotable = a.role !== 'dm';
						const roleOptions = [
							{ value: 'player', label: t('settings.players.role.player') },
							{ value: 'observer', label: t('settings.players.role.observer') },
							{
								value: 'co-dm',
								label:
									coDmSeats > 0
										? t('settings.players.coDmOption', { used: coDmInUse, total: coDmSeats })
										: t('settings.players.coDmNoSeats'),
							},
						];
						return (
							<div
								key={a.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 12,
									padding: '10px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<Avatar
									name={a.displayName}
									size="sm"
									ring={a.role === 'dm' || a.role === 'co-dm' ? 'active' : undefined}
								/>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}` }}>{a.displayName}</div>
									<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{a.id}</div>
								</div>
								{/* No presence dot here: this roster has no live session/connection state to derive one
								    from, and a role-derived "live" would be a fake claim. The role badge carries the row. */}
								{promotable ? (
									<span style={{ minWidth: 150 }}>
										<Select
											aria-label={t('settings.players.roleFor', { name: a.displayName })}
											value={a.role}
											onChange={(e: { target: { value: string } }) => {
												const next = e.target.value as 'co-dm' | 'player' | 'observer';
												if (next !== a.role) assignRole(a.id, next, a.displayName);
											}}
											options={roleOptions}
										/>
									</span>
								) : (
									<Badge status={roleBadgeTone(a.role)}>
										{ROLE_LABEL[a.role] ? t(ROLE_LABEL[a.role]) : a.role}
									</Badge>
								)}
							</div>
						);
					})}
				</div>
			</Panel>
			<InvitesPanel
				cloudReady={cloudReady}
				createOpen={inviteOpen}
				onCloseCreate={() => setInviteOpen(false)}
			/>
		</div>
	);
}
