import {
	ALL_HOST_PERMISSIONS,
	type PlatformProfileId,
	type WidgetConfigControl,
	type WidgetDataQuerySource,
	type WidgetHostPermission,
	type WidgetStyleCapability,
	type WidgetStyleIsolation,
	type WidgetSurface,
	type WidgetTemplateKind,
} from '@dndtools/core';
import { ICON_REGISTRY } from '../../ds';

/**
 * The spoken vocabularies the builder's pickers offer (RC-WID-2.1).
 *
 * Every list here is derived from, or exhaustively typed against, a core enum, so a kind added to
 * the schema fails the build here rather than quietly going unofferable. The labels are the copy
 * rules: sentence case, verbs first, and the safety words "DM only · Shared · Player visible" left
 * exactly as the design package spells them.
 */

export const TEMPLATE_LABEL: Record<WidgetTemplateKind, string> = {
	'data-table': 'Data table',
	'status-list': 'Status list',
	tracker: 'Tracker',
	'action-panel': 'Action panel',
	'scene-message': 'Scene message',
	chart: 'Chart',
	'stat-block': 'Stat block',
	'form-panel': 'Form panel',
};

export const TEMPLATE_HELP: Record<WidgetTemplateKind, string> = {
	'data-table': 'Rows and columns from one data query.',
	'status-list': 'A list of names with a status line each, for combatants or party members.',
	tracker: 'One measure drawn as a meter, for a countdown or a resource.',
	'action-panel': 'Buttons that fire this widget’s declared commands.',
	'scene-message': 'A short block of text for the table to read.',
	chart: 'A bar chart over one query’s measure column.',
	'stat-block': 'One entity’s key numbers and traits.',
	'form-panel': 'Fields the DM fills in, submitted through a declared command.',
};

export const TEMPLATE_KINDS = Object.keys(TEMPLATE_LABEL) as WidgetTemplateKind[];

export const QUERY_SOURCE_LABEL: Record<WidgetDataQuerySource, string> = {
	'current-combatants': 'Current combatants',
	'visible-characters': 'Characters you can see',
	'selected-scene': 'The selected scene',
	'session-state': 'Session state',
	notes: 'Notes',
	maps: 'Maps',
	'content-objects': 'Vault objects',
	binding: 'A declared binding',
};

export const QUERY_SOURCES = Object.keys(QUERY_SOURCE_LABEL) as WidgetDataQuerySource[];

export const AUDIENCE_LABEL: Record<'dm' | 'players' | 'shared', string> = {
	dm: 'DM only',
	players: 'Player visible',
	shared: 'Shared',
};

export const CAPABILITY_LABEL: Record<'manager' | 'operator' | 'viewer', string> = {
	manager: 'Campaign manager',
	operator: 'Operator',
	viewer: 'Viewer',
};

export const SURFACE_LABEL: Record<WidgetSurface, string> = {
	scene: 'Scene canvas',
	'command-center': 'Command Center',
	'player-view': 'Player view',
};

export const SURFACES = Object.keys(SURFACE_LABEL) as WidgetSurface[];

export const PROFILE_LABEL: Record<PlatformProfileId, string> = {
	desktop: 'Desktop',
	tablet: 'Tablet',
	mobile: 'Mobile',
	web: 'Web',
};

export const PROFILES = Object.keys(PROFILE_LABEL) as PlatformProfileId[];

export const RESIZE_LABEL: Record<'fixed' | 'axis-locked' | 'free', string> = {
	fixed: 'Fixed size',
	'axis-locked': 'Resize on one axis',
	free: 'Resize freely',
};

export const CONTROL_LABEL: Record<WidgetConfigControl, string> = {
	text: 'Single line of text',
	textarea: 'Paragraph',
	number: 'Number',
	select: 'Choice',
	toggle: 'On or off',
	color: 'Colour',
};

export const CONTROLS = Object.keys(CONTROL_LABEL) as WidgetConfigControl[];

export const FIELD_GROUP_LABEL: Record<'content' | 'display' | 'style', string> = {
	content: 'Content',
	display: 'Display',
	style: 'Style',
};

export const WRITES_TO_LABEL: Record<'scene' | 'session' | 'entity', string> = {
	scene: 'The scene',
	session: 'The session',
	entity: 'A bound entity',
};

export const ISOLATION_LABEL: Record<WidgetStyleIsolation, string> = {
	'host-scoped': 'Host scoped — inherits the app theme',
	'shadow-root': 'Shadow root — isolated styles',
	'iframe-document': 'Iframe document — fully separate',
};

export const STYLE_CAPABILITY_LABEL: Record<WidgetStyleCapability, string> = {
	'css-variables': 'CSS variables',
	'custom-stylesheet': 'Custom stylesheet',
	'responsive-layout': 'Responsive layout',
	'host-theme-tokens': 'Host theme tokens',
	animation: 'Animation',
	'custom-fonts': 'Custom fonts',
};

export const STYLE_CAPABILITIES = Object.keys(STYLE_CAPABILITY_LABEL) as WidgetStyleCapability[];

export const HOST_PERMISSION_LABEL: Record<WidgetHostPermission, string> = {
	filesystem: 'Read and write files',
	clipboard: 'Use the clipboard',
	network: 'Reach the network',
	'source-adapter': 'Read connected sources',
	asset: 'Read campaign assets',
	'external-link': 'Open external links',
};

export const HOST_PERMISSIONS: WidgetHostPermission[] = [...ALL_HOST_PERMISSIONS];

/**
 * The semantic tokens a style token may point at. Raw hex is not offered: a widget that needs its
 * own colour space declares the `custom-stylesheet` capability and ships one (RC-WID-2.4), and a
 * value picked here re-themes with `data-theme` because it stays a `var()` reference.
 */
export const SEMANTIC_TOKEN_VALUES: { value: string; label: string }[] = [
	{ value: 'var(--color-accent)', label: 'Accent' },
	{ value: 'var(--color-accent-subtle)', label: 'Accent, subtle' },
	{ value: 'var(--color-surface)', label: 'Surface' },
	{ value: 'var(--color-surface-raised)', label: 'Surface, raised' },
	{ value: 'var(--color-surface-sunken)', label: 'Surface, sunken' },
	{ value: 'var(--color-border)', label: 'Border' },
	{ value: 'var(--color-text-primary)', label: 'Text, primary' },
	{ value: 'var(--color-text-secondary)', label: 'Text, secondary' },
	{ value: 'var(--color-text-tertiary)', label: 'Text, tertiary' },
	{ value: 'var(--color-status-success)', label: 'Status, success' },
	{ value: 'var(--color-status-warning)', label: 'Status, warning' },
	{ value: 'var(--color-status-error)', label: 'Status, error' },
];

/**
 * The icon vocabulary the Identity step picks from: the app's own semantic registry
 * (`docs/reference/ICON_VOCABULARY.md`), so a widget can never introduce a glyph outside the one
 * Lucide family. Sorted so the picker is scannable.
 */
export const ICON_VOCABULARY: string[] = Object.keys(
	ICON_REGISTRY as Record<string, string>,
).sort();
