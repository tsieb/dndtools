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
import type { MessageKey } from '../../i18n';
import type { DockPreference } from './draft';

/**
 * The spoken vocabularies the builder's pickers offer (RC-WID-2.1).
 *
 * Every list here is derived from, or exhaustively typed against, a core enum, so a kind added to
 * the schema fails the build here rather than quietly going unofferable. Each entry is a catalog
 * key rather than a spoken label (RC-UX-1.2): the copy rules — sentence case, verbs first, and the
 * safety words "DM only · Shared · Player visible" exactly as the design package spells them —
 * still apply, they just apply in `i18n/messages/en.ts` where a translator can see them.
 */

export const TEMPLATE_LABEL: Record<WidgetTemplateKind, MessageKey> = {
	'data-table': 'builder.template.dataTable',
	'status-list': 'builder.template.statusList',
	tracker: 'builder.template.tracker',
	'action-panel': 'builder.template.actionPanel',
	'scene-message': 'builder.template.sceneMessage',
	chart: 'builder.template.chart',
	'stat-block': 'builder.template.statBlock',
	'form-panel': 'builder.template.formPanel',
};

export const TEMPLATE_HELP: Record<WidgetTemplateKind, MessageKey> = {
	'data-table': 'builder.templateHelp.dataTable',
	'status-list': 'builder.templateHelp.statusList',
	tracker: 'builder.templateHelp.tracker',
	'action-panel': 'builder.templateHelp.actionPanel',
	'scene-message': 'builder.templateHelp.sceneMessage',
	chart: 'builder.templateHelp.chart',
	'stat-block': 'builder.templateHelp.statBlock',
	'form-panel': 'builder.templateHelp.formPanel',
};

export const TEMPLATE_KINDS = Object.keys(TEMPLATE_LABEL) as WidgetTemplateKind[];

export const QUERY_SOURCE_LABEL: Record<WidgetDataQuerySource, MessageKey> = {
	'current-combatants': 'builder.source.currentCombatants',
	'visible-characters': 'builder.source.visibleCharacters',
	'selected-scene': 'builder.source.selectedScene',
	'session-state': 'builder.source.sessionState',
	notes: 'builder.source.notes',
	maps: 'builder.source.maps',
	'content-objects': 'builder.source.contentObjects',
	binding: 'builder.source.binding',
};

export const QUERY_SOURCES = Object.keys(QUERY_SOURCE_LABEL) as WidgetDataQuerySource[];

export const AUDIENCE_LABEL: Record<'dm' | 'players' | 'shared', MessageKey> = {
	dm: 'builder.audience.dm',
	players: 'builder.audience.players',
	shared: 'builder.audience.shared',
};

export const CAPABILITY_LABEL: Record<'manager' | 'operator' | 'viewer', MessageKey> = {
	manager: 'builder.capability.manager',
	operator: 'builder.capability.operator',
	viewer: 'builder.capability.viewer',
};

export const SURFACE_LABEL: Record<WidgetSurface, MessageKey> = {
	scene: 'builder.surface.scene',
	'command-center': 'builder.surface.commandCenter',
	'player-view': 'builder.surface.playerView',
};

export const SURFACES = Object.keys(SURFACE_LABEL) as WidgetSurface[];

export const PROFILE_LABEL: Record<PlatformProfileId, MessageKey> = {
	desktop: 'builder.profile.desktop',
	tablet: 'builder.profile.tablet',
	mobile: 'builder.profile.mobile',
	web: 'builder.profile.web',
};

export const PROFILES = Object.keys(PROFILE_LABEL) as PlatformProfileId[];

export const DOCK_PREFERENCE_LABEL: Record<DockPreference, MessageKey> = {
	canvas: 'builder.dock.canvas',
	left: 'builder.dock.left',
	right: 'builder.dock.right',
	bottom: 'builder.dock.bottom',
};

export const RESIZE_LABEL: Record<'fixed' | 'axis-locked' | 'free', MessageKey> = {
	fixed: 'builder.resize.fixed',
	'axis-locked': 'builder.resize.axisLocked',
	free: 'builder.resize.free',
};

