import { createNoteId, createFolderId, type Note } from '$lib/types/note.js';
import { generateNoteId } from '$lib/utils/id.js';

/** Create a test note with sensible defaults */
export function createTestNote(overrides: Partial<Note> = {}): Note {
	const now = new Date().toISOString();
	return {
		id: generateNoteId(),
		title: 'Test Note',
		content: '',
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: now,
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

/** Sample notes for testing various scenarios */
export const sampleNotes: Note[] = [
	createTestNote({
		id: createNoteId('npc-barthen-001'),
		title: "Barthen's Provisions",
		content:
			"# Barthen's Provisions\n\nA general store in [[Phandalin]] run by **Elmar Barthen**.\n\n## Inventory\n- Rations\n- Rope\n- Torches\n\n#npc #merchant",
		folder: createFolderId('/campaign/npcs'),
		tags: ['npc', 'merchant', 'phandalin'],
	}),
	createTestNote({
		id: createNoteId('loc-phandalin-001'),
		title: 'Phandalin',
		content:
			"# Phandalin\n\nA small frontier town at the foot of the Sword Mountains.\n\n## Key Locations\n- [[Barthen's Provisions]]\n- [[Stonehill Inn]]\n\n## NPCs\n- [[Elmar Barthen]]\n- [[Toblen Stonehill]]\n\n#location #town",
		folder: createFolderId('/campaign/locations'),
		tags: ['location', 'town'],
	}),
	createTestNote({
		id: createNoteId('session-001'),
		title: 'Session 1: The Goblin Ambush',
		content:
			'# Session 1: The Goblin Ambush\n\nDate: 2025-01-15\n\n## Summary\nThe party was ambushed by goblins on the road to [[Phandalin]].\n\n## Key Events\n1. Met [[Gundren Rockseeker]] in Neverwinter\n2. Hired to escort a wagon of supplies\n3. Ambushed by four goblins near Triboar Trail\n\n#session #combat',
		folder: createFolderId('/sessions'),
		tags: ['session', 'combat'],
	}),
];
