import type { HubTemplateKind, HubProps } from './Hub';
import type { WidgetIntentDescriptor } from '@dndtools/core';
import type { WidgetDataRow } from '../dataEnvironment';

/** CAN-7.5 home desktop content, retained in state/RC-CAN-7.5/aria/aria-home-desktop.yaml. */
export function hubFixture(kind: HubTemplateKind): HubProps {
	const rows: Record<HubTemplateKind, WidgetDataRow[]> = {
		hero: [
			{
				id: 'campaign',
				primary: 'Your campaign',
				secondary: 'Resume or open a scene to run live play · 3 in the party',
			},
		],
		'card-grid': [
			{
				id: 'harbor',
				primary: 'Harbor of Saltreach',
				secondary: 'town · 0 widgets',
				visibility: 'shared',
				thumbnail: 'paper',
			},
			{
				id: 'crypt',
				primary: 'The Sunken Crypt',
				secondary: 'dungeon · 3 widgets',
				visibility: 'dm-only',
				thumbnail: 'grid',
			},
		],
		launcher: [
			{ id: 'new-scene', primary: 'New scene', secondary: 'A canvas for the table' },
			{ id: 'new-character', primary: 'New character', secondary: 'PC, NPC, or monster' },
		],
		'link-list': [
			{ id: 'players', primary: 'Players', secondary: 'Roster & invites' },
			{ id: 'permissions', primary: 'Permissions', secondary: 'Roles & capability grants' },
		],
	};
	const intents: Record<HubTemplateKind, WidgetIntentDescriptor[]> = {
		hero: [{ id: 'open', displayName: 'Open scene', kind: 'open-screen', targetId: 'harbor' }],
		'card-grid': [
			{ id: 'open', displayName: 'Open scene', kind: 'open-screen' },
			{ id: 'new', displayName: 'New scene', kind: 'create', target: 'screen' },
		],
		launcher: [
			{ id: 'new-scene', displayName: 'New scene', kind: 'create', target: 'screen' },
			{ id: 'new-character', displayName: 'New character', kind: 'create', target: 'character' },
		],
		'link-list': [
			{ id: 'players', displayName: 'Players', kind: 'open-settings', tab: 'players' },
			{ id: 'permissions', displayName: 'Permissions', kind: 'open-settings', tab: 'permissions' },
		],
	};
	const query = {
		id: 'hub',
		label: 'Hub',
		source: 'screens' as const,
		rows: rows[kind],
		header: null,
		emptyLabel: 'No scenes yet.',
		withheld: null,
	};
	return {
		widget: {
			id: 'hub',
			type: 'hub',
			title: 'Hub',
			typeLabel: 'Hub',
			icon: 'scene',
			tier: 'custom',
			description: '',
			visibility: 'shared',
			x: 0,
			y: 0,
			w: 640,
			h: 400,
			status: 'available',
			statusNote: null,
			configuration: {},
			configFields: [],
			requiresBinding: false,
			commands: [],
			bindingRef: null,
		},
		definition: {
			type: 'hub',
			version: '1.0.0',
			displayName: 'Hub',
			author: 'user',
			defaultSize: { width: 640, height: 400 },
			minSize: { width: 160, height: 100 },
			resizePolicy: 'free',
			supportedProfiles: ['desktop'],
			requiredBindings: [],
			optionalBindings: [],
			configurationSchema: { type: 'object' },
			capabilitySets: [],
			events: [],
			hostPermissions: [],
			commands: [],
			intents: intents[kind],
			renderEntrypoint: { runtime: 'template', template: kind, hostApiVersion: 1 },
		},
		data: {
			primary: query,
			queries: [
				query,
				{
					...query,
					id: 'party',
					source: 'party',
					rows: ['Brother Calloway', 'Sera Duskwhisper', 'Tormund Ironfist'].map((primary) => ({
						id: primary,
						primary,
					})),
				},
			],
			computed: [],
			isDm: true,
		},
	};
}
