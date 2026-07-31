import { describe, expect, it } from 'vitest';
import { deleteSelection } from './keyboard';
import type { MapEditorApi } from './useMapEditor';

/**
 * The map editor's Delete key used to end with an UNCONDITIONAL `clearSelection()` followed by
 * `announce('Deleted ${deleted} objects.')`. `editor.run` returns false both while another command
 * is in flight and when the core refuses (a locked layer, a permission ceiling), and the loop
 * `break`s on the first refusal — so a refused delete destroyed the user's whole selection and told
 * them "Deleted 0 objects.", removing the one recovery action (unlock the layer, press Delete
 * again). These lock all three halves: a total refusal keeps the selection and says why, a PARTIAL
 * refusal keeps exactly the survivors and says the rest were refused, and a clean success still
 * empties the selection and counts — with honest pluralisation.
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
			state.selection = [];
		},
		setSelection(ids: readonly string[]) {
			state.selection = ids;
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

		expect(editor.selection).toEqual(['poi-a', 'poi-b']);
		expect(said).toHaveLength(1);
		expect(said[0]).toMatch(/locked layer/i);
		// The old behaviour, which this must never regress to.
		expect(said[0]).not.toMatch(/Deleted 0/);
	});

	it('keeps the survivors selected and admits the refusal on a PARTIAL delete', async () => {
		// The loop stops on the first refusal, so poi-c is never even attempted — it and poi-b are
		// both still on the map and must both still be selected for the retry-after-unlock path.
		const editor = makeEditor(['poi-a', 'poi-b', 'poi-c'], (id) => id === 'poi-a');
		const said: string[] = [];
		await deleteSelection(editor, (m) => said.push(m));

		expect(editor.selection).toEqual(['poi-b', 'poi-c']);
		expect(said).toHaveLength(1);
		expect(said[0]).toMatch(/refused/i);
		expect(said[0]).toContain('1 object');
	});

	it('clears the selection and counts honestly when the deletes land', async () => {
		const editor = makeEditor(['poi-a', 'poi-b'], () => true);
		const said: string[] = [];
		await deleteSelection(editor, (m) => said.push(m));

		expect(editor.ran).toEqual(['poi-a', 'poi-b']);
		expect(editor.selection).toEqual([]);
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
		expect(editor.selection).toEqual([]);
	});
});
