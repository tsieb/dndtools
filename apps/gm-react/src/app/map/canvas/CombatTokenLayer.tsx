import {
	useCallback,
	useRef,
	type KeyboardEvent,
	type PointerEvent as ReactPointerEvent,
} from 'react';
import { Avatar, ConditionBadge, HPBar } from '../../../ds';
import { T, srOnly } from '../../screen-kit';
import { useI18n } from '../../../i18n';
import type { MessageKey, MessageValues } from '../../../i18n';
import { useSessionSelection } from '../../session/SessionSelection';
import { clamp01 } from '../mapVocab';
import type { CombatTokenModel, EditorCombat } from './useCombatTokens';

/**
 * RC-MAP-2.1 — the COMBAT TOKEN layer: where the creatures in the running fight are standing, drawn
 * over the map the DM is editing.
 *
 * It is deliberately a separate layer from `MapMarkers`' annotation tokens. An annotation token is a
 * durable piece of the map; a combat token is a combatant in a fight that is happening right now, it
 * lives in the session slice, and it disappears when the fight ends. Drawing them together would
 * invite exactly the confusion the DM cannot afford mid-encounter — dragging the wrong noun.
 *
 * Each token carries the four things a DM reads without stopping to think: WHO (initials, or a
 * portrait once one exists), HOW HURT (a DS `HPBar`), WHAT IS ON THEM (condition mini-badges from the
 * active system package's registry, via `ConditionBadge`), and WHOSE TURN IT IS (the active ring).
 * None of it is derived here — every value arrives already decided by the core's actor-scoped reads,
 * so a token the viewer may not see was never in the list to begin with.
 *
 * Movement dispatches `combat.move-token`, snapped to the grid, and is offered ONLY when the core says
 * `canMove`: a player watching their party's map gets a read-only board rather than a drag that would
 * be refused. The keyboard equivalent is the arrow keys on the focused token, which dispatch the
 * identical command one grid cell at a time (WCAG 2.2 AA, guardrail 8).
 */
