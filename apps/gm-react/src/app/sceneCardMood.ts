import type { SceneCardMood } from '@dndtools/core';

/**
 * I11 S11.2.2 — the mood palette for the fullscreen SCENE DISPLAY surface. These are deliberately vivid,
 * self-contained colors (not the app's neutral surface tokens): the display is a TV/projector surface
 * shown to players, so each mood reads as a distinct, saturated backdrop the hero image sits over. Pure
 * data — no DOM, safe to import anywhere (display page, overlay, player banner).
 */
export interface SceneMoodTheme {
	label: string;
	/** The two-stop background gradient for a mood-only (imageless) card + the image scrim. */
	from: string;
	to: string;
	/** The accent used for the mood chip + title underline. */
	accent: string;
	/** Legible text color over the mood backdrop. */
	ink: string;
}

export const SCENE_MOOD_THEME: Record<SceneCardMood, SceneMoodTheme> = {
	combat: { label: 'Combat', from: '#3a0d12', to: '#7f1d24', accent: '#f0596b', ink: '#fde8ea' },
	exploration: { label: 'Exploration', from: '#0c2a20', to: '#1d5c44', accent: '#4fd6a0', ink: '#e4f7ee' },
	mystery: { label: 'Mystery', from: '#1a1140', to: '#3b2c86', accent: '#a48bff', ink: '#ece7ff' },
	social: { label: 'Social', from: '#3a2606', to: '#7a521a', accent: '#f5c265', ink: '#fdf1dc' },
	rest: { label: 'Rest', from: '#101d30', to: '#274563', accent: '#79b8f0', ink: '#e5f0fb' },
};

export function moodTheme(mood: SceneCardMood): SceneMoodTheme {
	return SCENE_MOOD_THEME[mood] ?? SCENE_MOOD_THEME.exploration;
}
