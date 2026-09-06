import { describe, expect, it } from 'vitest';
import { emptyDraft, type WidgetDraft } from './draft';
import { applyDraftDiff, diffDrafts } from './draftDiff';

/**
 * RC-WID-3.3 — the diff view an iteration re-run is judged by before it is applied.
 *
 * `diffDrafts` is what the dialog renders; `applyDraftDiff` is what "apply" does with it. Both are
 * plain data transforms so the field-by-field contract is testable without mounting the dialog.
 */

function draft(patch: Partial<WidgetDraft>): WidgetDraft {
	return { ...emptyDraft(), name: 'Loot ledger', ...patch };
}

describe('diffDrafts', () => {
	it('reports nothing when the re-run repeats the same draft', () => {
		const a = draft({});
		const b = draft({});
		expect(diffDrafts(a, b)).toEqual([]);
	});

	it('reports only the fields that actually changed', () => {
		const before = draft({ description: 'Tracks party gold' });
		const after = draft({ description: 'Tracks party gold and gems', icon: 'gem' });
		const diffs = diffDrafts(before, after);
		expect(diffs.map((d) => d.field)).toEqual(['description', 'icon']);
		const description = diffs.find((d) => d.field === 'description')!;
		expect(description.before).toBe('Tracks party gold');
		expect(description.after).toBe('Tracks party gold and gems');
	});

	it('summarizes list fields by their readable content, not object identity', () => {
		const query = (id: string, label: string) => ({
			id,
			label,
			source: 'binding' as const,
			bindingIds: [],
			requiredCapability: 'viewer' as const,
			audience: 'dm' as const,
		});
		const before = draft({ dataQueries: [query('gold', 'Gold')] });
		const after = draft({ dataQueries: [query('gold', 'Gold')] });
		// Same content, different array instances: must not show up as a change.
		expect(diffDrafts(before, after)).toEqual([]);

		const changed = draft({ dataQueries: [query('gold', 'Gold'), query('gems', 'Gems')] });
		const diffs = diffDrafts(before, changed);
		expect(diffs).toHaveLength(1);
		expect(diffs[0]!.field).toBe('dataQueries');
		expect(diffs[0]!.before).toBe('Gold');
		expect(diffs[0]!.after).toBe('Gold, Gems');
	});

	it('renders an empty list field as the none placeholder rather than a blank string', () => {
		const before = draft({ commands: [] });
		const after = draft({
			commands: [
				{
					type: 'x.y',
					displayName: 'Reset',
					requiredCapability: 'operator',
					payloadSchema: { type: 'object', properties: {}, additionalProperties: true },
					writesTo: 'scene',
				},
			],
		});
		const diffs = diffDrafts(before, after);
		const commands = diffs.find((d) => d.field === 'commands')!;
		expect(commands.before).toBe('—');
		expect(commands.after).toBe('Reset');
	});
});

describe('applyDraftDiff', () => {
	it('copies only the chosen fields, leaving identity and provenance alone', () => {
		const current = draft({
			packageId: 'p.loot',
			version: '1.0.0',
			description: 'old',
			icon: 'coin',
			authoring: { source: 'generated', createdBy: 'agent-1', promptHash: 'abc' },
		});
		const after = draft({
			packageId: 'p.loot-renamed',
			version: '9.9.9',
			description: 'new',
			icon: 'gem',
		});
		const applied = applyDraftDiff(current, after, ['description', 'icon']);
		expect(applied.description).toBe('new');
		expect(applied.icon).toBe('gem');
		// Untouched fields keep the DM's own values, not the re-run's.
		expect(applied.packageId).toBe('p.loot');
		expect(applied.version).toBe('1.0.0');
		expect(applied.authoring).toEqual({
			source: 'generated',
			createdBy: 'agent-1',
			promptHash: 'abc',
		});
	});

	it('applying zero fields is a no-op copy', () => {
		const current = draft({ description: 'unchanged' });
		const after = draft({ description: 'different' });
		expect(applyDraftDiff(current, after, [])).toEqual(current);
	});
});
