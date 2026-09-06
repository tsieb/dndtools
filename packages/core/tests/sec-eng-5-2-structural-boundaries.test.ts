import { describe, expect, it } from 'vitest';
import {
	assertSystemPackageCarriesNoFunctions,
	assertViewModelExcludesPrivateFields,
} from '../src';

/**
 * RC-ENG-5.2 — dedicated coverage for the two NET-NEW structural-leak walkers `regression-gates.ts`
 * adds: "a system package cannot carry a function" and "a private-store field never reaches a
 * view-model". Both are generic tree walkers with no domain module of their own yet, so this file
 * IS their coverage test (named by the `system-package-no-functions` and
 * `private-store-view-model-exclusion` rows in `SECURITY_BOUNDARIES`).
 */

describe('RC-ENG-5.2 — assertSystemPackageCarriesNoFunctions', () => {
	it('reports no violations for a plain-data package', () => {
		const pkg = {
			id: 'dnd5e',
			conditions: [{ key: 'poisoned', label: 'Poisoned', severity: 'moderate' }],
			turnModel: { kind: 'standard', segments: ['action', 'bonus-action'] },
		};
		expect(assertSystemPackageCarriesNoFunctions(pkg)).toEqual([]);
	});

	it('flags a function value nested inside an array of objects, by dotted path', () => {
		const pkg = {
			id: 'evil-package',
			conditions: [{ key: 'poisoned', onApply: () => 'gotcha' }],
		};
		const violations = assertSystemPackageCarriesNoFunctions(pkg);
		expect(violations).toEqual([{ path: '$.conditions[0].onApply' }]);
	});

	it('flags a bare top-level function value', () => {
		expect(assertSystemPackageCarriesNoFunctions(() => null)).toEqual([{ path: '$' }]);
	});

	it('reports every function value found, not just the first', () => {
		const pkg = { a: () => 1, nested: { b: () => 2 } };
		expect(
			assertSystemPackageCarriesNoFunctions(pkg)
				.map((v) => v.path)
				.sort(),
		).toEqual(['$.a', '$.nested.b']);
	});

	it('does not loop forever on a cyclic structure (defensive, not a real package shape)', () => {
		const cyclic: Record<string, unknown> = { id: 'cyclic' };
		cyclic.self = cyclic;
		expect(() => assertSystemPackageCarriesNoFunctions(cyclic)).not.toThrow();
		expect(assertSystemPackageCarriesNoFunctions(cyclic)).toEqual([]);
	});
});

describe('RC-ENG-5.2 — assertViewModelExcludesPrivateFields', () => {
	const PRIVATE_FIELDS = ['privateNotes', 'privateBookmarks'];

	it('reports no violations for a view-model with none of the private fields', () => {
		const viewModel = { characterId: 'char-1', sharedNotes: ['visible to the DM'] };
		expect(assertViewModelExcludesPrivateFields(viewModel, PRIVATE_FIELDS)).toEqual([]);
	});

	it('flags a private field nested at any depth, by dotted path', () => {
		const viewModel = {
			characterId: 'char-1',
			journal: { entries: [{ id: 'e1', privateNotes: 'DM must never see this' }] },
		};
		const violations = assertViewModelExcludesPrivateFields(viewModel, PRIVATE_FIELDS);
		expect(violations).toEqual([
			{ path: '$.journal.entries[0].privateNotes', fieldName: 'privateNotes' },
		]);
	});

	it('matches a declared private field case-insensitively (a renamed/aliased key still fails closed)', () => {
		const viewModel = { PrivateNotes: 'leaked' };
		expect(assertViewModelExcludesPrivateFields(viewModel, PRIVATE_FIELDS)).toEqual([
			{ path: '$.PrivateNotes', fieldName: 'PrivateNotes' },
		]);
	});

	it('reports every private field found across the tree', () => {
		const viewModel = { privateNotes: 'a', nested: { privateBookmarks: ['b'] } };
		const violations = assertViewModelExcludesPrivateFields(viewModel, PRIVATE_FIELDS);
		expect(violations.map((v) => v.fieldName).sort()).toEqual(['privateBookmarks', 'privateNotes']);
	});
});
