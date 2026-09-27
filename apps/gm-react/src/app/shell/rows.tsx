import { useLocation, useNavigate } from 'react-router-dom';
import { listPinnedScreens } from '@dndtools/core';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useScreens, useScreenActions } from '../../screens/screen/useScreens';
import { screenPath, SCREENS_PATH, visibilityLabelKey } from '../../screens/screen/screenModel';
import { useSessionPosture } from './session-posture';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { type SceneListEntry } from '@dndtools/core';
import { Icon, IconButton, Menu, StatusDot, Toaster } from '../../ds';
import { useCloudSync } from '../../cloud/CloudSyncContext';
import { useSession } from '../../net/SessionContext';
import { T, srOnly } from '../screen-kit';

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

/* A sidebar row is a fixed ~189px rail, so a single nowrap line silently ate the tail of any label
 * or caption longer than English's. RC-UX-1.5's pseudo locale (+40%) clipped four of these outright.
 * Wrapping to a second line costs nothing in English — every shipped string still fits one line — and
 * the two-line clamp keeps a pathological user-supplied scene name from growing the row without
 * bound. `anywhere` covers a single unbreakable token that is wider than the rail on its own. */
const ROW_TEXT = {
	display: '-webkit-box',
	WebkitBoxOrient: 'vertical' as const,
	WebkitLineClamp: 2,
	overflow: 'hidden',
	overflowWrap: 'anywhere' as const,
};

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
				minWidth: 0,
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
						...ROW_TEXT,
						font: `${active ? 600 : 500} 13.5px ${T.sans}`,
						color: active ? T.acc : T.ink,
					}}
				>
					{label}
				</span>
				{sub && <span style={{ ...ROW_TEXT, font: `11px ${T.sans}`, color: T.ter }}>{sub}</span>}
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

// The same actor-filtered, durable order as the library and header switcher.
const PIN_TEXT = {
	actions: (name: string) => `Actions for ${name}`,
	up: 'Move up',
	down: 'Move down',
	keys: 'Reorder with Alt+ArrowUp or Alt+ArrowDown',
	moved: (name: string, index: number, count: number) =>
		`${name}, position ${index + 1} of ${count}`,
};

