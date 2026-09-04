// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { auditFileSizes, FILE_SIZE_HARD_LIMIT } from '../../packages/core/src/index';
import { collectFileSizeWarnings, scanTsxFiles } from '../../scripts/quality-gates';

describe('RC-STB-2.7 file-size gate wiring', () => {
	it('scans real apps/gm-react/src .tsx files and passes the current tree', () => {
		const files = scanTsxFiles();
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			expect(file.path.startsWith('apps/gm-react/src/')).toBe(true);
			expect(file.path.endsWith('.tsx')).toBe(true);
		}
		// The live tree must pass its own gate (either under the limit, or grandfathered without
		// having grown past its recorded baseline) — this is what `pnpm gates` enforces.
		expect(auditFileSizes(files)).toEqual([]);
	});

	it('surfaces at least one non-blocking warn-target notice from the real tree', () => {
		// The repo currently has files between the 500-line warn target and the 800-line hard
		// limit; this pins that the warn collector actually walks the real tree, not a stub.
		const warnings = collectFileSizeWarnings();
		expect(warnings.length).toBeGreaterThan(0);
		for (const warning of warnings) {
			expect(warning.lines).toBeLessThanOrEqual(FILE_SIZE_HARD_LIMIT);
		}
	});
});
