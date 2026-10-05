import {
	ALL_HOST_PERMISSIONS,
	WIDGET_DESTINATION_CLASSES,
	WIDGET_INTENT_CREATE_TARGETS,
	type PlatformProfileId,
	type WidgetConfigControl,
	type WidgetDataQuerySource,
	type WidgetHostPermission,
	type WidgetIntentCreateTarget,
	type WidgetIntentDescriptor,
	type WidgetIntentEntityKind,
	type WidgetIntentRoute,
	type WidgetIntentSettingsTab,
	type WidgetNetworkDestinationClass,
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
	'link-list': 'builder.template.linkList',
	launcher: 'builder.template.launcher',
	'card-grid': 'builder.template.cardGrid',
	hero: 'builder.template.hero',
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
	'link-list': 'builder.templateHelp.linkList',
	launcher: 'builder.templateHelp.launcher',
	'card-grid': 'builder.templateHelp.cardGrid',
	hero: 'builder.templateHelp.hero',
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
	// RC-WID-5.2 — the hub sources, in `ALL_WIDGET_DATA_QUERY_SOURCES` order.
	screens: 'builder.source.screens',
	'vault-counts': 'builder.source.vaultCounts',
	party: 'builder.source.party',
	campaign: 'builder.source.campaign',
	'dice-history': 'builder.source.diceHistory',
	handouts: 'builder.source.handouts',
	'rollable-tables': 'builder.source.rollableTables',
	'quick-reference': 'builder.source.quickReference',
	'session-archives': 'builder.source.sessionArchives',
	'continuity-digest': 'builder.source.continuityDigest',
	'rest-log': 'builder.source.restLog',
	presence: 'builder.source.presence',
	'player-projections': 'builder.source.playerProjections',
	'initiative-call': 'builder.source.initiativeCall',
	'combatant-status': 'builder.source.combatantStatus',
	'capture-candidates': 'builder.source.captureCandidates',
	'widget-library': 'builder.source.widgetLibrary',
	'live-peers': 'builder.source.livePeers',
	'table-readiness': 'builder.source.tableReadiness',
	'continuity-mentions': 'builder.source.continuityMentions',
	// RC-CAN-7.6 — the Command Center's parts.
	resume: 'builder.source.resume',
	'table-scenes': 'builder.source.tableScenes',
	'library-sections': 'builder.source.librarySections',
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
	navigate: 'builder.hostPermission.navigate',
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

/**
 * The Advanced step's vocabularies (RC-WID-2.5).
 *
 * The host API reference is written from `public/widget-host.html`'s `window.dndtoolsWidget` — the
 * only surface package code ever gets — so the panel documents what the sandbox actually exposes
 * rather than an idea of it. Signatures are code and stay in the source language; every line of
 * prose beside them is a catalog key.
 */
export const RUNTIME_LABEL: Record<'template' | 'custom-html-js', MessageKey> = {
	template: 'builder.advanced.runtimeTemplate',
	'custom-html-js': 'builder.advanced.runtimeCustom',
};

export const CODE_PART_LABEL: Record<'html' | 'css' | 'js', MessageKey> = {
	html: 'builder.advanced.partHtml',
	css: 'builder.advanced.partCss',
	js: 'builder.advanced.partJs',
};

export interface HostApiEntry {
	signature: string;
	description: MessageKey;
}

export const HOST_API_REFERENCE: readonly HostApiEntry[] = Object.freeze([
	{
		signature: 'window.dndtoolsWidget.root',
		description: 'builder.advanced.api.root',
	},
	{
		signature: 'onRender(props => {})',
		description: 'builder.advanced.api.onRender',
	},
	{
		signature: 'onConfigChanged(configuration => {})',
		description: 'builder.advanced.api.onConfigChanged',
	},
	{
		signature: 'onBindingChanged(binding => {})',
		description: 'builder.advanced.api.onBindingChanged',
	},
	{
		signature: 'dispatch({ commandType, payload })',
		description: 'builder.advanced.api.dispatch',
	},
	{
		signature: 'requestPermission(kind)',
		description: 'builder.advanced.api.requestPermission',
	},
	{
		signature: 'outbound({ url, destinationClass, payload })',
		description: 'builder.advanced.api.outbound',
	},
	{
		signature: 'setHeight(pixels)',
		description: 'builder.advanced.api.setHeight',
	},
] as const);

export const NETWORK_DESTINATION_LABEL: Record<WidgetNetworkDestinationClass, MessageKey> = {
	'vault-sync': 'builder.advanced.destination.vaultSync',
	'asset-cdn': 'builder.advanced.destination.assetCdn',
	'widget-declared': 'builder.advanced.destination.widgetDeclared',
	analytics: 'builder.advanced.destination.analytics',
};

export const NETWORK_DESTINATION_HELP: Record<WidgetNetworkDestinationClass, MessageKey> = {
	'vault-sync': 'builder.advanced.destinationHelp.vaultSync',
	'asset-cdn': 'builder.advanced.destinationHelp.assetCdn',
	'widget-declared': 'builder.advanced.destinationHelp.widgetDeclared',
	analytics: 'builder.advanced.destinationHelp.analytics',
};

export const NETWORK_DESTINATIONS: WidgetNetworkDestinationClass[] = [
	...WIDGET_DESTINATION_CLASSES,
];

/** How the core's trust recommendation is spoken and toned, wherever it is shown. */
export const TRUST_RECOMMENDATION: Record<
	string,
	{ label: MessageKey; tone: 'success' | 'warning' | 'error' }
> = {
	'trusted-after-review': { label: 'extensions.plugins.recommendTrust', tone: 'success' },
	'requires-review': { label: 'extensions.trust.recommend.review', tone: 'warning' },
	'deny-until-fixed': { label: 'extensions.trust.recommend.deny', tone: 'error' },
};

// --- RC-WID-5.1: intents -----------------------------------------------------------------------

/**
 * A catalogue row for an intent. `displayName` is stored text, like a command's, so it stays in the
 * source language until the author renames it; `label` names the chip and is translated.
 */
export interface IntentSeed {
	label: MessageKey;
	group: 'open' | 'create';
	seed: WidgetIntentDescriptor;
}

const OPEN_ENTITY_SEEDS: [WidgetIntentEntityKind, MessageKey, string][] = [
	['character', 'builder.intents.openCharacter', 'Open character'],
	['map', 'builder.intents.openMap', 'Open map'],
	['note', 'builder.intents.openNote', 'Open note'],
	['quest', 'builder.intents.openQuest', 'Open quest'],
];

export const CREATE_LABEL: Record<WidgetIntentCreateTarget, [MessageKey, string]> = {
	scene: ['home.create.scene', 'New scene'],
	screen: ['builder.intents.newScreen', 'New screen'],
	character: ['home.create.character', 'New character'],
	map: ['home.create.map', 'New map'],
	note: ['home.create.note', 'New note'],
	widget: ['home.create.widget', 'New widget'],
};

export const INTENT_CATALOG: IntentSeed[] = [
	...OPEN_ENTITY_SEEDS.map(([entityKind, label, displayName]) => ({
		label,
		group: 'open' as const,
		seed: { id: `open-${entityKind}`, displayName, kind: 'open-entity' as const, entityKind },
	})),
	{
		label: 'builder.intents.openScreen',
		group: 'open',
		seed: { id: 'open-screen', displayName: 'Open screen', kind: 'open-screen' },
	},
	{
		label: 'builder.intents.openRoute',
		group: 'open',
		seed: { id: 'open-page', displayName: 'Open page', kind: 'open-route', route: '/characters' },
	},
	{
		label: 'builder.intents.openSettings',
		group: 'open',
		seed: {
			id: 'open-settings',
			displayName: 'Open Settings',
			kind: 'open-settings',
			tab: 'appearance',
		},
	},
	...WIDGET_INTENT_CREATE_TARGETS.map((target) => ({
		label: CREATE_LABEL[target][0],
		group: 'create' as const,
		seed: {
			id: `new-${target}`,
			displayName: CREATE_LABEL[target][1],
			kind: 'create' as const,
			target,
		},
	})),
];

/** The seed's id, suffixed until it is unique in the draft (two "Open character" buttons are fine). */
export function uniqueIntentId(base: string, intents: readonly WidgetIntentDescriptor[]): string {
	const taken = new Set(intents.map((intent) => intent.id));
	if (!taken.has(base)) return base;
	let index = 2;
	while (taken.has(`${base}-${index}`)) index += 1;
	return `${base}-${index}`;
}

export const ROUTE_LABEL: Record<WidgetIntentRoute, MessageKey> = {
	'/': 'nav.home',
	'/scenes': 'nav.scenes',
	'/session': 'nav.session',
	'/board': 'nav.gmScreen',
	'/characters': 'nav.characters',
	'/atlas': 'nav.maps',
	'/campaign': 'nav.story',
	'/campaign/calendar': 'builder.intents.route.calendar',
	'/campaign/relationships': 'builder.intents.route.relationships',
	'/knowledge': 'nav.notes',
	'/graph': 'nav.graph',
	'/audio': 'nav.audio',
	'/extensions': 'nav.extensions',
};

export const SETTINGS_TAB_LABEL: Record<WidgetIntentSettingsTab, MessageKey> = {
	appearance: 'settings.nav.appearance',
	language: 'settings.nav.language',
	account: 'settings.nav.account',
	subscription: 'settings.nav.subscription',
	players: 'settings.nav.players',
	permissions: 'settings.nav.permissions',
	vault: 'settings.nav.vault',
	sync: 'settings.nav.sync',
	tools: 'settings.nav.tools',
	ai: 'settings.nav.ai',
	plugins: 'settings.nav.plugins',
	systems: 'settings.nav.systems',
	accessibility: 'settings.nav.accessibility',
	about: 'settings.nav.about',
};
