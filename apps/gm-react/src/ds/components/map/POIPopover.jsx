import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Popover } from '../core/Popover.jsx';
import { SegmentedControl } from '../forms/SegmentedControl.jsx';
import { Button } from '../core/Button.jsx';

/**
 * POIPopover — the point-of-interest detail panel (UX-MAP-010). Built on Popover, so it inherits
 * the leak-safe dismissal model (outside-pointerdown, never pointerleave — MAP-015/AP-8): the
 * pointer can travel from the marker into the popover and operate its actions without it closing.
 *
 * POI visibility is its OWN axis, independent of layer/map visibility (MAP-011) — the visibility
 * control here never changes the layer. Authoring controls (visibility, Edit, Delete) are DM-only;
 * pass `readOnly` for the player view, which shows just the name, category, and linked note.
 *
 * RC-MAP-3.10 — when the POI links a note, `poi.notePreview` renders the note's opening THREE lines
 * (clamped, never the whole body) with a "Read note" action. The preview is whatever the caller's
 * actor-scoped read returned: the popover never reaches for content itself, so a player can only
 * ever be handed a preview of a note the core already decided they may see.
 */
const CAT = {
	location: { icon: 'poi', color: 'var(--layer-poi)' },
	quest: { icon: 'flag', color: 'var(--layer-political)' },
	danger: { icon: 'warning', color: 'var(--color-status-error)' },
	npc: { icon: 'characters-person', color: 'var(--layer-player)' },
	treasure: { icon: 'sparkle', color: 'var(--color-accent)' },
	note: { icon: 'note-edit', color: 'var(--layer-custom)' },
};

export function POIPopover({
	poi = {},
	anchor,
	readOnly = false,
	onClose,
	onVisibilityChange,
	onFocus,
	onEdit,
	onDeepLink,
	onDelete,
	onOpenNote,
	...rest
}) {
	const {
		name = 'Untitled POI',
		category = 'location',
		categoryLabel,
		linkedNote,
		notePreview,
		visibility = 'dm-only',
	} = poi;
	const c = CAT[category] || CAT.location;

	const badge = (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 4,
				padding: '2px var(--space-1-5)',
				borderRadius: 'var(--radius-full)',
				background: `color-mix(in oklab, ${c.color} 16%, var(--color-surface))`,
				color: c.color,
				border: `1px solid color-mix(in oklab, ${c.color} 55%, transparent)`,
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-2xs)',
				fontWeight: 'var(--font-weight-bold)',
				letterSpacing: 'var(--tracking-wide)',
				textTransform: 'uppercase',
			}}
		>
			<Icon name={c.icon} size={11} /> {categoryLabel || category}
		</span>
	);

	return (
		<Popover
			anchor={anchor}
			onClose={onClose}
			title={name}
			headerAccessory={badge}
			width={320}
			{...rest}
			footer={
				<>
					<Button size="sm" variant="primary" icon="tool-crosshair" onClick={onFocus}>
						Focus on map
					</Button>
					{!readOnly && (
						<Button size="sm" variant="ghost" icon="edit" onClick={onEdit}>
							Edit
						</Button>
					)}
					<Button
						size="sm"
						variant="ghost"
						icon="link"
						onClick={onDeepLink}
						aria-label={`Copy link to ${name}`}
					>
						Copy link
					</Button>
					{!readOnly && (
						<Button
							size="sm"
							variant="danger"
							icon="delete"
							onClick={onDelete}
							aria-label={`Delete ${name}`}
							style={{ marginLeft: 'auto' }}
						>
							Delete
						</Button>
					)}
				</>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
				{linkedNote && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								fontFamily: 'var(--font-sans)',
								fontSize: 'var(--text-sm)',
							}}
						>
							<Icon name="link" size={13} />
							<span style={{ color: 'var(--color-text-tertiary)' }}>Linked note</span>
							<span style={{ color: 'var(--color-text-primary)' }}>{linkedNote}</span>
						</div>
						{notePreview && (
							<p
								style={{
									margin: 0,
									fontFamily: 'var(--font-sans)',
									fontSize: 'var(--text-xs)',
									lineHeight: 1.5,
									color: 'var(--color-text-secondary)',
									display: '-webkit-box',
									WebkitBoxOrient: 'vertical',
									WebkitLineClamp: 3,
									overflow: 'hidden',
									whiteSpace: 'pre-line',
								}}
							>
								{notePreview}
							</p>
						)}
						{onOpenNote && (
							<Button
								size="sm"
								variant="secondary"
								icon="knowledge-book"
								onClick={onOpenNote}
								aria-label={`Read note ${linkedNote}`}
							>
								Read note
							</Button>
						)}
					</div>
				)}
				{!readOnly && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
						<span
							style={{
								fontFamily: 'var(--font-sans)',
								fontSize: 'var(--text-xs)',
								color: 'var(--color-text-tertiary)',
								letterSpacing: 'var(--tracking-wide)',
								textTransform: 'uppercase',
							}}
						>
							Visibility
						</span>
						<SegmentedControl
							fullWidth
							size="sm"
							ariaLabel="Point of interest visibility"
							value={visibility}
							onChange={onVisibilityChange}
							options={[
								{ value: 'dm-only', label: 'DM only' },
								{ value: 'players', label: 'Players' },
								{ value: 'shared', label: 'Shared' },
							]}
						/>
						<span
							style={{
								fontFamily: 'var(--font-sans)',
								fontSize: 'var(--text-2xs)',
								color: 'var(--color-text-tertiary)',
							}}
						>
							Independent of the layer — a DM-only POI never appears in player lists or search.
						</span>
					</div>
				)}
			</div>
		</Popover>
	);
}
