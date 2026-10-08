import type { ComponentType } from 'react';
import type { WidgetTemplateKind } from '@dndtools/core';
import type { WidgetTemplateProps } from '../shared';
import { CountdownTemplate } from './Countdown';
import { DiceRollerTemplate } from './DiceRoller';
import { InitiativeTemplate } from './Initiative';
import { ItemListTemplate } from './ItemList';
import { MapViewTemplate } from './MapView';
import { NowPlayingTemplate } from './NowPlaying';

/**
 * RC-WID-5.7 — the GM board's template kinds, each with its renderer and the display name the
 * connected renderer carries. One list, so the live registry, the builder preview and the gallery
 * miniature cannot disagree about which board kinds exist.
 */
export const BOARD_TEMPLATES: ReadonlyArray<
	readonly [WidgetTemplateKind, ComponentType<WidgetTemplateProps>, string]
> = [
	['map-view', MapViewTemplate, 'MapViewWidget'],
	['initiative', InitiativeTemplate, 'InitiativeWidget'],
	['dice-roller', DiceRollerTemplate, 'DiceRollerWidget'],
	['countdown', CountdownTemplate, 'CountdownWidget'],
	['now-playing', NowPlayingTemplate, 'NowPlayingWidget'],
	['item-list', ItemListTemplate, 'ItemListWidget'],
];

/** The same renderers, by kind, for a `Record` every template kind must fill. */
export const BOARD_TEMPLATE_RENDERERS = {
	'map-view': MapViewTemplate,
	initiative: InitiativeTemplate,
	'dice-roller': DiceRollerTemplate,
	countdown: CountdownTemplate,
	'now-playing': NowPlayingTemplate,
	'item-list': ItemListTemplate,
} as const satisfies Record<string, ComponentType<WidgetTemplateProps>>;
