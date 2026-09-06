import { useState, type CSSProperties, type ReactNode } from 'react';
import { type SceneListEntry } from '@dndtools/core';
import { Icon, StatusDot } from '../../ds';
import { useCloudSync } from '../../cloud/CloudSyncContext';
import { useSession } from '../../net/SessionContext';
import { T } from '../screen-kit';

/* The shared sidebar row vocabulary: a section row, a scene row, a group heading, and the DM
 * presence hook the sidebar footer reads. Extracted from AppShell.tsx unchanged (RC-STB-2.6);
 * the phone "More" sheet reuses SideRow so the two navigations stay one IA. */

export type SceneStatus = 'live' | 'ready' | 'draft';
const SCENE_STATUS: Record<SceneStatus, { dot: 'live' | 'idle' | 'off'; label: string }> = {
	live: { dot: 'live', label: 'Live' },
	ready: { dot: 'idle', label: 'Ready' },
	draft: { dot: 'off', label: 'Draft' },
};

export function sceneStatus(scene: SceneListEntry, activeSceneId: string | null): SceneStatus {
	if (scene.id === activeSceneId) return 'live';
	return scene.visibility === 'dm-only' ? 'draft' : 'ready';
}

/**
 * A scene row in the sidebar Scenes library: a status indicator (lock for drafts, pulsing dot when
 * live) + name / status line. Clicking opens the real `/scene/:id` canvas editor.
 */
export function SceneSideRow({
	scene,
	status,
	active,
	onOpen,
}: {
	scene: SceneListEntry;
	status: SceneStatus;
	active?: boolean;
	onOpen: () => void;
}) {
	const [hov, setHov] = useState(false);
	const st = SCENE_STATUS[status];
	const sub = scene.tags[0] ? `${st.label} · ${scene.tags[0]}` : st.label;
	return (
		<div
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			style={{ position: 'relative' }}
		>
			<button
				type="button"
				onClick={onOpen}
				aria-current={active ? 'page' : undefined}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					width: '100%',
					padding: '7px 10px',
					border: 'none',
					borderRadius: 8,
					cursor: 'pointer',
					textAlign: 'left',
					position: 'relative',
					background: active ? T.accSub : hov ? T.hover : 'transparent',
					transition: 'background var(--duration-fast) var(--easing-standard)',
				}}
			>
				{active && (
					<span
						style={{
							position: 'absolute',
							left: -6,
							top: 7,
							bottom: 7,
							width: 3,
							borderRadius: 3,
							background: T.acc,
						}}
					/>
				)}
				<span style={{ flex: '0 0 auto', display: 'inline-flex' }}>
					{status === 'draft' ? (
						<Icon name="lock" size={14} color={T.ter} />
					) : (
						<StatusDot status={st.dot === 'off' ? 'idle' : st.dot} pulse={status === 'live'} />
					)}
				</span>
				<span style={{ flex: 1, minWidth: 0 }}>
					<span
						style={{
							display: 'block',
							font: `${active ? 600 : 500} 13px ${T.sans}`,
							color: active ? T.acc : T.ink,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{scene.name}
					</span>
					<span
						style={{
							display: 'block',
							font: `10.5px ${T.sans}`,
							color: T.ter,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{sub}
					</span>
				</span>
			</button>
		</div>
	);
}

export function SideRow({
	icon,
	label,
	sub,
	active,
	badge,
	onClick,
	color,
	right,
}: {
	icon: string;
	label: ReactNode;
	sub?: ReactNode;
	active?: boolean;
	badge?: ReactNode;
	onClick: () => void;
	color?: string;
	right?: ReactNode;
}) {
	const [hov, setHov] = useState(false);
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			aria-current={active ? 'page' : undefined}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				width: '100%',
				padding: '8px 10px',
				border: 'none',
				borderRadius: 8,
				cursor: 'pointer',
				textAlign: 'left',
				position: 'relative',
				background: active ? T.accSub : hov ? T.hover : 'transparent',
				color: active ? T.acc : T.sub,
				transition:
					'background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard)',
			}}
		>
			{active && (
				<span
					style={{
						position: 'absolute',
						left: -6,
						top: 8,
						bottom: 8,
						width: 3,
						borderRadius: 3,
						background: T.acc,
					}}
				/>
			)}
			<Icon name={icon} size="sm" color={active ? T.acc : color || 'currentColor'} />
			<span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
				<span
					style={{
						display: 'block',
						font: `${active ? 600 : 500} 13.5px ${T.sans}`,
						color: active ? T.acc : T.ink,
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{label}
				</span>
				{sub && (
					<span
						style={{
							display: 'block',
							font: `11px ${T.sans}`,
							color: T.ter,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{sub}
					</span>
				)}
			</span>
			{badge}
			{right}
		</button>
	);
}

/**
 * The DM-footer presence dot — REAL state, not a hardcoded "Online": the live P2P session role wins
 * (hosting / joined), then the cloud-backup engine (error / backing up / current), else the honest
 * local-only baseline. The label doubles as the row's status caption.
 */
export function usePresenceStatus(): { dot: 'live' | 'idle' | 'error' | 'pending'; label: string } {
	const session = useSession();
	const cloud = useCloudSync();
	if (session.role === 'host') {
		const n = session.peers.length;
		return {
			dot: 'live',
			label:
				n > 0
					? `Hosting — ${n} ${n === 1 ? 'player' : 'players'} connected`
					: 'Hosting — waiting for players',
		};
	}
	if (session.role === 'joined') return { dot: 'live', label: 'Connected to a table' };
	if (cloud.available && cloud.enabled) {
		const es = cloud.engineStatus;
		if (es?.lastError)
			return { dot: 'error', label: 'Cloud backup error — see Settings → Backup & history' };
		if (es?.busy) return { dot: 'pending', label: 'Backing up…' };
		return {
			dot: 'live',
			label: es?.lastSyncedAt ? 'Cloud backup up to date' : 'Cloud backup on',
		};
	}
	return { dot: 'idle', label: 'Local-only — this device' };
}

export function SideGroup({
	label,
	action,
	children,
}: {
	label: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	const eb: CSSProperties = {
		font: `600 11px ${T.sans}`,
		letterSpacing: '.09em',
		textTransform: 'uppercase',
		color: T.ter,
	};
	return (
		<div style={{ marginTop: 14 }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '0 10px 6px',
				}}
			>
				<span style={eb}>{label}</span>
				{action}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</div>
		</div>
	);
}
