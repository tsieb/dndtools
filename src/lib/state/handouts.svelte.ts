import { getStorage } from '$lib/platform/storage/index.js';
import { nowISO } from '$lib/utils/date.js';
import { generateVaultObjectId } from '$lib/utils/id.js';
import { playerModeState } from '$lib/state/player-mode.svelte.js';
import { reportRuntimeError } from '$lib/runtime/diagnostics.js';
import { normalizeHandoutData, summarizeVaultObject } from '$lib/domain/objects.js';
import type { HandoutData, HandoutObject, VaultObject } from '$lib/types/object.js';

type HandoutEventType = 'delivered' | 'decoded';

interface HandoutPresenceEntry {
	role: 'dm' | 'player';
	seenAtMs: number;
}

interface HandoutRecentEvent {
	type: HandoutEventType;
	at: string;
}

type HandoutChannelMessage =
	| {
			kind: 'presence';
			peerId: string;
			role: 'dm' | 'player';
			atMs: number;
	  }
	| {
			kind: 'deliver';
			peerId: string;
			handoutId: string;
			deliveredAt: string;
	  }
	| {
			kind: 'decoded';
			peerId: string;
			handoutId: string;
			revealedAt: string;
	  };

export interface CreateHandoutInput {
	name?: string;
	summary?: string;
	tags?: string[];
	visibility?: HandoutObject['visibility'];
	data: Partial<HandoutData>;
}

export interface DeliverHandoutResult {
	handout: HandoutObject;
	deliveredAt: string;
	connectedPlayerCount: number;
	alreadyDelivered: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asHandoutObject(value: VaultObject | null): HandoutObject | null {
	if (!value || value.type !== 'handout') return null;
	return {
		...value,
		data: normalizeHandoutData(value.data),
	} as HandoutObject;
}

function normalizeTags(tags: string[] | undefined): string[] {
	const normalized = (tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0);
	return normalized.length > 0 ? normalized : ['handout'];
}

class HandoutsState {
	handouts = $state<HandoutObject[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);
	loaded = $state(false);
	connectedPlayerCount = $state(0);
	recentEvents = $state<Record<string, HandoutRecentEvent>>({});

	private channel: BroadcastChannel | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private presenceSweepTimer: ReturnType<typeof setInterval> | null = null;
	private peerPresence = new Map<string, HandoutPresenceEntry>();
	private readonly peerId = `handout-${Math.random().toString(36).slice(2, 10)}`;

	sortedHandouts = $derived.by(() =>
		[...this.handouts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
	);

	deliveredHandouts = $derived.by(() =>
		this.sortedHandouts.filter((handout) => handout.data.delivered),
	);

	pendingHandouts = $derived.by(() =>
		this.sortedHandouts.filter((handout) => !handout.data.delivered),
	);

	getById(id: string): HandoutObject | null {
		return this.handouts.find((entry) => String(entry.id) === id) ?? null;
	}

	async ensureLoaded(): Promise<void> {
		if (!this.loaded && !this.loading) {
			await this.loadAll();
		}
		this.startRealtime();
	}

	async loadAll(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const objects = await getStorage().getAllObjects({ type: 'handout' });
			this.handouts = objects
				.map((object) => asHandoutObject(object))
				.filter((object): object is HandoutObject => !!object)
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			this.loaded = true;
		} catch (error) {
			this.error = String(error);
			await reportRuntimeError({
				category: 'storage',
				code: 'HANDOUTS_LOAD_FAILED',
				error,
			});
		} finally {
			this.loading = false;
		}
	}

	private upsertHandout(handout: HandoutObject): void {
		const index = this.handouts.findIndex((entry) => entry.id === handout.id);
		if (index < 0) {
			this.handouts = [...this.handouts, handout].sort((a, b) =>
				b.updatedAt.localeCompare(a.updatedAt),
			);
			return;
		}
		const next = [...this.handouts];
		next[index] = handout;
		next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		this.handouts = next;
	}

	private removeHandout(handoutId: string): void {
		this.handouts = this.handouts.filter((entry) => String(entry.id) !== handoutId);
	}

	private currentRole(): 'dm' | 'player' {
		return playerModeState.enabled ? 'player' : 'dm';
	}

	private setRecentEvent(handoutId: string, type: HandoutEventType, at: string): void {
		this.recentEvents = {
			...this.recentEvents,
			[handoutId]: { type, at },
		};
		setTimeout(() => {
			const current = this.recentEvents[handoutId];
			if (!current || current.at !== at || current.type !== type) return;
			const next = { ...this.recentEvents };
			delete next[handoutId];
			this.recentEvents = next;
		}, 7_000);
	}

	private refreshConnectedPlayers(): void {
		const now = Date.now();
		for (const [peerId, presence] of this.peerPresence.entries()) {
			if (now - presence.seenAtMs > 16_000) {
				this.peerPresence.delete(peerId);
			}
		}
		let connectedPlayers = 0;
		for (const [peerId, presence] of this.peerPresence.entries()) {
			if (peerId === this.peerId) continue;
			if (presence.role !== 'player') continue;
			connectedPlayers += 1;
		}
		this.connectedPlayerCount = connectedPlayers;
	}

	private postChannelMessage(message: HandoutChannelMessage): void {
		if (!this.channel) return;
		this.channel.postMessage(message);
	}

	private sendPresence(): void {
		this.postChannelMessage({
			kind: 'presence',
			peerId: this.peerId,
			role: this.currentRole(),
			atMs: Date.now(),
		});
	}

