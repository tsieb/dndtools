import { Link } from 'react-router-dom';
import type { ScreenListEntry } from '@dndtools/core';
import { Badge, Button, Card, Chip } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { T } from '../../app/screen-kit';
import { screenPath, visibilityLabelKey } from './screenModel';
import { ScreenMetaEditor } from './ScreenMetaEditor';
import { ScreenThumbnail } from './ScreenThumbnail';

export interface ScreenCardActions {
	onTogglePin: () => void;
	onToggleRename: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
	onSaveMeta: (meta: {
		name: string;
		description: string;
		tags: string[];
	}) => Promise<string | null>;
}

/** RC-CAN-8.7 — a card action is a labelled button at the touch-target floor, never a bare glyph. */
const ACTION_STYLE = {
	flex: '1 1 auto',
	minHeight: 'var(--touch-target-min)',
	justifyContent: 'center',
} as const;

/**
 * One screen in the library: a thumbnail of its layout, its name (the link that opens it), its
 * visibility named for what it is, the live and pinned markers, and — for the GM — pin, rename,
 * duplicate and delete. The thumbnail and the name are one link, so a screen is a single tab stop to
 * open, followed by its actions.
 *
 * RC-CAN-8.7 — the actions carry their word as well as their icon ("Pin", "Rename", …) and meet the
 * 44px touch floor: four 16px glyphs left the GM guessing which one deletes. Each button's accessible
 * name still names the screen ("Rename Ford ambush") and starts with its visible word.
 */
export function ScreenCard({
	entry,
	name,
	editable,
	renaming,
	busy,
	actions,
}: {
	entry: ScreenListEntry;
	name: string;
	editable: boolean;
	renaming: boolean;
	busy: boolean;
	actions: ScreenCardActions;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	// The thumbnail is drawn from the stored layout. Only the GM is shown it: a player's card must not
	// sketch tiles from sections they are not delivered (their `widgetCount` is scoped the same way).
	const scene = editable ? runtime.state.scenes.scenes[entry.id] : undefined;
	const tiles = (scene?.widgets ?? []).map((widget) => ({
		key: widget.id,
		type: widget.type,
		...widget.layout,
	}));
	const muted = { font: `var(--text-xs) ${T.sans}`, color: T.sub };
	return (
		<li data-testid={`screen-card-${entry.id}`} style={{ listStyle: 'none', minWidth: 0 }}>
			<Card
				elevation="flat"
				padding="sm"
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: T.space.two,
					height: '100%',
					boxSizing: 'border-box',
				}}
			>
				<Link
					to={screenPath(entry.id)}
					data-testid={`screen-open-${entry.id}`}
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: T.space.two,
						color: 'inherit',
						textDecoration: 'none',
						minWidth: 0,
					}}
				>
					<ScreenThumbnail
						tiles={tiles}
						icon={entry.layoutPolicy === 'flow' ? 'layout-list' : 'widget'}
					/>
					<h3
						style={{
							margin: T.space.zero,
							font: `600 var(--text-sm) ${T.sans}`,
							color: T.ink,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{name}
					</h3>
				</Link>
				<div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: T.space.one }}>
					<Badge
						status={entry.visibility === 'dm-only' ? 'neutral' : 'info'}
						icon={entry.visibility === 'dm-only' ? 'lock' : 'eye'}
					>
						{t(visibilityLabelKey(entry.visibility))}
					</Badge>
					{entry.isLive && <Badge status="success">{t('screens.live')}</Badge>}
					{entry.pinned && (
						<Badge status="neutral" icon="pin">
							{t('screens.pinned')}
						</Badge>
					)}
					<span style={muted}>
						{t('screens.cardMeta', {
							policy: t(
								entry.layoutPolicy === 'flow' ? 'screens.policy.flow' : 'screens.policy.canvas',
							),
							count: entry.widgetCount,
						})}
					</span>
				</div>
				{entry.tags.length > 0 && (
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: T.space.one }}>
						{entry.tags.map((tag) => (
							<Chip key={tag} icon="tag">
								{tag}
							</Chip>
						))}
					</div>
				)}
				{editable && (
					<div
						role="group"
						aria-label={t('screens.actionsFor', { name })}
						data-testid={`screen-actions-${entry.id}`}
						// The buttons size to their words and wrap: two to a row in a library column, all
						// four in one on a phone's full-width card, in whatever lengths the locale has.
						style={{ display: 'flex', flexWrap: 'wrap', gap: T.space.one, marginTop: 'auto' }}
					>
						<Button
							icon="pin"
							aria-label={t(entry.pinned ? 'screens.unpinNamed' : 'screens.pinNamed', { name })}
							aria-pressed={entry.pinned}
							variant={entry.pinned ? 'accent' : 'ghost'}
							size="sm"
							disabled={busy}
							onClick={actions.onTogglePin}
							style={ACTION_STYLE}
						>
							{t(entry.pinned ? 'screens.action.unpin' : 'screens.action.pin')}
						</Button>
						<Button
							icon="edit"
							aria-label={t('screens.renameNamed', { name })}
							aria-expanded={renaming}
							variant="ghost"
							size="sm"
							onClick={actions.onToggleRename}
							style={ACTION_STYLE}
						>
							{t('screens.action.rename')}
						</Button>
						<Button
							icon="duplicate"
							aria-label={t('screens.duplicateNamed', { name })}
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={actions.onDuplicate}
							style={ACTION_STYLE}
						>
							{t('screens.action.duplicate')}
						</Button>
						<Button
							icon="delete"
							aria-label={t('screens.deleteNamed', { name })}
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={actions.onDelete}
							style={ACTION_STYLE}
						>
							{t('screens.action.delete')}
						</Button>
					</div>
				)}
				{renaming && (
					<ScreenMetaEditor
						idBase={`screen-meta-${entry.id}`}
						name={entry.name}
						description={entry.description}
						tags={entry.tags}
						onSave={actions.onSaveMeta}
						onClose={actions.onToggleRename}
					/>
				)}
			</Card>
		</li>
	);
}
