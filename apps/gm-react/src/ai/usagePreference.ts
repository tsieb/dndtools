/**
 * Device-local consent for optional model-powered tools. This is intentionally separate from
 * provider credentials and campaign/MCP policy: choosing "none" must be enough to make the
 * entire AI surface unavailable, even if a key and agent policy were configured previously.
 */
export type AiUsagePreference = 'complete' | 'generation-only' | 'none';

export const AI_USAGE_PREFERENCE_KEY = 'dndtools.ai.usage-preference';
export const AI_USAGE_PREFERENCE_EVENT = 'dndtools:ai-usage-preference-changed';

export function getAiUsagePreference(): AiUsagePreference {
	try {
		const value = localStorage.getItem(AI_USAGE_PREFERENCE_KEY);
		return value === 'complete' || value === 'generation-only' || value === 'none' ? value : 'none';
	} catch {
		return 'none';
	}
}

/** Model/provider features are available only after an explicit "Complete use" choice. */
export function isAiAssistantEnabled(): boolean {
	return getAiUsagePreference() === 'complete';
}

export function saveAiUsagePreference(preference: AiUsagePreference): AiUsagePreference {
	try {
		localStorage.setItem(AI_USAGE_PREFERENCE_KEY, preference);
	} catch {
		/* The in-memory UI still updates; storage may be unavailable in private mode. */
	}
	if (typeof window !== 'undefined') window.dispatchEvent(new Event(AI_USAGE_PREFERENCE_EVENT));
	return preference;
}
