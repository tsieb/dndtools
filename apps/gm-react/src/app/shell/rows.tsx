import { useLocation, useNavigate } from 'react-router-dom';
import { listPinnedScreens } from '@dndtools/core';
import { useI18n, type MessageKey } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useScreens, useScreenActions } from '../../screens/screen/useScreens';
import { screenPath, SCREENS_PATH, visibilityLabelKey } from '../../screens/screen/screenModel';
import { useSessionPosture } from './session-posture';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { type SceneListEntry } from '@dndtools/core';
import { Icon, IconButton, Menu, StatusDot, Toaster } from '../../ds';
import { T, srOnly } from '../screen-kit';

/* The shared sidebar row vocabulary: a section row, a scene row, a group heading, and the DM
 * presence hook the sidebar footer reads. Extracted from AppShell.tsx unchanged (RC-STB-2.6);
 * the phone "More" sheet reuses SideRow so the two navigations stay one IA. */

export type SceneStatus = 'live' | 'ready' | 'draft';
const SCENE_STATUS: Record<SceneStatus, { dot: 'live' | 'idle' | 'off'; label: MessageKey }> = {
	live: { dot: 'live', label: 'shell.sceneLive' },
	ready: { dot: 'idle', label: 'shell.sceneReady' },
	draft: { dot: 'off', label: 'shell.sceneDraft' },
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
	const { t } = useI18n();
	const st = SCENE_STATUS[status];
	const sub = scene.tags[0] ? `${t(st.label)} · ${scene.tags[0]}` : t(st.label);
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
					gap: 'var(--space-2)',
					width: '100%',
					minHeight: 'var(--touch-target-min)',
					padding: 'var(--space-2) var(--space-2)',
					border: 'none',
					borderRadius: 'var(--radius-md)',
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
							borderRadius: 'var(--radius-sm)',
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
							color: T.ink,
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
							color: T.sub,
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
				gap: 'var(--space-2)',
				width: '100%',
				minHeight: 'var(--touch-target-min)',
				minWidth: 0,
				padding: 'var(--space-2) var(--space-2)',
				border: 'none',
				borderRadius: 'var(--radius-md)',
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
						borderRadius: 'var(--radius-sm)',
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
						color: T.ink,
					}}
				>
					{label}
				</span>
				{sub && <span style={{ ...ROW_TEXT, font: `11px ${T.sans}`, color: T.sub }}>{sub}</span>}
			</span>
			{badge}
			{right}
		</button>
	);
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
		color: T.sub,
	};
	return (
		<div style={{ marginTop: 'var(--space-3)' }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: 'var(--space-0) var(--space-2) var(--space-1-5)',
				}}
			>
				<span style={eb}>{label}</span>
				{action}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)' }}>
				{children}
			</div>
		</div>
	);
}

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
				setNotice(
					t('shell.pinMoved', {
						name: nameOf(pins.find((entry) => entry.id === id)!),
						position: to + 1,
						count: ids.length,
					}),
				);
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
										label={t('shell.pinActions', { name })}
										title={t('shell.pinKeys')}
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
									title={t('shell.pinActions', { name })}
									width={220}
									triggerRef={triggerRef}
									onClose={() => setMenu(null)}
								>
									{[
										{
											label: t('shell.pinUp'),
											disabled: index === 0,
											run: () => reorder(entry.id, pins[index - 1]!.id),
										},
										{
											label: t('shell.pinDown'),
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
