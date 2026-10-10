import type { ProjectedPresenceEntry } from '@dndtools/core';
import { Avatar, Badge, HPBar, StatusDot } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
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
const ROLE_LABEL: Record<string, MessageKey> = {
	dm: 'session.roster.role.dm',
	'co-dm': 'session.roster.role.coDm',
	player: 'session.roster.role.player',
	observer: 'session.roster.role.observer',
};
const PRESENCE_LABEL: Record<string, MessageKey> = {
	online: 'status.online',
	away: 'status.away',
	offline: 'status.offline',
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
	const { t } = useI18n();
	const connected = peers.filter((p) => p.connected);
	// One translatable sentence with the Host control named inside it, split around that name so it
	// keeps its emphasis without freezing English word order into two catalog fragments.
	const notHosting = t('session.roster.notHosting', { host: t('session.roster.hostAction') });
	const [hostBefore, hostAfter = ''] = notHosting.split(t('session.roster.hostAction'));
	return (
		<Panel
			title={t('session.roster.title')}
			action={
				hosting ? (
					<Badge status={connected.length > 0 ? 'success' : 'neutral'}>
						{t('session.roster.connectedCount', { count: connected.length })}
					</Badge>
				) : undefined
			}
		>
			{!hosting ? (
				<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>
					{hostBefore}
					<strong style={{ color: T.sub }}>{t('session.roster.hostAction')}</strong>
					{hostAfter}
				</div>
			) : peers.length === 0 ? (
				<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>
					{t('session.roster.hostingEmpty')}
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}>
					{peers.map((p) => {
						const entry = presence.get(p.actorId);
						const status = p.connected ? (entry?.status ?? p.status) : 'offline';
						return (
							<div
								key={p.peerId}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: T.space.three,
									padding: `${T.space.two} ${T.space.three}`,
									borderRadius: T.radius.md,
									border: `1px solid ${p.hand ? T.accBd : T.bd}`,
									background: p.hand ? T.accSub : T.surf,
								}}
							>
								<StatusDot status={status === 'online' ? 'live' : 'idle'} pulse={p.hand} />
								<Avatar name={p.displayName} size="sm" />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											font: `600 var(--text-sm) ${T.sans}`,
											color: T.ink,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
										}}
									>
										{p.displayName}
									</div>
									<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
										{ROLE_LABEL[p.role] ? t(ROLE_LABEL[p.role]) : p.role}
										{p.connected
											? ` · ${PRESENCE_LABEL[status] ? t(PRESENCE_LABEL[status]) : status}`
											: ` · ${t('session.roster.notConnected')}`}
										{entry && entry.device !== 'unknown' ? ` · ${entry.device}` : ''}
									</div>
								</div>
								{p.connected &&
									(p.hand ? (
										<Badge status="accent" icon="flag">
											{t('session.roster.handRaised')}
										</Badge>
									) : p.ready ? (
										<Badge status="success" icon="check">
											{t('session.roster.ready')}
										</Badge>
									) : (
										<Badge status="neutral">{t('status.connected')}</Badge>
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
	const { t } = useI18n();
	return (
		<Panel title={t('session.party.title')}>
			{party.length === 0 ? (
				<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>
					{t('session.party.empty')}
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}>
					{party.map((p) => (
						<div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: T.space.three }}>
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
											gap: T.space.two,
											font: `var(--text-sm) ${T.sans}`,
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
										<span style={{ color: T.sub }}>{t('session.party.noHitPoints')}</span>
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
