/** Metadata order is authoritative; ignore stale/duplicate ids and include newly mounted tiles. */
export function readingOrder(ids: readonly string[], metadata: readonly string[] = []): string[] {
	const present = new Set(ids);
	return [...new Set([...metadata.filter((id) => present.has(id)), ...ids])];
}

export interface SpatialTile {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Nearest centre in the requested half-plane. Metadata order breaks equal-distance ties. */
export function spatialNeighbour(
	tiles: readonly SpatialTile[],
	id: string,
	delta: readonly [number, number],
): string | undefined {
	const origin = tiles.find((tile) => tile.id === id);
	if (!origin) return;
	let distance = Infinity;
	let next: string | undefined;
	for (const tile of tiles) {
		if (tile.id === id) continue;
		const dx = tile.x + tile.w / 2 - (origin.x + origin.w / 2);
		const dy = tile.y + tile.h / 2 - (origin.y + origin.h / 2);
		if (dx * delta[0] + dy * delta[1] <= 0) continue;
		const squared = dx * dx + dy * dy;
		if (squared < distance) {
			distance = squared;
			next = tile.id;
		}
	}
	return next;
}

/** Both canvas hosts already expose the gallery through the same translated Add toggle.
 * Activate that control so panel state, focus return and mutual exclusion stay host-owned. */
export function openGallery(canvas: HTMLElement, label: string): void {
	const screen = canvas.closest('main') ?? canvas.closest('[role="main"]');
	const trigger = [
		...(screen?.querySelectorAll<HTMLButtonElement>('button[aria-expanded]') ?? []),
	].find((button) => (button.getAttribute('aria-label') ?? button.textContent)?.trim() === label);
	if (!trigger || trigger.disabled) return;
	trigger.focus();
	if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
}
