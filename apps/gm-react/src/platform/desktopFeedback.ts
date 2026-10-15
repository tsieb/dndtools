/** Must match the fixed main-process destination and Discussions category form filename. */
export const BETA_FEEDBACK_URL =
	'https://github.com/tsieb/dndtools/discussions/new?category=beta-feedback';

declare global {
	interface Window {
		dndtoolsFeedback?: { open(): Promise<boolean> };
	}
}

export async function openDesktopFeedback(url: string): Promise<boolean> {
	if (url !== BETA_FEEDBACK_URL || typeof window === 'undefined') return false;
	try {
		return (await window.dndtoolsFeedback?.open()) === true;
	} catch {
		return false;
	}
}
