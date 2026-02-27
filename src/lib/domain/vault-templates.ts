import type { FolderId } from '$lib/types/note.js';
import { createFolderId } from '$lib/types/note.js';

export interface VaultTemplateNote {
	title: string;
	content: string;
	folder: FolderId;
	tags: string[];
}

export interface VaultTemplate {
	id: 'campaign-starter' | 'one-shot' | 'player-journal';
	name: string;
	description: string;
	notes: VaultTemplateNote[];
}

function note(title: string, folder: string, tags: string[], content: string): VaultTemplateNote {
	return {
		title,
		folder: createFolderId(folder),
		tags,
		content,
	};
}

export const DND_VAULT_TEMPLATES: readonly VaultTemplate[] = [
	{
		id: 'campaign-starter',
		name: 'Campaign Starter',
		description: 'Core campaign notes with linked overview, NPCs, and sessions.',
		notes: [
			note(
				'Campaign Overview',
				'/campaign',
				['campaign', 'overview'],
				`# Campaign Overview

## Premise
One paragraph pitch for your campaign.

## Active Threads
- [[Session 01 - Arrival]]
- [[Starter Town]]
- [[Patron NPC]]
`,
			),
			note(
				'Starter Town',
				'/locations',
				['location', 'settlement'],
				`# Starter Town

## Description
The first major location your party visits.

## Notable NPCs
- [[Patron NPC]]
`,
			),
			note(
				'Patron NPC',
				'/npcs',
				['npc'],
				`# Patron NPC

## Role
Quest giver and recurring ally.

## Appears In
- [[Session 01 - Arrival]]
- [[Starter Town]]
`,
			),
			note(
				'Session 01 - Arrival',
				'/sessions',
				['session'],
				`# Session 01 - Arrival

## Summary
Opening session notes.

## Referenced Notes
- [[Campaign Overview]]
- [[Starter Town]]
- [[Patron NPC]]
`,
			),
		],
	},
	{
		id: 'one-shot',
		name: 'One-Shot',
		description: 'Lightweight prep set for a single-session adventure.',
		notes: [
			note(
				'One-Shot Brief',
				'/oneshot',
				['oneshot', 'prep'],
				`# One-Shot Brief

## Hook
How the party gets pulled in.

## Linked Prep
- [[One-Shot Scene List]]
- [[Final Encounter]]
`,
			),
			note(
				'One-Shot Scene List',
				'/oneshot',
				['oneshot', 'session'],
				`# One-Shot Scene List

1. Opening in [[One-Shot Brief]]
2. Midpoint challenge
3. Climax in [[Final Encounter]]
`,
			),
			note(
				'Final Encounter',
				'/oneshot',
				['encounter', 'oneshot'],
				`# Final Encounter

## Objective
Define success and failure outcomes.

## Context
The finale of [[One-Shot Brief]].
`,
			),
		],
	},
	{
		id: 'player-journal',
		name: 'Player Journal',
		description: 'Character-focused notes for session recaps and goals.',
		notes: [
			note(
				'Character Journal',
				'/journal',
				['player', 'journal'],
				`# Character Journal

## Current Goals
- Personal objective
- Party objective

## Related
- [[Session Journal Index]]
`,
			),
			note(
				'Session Journal Index',
				'/journal',
				['player', 'session'],
				`# Session Journal Index

- [[Journal Entry 01]]
`,
			),
			note(
				'Journal Entry 01',
				'/journal',
				['player', 'session'],
				`# Journal Entry 01

## What Happened
First personal recap entry.

## Follow-ups
- Update [[Character Journal]]
`,
			),
		],
	},
] as const;

export function getVaultTemplateById(id: VaultTemplate['id']): VaultTemplate | undefined {
	return DND_VAULT_TEMPLATES.find((template) => template.id === id);
}
