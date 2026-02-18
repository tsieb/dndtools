export interface NoteTemplate {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly icon: string;
	readonly content: string;
	readonly defaultTags: readonly string[];
	readonly defaultFolder: string;
}

const isoDate = new Date().toISOString().split('T')[0];
const localDate = new Date().toLocaleDateString();

export const DND_TEMPLATES: readonly NoteTemplate[] = [
	{
		id: 'npc',
		name: 'NPC',
		description: 'Non-player character profile',
		icon: '\uD83D\uDC64',
		defaultTags: ['npc'],
		defaultFolder: '/npcs',
		content: `---
tags: [npc]
---

# Character Name

> [!npc] NPC Summary
> **Race:** Human | **Class:** Commoner | **Alignment:** Neutral

## Description
Physical appearance, mannerisms, and first impression.

## Personality
Key traits, ideals, bonds, and flaws.

## Background
History, motivations, and secrets.

## Connections
- [[Related NPC]] - relationship
- Found at [[Location]]

## Notes
Session observations and DM reminders.
`,
	},
	{
		id: 'major-npc',
		name: 'Major NPC',
		description: 'Recurring ally, villain, or patron',
		icon: '\uD83C\uDFAD',
		defaultTags: ['npc', 'major'],
		defaultFolder: '/npcs',
		content: `---
tags: [npc, major]
role: ally
status: active
---

# Major NPC Name

> [!npc] Major NPC Snapshot
> **Role:** Ally | **Public Face:** Trusted | **True Agenda:** Hidden

## Core Identity
- **Pronouns:**
- **Ancestry / Species:**
- **Class / Profession:**
- **Alignment / Ethos:**

## Why They Matter
How this NPC influences the campaign and player decisions.

## Motivations
- **Short-term goal:**
- **Long-term goal:**
- **Fear:**
- **Moral line they will not cross:**

## Levers
- **What they want from the party:**
- **What they can offer:**
- **What can pressure or blackmail them:**

## Arc Beats
- [ ] First appearance
- [ ] Turning point
- [ ] Reveal
- [ ] Endgame outcome

## Relationships
| Entity | Relationship | Current State |
|--------|--------------|---------------|
| [[Faction]] | Member / rival | Neutral |
| [[Location]] | Home base | Stable |

## Secrets
Things the players do not know yet.

## Voice and Mannerisms
Speech patterns, tone, and behavior cues for roleplay consistency.
`,
	},
	{
		id: 'location',
		name: 'Location',
		description: 'Place, town, or dungeon',
		icon: '\uD83C\uDFF0',
		defaultTags: ['location'],
		defaultFolder: '/locations',
		content: `---
tags: [location]
---

# Location Name

> [!location] Location Overview
> **Type:** Town | **Region:** Unknown | **Population:** ~100

## Description
Sights, sounds, and atmosphere.

## Key Features
- **Town Square** - central gathering place
- **Market** - goods and services

## NPCs
- [[NPC Name]] - role or title
- [[NPC Name]] - role or title

## Connections
- Road to [[Other Location]]
- Part of [[Region]]

## Notes
DM reminders and plot hooks.
`,
	},
	{
		id: 'settlement',
		name: 'Settlement',
		description: 'Town, city, outpost, or village template',
		icon: '\uD83C\uDFD8',
		defaultTags: ['location', 'settlement'],
		defaultFolder: '/locations',
		content: `---
tags: [location, settlement]
size: town
danger: moderate
---

# Settlement Name

> [!location] Settlement Overview
> **Type:** Town | **Population:** 2,000 | **Government:** Council

## Identity
One paragraph that captures the place in play: what players remember after one visit.

## Districts and Landmarks
| District | Description | Notable NPC |
|----------|-------------|-------------|
| Old Quarter | Historic stone blocks | [[NPC Name]] |
| Market Ward | Trade and gossip hub | [[NPC Name]] |

## Services
| Service | Quality | Cost Modifier |
|---------|---------|---------------|
| Inns | Good | Standard |
| Healing | Limited | +25% |
| Gear | Common only | Standard |

## Local Conflicts
- **Open conflict:**
- **Hidden tension:**
- **Who benefits from chaos:**

## Rumors
- [ ] Rumor 1
- [ ] Rumor 2
- [ ] Rumor 3

## Adventure Hooks
- Hook tied to [[Faction]]
- Hook tied to [[Quest]]

## Notes
Session-level updates, consequences, and changes over time.
`,
	},
	{
		id: 'region',
		name: 'Region',
		description: 'Political or geographic area summary',
		icon: '\uD83D\uDDFA\uFE0F',
		defaultTags: ['world', 'region'],
		defaultFolder: '/world',
		content: `---
tags: [world, region]
scale: regional
---

# Region Name

> [!info] Regional Overview
> **Climate:** Temperate | **Terrain:** Hills and rivers | **Stability:** Fragile

## Big Picture
What makes this region distinct in your setting.

## Borders and Neighbors
- North: [[Neighbor Region]]
- East: [[Neighbor Region]]
- South: [[Neighbor Region]]
- West: [[Neighbor Region]]

## Power Map
| Power | Influence | Method |
|-------|-----------|--------|
| [[Faction]] | High | Trade networks |
| [[Faction]] | Medium | Military force |

## Travel and Hazards
- **Common routes:**
- **Seasonal risks:**
- **Monsters / threats:**

## Key Sites
- [[Location]]
- [[Dungeon]]
- [[Settlement]]

## Campaign Use
How this region supports current and future arcs.
`,
	},
	{
		id: 'dungeon',
		name: 'Dungeon / Site',
		description: 'Dungeon, ruin, stronghold, or delve site',
		icon: '\uD83D\uDD75\uFE0F',
		defaultTags: ['location', 'dungeon'],
		defaultFolder: '/locations',
		content: `---
tags: [location, dungeon]
tier: low
status: active
---

# Dungeon Name

> [!location] Site Overview
> **Type:** Ruin | **Recommended Level:** 3-5 | **Theme:** Undead

## Premise
Why this site exists and why the party should care.

## Entrance and Access
- **Visible entrance:**
- **Hidden entrance:**
- **Lock / key condition:**

## Zones
| Zone | Purpose | Threat |
|------|---------|--------|
| Entry | Orientation and warning | Traps |
| Mid-depths | Exploration and lore | Patrols |
| Core | Boss / objective | Elite enemy |

## Encounters
- [[Encounter: Name]]
- [[Monster: Name]]

## Treasures and Clues
- Reward tied to [[Quest]]
- Lore clue tied to [[Campaign Arc]]

## Fail-Forward Outcomes
Consequences if the party retreats, fails, or negotiates.
`,
	},
	{
		id: 'session',
		name: 'Session',
		description: 'Session log and recap',
		icon: '\uD83D\uDCD6',
		defaultTags: ['session'],
		defaultFolder: '/sessions',
		content: `---
tags: [session]
date: ${isoDate}
---

# Session X: Title

> [!info] Session Info
> **Date:** ${localDate} | **Duration:** ~3h

## Previously
Brief recap of where we left off.

## Key Events
1. First major event
2. Second major event
3. Third major event

## Combat Encounters
- **Enemy Name** - brief outcome

## NPCs Encountered
- [[NPC Name]] - what happened
- [[NPC Name]] - what happened

## Loot & Rewards
| Item | Value | Recipient |
|------|-------|-----------|
| Item | 0 gp | Party     |

## Open Threads
- [ ] Follow up on clue
- [ ] Return to NPC
- [ ] Explore location

## DM Notes
> [!dm] Behind the Screen
> Notes for next session planning.
`,
	},
	{
		id: 'session-prep',
		name: 'Session Prep',
		description: 'Pre-session planning worksheet for the DM',
		icon: '\uD83E\uDDFE',
		defaultTags: ['session', 'prep'],
		defaultFolder: '/sessions',
		content: `---
tags: [session, prep]
date: ${isoDate}
---

# Session Prep: Title

> [!dm] Prep Snapshot
> **Target Length:** 3 hours | **Planned Pillars:** Exploration / Social / Combat

## Last Session Fallout
- Consequence 1
- Consequence 2
- Consequence 3

## Player Character Focus
| PC | Spotlight Opportunity | Hook |
|----|-----------------------|------|
| PC Name | Personal scene | [[Quest]] |
| PC Name | Challenge scene | [[NPC Name]] |

## Likely Scenes
1. Opening scene
2. Mid-session complication
3. Climax decision point

## Prepared Assets
- **Maps:** Yes / No
- **Stat blocks:** [[Monster: Name]]
- **Props / Handouts:** [[Rumor and Clue List]]

## Safety Nets
- If players skip planned content, pivot to:
- If players split the party, handle by:
- If pacing runs long, cut:

## End-State Goals
- [ ] Resolve one active thread
- [ ] Introduce one new thread
- [ ] Leave a clear next objective
`,
	},
	{
		id: 'quest',
		name: 'Quest',
		description: 'Quest or adventure hook',
		icon: '\u2694\uFE0F',
		defaultTags: ['quest'],
		defaultFolder: '/quests',
		content: `---
tags: [quest]
status: active
---

# Quest Title

> [!quest] Quest Summary
> **Given by:** [[NPC Name]] | **Status:** Active | **Reward:** TBD

## Objective
What the party needs to accomplish.

## Background
Why this quest exists and what's at stake.

## Steps
- [ ] First step
- [ ] Second step
- [ ] Final step

## Key Locations
- [[Location]] - relevance

## Complications
Possible obstacles, twists, or moral dilemmas.

## Reward
- Gold: 0 gp
- Items: None
- Reputation: None

## Notes
DM planning notes and contingencies.
`,
	},
	{
		id: 'adventure-hook',
		name: 'Adventure Hook',
		description: 'Quick, reusable hook generator for any level',
		icon: '\uD83E\uDEA7',
		defaultTags: ['quest', 'hook'],
		defaultFolder: '/quests',
		content: `---
tags: [quest, hook]
scope: one-shot
---

# Adventure Hook Title

> [!quest] Hook Pitch
> One sentence: who needs help, what is wrong, and why now.

## Hook Ingredients
- **Client / source:** [[NPC Name]] or [[Faction]]
- **Immediate problem:**
- **Urgency timer:**
- **Visible reward:**
- **Hidden cost:**

## Escalation Ladder
1. Initial ask
2. Unexpected complication
3. Reveal or betrayal
4. Decision with consequences

## Reusable Variants
- Social version:
- Exploration version:
- Combat-forward version:

## World Ties
- Connects to [[Location]]
- Foreshadows [[Campaign Arc]]
`,
	},
	{
		id: 'campaign-arc',
		name: 'Campaign Arc',
		description: 'Multi-session arc with stakes and milestones',
		icon: '\uD83C\uDFAF',
		defaultTags: ['campaign', 'arc'],
		defaultFolder: '/campaign',
		content: `---
tags: [campaign, arc]
status: active
---

# Arc Name

> [!info] Arc Summary
> **Theme:** Power and sacrifice | **Tier:** 5-10 | **Status:** Active

## Core Conflict
What opposing forces are in motion and what happens if nobody intervenes.

## Stakes
- **Personal stakes (PC-level):**
- **Local stakes (settlement / region):**
- **World stakes (setting-level):**

## Milestones
- [ ] Milestone 1: Discovery
- [ ] Milestone 2: Commitment
- [ ] Milestone 3: Reversal
- [ ] Milestone 4: Finale

## Key Actors
- [[Major NPC Name]]
- [[Faction]]
- [[Villain or Rival]]

## Associated Content
- [[Quest]]
- [[Region]]
- [[Dungeon]]

## End Conditions
Define what success, partial success, and failure look like.
`,
	},
	{
		id: 'timeline',
		name: 'Timeline',
		description: 'Chronological world or campaign event tracker',
		icon: '\u23F3',
		defaultTags: ['world', 'timeline'],
		defaultFolder: '/world',
		content: `---
tags: [world, timeline]
scale: campaign
---

# Timeline: Name

> [!info] Timeline Scope
> **Range:** Ancient age to present day | **Focus:** Region / faction / arc

## Era Summary
| Era | Years | Defining Change |
|-----|-------|-----------------|
| First Era | 0-500 | Founding myth |
| Second Era | 501-900 | Empire expansion |
| Current Era | 901-Present | Fragmentation |

## Key Events
| Date | Event | Impact | Linked Notes |
|------|-------|--------|--------------|
| Year 921 | Treaty signed | Temporary peace | [[Faction]] |
| Year 927 | Capital falls | Regional instability | [[Region]] |

## Active Countdown Clocks
- [ ] Clock 1 (0/6): Threat escalates
- [ ] Clock 2 (0/4): Political collapse

## Notes
Use this as the canonical source of sequence and causality.
`,
	},
	{
		id: 'item',
		name: 'Item',
		description: 'Magic item or artifact',
		icon: '\uD83D\uDCA0',
		defaultTags: ['item'],
		defaultFolder: '/items',
		content: `---
tags: [item]
rarity: uncommon
---

# Item Name

> [!item] Item Details
> **Type:** Weapon | **Rarity:** Uncommon | **Attunement:** No

## Description
Physical appearance and sensory details.

## Properties
- **+1 to attack and damage rolls**
- Special ability description

## History
Origin and known lore about this item.

## Current Owner
[[Character Name]] - obtained during [[Session X]]

## Notes
Mechanical details and DM rulings.
`,
	},
	{
		id: 'spell-ritual',
		name: 'Spell / Ritual',
		description: 'Homebrew spell, ritual, or magical technique',
		icon: '\u2728',
		defaultTags: ['magic', 'homebrew'],
		defaultFolder: '/items',
		content: `---
tags: [magic, homebrew]
level: 3
school: evocation
---

# Spell or Ritual Name

> [!item] Magic Summary
> **Type:** Spell / Ritual | **Level:** 3 | **School:** Evocation

## Casting Details
- **Casting Time:**
- **Range:**
- **Components:**
- **Duration:**

## Effect
Write exact playable text first, then interpretation notes.

## Scaling
How the effect changes by slot level, narrative cost, or condition.

## Limitations and Risks
Backfires, costs, counters, and adjudication notes.

## Lore
Origin, creators, and where this knowledge is found.
`,
	},
	{
		id: 'monster',
		name: 'Monster',
		description: 'Creature profile with lore and encounter usage',
		icon: '\uD83D\uDC7E',
		defaultTags: ['monster'],
		defaultFolder: '/encounters',
		content: `---
tags: [monster]
cr: 5
type: fiend
---

# Monster Name

> [!info] Monster Snapshot
> **CR:** 5 | **Type:** Fiend | **Role:** Controller

## Concept
What makes this creature memorable in your setting.

## Combat Profile
- **Role:** Brute / skirmisher / controller
- **Signature ability:**
- **Weakness players can learn:**

## Behavior
Instincts, tactics, and retreat conditions.

## Ecology and Lore
Where it lives, what it wants, and myths around it.

## Adventure Uses
- Ambush in [[Location]]
- Minion of [[Major NPC Name]]
- Guardian of [[Dungeon]]
`,
	},
	{
		id: 'encounter',
		name: 'Encounter',
		description: 'Balanced combat, social, or exploration encounter',
		icon: '\u2694',
		defaultTags: ['encounter'],
		defaultFolder: '/encounters',
		content: `---
tags: [encounter]
pillar: combat
difficulty: medium
---

# Encounter Name

> [!info] Encounter Summary
> **Pillar:** Combat | **Difficulty:** Medium | **Level Band:** 4-6

## Setup
Where and when this encounter triggers.

## Goals
- **Party goal:**
- **Enemy / obstacle goal:**
- **Secondary objective:**

## Participants
| Participant | Quantity | Notes |
|-------------|----------|-------|
| [[Monster: Name]] | 2 | Frontline pressure |
| Hazard | 1 | Environmental threat |

## Environment
Terrain features, hazards, and interactive elements.

## Outcomes
- **Success result:**
- **Partial success result:**
- **Failure result:**

## Adjustments
How to scale up or down for table size and pacing.
`,
	},
	{
		id: 'faction',
		name: 'Faction',
		description: 'Organization or group',
		icon: '\uD83C\uDFF4',
		defaultTags: ['faction'],
		defaultFolder: '/factions',
		content: `---
tags: [faction]
---

# Faction Name

> [!info] Faction Overview
> **Type:** Guild | **Alignment:** Neutral | **Influence:** Regional

## Overview
Purpose, goals, and public reputation.

## Leadership
- **Leader:** [[NPC Name]] - title
- **Notable Members:** [[NPC Name]], [[NPC Name]]

## Goals
1. Primary objective
2. Secondary objective

## Resources
Territory, wealth, military strength, or political influence.

## Relationships
- **Allied with:** [[Other Faction]]
- **Rivals:** [[Other Faction]]
- **Party standing:** Neutral

## Notes
Plot hooks and campaign integration.
`,
	},
	{
		id: 'deity',
		name: 'Deity / Power',
		description: 'God, patron, or cosmic power entry',
		icon: '\u26E9',
		defaultTags: ['world', 'deity'],
		defaultFolder: '/world',
		content: `---
tags: [world, deity]
domain: knowledge
alignment: neutral
---

# Deity or Power Name

> [!info] Divine Overview
> **Domain:** Knowledge | **Alignment:** Neutral | **Worship Base:** Regional

## Portfolio
Concepts this power governs and what followers believe.

## Symbols and Tenets
- **Symbol:**
- **Primary tenet:**
- **Forbidden act:**

## Worship and Institutions
- Temples:
- Holy days:
- Clergy structure:

## Miracles and Omens
How this power manifests in your campaign.

## Relationships
- Allied with [[Deity / Power]]
- Opposed by [[Deity / Power]]
- Influences [[Faction]]
`,
	},
	{
		id: 'culture',
		name: 'Culture / People',
		description: 'Custom culture, lineage, or society profile',
		icon: '\uD83E\uDDDD',
		defaultTags: ['world', 'culture'],
		defaultFolder: '/world',
		content: `---
tags: [world, culture]
status: current
---

# Culture Name

> [!info] Culture Snapshot
> **Homeland:** [[Region]] | **Primary Values:** Honor, kinship, curiosity

## Identity and Values
Core beliefs, taboos, and how members view outsiders.

## Social Structure
Leadership, family patterns, and conflict resolution customs.

## Material Culture
- Clothing and art:
- Food and festivals:
- Architecture and craft:

## Language and Naming
Style notes and example names.

## Tensions and Change
Internal disagreements, reform movements, and external pressures.

## Campaign Hooks
- Character background tie-in
- Political conflict with [[Faction]]
- Migration or diaspora story
`,
	},
	{
		id: 'rumor-clue',
		name: 'Rumor and Clue List',
		description: 'Drop-in rumors, clues, and revelations for live play',
		icon: '\uD83D\uDD0D',
		defaultTags: ['prep', 'clue'],
		defaultFolder: '/campaign',
		content: `---
tags: [prep, clue]
status: active
---

# Rumor and Clue List

> [!dm] Use in Play
> Mark items as delivered when introduced. Track truth level to control misinformation.

## Rumors
| Rumor | Source | Truth Level | Delivered |
|-------|--------|-------------|-----------|
| "The bridge is cursed." | Tavern regular | Half-true | [ ] |
| "A noble funds the bandits." | Guard captain | True | [ ] |

## Investigative Clues
| Clue | Where Found | Leads To | Found |
|------|-------------|----------|-------|
| Wax seal with raven sigil | Crime scene | [[Faction]] | [ ] |
| Torn map fragment | [[Dungeon]] | [[Location]] | [ ] |

## Revelation Ladder
1. Surface suspicion
2. Confirming evidence
3. Contradictory twist
4. Final reveal

## Notes
Track which clues players ignored, misread, or weaponized.
`,
	},
] as const;