	private handleChannelMessage(raw: unknown): void {
		if (!isRecord(raw) || typeof raw.kind !== 'string' || typeof raw.peerId !== 'string') return;
		const peerId = raw.peerId;
		if (!peerId || peerId === this.peerId) return;

		if (raw.kind === 'presence') {
			const role = raw.role === 'player' ? 'player' : 'dm';
			const atMs =
				typeof raw.atMs === 'number' && Number.isFinite(raw.atMs)
					? Math.round(raw.atMs)
					: Date.now();
			this.peerPresence.set(peerId, { role, seenAtMs: atMs });
			this.refreshConnectedPlayers();
			return;
		}

		if (
			raw.kind === 'deliver' &&
			typeof raw.handoutId === 'string' &&
			typeof raw.deliveredAt === 'string'
		) {
			this.setRecentEvent(raw.handoutId, 'delivered', raw.deliveredAt);
			void this.loadAll();
			return;
		}

		if (
			raw.kind === 'decoded' &&
			typeof raw.handoutId === 'string' &&
			typeof raw.revealedAt === 'string'
		) {
			this.setRecentEvent(raw.handoutId, 'decoded', raw.revealedAt);
			void this.loadAll();
		}
	}

	startRealtime(): void {
		if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
		if (this.channel) return;
		const channel = new BroadcastChannel('dndtools.handouts.v1');
		channel.onmessage = (event: MessageEvent<unknown>) => this.handleChannelMessage(event.data);
		this.channel = channel;
		this.sendPresence();
		this.heartbeatTimer = setInterval(() => this.sendPresence(), 5_000);
		this.presenceSweepTimer = setInterval(() => this.refreshConnectedPlayers(), 4_000);
	}

	stopRealtime(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		if (this.presenceSweepTimer) {
			clearInterval(this.presenceSweepTimer);
			this.presenceSweepTimer = null;
		}
		if (this.channel) {
			this.channel.close();
			this.channel = null;
		}
		this.peerPresence.clear();
		this.connectedPlayerCount = 0;
	}

	async createHandout(input: CreateHandoutInput): Promise<HandoutObject> {
		const normalizedData = normalizeHandoutData(input.data);
		const timestamp = nowISO();
		const handout: HandoutObject = {
			id: generateVaultObjectId(),
			type: 'handout',
			name: (input.name?.trim() || normalizedData.title.trim() || 'Handout').trim(),
			summary: input.summary?.trim() || '',
			tags: normalizeTags(input.tags),
			visibility: input.visibility ?? 'shared',
			relationships: [],
			data: normalizedData,
			createdAt: timestamp,
			updatedAt: timestamp,
		};

		if (!handout.summary) {
			handout.summary = summarizeVaultObject(handout);
		}

		await getStorage().saveObject(handout);
		const persisted = asHandoutObject(await getStorage().getObject(handout.id)) ?? handout;
		this.upsertHandout(persisted);
		return persisted;
	}

	async saveHandout(handout: HandoutObject): Promise<HandoutObject> {
		const normalized: HandoutObject = {
			...handout,
			name: handout.name.trim() || handout.data.title.trim() || 'Handout',
			tags: normalizeTags(handout.tags),
			data: normalizeHandoutData(handout.data),
			updatedAt: nowISO(),
		};
		normalized.summary = normalized.summary.trim() || summarizeVaultObject(normalized);
		await getStorage().saveObject(normalized);
		const persisted = asHandoutObject(await getStorage().getObject(normalized.id)) ?? normalized;
		this.upsertHandout(persisted);
		return persisted;
	}

	async deleteHandout(handoutId: string): Promise<boolean> {
		const existing = this.getById(handoutId);
		if (!existing) return false;
		await getStorage().deleteObject(existing.id);
		this.removeHandout(handoutId);
		return true;
	}

	async deliverHandout(handoutId: string): Promise<DeliverHandoutResult | null> {
		const existing = this.getById(handoutId);
		if (!existing) return null;

		const deliveredAt = nowISO();
		const next: HandoutObject = {
			...existing,
			data: normalizeHandoutData({
				...existing.data,
				delivered: true,
				deliveredAt,
			}),
			updatedAt: deliveredAt,
		};
		next.summary = summarizeVaultObject(next);
		await getStorage().saveObject(next);
		const persisted = asHandoutObject(await getStorage().getObject(next.id)) ?? next;
		this.upsertHandout(persisted);

		this.postChannelMessage({
			kind: 'deliver',
			peerId: this.peerId,
			handoutId,
			deliveredAt,
		});
		this.setRecentEvent(handoutId, 'delivered', deliveredAt);

		return {
			handout: persisted,
			deliveredAt,
			connectedPlayerCount: this.connectedPlayerCount,
			alreadyDelivered: existing.data.delivered,
		};
	}

	async revealCipherDecoded(handoutId: string): Promise<HandoutObject | null> {
		const existing = this.getById(handoutId);
		if (!existing || existing.data.handoutType !== 'cipher' || !existing.data.cipher) return null;

		const revealedAt = nowISO();
		const next: HandoutObject = {
			...existing,
			data: normalizeHandoutData({
				...existing.data,
				cipher: {
					...existing.data.cipher,
					decodedRevealed: true,
					decodedRevealedAt: revealedAt,
				},
			}),
			updatedAt: revealedAt,
		};
		next.summary = summarizeVaultObject(next);
		await getStorage().saveObject(next);
		const persisted = asHandoutObject(await getStorage().getObject(next.id)) ?? next;
		this.upsertHandout(persisted);

		this.postChannelMessage({
			kind: 'decoded',
			peerId: this.peerId,
			handoutId,
			revealedAt,
		});
		this.setRecentEvent(handoutId, 'decoded', revealedAt);
		return persisted;
	}
}

export const handoutsState = new HandoutsState();
