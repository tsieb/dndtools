// Shared gallery registry and documentation command entry point.
// Browser imports load only literal fixtures. Node-only tooling lives in the app script below.
// Node 22.18+/24 provides import.meta.main; browsers leave it undefined.
/** @type {Array<{name: string, source: string, description: string, props: Record<string, unknown>, axes: Record<string, unknown[]>, examples: Record<string, Record<string, unknown>>}>} */
export const galleryRegistry = [
	{
		name: 'NpcCard',
		source: 'apps/gm-react/src/ds/components/campaign/NpcCard.tsx',
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
		source: 'apps/gm-react/src/ds/components/campaign/QuestCard.tsx',
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
		source: 'apps/gm-react/src/ds/components/campaign/SessionTimeline.tsx',
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
		source: 'apps/gm-react/src/ds/components/command/CommandPalette.tsx',
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
		source: 'apps/gm-react/src/ds/components/condition/ConditionBadge.tsx',
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
		source: 'apps/gm-react/src/ds/components/condition/ConditionTracker.tsx',
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
		source: 'apps/gm-react/src/ds/components/condition/SystemProvider.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Avatar.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Brand.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Brand.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Brand.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Breadcrumb.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Button.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Callout.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Card.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Card.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/FeatureSpotlight.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/HelpTip.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Icon.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/IconButton.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Kbd.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/ListItem.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Menu.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Popover.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/RadioCard.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Stepper.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Tabs.tsx',
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
		source: 'apps/gm-react/src/ds/components/core/Toolbar.tsx',
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
		source: 'apps/gm-react/src/ds/components/creature/AbilityScore.tsx',
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
		source: 'apps/gm-react/src/ds/components/creature/StatBlock.tsx',
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
		source: 'apps/gm-react/src/ds/components/data/DataTable.tsx',
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
		source: 'apps/gm-react/src/ds/components/data/DefinitionList.tsx',
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
		source: 'apps/gm-react/src/ds/components/data/Figure.tsx',
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
		source: 'apps/gm-react/src/ds/components/data/Stat.tsx',
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
		source: 'apps/gm-react/src/ds/components/domain/DiceResult.tsx',
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
		source: 'apps/gm-react/src/ds/components/domain/HPBar.tsx',
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
		source: 'apps/gm-react/src/ds/components/domain/InitiativeRow.tsx',
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
		source: 'apps/gm-react/src/ds/components/domain/StatPill.tsx',
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
		source: 'apps/gm-react/src/ds/components/feedback/Badge.tsx',
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
		source: 'apps/gm-react/src/ds/components/feedback/Chip.tsx',
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
		source: 'apps/gm-react/src/ds/components/feedback/StatusDot.tsx',
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
		source: 'apps/gm-react/src/ds/components/feedback/VisibilityChip.tsx',
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
		source: 'apps/gm-react/src/ds/components/forms/Checkbox.tsx',
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
		source: 'apps/gm-react/src/ds/components/forms/Field.tsx',
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
		source: 'apps/gm-react/src/ds/components/forms/Input.tsx',
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
		source: 'apps/gm-react/src/ds/components/forms/Input.tsx',
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
		source: 'apps/gm-react/src/ds/components/forms/SegmentedControl.tsx',
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
		source: 'apps/gm-react/src/ds/components/forms/Select.tsx',
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
		source: 'apps/gm-react/src/ds/components/forms/Slider.tsx',
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
		source: 'apps/gm-react/src/ds/components/forms/Switch.tsx',
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
		source: 'apps/gm-react/src/ds/components/forms/TagInput.tsx',
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
		source: 'apps/gm-react/src/ds/components/map/FogControls.tsx',
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
		source: 'apps/gm-react/src/ds/components/map/GenerationPanel.tsx',
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
		source: 'apps/gm-react/src/ds/components/map/ImportWizard.tsx',
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
		source: 'apps/gm-react/src/ds/components/map/LayerPanel.tsx',
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
		source: 'apps/gm-react/src/ds/components/map/LayerRow.tsx',
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
		source: 'apps/gm-react/src/ds/components/map/LayerTypeBadge.tsx',
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
		source: 'apps/gm-react/src/ds/components/map/MapCreationForm.tsx',
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
		source: 'apps/gm-react/src/ds/components/map/Minimap.tsx',
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
		source: 'apps/gm-react/src/ds/components/map/POIMarker.tsx',
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
		source: 'apps/gm-react/src/ds/components/map/POIPopover.tsx',
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
		source: 'apps/gm-react/src/ds/components/map/ToolPalette.tsx',
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
		source: 'apps/gm-react/src/ds/components/navigation/BottomTabBar.tsx',
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
		source: 'apps/gm-react/src/ds/components/navigation/NavItem.tsx',
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
		source: 'apps/gm-react/src/ds/components/navigation/NavRail.tsx',
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
		source: 'apps/gm-react/src/ds/components/navigation/NavSidebar.tsx',
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
		source: 'apps/gm-react/src/ds/components/overlay/Dialog.tsx',
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
		source: 'apps/gm-react/src/ds/components/overlay/Sheet.tsx',
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
		source: 'apps/gm-react/src/ds/components/overlay/Toast.tsx',
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
		source: 'apps/gm-react/src/ds/components/overlay/Toast.tsx',
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
		source: 'apps/gm-react/src/ds/components/overlay/Tooltip.tsx',
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
		source: 'apps/gm-react/src/ds/components/spell/SpellCard.tsx',
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
		source: 'apps/gm-react/src/ds/components/spell/SpellSlots.tsx',
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
		source: 'apps/gm-react/src/ds/components/system/EmptyState.tsx',
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
		source: 'apps/gm-react/src/ds/components/system/ProgressMeter.tsx',
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
		source: 'apps/gm-react/src/ds/components/system/Skeleton.tsx',
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
		source: 'apps/gm-react/src/ds/components/system/SystemPackageCard.tsx',
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
if (import.meta.main) {
	const { run } = await import('../apps/gm-react/scripts/check-prod-bundle.mjs');
	await run({
		registry: galleryRegistry,
		defaultOutDir: new URL('../apps/gm-react/dist', import.meta.url),
	});
}
