export interface SessionPartyLocation {
	mapId: string;
	x: number;
	y: number;
	poiId?: string;
	source: 'poi' | 'point';
	updatedAt: string;
}

export interface SessionState {
	version: 1;
	partyLocation: SessionPartyLocation | null;
}

export const DEFAULT_SESSION_STATE: SessionState = {
	version: 1,
	partyLocation: null,
};

function clamp01(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.min(1, Math.max(0, value));
	}
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		if (Number.isFinite(parsed)) {
			return Math.min(1, Math.max(0, parsed));
		}
	}
	return null;
}

function toOptionalTrimmedString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed || undefined;
}

export function normalizeSessionState(value: unknown): SessionState {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { ...DEFAULT_SESSION_STATE };
	}
	const source = value as Record<string, unknown>;
	const locationRaw = source.partyLocation;
	if (!locationRaw || typeof locationRaw !== 'object' || Array.isArray(locationRaw)) {
		return { ...DEFAULT_SESSION_STATE };
	}
	const location = locationRaw as Record<string, unknown>;
	const mapId = toOptionalTrimmedString(location.mapId);
	const x = clamp01(location.x);
	const y = clamp01(location.y);
	if (!mapId || x === null || y === null) {
		return { ...DEFAULT_SESSION_STATE };
	}
	return {
		version: 1,
		partyLocation: {
			mapId,
			x,
			y,
			poiId: toOptionalTrimmedString(location.poiId),
			source: location.source === 'poi' ? 'poi' : 'point',
			updatedAt: toOptionalTrimmedString(location.updatedAt) ?? new Date().toISOString(),
		},
	};
}
