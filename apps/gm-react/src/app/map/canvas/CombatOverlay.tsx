import { type MapCombatTokenView } from '@dndtools/core';
import { Avatar } from '../../../ds';
import { T, srOnly } from '../../screen-kit';
import { useI18n } from '../../../i18n';
import { type Point } from './geometry';

/**
 * RC-MAP-2.3 — the READ-ONLY combat overlay: where the creatures in the running fight are standing,
 * drawn on every surface that shows a map rather than only inside the editor.
 *
 * It reads `MapView.combatTokens`, which the core has ALREADY filtered for the viewing actor
 * (`getMapViewForActor` joins the combat slice through the same rule the combat tracker applies), so
 * a combatant this actor may not see is simply absent from the list — there is nothing here that
 * could leak one, and no visibility decision is taken in the interface. A surface opts in by asking
 * for the view with `{ combat }`; a surface that does not gets an empty list and draws nothing.
 *
 * Deliberately inert: no button, no drag, `pointerEvents: 'none'`. Moving a combatant is an
 * authoring gesture and it belongs to the editor's interactive `CombatTokenLayer` (RC-MAP-2.1) — a
 * control here that could not dispatch anything would be a dead control. Because nothing is
 * focusable there is no keyboard equivalent to owe: the whole layer is one labelled image instead.
 */
export function CombatOverlay({
	tokens,
	toVisual,
	compact = false,
}: {
	/** Already actor-filtered combat tokens from `MapView.combatTokens`. */
	tokens: readonly MapCombatTokenView[];
	/** Normalized map point -> fraction of the viewport (the canvas's zoom/pan transform). */
	toVisual: (point: Point) => Point;
	/** Small surfaces (the session stage preview) drop the name plate and shrink the disc. */
	compact?: boolean;
}) {
	const { t } = useI18n();
	if (tokens.length === 0) return null;
	const names = tokens.map((token) => token.name).join(', ');
	return (
		<div
			role="group"
			aria-label={t('mapCombat.overlay', { names })}
			style={{
				position: 'absolute',
				inset: 0,
				zIndex: 5,
				pointerEvents: 'none',
				overflow: 'hidden',
			}}
		>
			{tokens.map((token) => {
				const v = toVisual(token.position);
				if (v.x < -0.1 || v.x > 1.1 || v.y < -0.1 || v.y > 1.1) return null;
				const base = compact ? 32 : 40;
				const diameter = Math.round(base * Math.min(2, Math.max(1, token.size)));
				// An OUTLINE, not a box-shadow: box-shadows are not painted under `forced-colors: active`,
				// and "whose turn is it" must survive high contrast (same reasoning as DS `Avatar`).
				return (
					<div
						key={token.combatantId}
						style={{
							position: 'absolute',
							left: `${v.x * 100}%`,
							top: `${v.y * 100}%`,
							transform: 'translate(-50%,-50%)',
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							gap: 2,
							zIndex: token.isActive ? 2 : 1,
						}}
					>
						<div
							style={{
								width: diameter,
								height: diameter,
								borderRadius: '50%',
								border: `1px solid ${T.bdS}`,
								outline: token.isActive ? `3px solid ${T.acc}` : 'none',
								outlineOffset: -1,
								background: T.surf,
								boxShadow: T.ssm,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							<Avatar name={token.name} size={compact ? 'sm' : token.size >= 2 ? 'lg' : 'md'} />
						</div>
						{!compact && (
							<span
								style={{
									font: `600 10px ${T.sans}`,
									color: T.ink,
									background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)',
									padding: '1px 5px',
									borderRadius: 4,
									maxWidth: 96,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
								}}
							>
								{token.name}
							</span>
						)}
						{compact && <span style={srOnly}>{token.name}</span>}
					</div>
				);
			})}
		</div>
	);
}
