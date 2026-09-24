import type { MessageKey } from '../../i18n';
import { type CellBox } from './ImportMapPanels';

/**
 * RC-MAP-3.2 — the raster import wizard.
 *
 * v1 imported bytes and stopped, which left the DM with a picture and no way to tell the app how big
 * a square was. v2 adds three steps between the file and the commit — align the grid, name the scale,
 * optionally trace the walls — and then dispatches the EXISTING durable commands in order:
 *
 *   map.import-asset → map.configure-overlay → map.set-scale → map.create-layer + map.add-features
 *
 * Every one of those is a core command, so the whole wizard writes nothing itself. The follow-up
 * dispatches are reported individually on the result step: the asset can land while the scale is
 * refused, and saying so is the honest outcome (guardrail 9) rather than a blanket "Imported".
 */

/** The step sequence, by source. The external path has no raster to calibrate. */
export const NATIVE_STEPS = ['source', 'align', 'scale', 'walls', 'preview', 'result'] as const;

export const EXTERNAL_STEPS = ['source', 'preview', 'result'] as const;

export type StepId = (typeof NATIVE_STEPS)[number];

export const STEP_LABEL: Record<StepId, MessageKey> = {
	source: 'mapImport.step.source',
	align: 'mapImport.step.align',
	scale: 'mapImport.step.scale',
	walls: 'mapImport.step.walls',
	preview: 'mapImport.step.preview',
	result: 'mapImport.step.result',
};

/** The default calibration box: a tenth of the image, which is a plausible battle-map cell. */
export const DEFAULT_CELL_BOX: CellBox = { a: { x: 0.4, y: 0.4 }, b: { x: 0.5, y: 0.5 } };

/** Default luminance cut. Printed dungeon ink sits well under this; parchment sits well over it. */
export const DEFAULT_TRACE_THRESHOLD = 96;

/**
 * An SVG's pixel size, from `width`/`height` when they carry one and otherwise from the `viewBox`.
 * Percentage and unitless-but-relative values are not a pixel size, so they read as unknown rather
 * than as a wrong number the DM would then calibrate a whole map against.
 */
export function readSvgDimensions(markup: string): { width: number; height: number } | null {
	const attribute = (name: string): number | null => {
		const raw = new RegExp(`<svg[^>]*\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(markup)?.[1];
		if (!raw) return null;
		const value = Number.parseFloat(raw);
		return Number.isFinite(value) && value > 0 && !/%$/.test(raw.trim()) ? value : null;
	};
	const width = attribute('width');
	const height = attribute('height');
	if (width !== null && height !== null) return { width, height };
	const viewBox = /<svg[^>]*\sviewBox\s*=\s*["']([^"']+)["']/i
		.exec(markup)?.[1]
		?.trim()
		.split(/[\s,]+/)
		.map(Number);
	if (
		viewBox?.length === 4 &&
		viewBox.every(Number.isFinite) &&
		viewBox[2]! > 0 &&
		viewBox[3]! > 0
	) {
		return { width: viewBox[2]!, height: viewBox[3]! };
	}
	return null;
}
