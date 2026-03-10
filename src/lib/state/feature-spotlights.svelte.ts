import { getStorage } from '$lib/platform/storage/index.js';
import {
	FEATURE_SPOTLIGHTS,
	getSpotlightById,
	getSpotlightForFeature,
	routeMatchesSpotlight,
	type FeatureSpotlightDefinition,
} from '$lib/domain/feature-spotlights.js';
import { normalizeSeenSpotlights, type AdvancedFeatureId } from '$lib/types/settings.js';

export interface ActiveFeatureSpotlight {
	id: string;
	featureId: AdvancedFeatureId;
	title: string;
	description: string;
	selector: string;
}

class FeatureSpotlightsState {
	seenIds = $state<string[]>([]);
	queuedIds = $state<string[]>([]);
	active = $state<ActiveFeatureSpotlight | null>(null);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);

	async loadFromStorage(): Promise<void> {
		if (this.loading) return;
		this.loading = true;
		this.error = null;
		try {
			const stored = await getStorage().getSetting('seenSpotlights');
			this.seenIds = normalizeSeenSpotlights(stored);
			this.loaded = true;
		} catch (error) {
			this.seenIds = [];
			this.loaded = false;
			this.error = String(error);
		} finally {
			this.loading = false;
		}
	}

	private isQueued(id: string): boolean {
		return this.queuedIds.includes(id);
	}

	private isActive(id: string): boolean {
		return this.active?.id === id;
	}

	isSeen(id: string): boolean {
		return this.seenIds.includes(id);
	}

	queueForFeature(featureId: AdvancedFeatureId): void {
		const spotlight = getSpotlightForFeature(featureId);
		if (!spotlight) return;
		this.queueSpotlightId(spotlight.id);
	}

	queueForEncounter(
		pathname: string,
		isFeatureEnabled: (featureId: AdvancedFeatureId) => boolean,
	): void {
		for (const spotlight of FEATURE_SPOTLIGHTS) {
			if (!isFeatureEnabled(spotlight.featureId)) continue;
			if (!routeMatchesSpotlight(pathname, spotlight)) continue;
			this.queueSpotlightId(spotlight.id);
		}
	}

	private queueSpotlightId(id: string): void {
		if (this.isSeen(id) || this.isQueued(id) || this.isActive(id)) return;
		this.queuedIds = [...this.queuedIds, id];
	}

	private resolveTargetSelector(
		spotlight: FeatureSpotlightDefinition,
		findSelector: (selectors: readonly string[]) => string | null,
	): string | null {
		return findSelector(spotlight.selectors);
	}

	showNext(findSelector: (selectors: readonly string[]) => string | null): void {
		if (this.active || this.queuedIds.length === 0) return;

		const queue = [...this.queuedIds];
		const attempts = queue.length;
		for (let index = 0; index < attempts; index += 1) {
			const spotlightId = queue.shift();
			if (!spotlightId) break;
			if (this.isSeen(spotlightId)) continue;
			const spotlight = getSpotlightById(spotlightId);
			if (!spotlight) continue;
			const selector = this.resolveTargetSelector(spotlight, findSelector);
			if (!selector) {
				queue.push(spotlightId);
				continue;
			}
			this.active = {
				id: spotlight.id,
				featureId: spotlight.featureId,
				title: spotlight.title,
				description: spotlight.description,
				selector,
			};
			this.queuedIds = queue;
			return;
		}

		this.queuedIds = queue;
	}

	async dismissActive(): Promise<void> {
		const current = this.active;
		if (!current) return;
		if (!this.isSeen(current.id)) {
			const nextSeen = [...this.seenIds, current.id];
			this.seenIds = nextSeen;
			await getStorage().setSetting('seenSpotlights', nextSeen);
		}
		this.active = null;
	}
}

export const featureSpotlightsState = new FeatureSpotlightsState();