export function CombatTokenLayer({
	combat,
	zoom,
	center,
	interactive,
	gridSize,
	snapGrid,
	onMove,
	onSelect,
	announce,
}: {
	combat: EditorCombat;
	zoom: number;
	center: { x: number; y: number };
	/** True when the active tool makes combat tokens clickable/draggable (`COMBAT_TOKEN_TOOLS`). */
	interactive: boolean;
	/** Grid divisions across the map, or 0 when the map has no grid. */
	gridSize: number;
	snapGrid: boolean;
	/** Dispatch `combat.move-token`; resolves false when the core refused. */
	onMove: (combatantId: string, position: { x: number; y: number }) => Promise<boolean>;
	/** Told what the shared selection became, so the editor can show the combatant in the Inspector. */
	onSelect?: (combatantId: string | null) => void;
	announce: (message: string) => void;
}) {
	const { t } = useI18n();
	const { selectedCombatantId, selectCombatant, toggleCombatant } = useSessionSelection();
	const layerRef = useRef<HTMLDivElement>(null);
	// The in-flight drag. Held in a ref (not state) so a pointermove never re-renders the whole layer;
	// the dragged token follows the pointer through its own inline transform instead.
	const dragRef = useRef<{
		combatantId: string;
		startPos: { x: number; y: number };
		sx: number;
		sy: number;
		moved: boolean;
	} | null>(null);
	// A drag ends with a `click` on the token button when it started there; without this the move
	// would be immediately followed by a selection toggle that clears the very token just moved.
	const draggedRef = useRef(false);

	/** Normalized map point -> fraction of the viewport, matching MapCanvas's own marker transform. */
	const toVisual = useCallback(
		(p: { x: number; y: number }) => ({
			x: (p.x - center.x) * zoom + 0.5,
			y: (p.y - center.y) * zoom + 0.5,
		}),
		[center.x, center.y, zoom],
	);

	const snap = useCallback(
		(p: { x: number; y: number }) => {
			if (!snapGrid || gridSize <= 0) return { x: clamp01(p.x), y: clamp01(p.y) };
			return {
				x: clamp01(Math.round(p.x * gridSize) / gridSize),
				y: clamp01(Math.round(p.y * gridSize) / gridSize),
			};
		},
		[gridSize, snapGrid],
	);

	const commitMove = useCallback(
		(token: CombatTokenModel, position: { x: number; y: number }) => {
			const target = snap(position);
			if (target.x === token.position.x && target.y === token.position.y) return;
			void onMove(token.combatantId, target).then((accepted) => {
				if (accepted) announce(t('mapCombat.moved', { name: token.name }));
			});
		},
		[announce, onMove, snap, t],
	);

	const onPointerDown = (token: CombatTokenModel) => (event: ReactPointerEvent<HTMLElement>) => {
		if (!interactive || !token.canMove || event.button !== 0) return;
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		selectCombatant(token.combatantId);
		onSelect?.(token.combatantId);
		dragRef.current = {
			combatantId: token.combatantId,
			startPos: token.position,
			sx: event.clientX,
			sy: event.clientY,
			moved: false,
		};
	};

	const onPointerMove = (token: CombatTokenModel) => (event: ReactPointerEvent<HTMLElement>) => {
		const drag = dragRef.current;
		const rect = layerRef.current?.getBoundingClientRect();
		if (!drag || drag.combatantId !== token.combatantId || !rect || rect.width === 0) return;
		const dx = event.clientX - drag.sx;
		const dy = event.clientY - drag.sy;
		// 4px of slop so a click that trembles is still a click, not a one-pixel move command.
		if (!drag.moved && Math.hypot(dx, dy) < 4) return;
		drag.moved = true;
		const el = event.currentTarget as HTMLElement;
		el.style.transform = `translate(-50%,-50%) translate(${dx}px, ${dy}px)`;
	};

	const onPointerUp = (token: CombatTokenModel) => (event: ReactPointerEvent<HTMLElement>) => {
		const drag = dragRef.current;
		const rect = layerRef.current?.getBoundingClientRect();
		dragRef.current = null;
		const el = event.currentTarget as HTMLElement;
		el.style.transform = 'translate(-50%,-50%)';
		if (!drag || drag.combatantId !== token.combatantId || !drag.moved || !rect) return;
		draggedRef.current = true;
		if (rect.width === 0 || rect.height === 0) return;
		commitMove(token, {
			x: drag.startPos.x + (event.clientX - drag.sx) / rect.width / zoom,
			y: drag.startPos.y + (event.clientY - drag.sy) / rect.height / zoom,
		});
	};

	/** Arrow keys are the drag's keyboard equivalent: one grid cell (or 2% of the map without a grid). */
	const onKeyDown = (token: CombatTokenModel) => (event: KeyboardEvent<HTMLElement>) => {
		const step = gridSize > 0 ? 1 / gridSize : 0.02;
		const delta =
			event.key === 'ArrowLeft'
				? { x: -step, y: 0 }
				: event.key === 'ArrowRight'
					? { x: step, y: 0 }
					: event.key === 'ArrowUp'
						? { x: 0, y: -step }
						: event.key === 'ArrowDown'
							? { x: 0, y: step }
							: null;
		if (!delta) return;
		event.preventDefault();
		event.stopPropagation();
		if (!token.canMove) {
			announce(t('mapCombat.cannotMove', { name: token.name }));
			return;
		}
		selectCombatant(token.combatantId);
		onSelect?.(token.combatantId);
		commitMove(token, { x: token.position.x + delta.x, y: token.position.y + delta.y });
	};

	if (!combat.running || combat.tokens.length === 0) return null;

	return (
		<div
			ref={layerRef}
			role="group"
			aria-label={t('mapCombat.layer')}
			style={{
				position: 'absolute',
				inset: 0,
				zIndex: 5,
				pointerEvents: 'none',
				overflow: 'hidden',
			}}
		>
			{combat.tokens.map((token) => {
				const v = toVisual(token.position);
				if (v.x < -0.1 || v.x > 1.1 || v.y < -0.1 || v.y > 1.1) return null;
				const selected = token.combatantId === selectedCombatantId;
				const diameter = Math.round(40 * Math.min(2, Math.max(1, token.size)));
				const shownConditions = token.conditions.slice(0, 3);
				const extraConditions = token.conditions.length - shownConditions.length;
				// The ring is the turn signal. It is an OUTLINE, not a box-shadow, because a box-shadow
				// is not painted under `forced-colors: active` (the same reason DS `Avatar` uses one).
				const ring = token.isActive
					? `3px solid ${T.acc}`
					: selected
						? `3px solid var(--color-interactive-selected)`
						: 'none';
				return (
					<div
						key={token.combatantId}
						onPointerDown={onPointerDown(token)}
						onPointerMove={onPointerMove(token)}
						onPointerUp={onPointerUp(token)}
						onPointerCancel={onPointerUp(token)}
						style={{
							position: 'absolute',
							left: `${v.x * 100}%`,
							top: `${v.y * 100}%`,
							transform: 'translate(-50%,-50%)',
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							gap: 3,
							width: Math.max(diameter, 72),
							pointerEvents: interactive ? 'auto' : 'none',
							touchAction: 'none',
							zIndex: token.isActive || selected ? 2 : 1,
						}}
					>
						<button
							type="button"
							aria-label={t('mapCombat.token', {
								name: token.name,
								status: tokenStatus(t, token),
							})}
							aria-pressed={selected}
							title={token.name}
							disabled={!interactive}
							onKeyDown={onKeyDown(token)}
							onClick={() => {
								if (draggedRef.current) {
									draggedRef.current = false;
									return;
								}
								const next = selected ? null : token.combatantId;
								toggleCombatant(token.combatantId);
								onSelect?.(next);
							}}
							style={{
								position: 'relative',
								width: diameter,
								height: diameter,
								padding: 0,
								borderRadius: '50%',
								border: `1px solid ${T.bdS}`,
								outline: ring,
								outlineOffset: -1,
								background: T.surf,
								boxShadow: T.ssm,
								opacity: token.isDefeated ? 0.55 : 1,
								cursor: !interactive ? 'default' : token.canMove ? 'grab' : 'pointer',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							<Avatar name={token.name} size={token.size >= 2 ? 'lg' : 'md'} />
						</button>
						<span
							style={{
								maxWidth: '100%',
								font: `600 10px ${T.sans}`,
								color: T.ink,
								background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)',
								padding: '1px 5px',
								borderRadius: 4,
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
							}}
						>
							{token.name}
						</span>
						{token.maxHp !== null && token.hp !== null && (
							<div style={{ width: '100%' }}>
								<HPBar current={token.hp} max={token.maxHp} size="sm" showText={false} />
								<span style={srOnly}>
									{t('mapCombat.hp', { hp: token.hp, maxHp: token.maxHp })}
								</span>
							</div>
						)}
						{shownConditions.length > 0 && (
							<div
								style={{
									display: 'flex',
									flexWrap: 'wrap',
									justifyContent: 'center',
									gap: 2,
								}}
							>
								{shownConditions.map((condition) => (
									<ConditionBadge key={condition} condition={condition} compact />
								))}
								{extraConditions > 0 && (
									<span style={{ font: `600 10px ${T.mono}`, color: T.sub }}>
										{t('mapCombat.moreConditions', { count: extraConditions })}
									</span>
								)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

/** The non-visual half of a token's label: turn, hit points, and defeated state, in words. */
function tokenStatus(
	t: (key: MessageKey, values?: MessageValues) => string,
	token: CombatTokenModel,
): string {
	const parts: string[] = [];
	if (token.isActive) parts.push(t('mapCombat.status.active'));
	if (token.hp !== null && token.maxHp !== null) {
		parts.push(t('mapCombat.hp', { hp: token.hp, maxHp: token.maxHp }));
	}
	if (token.isDefeated) parts.push(t('mapCombat.status.down'));
	return parts.join(' · ');
}
