import { describe, expect, it } from 'vitest';
import { deleteSelection } from './keyboard';
import type { MapEditorApi } from './useMapEditor';

/**
 * The map editor's Delete key used to end with an UNCONDITIONAL `clearSelection()` followed by
 * `announce('Deleted ${deleted} objects.')`. `editor.run` returns false both while another command
 * is in flight and when the core refuses (a locked layer, a permission ceiling), and the loop
 * `break`s on the first refusal — so a refused delete destroyed the user's whole selection and told
 * them "Deleted 0 objects.", removing the one recovery action (unlock the layer, press Delete
 * again). These lock the two halves: a refusal keeps the selection and says why, and a success
 * still clears and counts — with honest pluralisation.
 */

function makeEditor(
	pois: string[],
	accept: (id: string) => boolean,
): MapEditorApi & { cleared: number; ran: string[] } {
	const state = {
		cleared: 0,
		ran: [] as string[],
		selection: pois as readonly string[],
		mapId: 'map-1',
		actorId: 'dm-1',
		map: { pois: pois.map((id) => ({ id })), tokens: [] },
		clearSelection() {
			state.cleared += 1;
		},
		run(command: { payload: { poiId: string } }) {
			state.ran.push(command.payload.poiId);
			return Promise.resolve(accept(command.payload.poiId));
		},
	};
	return state as unknown as MapEditorApi & { cleared: number; ran: string[] };
}

describe('map editor Delete', () => {
	it('keeps the selection and explains itself when the core refuses every object', async () => {
		const editor = makeEditor(['poi-a', 'poi-b'], () => false);
		const said: string[] = [];
		await deleteSelection(editor, (m) => said.push(m));

		expect(editor.cleared).toBe(0);
		expect(said).toHaveLength(1);
		expect(said[0]).toMatch(/locked layer/i);
		// The old behaviour, which this must never regress to.
		expect(said[0]).not.toMatch(/Deleted 0/);
	});

	it('clears the selection and counts honestly when the deletes land', async () => {
		const editor = makeEditor(['poi-a', 'poi-b'], () => true);
		const said: string[] = [];
		await deleteSelection(editor, (m) => said.push(m));

		expect(editor.ran).toEqual(['poi-a', 'poi-b']);
		expect(editor.cleared).toBe(1);
		expect(said).toEqual(['Deleted 2 objects.']);
	});

	it('says "1 object", not "1 objects"', async () => {
		const editor = makeEditor(['poi-a'], () => true);
		const said: string[] = [];
		await deleteSelection(editor, (m) => said.push(m));

		expect(said).toEqual(['Deleted 1 object.']);
	});

	it('announces nothing at all on an empty selection', async () => {
		const editor = makeEditor([], () => true);
		const said: string[] = [];
		await deleteSelection(editor, (m) => said.push(m));

		expect(said).toEqual([]);
		expect(editor.cleared).toBe(0);
	});
});
