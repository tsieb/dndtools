import React from 'react';
import { icons } from 'lucide-react';

/**
 * The DND Tools icon registry — semantic names → Lucide PascalCase glyph names.
 * Mirrors src/lib/gui/icons.ts in the production app: Lucide is the ONLY icon family
 * (clean 2px stroke), and every surface draws through this one registry so there is one
 * family at one weight — no "icon soup". Status keys each map to a DISTINCT shape so
 * meaning survives grayscale (A11Y-011).
 *
 * Port note: the design-package Icon read glyph geometry from the global `lucide` UMD
 * (window.lucide). For a self-contained, offline-capable build we resolve the same glyphs
 * through `lucide-react`'s `icons` record (PascalName → component). Same family, same stroke.
 */
export const ICON_REGISTRY = {
	// Global navigation sections
	home: 'House',
	'session-bolt': 'Zap',
	'characters-person': 'Users',
	'atlas-map': 'Map',
	'campaign-scroll': 'Scroll',
	'knowledge-book': 'BookOpen',
	'settings-gear': 'Settings',
	// Status — each a distinct shape (non-color cue)
	success: 'CircleCheck',
	warning: 'TriangleAlert',
	error: 'CircleX',
	info: 'Info',
	// Visibility / actor-safety
	'dm-only': 'Eye',
	hidden: 'EyeOff',
	'visibility-shared': 'Users',
	'visibility-players': 'Eye',
	'visibility-hidden': 'EyeOff',
	'visibility-mixed': 'Layers',
	// Common actions / affordances
	close: 'X',
	check: 'Check',
	add: 'Plus',
	search: 'Search',
	more: 'Ellipsis',
	'chevron-down': 'ChevronDown',
	'chevron-right': 'ChevronRight',
	'chevron-left': 'ChevronLeft',
	'chevron-up': 'ChevronUp',
	retry: 'RotateCcw',
	loading: 'LoaderCircle',
	move: 'Move',
	pin: 'Pin',
	recent: 'Clock',
	// Display preferences
	motion: 'Sparkles',
	density: 'Gauge',
	theme: 'Sun',
	accessibility: 'Accessibility',
	// Game / live-play extras
	dice: 'Dices',
	heart: 'Heart',
	shield: 'Shield',
	sword: 'Swords',
	audio: 'Volume2',
	'audio-off': 'VolumeX',
	play: 'Play',
	pause: 'Pause',
	skip: 'SkipForward',
	send: 'Send',
	flag: 'Flag',
	sparkle: 'Sparkles',
	scroll: 'Scroll',
	wand: 'Wand',
	book: 'BookOpen',
	map: 'Map',
	link: 'Link2',
	// Command Center — hub navigation & authoring
	scene: 'LayoutDashboard',
	widget: 'LayoutGrid',
	'new-character': 'UserPlus',
	'new-map': 'MapPlus',
	'note-edit': 'NotebookPen',
	players: 'UsersRound',
	permissions: 'ShieldCheck',
	vault: 'DatabaseZap',
	connection: 'Plug',
	lock: 'Lock',
	unlock: 'LockOpen',
	enter: 'LogIn',

	// ── Maps — view controls (UX-MAP-001/002/003) ─────────────────────────────────────────
	'zoom-in': 'ZoomIn',
	'zoom-out': 'ZoomOut',
	'zoom-fit': 'Maximize',
	globe: 'Globe',
	minimap: 'Map',
	nested: 'PictureInPicture2',
	'new-map-alt': 'MapPlus',
	import: 'Import',
	upload: 'CloudUpload',
	undo: 'Undo2',
	redo: 'Redo2',
	preview: 'Eye',
	generate: 'Wand',
	shuffle: 'Shuffle',
	seed: 'Sprout',

	// ── Maps — drawing / fog tool palette (UX-MAP-007) ────────────────────────────────────
	'tool-select': 'MousePointer2',
	'tool-brush': 'Brush',
	'tool-stamp': 'Stamp',
	'tool-shape': 'Pentagon',
	'tool-eraser': 'Eraser',
	'tool-text': 'Type',
	'tool-fill': 'PaintBucket',
	'tool-route': 'Route',
	'tool-ruler': 'Ruler',
	'tool-aoe': 'Cone',
	'tool-grid': 'Grid3x3',
	'tool-token': 'Circle',
	'tool-magnet': 'Magnet',
	'tool-crosshair': 'Crosshair',
	reveal: 'Sun',
	conceal: 'Cloud',
	feather: 'Feather',

	// ── Maps — layer-type glyphs (UX-MAP-005) ─────────────────────────────────────────────
	'layer-base': 'Mountain',
	'layer-height': 'Spline',
	'layer-political': 'Flag',
	'layer-climate': 'CloudSun',
	'layer-roads': 'Waypoints',
	'layer-water': 'Waves',
	'layer-wshed': 'Droplets',
	'layer-fog': 'CloudFog',
	'layer-poi': 'MapPin',
	'layer-dm': 'PencilLine',
	'layer-player': 'UsersRound',
	'layer-combat': 'Swords',
	'layer-custom': 'Tag',

	// ── Maps — layer-row & POI affordances (UX-MAP-004/010) ───────────────────────────────
	'drag-handle': 'GripVertical',
	layers: 'Layers',
	opacity: 'Blend',
	duplicate: 'Copy',
	delete: 'Trash2',
	edit: 'Pencil',
	group: 'Group',
	tag: 'Tag',
	poi: 'MapPin',
	waypoint: 'Circle',
	distance: 'Ruler',
	travel: 'Footprints',
	validate: 'ShieldCheck',
	'arrow-left': 'ArrowLeft',

	// ── Conditions (5e) — each a DISTINCT shape so status reads in grayscale (A11Y-011) ─────
	'cond-blinded': 'EyeOff',
	'cond-charmed': 'HeartHandshake',
	'cond-deafened': 'EarOff',
	'cond-frightened': 'Ghost',
	'cond-grappled': 'Grab',
	'cond-incapacitated': 'Ban',
	'cond-invisible': 'VenetianMask',
	'cond-paralyzed': 'Zap',
	'cond-petrified': 'Gem',
	'cond-poisoned': 'FlaskConical',
	'cond-prone': 'ArrowDownToLine',
	'cond-restrained': 'Lock',
	'cond-stunned': 'Stars',
	'cond-unconscious': 'Moon',
	'cond-exhaustion': 'BatteryLow',
	'cond-concentration': 'Brain',
	'cond-blessed': 'Sparkles',
	'cond-cursed': 'Skull',
	hourglass: 'Hourglass',
	// Spellcasting
	'spell-slot': 'Diamond',
	'spell-slot-filled': 'Diamond',
	flame: 'Flame',
	ritual: 'Infinity',
	concentration: 'Brain',
};

const SIZE_TOKEN = {
	micro: 'var(--icon-size-micro, 16px)',
	sm: 'var(--icon-size-sm, 20px)',
	md: 'var(--icon-size-md, 24px)',
	lg: 'var(--icon-size-lg, 32px)',
	xl: 'var(--icon-size-xl, 48px)',
};

/**
 * Icon — renders a single Lucide glyph at a token size, inheriting currentColor at a 2px stroke.
 *
 * An icon is EITHER meaningful (pass `label` → role=img + aria-label) OR decorative (omit label →
 * aria-hidden, paired with adjacent visible text). Icon-only buttons must always pass a label.
 */
export function Icon({ name, size = 'md', label, color, strokeWidth, style, className, ...rest }) {
	const pascal = ICON_REGISTRY[name] || name;
	const Glyph = icons[pascal] || icons.Square;
	const px = SIZE_TOKEN[size] || (typeof size === 'number' ? `${size}px` : size);
	const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
	return (
		<Glyph
			{...a11y}
			{...rest}
			className={className}
			color={color || 'currentColor'}
			strokeWidth={strokeWidth ?? 2}
			style={{ width: px, height: px, flex: '0 0 auto', display: 'inline-block', ...style }}
		/>
	);
}