export const CONTROL_LABEL: Record<WidgetConfigControl, MessageKey> = {
	text: 'builder.control.text',
	textarea: 'builder.control.textarea',
	number: 'builder.control.number',
	select: 'builder.control.select',
	toggle: 'builder.control.toggle',
	color: 'builder.control.color',
};

export const CONTROLS = Object.keys(CONTROL_LABEL) as WidgetConfigControl[];

export const FIELD_GROUP_LABEL: Record<'content' | 'display' | 'style', MessageKey> = {
	content: 'builder.group.content',
	display: 'builder.group.display',
	style: 'builder.group.style',
};

export const WRITES_TO_LABEL: Record<'scene' | 'session' | 'entity', MessageKey> = {
	scene: 'builder.writesTo.scene',
	session: 'builder.writesTo.session',
	entity: 'builder.writesTo.entity',
};

export const ISOLATION_LABEL: Record<WidgetStyleIsolation, MessageKey> = {
	'host-scoped': 'builder.isolation.hostScoped',
	'shadow-root': 'builder.isolation.shadowRoot',
	'iframe-document': 'builder.isolation.iframeDocument',
};

export const STYLE_CAPABILITY_LABEL: Record<WidgetStyleCapability, MessageKey> = {
	'css-variables': 'builder.styleCapability.cssVariables',
	'custom-stylesheet': 'builder.styleCapability.customStylesheet',
	'responsive-layout': 'builder.styleCapability.responsiveLayout',
	'host-theme-tokens': 'builder.styleCapability.hostThemeTokens',
	animation: 'builder.styleCapability.animation',
	'custom-fonts': 'builder.styleCapability.customFonts',
};

export const STYLE_CAPABILITIES = Object.keys(STYLE_CAPABILITY_LABEL) as WidgetStyleCapability[];

export const HOST_PERMISSION_LABEL: Record<WidgetHostPermission, MessageKey> = {
	filesystem: 'builder.hostPermission.filesystem',
	clipboard: 'builder.hostPermission.clipboard',
	network: 'builder.hostPermission.network',
	'source-adapter': 'builder.hostPermission.sourceAdapter',
	asset: 'builder.hostPermission.asset',
	'external-link': 'builder.hostPermission.externalLink',
};

export const HOST_PERMISSIONS: WidgetHostPermission[] = [...ALL_HOST_PERMISSIONS];

/**
 * The semantic tokens a style token may point at. Raw hex is not offered: a widget that needs its
 * own colour space declares the `custom-stylesheet` capability and ships one (RC-WID-2.4), and a
 * value picked here re-themes with `data-theme` because it stays a `var()` reference.
 */
export const SEMANTIC_TOKEN_VALUES: { value: string; label: MessageKey }[] = [
	{ value: 'var(--color-accent)', label: 'builder.token.accent' },
	{ value: 'var(--color-accent-subtle)', label: 'builder.token.accentSubtle' },
	{ value: 'var(--color-surface)', label: 'builder.token.surface' },
	{ value: 'var(--color-surface-raised)', label: 'builder.token.surfaceRaised' },
	{ value: 'var(--color-surface-sunken)', label: 'builder.token.surfaceSunken' },
	{ value: 'var(--color-border)', label: 'builder.token.border' },
	{ value: 'var(--color-text-primary)', label: 'builder.token.textPrimary' },
	{ value: 'var(--color-text-secondary)', label: 'builder.token.textSecondary' },
	{ value: 'var(--color-text-tertiary)', label: 'builder.token.textTertiary' },
	{ value: 'var(--color-status-success)', label: 'builder.token.statusSuccess' },
	{ value: 'var(--color-status-warning)', label: 'builder.token.statusWarning' },
	{ value: 'var(--color-status-error)', label: 'builder.token.statusError' },
];

/**
 * The icon vocabulary the Identity step picks from: the app's own semantic registry
 * (`docs/reference/ICON_VOCABULARY.md`), so a widget can never introduce a glyph outside the one
 * Lucide family. Sorted so the picker is scannable.
 */
export const ICON_VOCABULARY: string[] = Object.keys(
	ICON_REGISTRY as Record<string, string>,
).sort();
