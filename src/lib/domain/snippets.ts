export interface ReusableSnippet {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly content: string;
}

export const REUSABLE_SNIPPETS: readonly ReusableSnippet[] = [
	{
		id: 'scene-framing',
		name: 'Scene Framing',
		description: 'Fast setup for improvised scenes',
		content: `## Scene Frame
- **Location:**
- **Immediate tension:**
- **What changes if ignored:**
`,
	},
	{
		id: 'npc-voice',
		name: 'NPC Voice Cue',
		description: 'Consistent roleplay prompt block',
		content: `> [!npc] Voice Cue
> **Tone:** Calm but guarded
> **Verbal tics:** short phrases, avoids names
> **What they want right now:**
`,
	},
	{
		id: 'combat-beats',
		name: 'Combat Beats',
		description: 'Round-by-round combat pacing notes',
		content: `## Combat Beats
1. Opening pressure
2. Mid-fight escalation
3. Fallback or twist trigger
`,
	},
	{
		id: 'continuity-check',
		name: 'Continuity Check',
		description: 'Track new canon after a session',
		content: `## Continuity Check
- **Canon established:**
- **Retcons to avoid:**
- **Threads for next session:**
`,
	},
	{
		id: 'session-outro',
		name: 'Session Outro',
		description: 'Closing beats and handoff',
		content: `## End of Session
- **Cliffhanger:**
- **Downtime hooks:**
- **Player-facing recap to send:**
`,
	},
] as const;
