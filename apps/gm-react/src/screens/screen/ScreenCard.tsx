import { Link } from 'react-router-dom';
import type { ScreenListEntry } from '@dndtools/core';
import { Badge, Card, Chip, IconButton } from '../../ds';
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

/**
 * One screen in the library: a thumbnail of its layout, its name (the link that opens it), its
 * visibility named for what it is, the live and pinned markers, and — for the GM — pin, rename,
 * duplicate and delete. The thumbnail and the name are one link, so a screen is a single tab stop to
 * open, followed by its actions.
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
						style={{ display: 'flex', flexWrap: 'wrap', gap: T.space.one, marginTop: 'auto' }}
					>
						<IconButton
							icon="pin"
							label={t(entry.pinned ? 'screens.unpinNamed' : 'screens.pinNamed', { name })}
							aria-pressed={entry.pinned}
							variant={entry.pinned ? 'accent' : 'ghost'}
							size="sm"
							disabled={busy}
							onClick={actions.onTogglePin}
						/>
						<IconButton
							icon="edit"
							label={t('screens.renameNamed', { name })}
							aria-expanded={renaming}
							variant="ghost"
							size="sm"
							onClick={actions.onToggleRename}
						/>
						<IconButton
							icon="duplicate"
							label={t('screens.duplicateNamed', { name })}
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={actions.onDuplicate}
						/>
						<IconButton
							icon="delete"
							label={t('screens.deleteNamed', { name })}
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={actions.onDelete}
						/>
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
