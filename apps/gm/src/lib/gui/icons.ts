/**
 * UX-VIS-009: the iconography registry — the single source of truth for icons in the v2 app.
 *
 * Lucide is the ONLY icon family (clean 2px stroke, MIT, ~1,400 glyphs). This module is the only
 * place `@lucide/svelte` may be imported; every surface draws icons through {@link ICON_REGISTRY}
 * (via `Icon.svelte`) so there is one family at one stroke weight — no "mixed icon soup". The
 * non-Lucide import ban is enforced by `tests/unit/icon-import-gate.test.ts`.
 *
 * Sizing comes from the `--icon-size-*` design tokens (UX-VIS-009 §size tokens), applied by the
 * `Icon.svelte` size class — not by hard-coded pixel props — so density and theming stay token
 * driven. Icons inherit `currentColor`; status icons add a `--color-status-*` colour ON TOP of a
 * redundant shape + adjacent label (A11Y-011 non-colour cue), never as the sole signal.
 *
 * This is a pure registry/type module: no Svelte runtime state, no DOM, no platform primitives.
 */

import type { Component } from 'svelte';
import type { LucideProps } from '@lucide/svelte';

// Individual icon imports keep the bundle tree-shakable (only referenced glyphs ship).
import House from '@lucide/svelte/icons/house';
import Zap from '@lucide/svelte/icons/zap';
import Users from '@lucide/svelte/icons/users';
import Map from '@lucide/svelte/icons/map';
import Scroll from '@lucide/svelte/icons/scroll';
import BookOpen from '@lucide/svelte/icons/book-open';
import Settings from '@lucide/svelte/icons/settings';
import CircleCheck from '@lucide/svelte/icons/circle-check';
import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
import CircleX from '@lucide/svelte/icons/circle-x';
import Info from '@lucide/svelte/icons/info';
import Eye from '@lucide/svelte/icons/eye';
import EyeOff from '@lucide/svelte/icons/eye-off';
import X from '@lucide/svelte/icons/x';
import Check from '@lucide/svelte/icons/check';
import Plus from '@lucide/svelte/icons/plus';
import Search from '@lucide/svelte/icons/search';
import Ellipsis from '@lucide/svelte/icons/ellipsis';
import ChevronDown from '@lucide/svelte/icons/chevron-down';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
import LoaderCircle from '@lucide/svelte/icons/loader-circle';
import Move from '@lucide/svelte/icons/move';
import Sparkles from '@lucide/svelte/icons/sparkles';
import Gauge from '@lucide/svelte/icons/gauge';
import Sun from '@lucide/svelte/icons/sun';
import Accessibility from '@lucide/svelte/icons/accessibility';
import Pin from '@lucide/svelte/icons/pin';
import Clock from '@lucide/svelte/icons/clock';
import Layers from '@lucide/svelte/icons/layers';

/** A Lucide glyph rendered by `Icon.svelte`. */
export type LucideIconComponent = Component<LucideProps>;

/** The four+1 named icon sizes (UX-VIS-009). `density` follows the active density mode. */
export const ICON_SIZES = ['micro', 'sm', 'md', 'lg', 'xl', 'density'] as const;
export type IconSize = (typeof ICON_SIZES)[number];

/** Icon size → the CSS custom property the stylesheet defines for it. */
export const ICON_SIZE_TOKEN: Readonly<Record<IconSize, string>> = {
	micro: '--icon-size-micro',
	sm: '--icon-size-sm',
	md: '--icon-size-md',
	lg: '--icon-size-lg',
	xl: '--icon-size-xl',
	density: '--density-icon-size',
};

/**
 * The curated icon registry. Section keys mirror the navigation-registry icon ids
 * (`docs/planning/v2/ux/navigation-registry.yaml`) so the phase-02 shell can render the global nav
 * through this same registry. Status keys give each severity a DISTINCT shape (non-colour cue).
 */
export const ICON_REGISTRY = {
	// --- Global navigation sections (ids mirror navigation-registry.yaml) ---
	home: House,
	'session-bolt': Zap,
	'characters-person': Users,
	'atlas-map': Map,
	'campaign-scroll': Scroll,
	'knowledge-book': BookOpen,
	'settings-gear': Settings,
	// --- Status (each a distinct shape so meaning survives grayscale; A11Y-011) ---
	success: CircleCheck,
	warning: TriangleAlert,
	error: CircleX,
	info: Info,
	// --- Actor-safety / visibility (DM-only uses Eye per UX-VIS-009 §usage rules) ---
	'dm-only': Eye,
	hidden: EyeOff,
	// --- UX-PERM visibility family (reserved eye-family vocabulary; UX-PERM-001 §visual
	// vocabulary separation — permission grants use a different family). `mixed` is the layered
	// glyph for items whose section/field overrides differ from the entity level (UX-PERM-007). ---
	'visibility-shared': Users,
	'visibility-players': Eye,
	'visibility-hidden': EyeOff,
	'visibility-mixed': Layers,
	// --- Common actions / affordances ---
	close: X,
	check: Check,
	add: Plus,
	search: Search,
	more: Ellipsis,
	'chevron-down': ChevronDown,
	'chevron-right': ChevronRight,
	retry: RotateCcw,
	loading: LoaderCircle,
	move: Move,
	// --- Pinned / recent strip (UX-NAV-015): a pin marker and a recency (clock) marker ---
	pin: Pin,
	recent: Clock,
	// --- Display preferences (Settings) ---
	motion: Sparkles,
	density: Gauge,
	theme: Sun,
	accessibility: Accessibility,
} satisfies Record<string, LucideIconComponent>;

export type IconName = keyof typeof ICON_REGISTRY;

/** Fail-closed name guard for dynamic lookups. */
export function isIconName(value: string): value is IconName {
	return Object.prototype.hasOwnProperty.call(ICON_REGISTRY, value);
}

/** Severity kinds that carry a status icon. */
export type StatusKind = 'success' | 'warning' | 'error' | 'info';

/**
 * Status → icon name. Each maps to a unique shape so the state is conveyed without colour
 * (UX-VIS-009 AC2). Always render alongside text — the icon is never the sole signal.
 */
export const STATUS_ICON: Readonly<Record<StatusKind, IconName>> = {
	success: 'success',
	warning: 'warning',
	error: 'error',
	info: 'info',
};

/** The accessible attributes the `Icon` wrapper applies (see {@link resolveIconA11y}). */
export interface IconA11yAttrs {
	role?: 'img';
	'aria-label'?: string;
	'aria-hidden'?: 'true';
}

/**
 * UX-VIS-009 AC1: an icon is EITHER meaningful (carries an accessible name) OR decorative (removed
 * from the a11y tree). A trimmed, non-empty `label` yields `role="img"` + `aria-label`; otherwise
 * the icon is `aria-hidden` (decorative, paired with adjacent visible text). Icon-only buttons must
 * always pass a label so the control has a non-empty accessible name.
 */
export function resolveIconA11y(label?: string): IconA11yAttrs {
	const trimmed = label?.trim();
	if (trimmed) return { role: 'img', 'aria-label': trimmed };
	return { 'aria-hidden': 'true' };
}
