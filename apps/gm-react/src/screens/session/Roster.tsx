import type { ProjectedPresenceEntry } from '@dndtools/core';
import { Avatar, Badge, HPBar, StatusDot } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import type { HostPeer } from '../../net/SessionHost';

// ── Table roster (COLLAB-004 — connected players + live presence) ─────────────────────────────────

/**
 * RosterPanel — who is at the table right now. Connection + the hand-raised / ready hints come from
 * the P2P host's peer roster; the online/away status and device come from the CORE presence state via
 * its projection query (`projectSessionPresence` — the model `session.set-presence` writes when a
 * player's presence beat arrives). Honest when there is no transport: not hosting ⇒ it says how to
 * host, hosting with nobody joined ⇒ it says players appear as they connect.
 */
// Roles and presence arrive as machine tokens; these are the words players and DMs actually read.
const ROLE_LABEL: Record<string, string> = {
	dm: 'DM',
	'co-dm': 'Co-DM',
	player: 'Player',
	observer: 'Observer',
};
const PRESENCE_LABEL: Record<string, string> = {
	online: 'Online',
	away: 'Away',
	offline: 'Offline',
};

export function RosterPanel({
	hosting,
	peers,
	presence,
}: {
	hosting: boolean;
	peers: HostPeer[];
	presence: Map<string, ProjectedPresenceEntry>;
}) {
	const connected = peers.filter((p) => p.connected);
	return (
		<Panel
			title="Table roster"
			action={
				hosting ? (
					<Badge status={connected.length > 0 ? 'success' : 'neutral'}>
						{connected.length} connected
					</Badge>
				) : undefined
			}
		>
			{!hosting ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					No live table yet. Use <strong style={{ color: T.sub }}>Host</strong> in the top bar to
					open your table — players appear here as they connect.
				</div>
			) : peers.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					Hosting — no players yet. Invite from the Host panel; players appear here as they connect.
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{peers.map((p) => {
						const entry = presence.get(p.actorId);
						const status = p.connected ? (entry?.status ?? p.status) : 'offline';
						return (
							<div
								key={p.peerId}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '8px 10px',
									borderRadius: 9,
									border: `1px solid ${p.hand ? T.accBd : T.bd}`,
									background: p.hand ? T.accSub : T.surf,
								}}
							>
								<StatusDot status={status === 'online' ? 'live' : 'idle'} pulse={p.hand} />
								<Avatar name={p.displayName} size="sm" />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											font: `600 13px ${T.sans}`,
											color: T.ink,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
										}}
									>
										{p.displayName}
									</div>
									<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
										{ROLE_LABEL[p.role] ?? p.role}
										{p.connected
											? ` · ${PRESENCE_LABEL[status] ?? status}`
											: ' · Invited — not connected yet'}
										{entry && entry.device !== 'unknown' ? ` · ${entry.device}` : ''}
									</div>
								</div>
								{p.connected &&
									(p.hand ? (
										<Badge status="accent" icon="flag">
											Hand raised
										</Badge>
									) : p.ready ? (
										<Badge status="success" icon="check">
											Ready
										</Badge>
									) : (
										<Badge status="neutral">Connected</Badge>
									))}
							</div>
						);
					})}
				</div>
			)}
		</Panel>
	);
}

export function PartyPanel({
	party,
}: {
	party: { id: string; name: string; combat?: { hp: number; maxHp: number } }[];
}) {
	return (
		<Panel title="Party">
			{party.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No player characters yet.</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{party.map((p) => (
						<div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
							<div style={{ flex: 1, minWidth: 0 }}>
								{/* `?? 0` / `?? 1` painted an EMPTY RED bar reading "0/1" for anyone
								    without hit points recorded — i.e. the panel asserted the character
								    was dead. It is reachable in one click: character-query strips the
								    whole `combat` block for a non-DM viewer, so previewing as a player
								    reported the entire party at 0 HP. Absent numbers are absent. */}
								{p.combat && typeof p.combat.maxHp === 'number' && p.combat.maxHp > 0 ? (
									<HPBar current={p.combat.hp ?? 0} max={p.combat.maxHp} label={p.name} size="sm" />
								) : (
									<div
										style={{
											display: 'flex',
											justifyContent: 'space-between',
											gap: 8,
											font: `13px ${T.sans}`,
											color: T.sub,
										}}
									>
										<span
											style={{
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap',
											}}
										>
											{p.name}
										</span>
										<span style={{ color: T.ter }}>No hit points recorded</span>
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</Panel>
	);
}
