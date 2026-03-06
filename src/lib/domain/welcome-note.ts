import { createNewNote } from '$lib/utils/note-factory.js';
import { getStorage } from '$lib/platform/storage/index.js';
import { createFolderId } from '$lib/types/note.js';

const WELCOME_CONTENT = `---
title: Welcome to DND Tools
tags: [welcome, tutorial]
---

# Welcome to DND Tools

Your campaign notes, connected.

## Getting Started

This is your first note! Here are the basics:

### Writing Notes

Use **markdown** for formatting:

- **Bold** text with \`**double asterisks**\`
- *Italic* text with \`*single asterisks*\`
- Create headings with \`#\`, \`##\`, \`###\`
- Make lists with \`-\` or \`1.\`
- Add \`> blockquotes\` for callouts

### Linking Notes

The most powerful feature is **wikilinks**. Type \`[[\` followed by a note title:

- \`[[Session Notes]]\` — links to another note
- \`[[NPC: Barthen|Barthen]]\` — link with display text

When you click a wikilink, you'll navigate to that note. If it doesn't exist yet, you can create it!

### Tags

Organize notes with tags:
- In frontmatter (the \`---\` block at the top): \`tags: [npc, waterdeep]\`
- Inline with \`#tag\` syntax

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+N** | Create new note |
| **Ctrl+P** | Command palette (find any note fast) |
| **Ctrl+D** | Open dice tray |
| **Ctrl+G** | Open generator panel |
| **Ctrl+E** | Toggle edit/view mode |
| **Ctrl+B** | Toggle local navigation |
| **Ctrl+Shift+F** | Global search |

## Tips for DMs

- Create a note for each **NPC**, **location**, and **quest**
- Use wikilinks to connect NPCs to locations they inhabit
- Tag session notes with \`#session\` for easy filtering
- Keep a \`[[Session Log]]\` note linking to all sessions

Happy adventuring!
`;

export async function createWelcomeNote(): Promise<void> {
	const storage = getStorage();
	const note = createNewNote({
		title: 'Welcome to DND Tools',
		content: WELCOME_CONTENT,
		folder: createFolderId('/'),
		tags: ['welcome', 'tutorial'],
	});
	await storage.saveNote(note);
}