export function PinnedScreenRows({ onOpen }: { onOpen?: () => void }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const { entries, nameOf } = useScreens();
	const { setPinned } = useScreenActions();
	const pins = entries.filter((entry) => entry.pinned);
	const isDm = runtime.state.permissions.actors[runtime.defaultActorId]?.role === 'dm';
	const navigate = useNavigate();
	const location = useLocation();
	const posture = useSessionPosture();
	const busy = useRef(false);
	const dragged = useRef<string | null>(null);
	const [notice, setNotice] = useState('');
	const [menu, setMenu] = useState<string | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const open = (path: string, createScreen = false) => {
		onOpen?.();
		navigate(path, createScreen ? { state: { createScreen: true } } : undefined);
	};
	async function reorder(id: string, target: string) {
		if (!isDm || busy.current || id === target) return;
		// Core requires the COMPLETE pin set, including pins outside an actor-filtered view.
		const ids = listPinnedScreens(runtime.state.scenes).map((entry) => entry.id);
		const from = ids.indexOf(id),
			to = ids.indexOf(target);
		if (from < 0 || to < 0) return;
		ids.splice(from, 1);
		ids.splice(to, 0, id);
		busy.current = true;
		try {
			const result = await runtime.dispatch({
				type: 'scene.reorder-pins',
				actorId: runtime.defaultActorId,
				payload: { sceneIds: ids },
			});
			if (result.status === 'rejected')
				Toaster.error(result.rejection.message ?? t('screens.failed'));
			else
				setNotice(PIN_TEXT.moved(nameOf(pins.find((entry) => entry.id === id)!), to, ids.length));
		} catch {
			Toaster.error(t('screens.notSaved'));
		} finally {
			busy.current = false;
		}
	}
	async function unpin(id: string) {
		if (busy.current) return;
		busy.current = true;
		const error = await setPinned(id, false);
		busy.current = false;
		if (error) Toaster.error(error);
		else setMenu(null);
	}
	return (
		<SideGroup
			label={t('screens.title')}
			action={
				isDm ? (
					<IconButton
						icon="add"
						label={t('screens.new.open')}
						variant="ghost"
						size="sm"
						style={onOpen ? { minWidth: 44, minHeight: 44 } : undefined}
						onClick={() => open(SCREENS_PATH, true)}
					/>
				) : undefined
			}
		>
			<div data-testid="pinned-screens" role="list" aria-label={t('screens.pinned')}>
				{pins.map((entry, index) => {
					const name = nameOf(entry);
					const live = entry.isLive && posture.live;
					return (
						<div
							key={entry.id}
							role="listitem"
							data-screen-pin={entry.id}
							aria-keyshortcuts={isDm ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
							draggable={isDm}
							onDragStart={(event) => {
								dragged.current = entry.id;
								event.dataTransfer.setData('text/plain', entry.id);
								event.dataTransfer.effectAllowed = 'move';
							}}
							onDragEnd={() => {
								dragged.current = null;
							}}
							onDragOver={(event) => {
								if (isDm && dragged.current) event.preventDefault();
							}}
							onDrop={(event) => {
								event.preventDefault();
								const id = dragged.current;
								dragged.current = null;
								if (id) void reorder(id, entry.id);
							}}
							onKeyDown={(event) => {
								if (!isDm || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
								event.preventDefault();
								const target = pins[index + (event.key === 'ArrowUp' ? -1 : 1)];
								if (target) void reorder(entry.id, target.id);
							}}
						>
							<div
								className={live ? 'session-live-ring' : undefined}
								style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}
							>
								<SideRow
									icon={entry.layoutPolicy === 'flow' ? 'layout-list' : 'widget'}
									label={name}
									sub={
										live
											? [t('screens.live'), posture.elapsed].filter(Boolean).join(' · ')
											: t(visibilityLabelKey(entry.visibility))
									}
									active={location.pathname === screenPath(entry.id)}
									onClick={() => open(screenPath(entry.id))}
								/>
								{isDm && (
									<IconButton
										icon="more"
										label={PIN_TEXT.actions(name)}
										title={PIN_TEXT.keys}
										aria-haspopup="menu"
										aria-expanded={menu === entry.id}
										variant="ghost"
										style={{ minWidth: 44, minHeight: 44 }}
										onClick={(event) => {
											triggerRef.current = event.currentTarget;
											setMenu(menu === entry.id ? null : entry.id);
										}}
									/>
								)}
							</div>
							{menu === entry.id && (
								<Menu
									title={PIN_TEXT.actions(name)}
									width={220}
									triggerRef={triggerRef}
									onClose={() => setMenu(null)}
								>
									{[
										{
											label: PIN_TEXT.up,
											disabled: index === 0,
											run: () => reorder(entry.id, pins[index - 1]!.id),
										},
										{
											label: PIN_TEXT.down,
											disabled: index === pins.length - 1,
											run: () => reorder(entry.id, pins[index + 1]!.id),
										},
										{
											label: t('screens.unpinNamed', { name }),
											disabled: false,
											run: () => unpin(entry.id),
										},
									].map((action) => (
										<button
											key={action.label}
											type="button"
											role="menuitem"
											disabled={action.disabled}
											onClick={() => {
												void action.run();
											}}
											style={{
												display: 'block',
												width: '100%',
												minHeight: 44,
												color: T.ink,
												background: T.surf,
												border: 0,
												textAlign: 'left',
												padding: T.space.two,
											}}
										>
											{action.label}
										</button>
									))}
								</Menu>
							)}
						</div>
					);
				})}
			</div>
			<span role="status" style={srOnly}>
				{notice}
			</span>
			<div style={{ display: 'flex', minHeight: onOpen ? 44 : undefined }}>
				<SideRow
					icon="layout-list"
					label={t('screens.all')}
					active={location.pathname === SCREENS_PATH}
					onClick={() => open(SCREENS_PATH)}
				/>
			</div>
		</SideGroup>
	);
}
