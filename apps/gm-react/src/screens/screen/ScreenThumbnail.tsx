import { findWidgetDefinition } from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import { tileMetadataForDefinition } from '../../app/widgets/tileMeta';
import { WidgetGlyph } from '../../app/canvas/WidgetFrame';
import { Icon } from '../../ds';
import { T } from '../../app/screen-kit';

/** The thumbnail's box. A layout is scaled down into it, never up. */
const THUMB_HEIGHT = 96;
const THUMB_WIDTH = 176;

export interface ThumbnailTile {
	key: string;
	type: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * RC-CAN-7.3 — a screen drawn as a schematic: every tile at its stored position and size, wearing
 * its type's accent rail and icon (the identity the canvas frame and the tile gallery use). It is read
 * from the screen itself, so it changes the moment the layout does. A screen with nothing on it shows
 * its own icon rather than an empty box. Decorative: the card next to it names the screen and says how
 * many widgets it holds.
 */
export function ScreenThumbnail({
	tiles,
	icon = 'widget',
}: {
	tiles: readonly ThumbnailTile[];
	icon?: string;
}) {
	const runtime = useRuntime();
	const frame = {
		position: 'relative' as const,
		height: THUMB_HEIGHT,
		overflow: 'hidden' as const,
		borderRadius: T.radius.sm,
		background: T.sunken,
		border: `1px solid ${T.bd}`,
	};
	if (tiles.length === 0) {
		return (
			<div
				aria-hidden
				data-testid="screen-thumbnail"
				style={{
					...frame,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: T.ter,
				}}
			>
				<Icon name={icon} size="md" />
			</div>
		);
	}
	const left = Math.min(...tiles.map((tile) => tile.x));
	const top = Math.min(...tiles.map((tile) => tile.y));
	const right = Math.max(...tiles.map((tile) => tile.x + tile.w));
	const bottom = Math.max(...tiles.map((tile) => tile.y + tile.h));
	const scale = Math.min(
		THUMB_WIDTH / Math.max(1, right - left),
		(THUMB_HEIGHT - 8) / Math.max(1, bottom - top),
		1,
	);
	return (
		<div aria-hidden data-testid="screen-thumbnail" style={frame}>
			<div
				style={{
					position: 'absolute',
					left: '50%',
					top: '50%',
					width: (right - left) * scale,
					height: (bottom - top) * scale,
					transform: 'translate(-50%, -50%)',
				}}
			>
				{tiles.map((tile) => {
					const definition = findWidgetDefinition(runtime.state.widgets, tile.type);
					const meta = tileMetadataForDefinition(
						definition ?? { category: '', icon: 'widget', description: '' },
					);
					const w = tile.w * scale;
					const h = tile.h * scale;
					return (
						<div
							key={tile.key}
							style={{
								position: 'absolute',
								left: (tile.x - left) * scale,
								top: (tile.y - top) * scale,
								width: w,
								height: h,
								boxSizing: 'border-box',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								overflow: 'hidden',
								border: `1px solid ${T.bd}`,
								borderLeft: `2px solid var(${meta.accentToken})`,
								borderRadius: T.radius.sm,
								background: T.raised,
							}}
						>
							{h >= 14 && w >= 14 && (
								<WidgetGlyph icon={meta.icon} size={10} color={`var(${meta.accentToken})`} />
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
