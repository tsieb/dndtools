/** Basic markdown with headings, bold, italic, lists */
export const basicMarkdown = `# Main Heading

Some **bold** and *italic* text.

## Subheading

- Item one
- Item two
- Item three

1. Numbered one
2. Numbered two
`;

/** Markdown with wikilinks */
export const wikilinkMarkdown = `# Session Notes

Met [[Barthen]] at the [[Stonehill Inn|inn]].

The party traveled to [[Phandalin]].
`;

/** Markdown with YAML frontmatter */
export const frontmatterMarkdown = `---
title: "Test Note"
tags: [npc, important]
type: character
---

# Test Note

This note has frontmatter.
`;

/** GFM features: tables, task lists, strikethrough */
export const gfmMarkdown = `# GFM Features

| Name | Race | Class |
|------|------|-------|
| Aria | Elf  | Ranger |
| Bron | Dwarf | Fighter |

- [x] Find the goblins
- [ ] Rescue the captive
- [ ] Return to town

This is ~~wrong~~ correct.
`;

/** XSS attack vectors for sanitization testing */
export const xssMarkdown = `# XSS Test

<script>alert('xss')</script>

<img src="x" onerror="alert('xss')">

[Click me](javascript:alert('xss'))

<div onmouseover="alert('xss')">hover</div>
`;

/** Complex note with everything combined */
export const complexMarkdown = `---
title: "The Dragon's Lair"
tags: [location, dungeon, dragon]
---

# The Dragon's Lair

A dangerous dungeon beneath the [[Sword Mountains]].

## Overview

The lair is home to **Venomfang**, a young green dragon. The party first heard about it from [[Reidoth the Druid|Reidoth]].

## Rooms

1. **Entry Chamber** — Collapsed walls, difficult terrain
2. **Treasure Room** — Guarded by a ~~goblin~~ kobold
3. **Dragon's Den** — Final encounter

## Loot Table

| Item | Value | Notes |
|------|-------|-------|
| Gold coins | 150 gp | Scattered |
| Potion of Healing | 50 gp | x2 |

## TODO

- [x] Map the entrance
- [ ] Plan the assault
- [ ] Distribute loot

> "Approach with caution. The dragon is young, but deadly." — [[Reidoth the Druid|Reidoth]]

#dungeon #boss-fight
`;
