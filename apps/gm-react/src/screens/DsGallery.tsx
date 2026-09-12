/* eslint-disable i18n/no-literal-jsx-text -- DEV-only developer documentation, excluded from production; fixtures intentionally show literal component copy. */
import { useEffect, useId, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import * as DS from '../ds';

type Props = Record<string, unknown>;
type GalleryEntry = {
	name: string;
	source: string;
	description: string;
	props: Props;
	axes: Record<string, unknown[]>;
	examples: Record<string, Props>;
};

// Literal data is also read by scripts/check-prod-bundle.mjs to generate COMPONENTS.md.
// Keep fixtures synthetic and serializable. Add every public DS component here.
export const galleryRegistry: GalleryEntry[] = [
	{
		name: 'NpcCard',
		source: 'apps/gm-react/src/ds/components/campaign/NpcCard.jsx',
		description: 'A character summary with disposition and visibility.',
		props: {
			name: 'Mira Vale',
			role: 'Lantern keeper',
			location: 'Coast',
			hook: 'Needs a map.',
			tags: ['Contact'],
		},
		axes: {
			disposition: ['friendly', 'neutral', 'hostile', 'unknown'],
			dmOnly: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'QuestCard',
		source: 'apps/gm-react/src/ds/components/campaign/QuestCard.jsx',
		description: 'A quest with completed and pending objectives.',
		props: {
			title: 'Find the lantern',
			hook: 'Follow the coastal path.',
			objectives: [
				{
					label: 'Find the map',
					done: true,
				},
				{
					label: 'Reach the tower',
					done: false,
				},
			],
			reward: 'A safe harbour',
		},
		axes: {
			status: ['active', 'completed', 'failed', 'onhold'],
			dmOnly: [false, true],
		},
		examples: {
			Default: {},
			'Empty objectives': {
				objectives: [],
			},
		},
	},
	{
		name: 'SessionTimeline',
		source: 'apps/gm-react/src/ds/components/campaign/SessionTimeline.jsx',
		description: 'A chronological log with active and completed beats.',
		props: {
			entries: [
				{
					time: '18:00',
					title: 'Arrival',
					detail: 'The party reaches the coast.',
					tone: 'default',
					active: true,
				},
				{
					time: '18:00',
					title: 'Arrival',
					detail: 'The party reaches the coast.',
					tone: 'accent',
					active: false,
				},
				{
					time: '18:00',
					title: 'Arrival',
					detail: 'The party reaches the coast.',
					tone: 'success',
					active: false,
				},
				{
					time: '18:00',
					title: 'Arrival',
					detail: 'The party reaches the coast.',
					tone: 'warning',
					active: false,
				},
				{
					time: '18:00',
					title: 'Arrival',
					detail: 'The party reaches the coast.',
					tone: 'error',
					active: false,
				},
				{
					time: '18:00',
					title: 'Arrival',
					detail: 'The party reaches the coast.',
					tone: 'info',
					active: false,
				},
			],
		},
		axes: {},
		examples: {
			Default: {},
			Empty: {
				entries: [],
			},
		},
	},
	{
		name: 'CommandPalette',
		source: 'apps/gm-react/src/ds/components/command/CommandPalette.jsx',
		description: 'Search, empty results, disabled commands and keyboard selection.',
		props: {
			commands: [
				{
					id: 'scene',
					label: 'Open example scene',
					group: 'Destinations',
					icon: 'scene',
				},
				{
					id: 'locked',
					label: 'Unavailable example',
					disabled: true,
					group: 'Actions',
				},
			],
			recentIds: ['scene'],
		},
		axes: {
			showFooter: [false, true],
		},
		examples: {
			Default: {},
			Empty: {
				commands: [],
			},
		},
	},
	{
		name: 'ConditionBadge',
		source: 'apps/gm-react/src/ds/components/condition/ConditionBadge.jsx',
		description: 'A named condition with optional duration, level and removal.',
		props: {
			condition: 'prone',
		},
		axes: {
			tone: ['danger', 'warning', 'good', 'info', 'neutral'],
			compact: [false, true],
			duration: [null, 3],
			level: [null, 2],
		},
		examples: {
			Default: {},
			'Without removal': {
				onRemove: null,
			},
		},
	},
	{
		name: 'ConditionTracker',
		source: 'apps/gm-react/src/ds/components/condition/ConditionTracker.jsx',
		description: 'An empty or populated condition list with an add action.',
		props: {
			entries: [
				{
					key: 'prone',
					duration: 3,
				},
				{
					key: 'blessed',
				},
			],
		},
		axes: {
			compact: [false, true],
			addable: [false, true],
		},
		examples: {
			Default: {},
			Empty: {
				entries: [],
			},
		},
	},
	{
		name: 'SystemProvider',
		source: 'apps/gm-react/src/ds/components/condition/SystemProvider.jsx',
		description: 'Condition vocabulary supplied by an active game system.',
		props: {
			conditions: [
				{
					key: 'inspired',
					label: 'Inspired',
					severity: 'boon',
				},
			],
		},
		axes: {},
		examples: {
			Default: {},
			'Empty catalog': {
				conditions: [],
			},
			'Default catalog': {
				conditions: null,
			},
		},
	},
	{
		name: 'Avatar',
		source: 'apps/gm-react/src/ds/components/core/Avatar.jsx',
		description: 'Initials or a portrait with a status ring.',
		props: {
			name: 'Mira Vale',
		},
		axes: {
			size: ['sm', 'md', 'lg', 'xl'],
			ring: [null, 'active', 'turn', 'danger'],
		},
		examples: {
			Default: {},
			Unnamed: {
				name: '',
			},
			Image: {
				src: '/icon.svg',
			},
		},
	},
	{
		name: 'BrandMark',
		source: 'apps/gm-react/src/ds/components/core/Brand.jsx',
		description: 'Lamplight mark, decorative or named.',
		props: {},
		axes: {
			size: [24, 30, 48],
			title: [null, 'Lamplight'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'BrandWordmark',
		source: 'apps/gm-react/src/ds/components/core/Brand.jsx',
		description: 'Lamplight wordmark.',
		props: {},
		axes: {
			size: [15, 24, 32],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'BrandLockup',
		source: 'apps/gm-react/src/ds/components/core/Brand.jsx',
		description: 'Combined mark and wordmark.',
		props: {},
		axes: {},
		examples: {
			Default: {},
			Large: {
				markSize: 48,
				wordSize: 24,
			},
		},
	},
	{
		name: 'Breadcrumb',
		source: 'apps/gm-react/src/ds/components/core/Breadcrumb.jsx',
		description: 'Nested navigation with optional collapsed ancestors.',
		props: {
			items: [
				{
					id: '0',
					label: 'World',
				},
				{
					id: '1',
					label: 'Coast',
				},
				{
					id: '2',
					label: 'Town',
				},
				{
					id: '3',
					label: 'Inn',
				},
			],
		},
		axes: {
			maxVisible: [null, 2, 3],
		},
		examples: {
			Default: {},
			Empty: {
				items: [],
			},
			'Unavailable ancestor': {
				items: [
					{
						id: 'world',
						label: 'World',
						unavailable: true,
					},
					{
						id: 'inn',
						label: 'Inn',
					},
				],
			},
		},
	},
	{
		name: 'Button',
		source: 'apps/gm-react/src/ds/components/core/Button.jsx',
		description: 'An action with native or focusable disabled states.',
		props: {
			children: 'Save example',
		},
		axes: {
			variant: ['primary', 'secondary', 'ghost', 'danger', 'accent'],
			size: ['sm', 'md', 'lg'],
			disabled: [false, true],
			'aria-disabled': [false, true],
			icon: [null, 'check'],
			iconRight: [null, 'chevron-right'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Callout',
		source: 'apps/gm-react/src/ds/components/core/Callout.jsx',
		description: 'Contextual feedback with a semantic status tone.',
		props: {
			title: 'Example notice',
			children: 'Your example is ready.',
		},
		axes: {
			tone: ['success', 'warning', 'error', 'info'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Card',
		source: 'apps/gm-react/src/ds/components/core/Card.jsx',
		description: 'A surface container with optional interactive treatment.',
		props: {
			children: 'A quiet place to prepare the next scene.',
		},
		axes: {
			elevation: ['sunken', 'flat', 'raised', 'overlay'],
			padding: ['none', 'sm', 'md', 'lg'],
			accent: [false, true],
			interactive: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'CardHeader',
		source: 'apps/gm-react/src/ds/components/core/Card.jsx',
		description: 'A panel title with optional actions.',
		props: {
			title: 'Scene notes',
		},
		axes: {
			eyebrow: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'FeatureSpotlight',
		source: 'apps/gm-react/src/ds/components/core/FeatureSpotlight.jsx',
		description: 'An introduction with optional action and supporting content.',
		props: {
			title: 'Try scene notes',
			description: 'Keep a detail close at hand.',
			actionLabel: 'Try example',
		},
		axes: {
			icon: ['sparkles', 'info'],
		},
		examples: {
			Default: {},
			'Without action': {
				actionLabel: null,
			},
		},
	},
	{
		name: 'HelpTip',
		source: 'apps/gm-react/src/ds/components/core/HelpTip.jsx',
		description: 'Short supporting guidance.',
		props: {
			title: 'Tip',
			children: 'Use the keyboard to move between controls.',
		},
		axes: {
			tone: ['info', 'success', 'warning'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Icon',
		source: 'apps/gm-react/src/ds/components/core/Icon.jsx',
		description: 'The complete shipped icon vocabulary; choose a name below.',
		props: {
			name: 'check',
			label: 'Example icon',
		},
		axes: {
			size: ['micro', 'sm', 'md', 'lg', 'xl'],
			label: [null, 'Example icon'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'IconButton',
		source: 'apps/gm-react/src/ds/components/core/IconButton.jsx',
		description: 'An icon action with an accessible label.',
		props: {
			icon: 'edit',
			label: 'Edit example',
		},
		axes: {
			variant: ['ghost', 'outline', 'accent'],
			size: ['sm', 'md', 'lg'],
			disabled: [false, true],
			'aria-disabled': [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Kbd',
		source: 'apps/gm-react/src/ds/components/core/Kbd.jsx',
		description: 'A keyboard shortcut token.',
		props: {
			children: 'Ctrl K',
		},
		axes: {
			tone: ['neutral', 'accent'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'ListItem',
		source: 'apps/gm-react/src/ds/components/core/ListItem.jsx',
		description: 'A semantic list row; interactive rows use a native toggle.',
		props: {
			children: 'Lantern room',
		},
		axes: {
			selected: [false, true],
			interactive: [false, true],
			disabled: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Menu',
		source: 'apps/gm-react/src/ds/components/core/Menu.jsx',
		description: 'An in-flow menu; use arrow keys, Home and End.',
		props: {
			title: 'Scene actions',
		},
		axes: {
			open: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Popover',
		source: 'apps/gm-react/src/ds/components/core/Popover.jsx',
		description: 'Open the example to inspect focus, dismissal and focus return.',
		props: {
			title: 'Example details',
			description: 'Review this local example.',
			children: 'Example content. No vault data is changed.',
		},
		axes: {
			placement: ['top', 'bottom', 'center'],
		},
		examples: {
			Default: {},
			Anchored: {
				anchor: {
					x: 160,
					y: 160,
				},
			},
		},
	},
	{
		name: 'RadioCard',
		source: 'apps/gm-react/src/ds/components/core/RadioCard.jsx',
		description: 'A radio choice with a heading and supporting text.',
		props: {
			value: 'room',
			heading: 'Lantern room',
			children: 'A small room for a quiet conversation.',
		},
		axes: {
			checked: [false, true],
			disabled: [false, true],
			icon: [null, 'check'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Stepper',
		source: 'apps/gm-react/src/ds/components/core/Stepper.jsx',
		description: 'Completed, active and upcoming steps.',
		props: {
			steps: ['Choose', 'Preview', 'Confirm'],
		},
		axes: {
			current: [0, 1, 2, 3],
			size: ['sm', 'md', 'lg'],
			orientation: ['horizontal', 'vertical'],
			showLines: [false, true],
		},
		examples: {
			Default: {},
			Empty: {
				steps: [],
			},
		},
	},
	{
		name: 'Tabs',
		source: 'apps/gm-react/src/ds/components/core/Tabs.jsx',
		description: 'Keyboard selectable tabs with a corresponding panel.',
		props: {
			tabs: [
				{
					id: 'scenes',
					label: 'Scenes',
					icon: 'scene',
				},
				{
					id: 'notes',
					label: 'Notes',
					icon: 'note',
				},
			],
			value: 'scenes',
		},
		axes: {},
		examples: {
			Default: {},
			'Disabled tab': {
				tabs: [
					{
						id: 'scenes',
						label: 'Scenes',
						icon: 'scene',
					},
					{
						id: 'notes',
						label: 'Notes',
						icon: 'note',
					},
					{
						id: 'locked',
						label: 'Unavailable',
						disabled: true,
					},
				],
			},
			Empty: {
				tabs: [],
			},
		},
	},
	{
		name: 'Toolbar',
		source: 'apps/gm-react/src/ds/components/core/Toolbar.jsx',
		description: 'A group of related actions with roving keyboard focus.',
		props: {},
		axes: {
			dense: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'AbilityScore',
		source: 'apps/gm-react/src/ds/components/creature/AbilityScore.jsx',
		description: 'An ability score and its derived modifier.',
		props: {
			label: 'STR',
			score: 14,
		},
		axes: {
			size: ['sm', 'md', 'lg'],
			tone: ['default', 'accent'],
			score: [8, 10, 14],
		},
		examples: {
			Default: {},
			'Explicit modifier': {
				modifier: '+4',
			},
		},
	},
	{
		name: 'StatBlock',
		source: 'apps/gm-react/src/ds/components/creature/StatBlock.jsx',
		description: 'A creature reference, including optional live health and extra actions.',
		props: {
			name: 'Lantern keeper',
			meta: 'Medium humanoid',
			ac: 14,
			hp: 20,
			speed: '30 ft.',
			abilities: {
				str: 12,
				dex: 14,
				con: 12,
				int: 10,
				wis: 14,
				cha: 12,
			},
			traits: [
				{
					name: 'Watchful',
					text: 'Keeps an eye on the door.',
				},
			],
			actions: [
				{
					name: 'Staff',
					text: 'A simple melee attack.',
				},
			],
		},
		axes: {
			dmOnly: [false, true],
		},
		examples: {
			Default: {},
			Live: {
				live: {
					current: 12,
					max: 20,
					conditions: ['prone'],
				},
			},
			'All sections': {
				bonusActions: [
					{
						name: 'Step',
						text: 'Move aside.',
					},
				],
				reactions: [
					{
						name: 'Guard',
						text: 'Raise a shield.',
					},
				],
				legendaryActions: [
					{
						name: 'Observe',
						text: 'Look around.',
					},
				],
				legendaryIntro: 'One action per round.',
			},
		},
	},
	{
		name: 'DataTable',
		source: 'apps/gm-react/src/ds/components/data/DataTable.jsx',
		description: 'A populated or empty table with sorting and density controls.',
		props: {
			columns: [
				{
					key: 'name',
					header: 'Name',
					sortable: true,
				},
				{
					key: 'count',
					header: 'Count',
					mono: true,
					align: 'right',
				},
			],
			rows: [
				{
					name: 'Lantern',
					count: 3,
				},
				{
					name: 'Map',
					count: 1,
				},
			],
			ariaLabel: 'Example supplies',
		},
		axes: {
			dense: [false, true],
			zebra: [false, true],
			sort: [
				null,
				{
					key: 'name',
					dir: 'asc',
				},
				{
					key: 'name',
					dir: 'desc',
				},
			],
		},
		examples: {
			Default: {},
			Empty: {
				rows: [],
			},
		},
	},
	{
		name: 'DefinitionList',
		source: 'apps/gm-react/src/ds/components/data/DefinitionList.jsx',
		description: 'Label and value pairs.',
		props: {
			items: [
				{
					label: 'Place',
					value: 'Lantern room',
				},
				{
					label: 'Guests',
					value: 3,
				},
			],
		},
		axes: {
			layout: ['rows', 'stacked'],
		},
		examples: {
			Default: {},
			Empty: {
				items: [],
			},
		},
	},
	{
		name: 'Figure',
		source: 'apps/gm-react/src/ds/components/data/Figure.jsx',
		description: 'An image or custom figure with a caption.',
		props: {
			alt: 'Lamplight mark',
			caption: 'An example figure.',
			src: '/icon.svg',
		},
		axes: {
			align: ['left', 'center', 'right'],
		},
		examples: {
			Default: {},
			'Custom content': {
				src: null,
				children: 'Map preview',
			},
		},
	},
	{
		name: 'Stat',
		source: 'apps/gm-react/src/ds/components/data/Stat.jsx',
		description: 'A metric with signed trend and optional unit.',
		props: {
			label: 'Supplies',
			value: 24,
			unit: 'items',
			deltaLabel: 'since last session',
		},
		axes: {
			tone: ['default', 'accent'],
			delta: [null, -3, 0, 3],
			invert: [false, true],
			icon: [null, 'check'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'DiceResult',
		source: 'apps/gm-react/src/ds/components/domain/DiceResult.jsx',
		description: 'Roll readouts for every supported resolution model.',
		props: {
			total: 17,
			rolls: [14],
			modifier: 3,
		},
		axes: {
			crit: [null, 'success', 'fail'],
		},
		examples: {
			Default: {},
			'Dice pool': {
				model: 'dice-pool',
				notation: '2d6',
				dice: [
					{
						sides: 6,
						value: 6,
						success: true,
					},
					{
						sides: 6,
						value: 2,
						success: false,
					},
				],
				successes: 1,
				successThreshold: 5,
			},
			'Strong hit': {
				model: '2d6-pbta',
				total: 10,
				rolls: [6, 4],
				modifier: 0,
				tier: 'strong',
			},
			'Partial hit': {
				model: '2d6-pbta',
				total: 8,
				rolls: [4, 4],
				modifier: 0,
				tier: 'partial',
			},
			Miss: {
				model: '2d6-pbta',
				total: 4,
				rolls: [2, 2],
				modifier: 0,
				tier: 'miss',
			},
			Custom: {
				model: 'custom',
			},
		},
	},
	{
		name: 'HPBar',
		source: 'apps/gm-react/src/ds/components/domain/HPBar.jsx',
		description: 'Health at full, wounded, critical and zero values.',
		props: {
			max: 20,
			label: 'Health',
		},
		axes: {
			current: [20, 12, 4, 0],
			size: ['sm', 'md', 'lg'],
			showText: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'InitiativeRow',
		source: 'apps/gm-react/src/ds/components/domain/InitiativeRow.jsx',
		description: 'A turn row with health, conditions and action economy.',
		props: {
			name: 'Mira',
			initiative: 17,
			current: 12,
			max: 20,
			conditions: ['prone'],
			actionsPerTurn: 3,
		},
		axes: {
			active: [false, true],
			dmOnly: [false, true],
			turnModel: ['initiative', 'popcorn', 'side-based', 'none'],
			actionsUsed: [0, 1, 3],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'StatPill',
		source: 'apps/gm-react/src/ds/components/domain/StatPill.jsx',
		description: 'A compact statistic.',
		props: {
			label: 'AC',
			value: 16,
		},
		axes: {
			tone: ['default', 'accent', 'success', 'warning', 'error'],
			mono: [false, true],
			align: ['left', 'center'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Badge',
		source: 'apps/gm-react/src/ds/components/feedback/Badge.jsx',
		description: 'A short status label.',
		props: {
			children: 'Example status',
		},
		axes: {
			status: ['success', 'warning', 'error', 'info', 'accent', 'neutral'],
			icon: [null, 'check'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Chip',
		source: 'apps/gm-react/src/ds/components/feedback/Chip.jsx',
		description: 'A tag, selected filter or removable token.',
		props: {
			children: 'Lantern',
		},
		axes: {
			tone: ['neutral', 'accent', 'danger', 'info'],
			selected: [false, true],
			icon: [null, 'tag'],
		},
		examples: {
			Default: {},
			Static: {
				onRemove: null,
				onClick: null,
			},
			Removable: {
				onClick: null,
			},
		},
	},
	{
		name: 'StatusDot',
		source: 'apps/gm-react/src/ds/components/feedback/StatusDot.jsx',
		description: 'A reinforcing status cue with a visible label.',
		props: {
			label: 'Connection status',
		},
		axes: {
			status: ['live', 'idle', 'warning', 'error', 'syncing', 'pending'],
			pulse: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'VisibilityChip',
		source: 'apps/gm-react/src/ds/components/feedback/VisibilityChip.jsx',
		description: 'Safety labels for private and player-visible content.',
		props: {},
		axes: {
			level: ['dm-only', 'players', 'hidden', 'mixed', 'player-visible', 'shared'],
			compact: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Checkbox',
		source: 'apps/gm-react/src/ds/components/forms/Checkbox.jsx',
		description: 'A labelled binary control.',
		props: {
			label: 'Enable example',
		},
		axes: {
			checked: [false, true],
			disabled: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Field',
		source: 'apps/gm-react/src/ds/components/forms/Field.jsx',
		description: 'A label, control, help and validation message.',
		props: {
			label: 'Scene name',
			help: 'Choose a memorable name.',
		},
		axes: {
			required: [false, true],
			error: [null, 'Enter a scene name.'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Input',
		source: 'apps/gm-react/src/ds/components/forms/Input.jsx',
		description: 'A labelled form control with validation and unavailable states.',
		props: {
			'aria-label': 'Example Input',
			placeholder: 'Enter a scene name',
		},
		axes: {
			invalid: [false, true],
			disabled: [false, true],
			readOnly: [false, true],
			icon: [null, 'search'],
		},
		examples: {
			Default: {},
			Filled: {
				defaultValue: 'Lantern room',
			},
		},
	},
	{
		name: 'Textarea',
		source: 'apps/gm-react/src/ds/components/forms/Input.jsx',
		description: 'A labelled form control with validation and unavailable states.',
		props: {
			'aria-label': 'Example Textarea',
			placeholder: 'Enter a scene name',
		},
		axes: {
			invalid: [false, true],
			disabled: [false, true],
			readOnly: [false, true],
		},
		examples: {
			Default: {},
			Filled: {
				defaultValue: 'Lantern room',
			},
		},
	},
	{
		name: 'SegmentedControl',
		source: 'apps/gm-react/src/ds/components/forms/SegmentedControl.jsx',
		description: 'A compact single-choice group.',
		props: {
			options: [
				{
					value: 'scenes',
					label: 'Scenes',
				},
				{
					value: 'notes',
					label: 'Notes',
				},
				{
					value: 'locked',
					label: 'Unavailable',
					disabled: true,
				},
			],
			value: 'scenes',
			ariaLabel: 'Example view',
		},
		axes: {
			size: ['sm', 'md'],
			fullWidth: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Select',
		source: 'apps/gm-react/src/ds/components/forms/Select.jsx',
		description: 'A labelled form control with validation and unavailable states.',
		props: {
			'aria-label': 'Example Select',
			options: [
				{
					value: 'scenes',
					label: 'Scenes',
				},
				{
					value: 'notes',
					label: 'Notes',
				},
				{
					value: 'locked',
					label: 'Unavailable',
					disabled: true,
				},
			],
			defaultValue: 'scenes',
		},
		axes: {
			invalid: [false, true],
			disabled: [false, true],
		},
		examples: {
			Default: {},
			Filled: {
				defaultValue: 'scenes',
			},
		},
	},
	{
		name: 'Slider',
		source: 'apps/gm-react/src/ds/components/forms/Slider.jsx',
		description: 'A bounded numeric control with optional steppers and stops.',
		props: {
			label: 'Example volume',
			value: 40,
		},
		axes: {
			steppers: [false, true],
			disabled: [false, true],
			stops: [null, [0, 25, 50, 75, 100]],
			value: [0, 40, 100],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Switch',
		source: 'apps/gm-react/src/ds/components/forms/Switch.jsx',
		description: 'A labelled binary control.',
		props: {
			label: 'Enable example',
		},
		axes: {
			checked: [false, true],
			disabled: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'TagInput',
		source: 'apps/gm-react/src/ds/components/forms/TagInput.jsx',
		description: 'Add and remove tags with keyboard or pointer.',
		props: {
			value: ['Lantern', 'Coast'],
			'aria-label': 'Example tags',
		},
		axes: {
			disabled: [false, true],
			maxTags: [2, 5],
		},
		examples: {
			Default: {},
			Empty: {
				value: [],
			},
		},
	},
	{
		name: 'FogControls',
		source: 'apps/gm-react/src/ds/components/map/FogControls.jsx',
		description: 'Fog modes, shapes, feathering and synchronization feedback.',
		props: {},
		axes: {
			mode: ['reveal', 'conceal'],
			shape: ['brush', 'rect', 'polygon'],
			feather: [false, true],
			syncStatus: ['synced', 'syncing', 'queued', 'idle'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'GenerationPanel',
		source: 'apps/gm-react/src/ds/components/map/GenerationPanel.jsx',
		description: 'Map generation configuration, progress and review.',
		props: {},
		axes: {
			progress: [null, 0, 50, 100],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'ImportWizard',
		source: 'apps/gm-react/src/ds/components/map/ImportWizard.jsx',
		description: 'Interactive selection, preview and completion of a sample import.',
		props: {},
		axes: {},
		examples: {
			Default: {},
			Preview: {
				step: 1,
			},
			Complete: {
				step: 2,
			},
		},
	},
	{
		name: 'LayerPanel',
		source: 'apps/gm-react/src/ds/components/map/LayerPanel.jsx',
		description: 'An editable or read-only stack of map layers.',
		props: {
			layers: [
				{
					id: 'coast',
					name: 'Coast',
					type: 'base',
					visibility: 'dm-only',
					opacity: 100,
				},
				{
					id: 'notes',
					name: 'Notes',
					type: 'dm',
					visibility: 'dm-only',
					opacity: 100,
				},
			],
		},
		axes: {
			readOnly: [false, true],
		},
		examples: {
			Default: {},
			Empty: {
				layers: [],
			},
		},
	},
	{
		name: 'LayerRow',
		source: 'apps/gm-react/src/ds/components/map/LayerRow.jsx',
		description: 'Layer display, visibility, opacity, lock, selection and rename controls.',
		props: {
			layer: {
				id: 'coast',
				name: 'Coast',
				type: 'base',
				visibility: 'dm-only',
				opacity: 100,
			},
		},
		axes: {
			readOnly: [false, true],
			dimmed: [false, true],
			selected: [false, true],
		},
		examples: {
			Default: {},
			'Player visible': {
				layer: {
					id: 'coast',
					name: 'Coast',
					type: 'base',
					visibility: 'players',
					opacity: 100,
				},
			},
			Shared: {
				layer: {
					id: 'coast',
					name: 'Coast',
					type: 'base',
					visibility: 'shared',
					opacity: 100,
				},
			},
			'Hidden and locked': {
				layer: {
					id: 'coast',
					name: 'Coast',
					type: 'base',
					visibility: 'dm-only',
					opacity: 40,
					dmDisplay: false,
					locked: true,
				},
			},
		},
	},
	{
		name: 'LayerTypeBadge',
		source: 'apps/gm-react/src/ds/components/map/LayerTypeBadge.jsx',
		description: 'Every shipped layer category.',
		props: {},
		axes: {
			type: [
				'base',
				'height',
				'political',
				'climate',
				'roads',
				'water',
				'wshed',
				'fog',
				'poi',
				'dm',
				'player',
				'combat',
				'custom',
			],
			showIcon: [false, true],
			compact: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'MapCreationForm',
		source: 'apps/gm-react/src/ds/components/map/MapCreationForm.jsx',
		description: 'A local map form with validation and submitting state.',
		props: {},
		axes: {
			submitting: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Minimap',
		source: 'apps/gm-react/src/ds/components/map/Minimap.jsx',
		description: 'A collapsible viewport preview with click-to-jump.',
		props: {},
		axes: {},
		examples: {
			Default: {},
			Collapsed: {
				defaultCollapsed: true,
			},
		},
	},
	{
		name: 'POIMarker',
		source: 'apps/gm-react/src/ds/components/map/POIMarker.jsx',
		description: 'Point-of-interest categories, active state and DM-only cue.',
		props: {
			label: 'Lantern tower',
		},
		axes: {
			category: ['location', 'quest', 'danger', 'npc', 'treasure', 'note'],
			active: [false, true],
			dmOnly: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'POIPopover',
		source: 'apps/gm-react/src/ds/components/map/POIPopover.jsx',
		description: 'Point-of-interest details and visibility actions.',
		props: {
			poi: {
				name: 'Lantern tower',
				category: 'location',
				visibility: 'dm-only',
				notePreview: 'A light on the coast.',
			},
		},
		axes: {
			readOnly: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'ToolPalette',
		source: 'apps/gm-react/src/ds/components/map/ToolPalette.jsx',
		description: 'Map tools with orientation, history and overflow states.',
		props: {
			active: 'select',
		},
		axes: {
			orientation: ['vertical', 'horizontal'],
			canUndo: [false, true],
			canRedo: [false, true],
			overflow: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'BottomTabBar',
		source: 'apps/gm-react/src/ds/components/navigation/BottomTabBar.jsx',
		description: 'Navigation with an active destination.',
		props: {
			items: [
				{
					label: 'Scenes',
					icon: 'scene',
					key: 'scenes',
				},
				{
					label: 'Notes',
					icon: 'note',
					key: 'notes',
				},
			],
			active: 'scenes',
		},
		axes: {
			active: ['scenes', 'notes'],
		},
		examples: {
			Default: {},
			Empty: {
				items: [],
			},
		},
	},
	{
		name: 'NavItem',
		source: 'apps/gm-react/src/ds/components/navigation/NavItem.jsx',
		description: 'An expanded or collapsed navigation action.',
		props: {
			icon: 'scene',
			label: 'Scenes',
		},
		axes: {
			active: [false, true],
			collapsed: [false, true],
			badge: [null, 3],
		},
		examples: {
			Default: {},
			Link: {
				as: 'a',
				href: '#/__ds',
			},
		},
	},
	{
		name: 'NavRail',
		source: 'apps/gm-react/src/ds/components/navigation/NavRail.jsx',
		description: 'Navigation with an active destination.',
		props: {
			items: [
				{
					label: 'Scenes',
					icon: 'scene',
					key: 'scenes',
				},
				{
					label: 'Notes',
					icon: 'note',
					key: 'notes',
				},
			],
			active: 'scenes',
		},
		axes: {
			active: ['scenes', 'notes'],
		},
		examples: {
			Default: {},
			Empty: {
				items: [],
			},
		},
	},
	{
		name: 'NavSidebar',
		source: 'apps/gm-react/src/ds/components/navigation/NavSidebar.jsx',
		description: 'Navigation with an active destination.',
		props: {
			items: [
				{
					label: 'Scenes',
					icon: 'scene',
					key: 'scenes',
				},
				{
					label: 'Notes',
					icon: 'note',
					key: 'notes',
				},
			],
			active: 'scenes',
		},
		axes: {
			active: ['scenes', 'notes'],
		},
		examples: {
			Default: {},
			Empty: {
				items: [],
			},
		},
	},
	{
		name: 'Dialog',
		source: 'apps/gm-react/src/ds/components/overlay/Dialog.jsx',
		description: 'Open the example to inspect focus, dismissal and focus return.',
		props: {
			title: 'Example details',
			description: 'Review this local example.',
			children: 'Example content. No vault data is changed.',
		},
		axes: {
			dismissible: [true, false],
			size: ['sm', 'md', 'lg'],
			tone: ['default', 'danger', 'warning', 'success', 'info'],
			backdropDismissible: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Sheet',
		source: 'apps/gm-react/src/ds/components/overlay/Sheet.jsx',
		description: 'Open the example to inspect focus, dismissal and focus return.',
		props: {
			title: 'Example details',
			description: 'Review this local example.',
			children: 'Example content. No vault data is changed.',
		},
		axes: {
			dismissible: [true, false],
			side: ['bottom', 'left', 'right'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Toast',
		source: 'apps/gm-react/src/ds/components/overlay/Toast.jsx',
		description: 'Dismissible feedback with an optional action.',
		props: {
			title: 'Example saved',
			message: 'Your local example is ready.',
			action: 'Undo',
		},
		axes: {
			status: ['success', 'warning', 'error', 'info'],
			live: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'ToastViewport',
		source: 'apps/gm-react/src/ds/components/overlay/Toast.jsx',
		description: 'A live toast queue with hover/focus pause and dismissal.',
		props: {},
		axes: {
			placement: ['top-right', 'top-center', 'bottom-right', 'bottom-center'],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Tooltip',
		source: 'apps/gm-react/src/ds/components/overlay/Tooltip.jsx',
		description: 'Hover or focus the trigger to inspect the tooltip.',
		props: {
			label: 'More about this example',
		},
		axes: {
			placement: ['top', 'bottom', 'left', 'right'],
			delay: [0, 250],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'SpellCard',
		source: 'apps/gm-react/src/ds/components/spell/SpellCard.jsx',
		description: 'A spell reference with school, level, ritual and concentration.',
		props: {
			name: 'Lantern light',
			castingTime: '1 action',
			range: 'Touch',
			components: 'V, S',
			duration: '1 hour',
			description: 'A small light illuminates the way.',
		},
		axes: {
			level: [0, 1, 3],
			school: [
				'abjuration',
				'conjuration',
				'divination',
				'enchantment',
				'evocation',
				'illusion',
				'necromancy',
				'transmutation',
			],
			concentration: [false, true],
			ritual: [false, true],
		},
		examples: {
			Default: {},
			'Higher levels': {
				higherLevels: 'The light lasts longer.',
			},
		},
	},
	{
		name: 'SpellSlots',
		source: 'apps/gm-react/src/ds/components/spell/SpellSlots.jsx',
		description: 'Available and spent spell resources with a read-only view.',
		props: {
			levels: [
				{
					level: 1,
					total: 4,
					used: 2,
				},
				{
					level: 2,
					total: 2,
					used: 2,
				},
			],
		},
		axes: {
			readOnly: [false, true],
		},
		examples: {
			Default: {},
			Empty: {
				levels: [],
			},
		},
	},
	{
		name: 'EmptyState',
		source: 'apps/gm-react/src/ds/components/system/EmptyState.jsx',
		description: 'An empty surface with explanation and optional action.',
		props: {
			title: 'No scenes yet',
			description: 'Create a scene to begin.',
		},
		axes: {
			inset: [false, true],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'ProgressMeter',
		source: 'apps/gm-react/src/ds/components/system/ProgressMeter.jsx',
		description: 'Determinate or indeterminate progress, with markers.',
		props: {
			value: 40,
			label: 'Example progress',
		},
		axes: {
			tone: ['success', 'warning', 'error', 'info', 'accent', 'neutral'],
			size: ['sm', 'md', 'lg'],
			indeterminate: [false, true],
			value: [0, 40, 100],
			markers: [[], [25, 50, 75]],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'Skeleton',
		source: 'apps/gm-react/src/ds/components/system/Skeleton.jsx',
		description: 'Loading placeholders for text, avatars and panels.',
		props: {
			width: '100%',
			height: 'var(--space-8)',
		},
		axes: {
			variant: ['rect', 'text', 'circle'],
			lines: [1, 3],
		},
		examples: {
			Default: {},
		},
	},
	{
		name: 'SystemPackageCard',
		source: 'apps/gm-react/src/ds/components/system/SystemPackageCard.jsx',
		description: 'Game-system choice with active, current and compact states.',
		props: {
			name: 'Example system',
			summary: 'A local rules vocabulary.',
			chips: [
				{
					label: 'Fantasy',
				},
				{
					label: 'Dice',
				},
			],
		},
		axes: {
			tier: ['official', 'community', 'custom'],
			active: [false, true],
			current: [false, true],
			compact: [false, true],
		},
		examples: {
			Default: {},
		},
	},
];
const stack: CSSProperties = { display: 'grid', gap: 'var(--space-4)', minWidth: 'var(--space-0)' };
const row: CSSProperties = {
	display: 'flex',
	flexWrap: 'wrap',
	gap: 'var(--space-3)',
	alignItems: 'center',
};
const control: CSSProperties = {
	maxWidth: '100%',
	minHeight: 'var(--density-button-height)',
	padding: 'var(--space-2)',
	border: '1px solid var(--color-border-strong)',
	borderRadius: 'var(--radius-sm)',
	background: 'var(--color-surface-raised)',
	color: 'var(--color-text-primary)',
};
const components = DS as unknown as Record<string, ComponentType<Props>>;

/** Only the selected specimen mounts: modal focus traps and live regions never compete. */
function Specimen({ entry, initial }: { entry: GalleryEntry; initial: Props }) {
	const [props, setProps] = useState(initial);
	const [open, setOpen] = useState(false);
	const [message, setMessage] = useState('No example actions yet.');
	const [removed, setRemoved] = useState(false);
	const toastIds = useRef<number[]>([]);
	useEffect(() => {
		const ids = toastIds.current;
		return () => ids.forEach((id) => DS.Toaster.dismiss(id));
	}, []);
	const id = useId();
	const update = (key: string, value: unknown) => setProps((p) => ({ ...p, [key]: value }));
	const action = () => setMessage('Example action received.');
	const close = () => setOpen(false);
	const remove = () => {
		setRemoved(true);
		setMessage('Example removed. Use Reset example to restore it.');
	};
	const Component = components[entry.name];
	const scrollable = ['InitiativeRow', 'ImportWizard', 'Toast'].includes(entry.name);
	const common = { ...props, onClick: action };
	let specimen;
	switch (entry.name) {
		case 'Dialog':
		case 'Sheet':
		case 'Popover':
		case 'CommandPalette':
		case 'POIPopover': {
			const commands = (props.commands as Props[] | undefined)?.map((command) => ({
				...command,
				run: () => {
					action();
					close();
				},
			}));
			specimen = (
				<>
					<DS.Button onClick={() => setOpen(true)}>Open example</DS.Button>
					{open && (
						<Component
							{...props}
							open
							onClose={close}
							{...(entry.name === 'CommandPalette'
								? { commands }
								: entry.name === 'POIPopover'
									? {
											onFocus: action,
											onEdit: action,
											onDeepLink: action,
											onDelete: close,
											onOpenNote: action,
											onVisibilityChange: (visibility: string) =>
												update('poi', { ...(props.poi as Props), visibility }),
										}
									: { footer: <DS.Button onClick={close}>Close example</DS.Button> })}
						/>
					)}
				</>
			);
			break;
		}
		case 'Checkbox':
		case 'Switch':
			specimen = (
				<Component {...props} onChange={(checked: boolean) => update('checked', checked)} />
			);
			break;
		case 'RadioCard':
			specimen = <Component {...props} onChange={() => update('checked', !props.checked)} />;
			break;
		case 'Slider':
		case 'SegmentedControl':
		case 'TagInput':
			specimen = <Component {...props} onChange={(value: unknown) => update('value', value)} />;
			break;
		case 'Tabs':
			specimen = (
				<>
					<DS.Tabs {...props} idBase={id} onChange={(value: string) => update('value', value)} />
					{(props.tabs as Props[]).length > 0 && (
						<div {...DS.tabPanelProps(id, String(props.value))}>
							Selected panel: {String(props.value)}
						</div>
					)}
				</>
			);
			break;
		case 'Field':
			specimen = (
				<DS.Field {...props} htmlFor={id}>
					<DS.Input id={id} invalid={!!props.error} required={props.required} />
				</DS.Field>
			);
			break;
		case 'ListItem':
			specimen = (
				<ul style={{ padding: 'var(--space-0)', margin: 'var(--space-0)', listStyle: 'none' }}>
					<DS.ListItem {...props} onSelect={() => update('selected', !props.selected)} />
				</ul>
			);
			break;
		case 'Menu':
			specimen = (
				<DS.Menu {...props}>
					<DS.Button role="menuitem" onClick={action}>
						Edit example
					</DS.Button>
					<DS.Button role="menuitem" disabled>
						Unavailable
					</DS.Button>
				</DS.Menu>
			);
			break;
		case 'Toolbar':
			specimen = (
				<DS.Toolbar {...props}>
					<DS.Button onClick={action}>Save example</DS.Button>
					<DS.IconButton icon="edit" label="Edit example" onClick={action} />
				</DS.Toolbar>
			);
			break;
		case 'Tooltip':
			specimen = (
				<DS.Tooltip {...props}>
					<button type="button">Hover or focus for help</button>
				</DS.Tooltip>
			);
			break;
		case 'SystemProvider':
			specimen = (
				<DS.SystemProvider {...props}>
					<DS.ConditionTracker entries={[{ key: 'inspired' }]} />
				</DS.SystemProvider>
			);
			break;
		case 'Chip':
		case 'ConditionBadge':
			specimen = removed ? (
				<p>Example removed.</p>
			) : (
				<Component
					{...props}
					onRemove={props.onRemove === null ? undefined : remove}
					onClick={
						entry.name === 'Chip' && props.onClick !== null
							? () => update('selected', !props.selected)
							: undefined
					}
				/>
			);
			break;
		case 'ConditionTracker':
			specimen = (
				<Component
					{...props}
					onRemove={(_condition: string, index: number) =>
						update(
							'entries',
							(props.entries as Props[]).filter((_, i) => i !== index),
						)
					}
					onAdd={() => update('entries', [...(props.entries as Props[]), { key: 'prone' }])}
				/>
			);
			break;
		case 'Toast':
			specimen = removed ? (
				<p>Example dismissed.</p>
			) : (
				<DS.Toast {...props} onAction={action} onDismiss={remove} />
			);
			break;
		case 'ToastViewport':
			specimen = (
				<>
					<DS.Button
						onClick={() =>
							toastIds.current.push(
								DS.Toaster.show({ message: 'Gallery example toast', duration: 5000 }),
							)
						}
					>
						Show example toast
					</DS.Button>
					<DS.ToastViewport {...props} />
				</>
			);
			break;
		case 'EmptyState':
			specimen = (
				<DS.EmptyState {...props} action={<DS.Button onClick={action}>Create example</DS.Button>} />
			);
			break;
		case 'FeatureSpotlight':
			specimen = <Component {...props} onAction={action} />;
			break;
		case 'CardHeader':
			specimen = (
				<Component
					{...props}
					actions={<DS.IconButton icon="edit" label="Edit example" onClick={action} />}
				/>
			);
			break;
		case 'Avatar':
			specimen = (
				<div style={row}>
					<Component {...props} />
					<span>{String(props.name || 'Unnamed participant')}</span>
				</div>
			);
			break;
		case 'NavRail':
		case 'NavSidebar':
		case 'BottomTabBar':
			specimen = <Component {...props} onSelect={(active: string) => update('active', active)} />;
			break;
		case 'Breadcrumb':
			specimen = <Component {...props} onNavigate={action} />;
			break;
		case 'DataTable':
			specimen = (
				<Component
					{...props}
					onSort={(key: string) => {
						const sort = props.sort as Props | null;
						const dir = sort?.dir === 'asc' ? 'desc' : 'asc';
						setProps((p) => ({
							...p,
							sort: { key, dir },
							rows: [...(p.rows as Props[])].sort(
								(a, b) => String(a[key]).localeCompare(String(b[key])) * (dir === 'asc' ? 1 : -1),
							),
						}));
					}}
				/>
			);
			break;
		case 'QuestCard':
			specimen = (
				<Component
					{...props}
					onToggleObjective={(index: number) =>
						update(
							'objectives',
							(props.objectives as Props[]).map((o, i) =>
								i === index ? { ...o, done: !o.done } : o,
							),
						)
					}
				/>
			);
			break;
		case 'SpellSlots':
			specimen = (
				<Component
					{...props}
					onToggle={(level: number, index: number) =>
						update(
							'levels',
							(props.levels as Props[]).map((l) =>
								l.level === level
									? {
											...l,
											used:
												Number(l.total) -
												index -
												(index < Number(l.total) - Number(l.used) ? 0 : 1),
										}
									: l,
							),
						)
					}
				/>
			);
			break;
		case 'InitiativeRow':
			specimen = (
				<Component
					{...props}
					onHpUp={() => update('current', Math.min(Number(props.max), Number(props.current) + 1))}
					onHpDown={() => update('current', Math.max(0, Number(props.current) - 1))}
				/>
			);
			break;
		case 'LayerRow': {
			const layer = props.layer as Props;
			const setLayer = (key: string, value: unknown) => update('layer', { ...layer, [key]: value });
			specimen = (
				<Component
					{...props}
					onToggleDisplay={() => setLayer('dmDisplay', layer.dmDisplay === false)}
					onToggleLock={() => setLayer('locked', !layer.locked)}
					onCycleVisibility={(visibility: string) => setLayer('visibility', visibility)}
					onOpacityChange={(opacity: number) => setLayer('opacity', opacity)}
					onRename={(name: string) => setLayer('name', name)}
					onAction={action}
					onMove={action}
				/>
			);
			break;
		}
		case 'LayerPanel':
			specimen = <Component {...props} onChange={action} onAddLayer={action} />;
			break;
		case 'FogControls':
			specimen = (
				<Component
					{...props}
					onModeChange={(v: string) => update('mode', v)}
					onShapeChange={(v: string) => update('shape', v)}
					onBrushSize={(v: number) => update('brushSize', v)}
					onFeather={(v: boolean) => update('feather', v)}
					onRevealAll={action}
					onResetFog={action}
				/>
			);
			break;
		case 'GenerationPanel':
			specimen = (
				<Component {...props} onAccept={action} onDiscard={action} onRandomizeSeed={action} />
			);
			break;
		case 'ImportWizard':
			specimen = <Component {...props} onCommit={action} onCancel={action} onOpenMap={action} />;
			break;
		case 'MapCreationForm':
			specimen = <Component {...props} onCreate={action} onCancel={action} />;
			break;
		case 'Minimap':
			specimen = <Component {...props} onJump={action} />;
			break;
		case 'ToolPalette':
			specimen = (
				<Component
					{...props}
					onSelect={(active: string) => update('active', active)}
					onUndo={action}
					onRedo={action}
				/>
			);
			break;
		case 'SystemPackageCard':
			specimen = <Component {...props} onSelect={() => update('active', !props.active)} />;
			break;
		default:
			specimen = <Component {...common} />;
	}
	return (
		<div style={stack}>
			<div
				data-ds-specimen={entry.name}
				role={scrollable ? 'group' : undefined}
				aria-label={scrollable ? `${entry.name} example, scroll for more` : undefined}
				tabIndex={scrollable ? 0 : undefined}
				style={{
					...stack,
					position: 'relative',
					minHeight: props.anchor ? 'calc(var(--space-16) * 6)' : undefined,
					overflowX: scrollable ? 'auto' : undefined,
					padding: 'var(--space-6)',
					border: '1px solid var(--color-border)',
					borderRadius: 'var(--radius-md)',
					background: 'var(--color-surface)',
				}}
			>
				{specimen}
			</div>
			<p role="status">{message}</p>
		</div>
	);
}

export function DsGallery() {
	const [name, setName] = useState('Button');
	const [example, setExample] = useState('Default');
	const [overrides, setOverrides] = useState<Props>({});
	const [revision, setRevision] = useState(0);
	const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'tavern');
	const [density, setDensity] = useState(document.documentElement.dataset.density || 'comfortable');
	const entry = galleryRegistry.find((item) => item.name === name)!;
	const axes =
		entry.name === 'Icon'
			? { ...entry.axes, name: Object.keys(DS.ICON_REGISTRY) }
			: entry.name === 'ConditionBadge'
				? { ...entry.axes, condition: Object.keys(DS.DEFAULT_CONDITIONS) }
				: entry.axes;
	const props = {
		...Object.fromEntries(Object.entries(axes).map(([key, values]) => [key, values[0]])),
		...entry.props,
		...entry.examples[example],
		...overrides,
	};
	// Apply to html so fixed overlays inherit the same tokens; do not persist gallery preferences.
	useEffect(() => {
		const root = document.documentElement;
		const previousTheme = root.getAttribute('data-theme');
		const previousDensity = root.getAttribute('data-density');
		return () => {
			for (const [attribute, value] of [
				['data-theme', previousTheme],
				['data-density', previousDensity],
			]) {
				if (value === null) root.removeAttribute(attribute!);
				else root.setAttribute(attribute!, value!);
			}
		};
	}, []);
	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		document.documentElement.dataset.density = density;
	}, [theme, density]);
	return (
		<main
			data-ds-gallery="lamplight-ds-gallery"
			style={{
				...stack,
				padding: 'var(--space-6)',
				color: 'var(--color-text-primary)',
				background: 'var(--color-bg)',
				fontFamily: 'var(--font-sans)',
				minHeight: '100vh',
			}}
		>
			<h1>Component gallery</h1>
			<p>
				{galleryRegistry.length} components. Choose an example and combine its variant and state
				controls. Hover, press and Tab through the specimen to inspect native interaction states.
			</p>
			<a href="#/">Return to Lamplight</a>
			<div style={row}>
				<label style={{ maxWidth: '100%', minWidth: 'var(--space-0)' }}>
					Theme{' '}
					<select
						aria-label="Theme"
						style={control}
						value={theme}
						onChange={(event) => setTheme(event.target.value)}
					>
						{['tavern', 'parchment', 'high-contrast'].map((value) => (
							<option key={value}>{value}</option>
						))}
					</select>
				</label>
				<label style={{ maxWidth: '100%', minWidth: 'var(--space-0)' }}>
					Density{' '}
					<select
						aria-label="Density"
						style={control}
						value={density}
						onChange={(event) => setDensity(event.target.value)}
					>
						{['comfortable', 'compact'].map((value) => (
							<option key={value}>{value}</option>
						))}
					</select>
				</label>
				<label style={{ maxWidth: '100%', minWidth: 'var(--space-0)' }}>
					Component{' '}
					<select
						aria-label="Component"
						style={control}
						value={name}
						onChange={(event) => {
							setName(event.target.value);
							setExample('Default');
							setOverrides({});
						}}
					>
						{galleryRegistry.map((item) => (
							<option key={item.name}>{item.name}</option>
						))}
					</select>
				</label>
			</div>
			<section style={stack} aria-labelledby="ds-component-title">
				<h2 id="ds-component-title">{entry.name}</h2>
				<p>{entry.description}</p>
				<code style={{ overflowWrap: 'anywhere' }}>{entry.source}</code>
				<div style={row}>
					<label style={{ maxWidth: '100%', minWidth: 'var(--space-0)' }}>
						Example{' '}
						<select
							aria-label="Example"
							style={control}
							value={example}
							onChange={(event) => {
								setExample(event.target.value);
								setOverrides({});
							}}
						>
							{Object.keys(entry.examples).map((value) => (
								<option key={value}>{value}</option>
							))}
						</select>
					</label>
					{Object.entries(axes).map(([key, values]) => (
						<label key={key} style={{ maxWidth: '100%', minWidth: 'var(--space-0)' }}>
							{key}{' '}
							<select
								style={control}
								aria-label={`Prop ${key}`}
								value={JSON.stringify(props[key])}
								onChange={(event) =>
									setOverrides((current) => ({ ...current, [key]: JSON.parse(event.target.value) }))
								}
							>
								{values.map((value) => (
									<option key={JSON.stringify(value)} value={JSON.stringify(value)}>
										{typeof value === 'string' ? value : JSON.stringify(value)}
									</option>
								))}
							</select>
						</label>
					))}
					<DS.Button onClick={() => setRevision((current) => current + 1)}>Reset example</DS.Button>
				</div>
				<Specimen
					key={`${name}:${example}:${JSON.stringify(overrides)}:${revision}`}
					entry={entry}
					initial={props}
				/>
				<details>
					<summary>Example props</summary>
					<pre style={{ overflowX: 'auto' }}>{JSON.stringify(props, null, 2)}</pre>
				</details>
			</section>
		</main>
	);
}
