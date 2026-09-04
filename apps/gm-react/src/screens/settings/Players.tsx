import { useState } from 'react';
import { countCoDmActors, type CommandResult } from '@dndtools/core';
import { Avatar, Badge, Button, Select, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useAuth } from '../../cloud/AuthContext';
import { isAccountApiConfigured } from '../../cloud/config';
import { coDmSeatsForPlan, useEntitlements } from '../../cloud/entitlements';
import { errMsg } from './shared';
import { InvitesPanel } from './PlayerInvites';
/* ---- Players (REAL — the live actor roster the Core enforces visibility against) ---------------- */
const ROLE_LABEL: Record<string, string> = {
	dm: 'Dungeon Master',
	'co-dm': 'Co-DM',
	player: 'Player',
	observer: 'Observer',
};
/** Badge tone per role — the Co-DM shares the DM's accent (elevated), players `info`, observers neutral. */
const roleBadgeTone = (role: string): 'accent' | 'info' | 'neutral' =>
	role === 'dm' || role === 'co-dm' ? 'accent' : role === 'observer' ? 'neutral' : 'info';

export function SettingsPlayers() {
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
				Toaster.success(`${displayName} is now ${ROLE_LABEL[role]}.`);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not change that role.')));
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel
				title="Players"
				action={
					<Button
						variant="primary"
						size="sm"
						icon="add"
						onClick={() => {
							if (cloudReady) setInviteOpen(true);
							else if (isAccountApiConfigured) auth.openAuthModal();
							else
								Toaster.info(
									'Online invite links are unavailable here — share a live-table code directly.',
								);
						}}
					>
						Invite player
					</Button>
				}
			>
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					{sorted.length} {sorted.length === 1 ? 'person' : 'people'} in this campaign. Each person
					sees only the scenes and tools their role allows.
				</div>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
					{coDmSeats > 0 ? (
						<>
							Co-DM seats:{' '}
							<strong style={{ color: T.ink }}>
								{coDmInUse} of {coDmSeats}
							</strong>{' '}
							used. A Co-DM sees your DM-only content and can run the table, but never manages
							roles, grants, invites, or the vault.
						</>
					) : (
						<>
							Your plan has no Co-DM seats.{' '}
							{ent.canChangePlan
								? 'You can try the Lantern or Beacon preview at no charge to promote a trusted player.'
								: 'Plan changes are unavailable in this release.'}
						</>
					)}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{sorted.map((a, i) => {
						const promotable = a.role !== 'dm';
						const roleOptions = [
							{ value: 'player', label: 'Player' },
							{ value: 'observer', label: 'Observer' },
							{
								value: 'co-dm',
								label: coDmSeats > 0 ? `Co-DM (${coDmInUse}/${coDmSeats})` : 'Co-DM (no seats)',
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
											aria-label={`Role for ${a.displayName}`}
											value={a.role}
											onChange={(e: { target: { value: string } }) => {
												const next = e.target.value as 'co-dm' | 'player' | 'observer';
												if (next !== a.role) assignRole(a.id, next, a.displayName);
											}}
											options={roleOptions}
										/>
									</span>
								) : (
									<Badge status={roleBadgeTone(a.role)}>{ROLE_LABEL[a.role] ?? a.role}</Badge>
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
