import { describe, expect, it } from 'vitest';
import { createMapImportAdapterRegistry, previewMapImport, stageMapImport, type MapState } from '../src';
import { DM_ACTOR, buildInitialState } from '../src/testing/fixtures';

/**
 * MAP-002 — re-importing the SAME file must be IDEMPOTENT, not destructive. The imported map id is
 * content-addressed (asset checksum), so a second import of the same bytes resolves to the same id.
 * Previously the staging logic then created a FRESH map at that id (revision reset to 1, annotations
 * wiped), CLOBBERING any layers/POIs/routes/fog/tokens the DM had added since the first import. It now
 * attaches to the existing map instead (deduped asset, bumped revision) — no data loss.
 */

const BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);
const registry = createMapImportAdapterRegistry([]);

function stageSameFile(maps: MapState) {
	const preview = previewMapImport(registry, {
		asset: { bytes: BYTES, mimeType: 'image/png', fileName: 'battlemap.png' },
		importedBy: DM_ACTOR.id,
		importedAt: 'now',
	});
	if (!preview.ok) throw new Error('expected ok native preview');
	return stageMapImport(maps, { preview, mapId: null, mapName: 'Imported', importedBy: DM_ACTOR.id, importedAt: 'now' });
}

describe('MAP-002 — re-importing the same file does not clobber the existing map', () => {
	it('attaches to the existing content-addressed map instead of recreating it', () => {
		const first = stageSameFile(buildInitialState(DM_ACTOR).maps);
		expect(first.mapCreated).toBe(true);
		const mapId = first.mapId;

		// Simulate DM edits since the first import: a description change + the map advancing to revision 5.
		const created = first.nextState.maps[mapId]!;
		const edited: MapState = {
			...first.nextState,
			maps: { ...first.nextState.maps, [mapId]: { ...created, description: 'DM EDITED', revision: 5 } },
		};

		// Re-import the SAME bytes.
		const second = stageSameFile(edited);
		expect(second.mapId).toBe(mapId);
		// It ATTACHED, it did not recreate.
		expect(second.mapCreated).toBe(false);
		const reMap = second.nextState.maps[mapId]!;
		// The DM's edit survives (a clobber would reset it to the default 'Imported map.').
		expect(reMap.description).toBe('DM EDITED');
		// Revision is BUMPED from the DM's edit, not reset to 1.
		expect(reMap.revision).toBe(6);
		// Still exactly one map (no duplicate created at a different id).
		expect(Object.keys(second.nextState.maps)).toHaveLength(1);
	});
});
