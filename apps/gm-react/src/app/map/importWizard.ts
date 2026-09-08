import { traceWallsFromLuminance, type MapGridShape } from '@dndtools/core';

/**
 * RC-MAP-3.2 — the browser half of the raster import wizard.
 *
 * The Processing Core owns the policy (calibration, scale, marching-squares tracing) and cannot touch
 * a canvas. This module is the thin GUI adapter that turns an imported `File` into the two things the
 * core asks for: intrinsic pixel dimensions, and a row-major luminance mask sampled at a bounded
 * resolution. Nothing here decides anything — it measures.
 */

/** Sample resolution for the wall tracer. Bounded so a 50 MB print-resolution map still traces fast. */
export const TRACE_SAMPLE_MAX = 192;

export interface LuminanceSample {
	luminance: Uint8Array;
	width: number;
	height: number;
}

/**
 * Draw `source` into an offscreen 2d canvas at most {@link TRACE_SAMPLE_MAX} across and read back a
 * row-major luminance mask (Rec. 601 luma). Returns null when the browser refuses a 2d context or the
 * image cannot be decoded — the caller then reports the tracer as unavailable rather than pretending
 * it found no walls.
 */
export async function sampleLuminance(
	source: Blob,
	maxSide = TRACE_SAMPLE_MAX,
): Promise<LuminanceSample | null> {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(source);
	} catch {
		return null;
	}
	try {
		const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) return null;
		context.drawImage(bitmap, 0, 0, width, height);
		const { data } = context.getImageData(0, 0, width, height);
		const luminance = new Uint8Array(width * height);
		for (let i = 0; i < luminance.length; i += 1) {
			const r = data[i * 4] as number;
			const g = data[i * 4 + 1] as number;
			const b = data[i * 4 + 2] as number;
			const alpha = data[i * 4 + 3] as number;
			// A transparent pixel is empty parchment, not ink: composite it onto white before the luma
			// read, otherwise every PNG with a cut-out background traces as one solid wall.
			const weighted =
				(0.299 * r + 0.587 * g + 0.114 * b) * (alpha / 255) + 255 * (1 - alpha / 255);
			luminance[i] = Math.round(weighted);
		}
		return { luminance, width, height };
	} catch {
		return null;
	} finally {
		bitmap.close();
	}
}

export interface TracedWallPreview {
	features: ReturnType<typeof traceWallsFromLuminance>;
	/** Total vertices across all traced rings — the honest cost readout the DM sees before committing. */
	vertexCount: number;
}

/** Run the core tracer over a sampled mask and summarize it for the preview step. */
export function traceWalls(
	sample: LuminanceSample,
	threshold: number,
	idPrefix: string,
): TracedWallPreview {
	const features = traceWallsFromLuminance({
		luminance: sample.luminance,
		width: sample.width,
		height: sample.height,
		threshold,
		idPrefix,
	});
	return {
		features,
		vertexCount: features.reduce((total, feature) => total + feature.points.length, 0),
	};
}

/** The SVG `points` string for a traced ring, in the 0..100 viewBox the preview uses. */
export function ringPoints(points: ReadonlyArray<{ x: number; y: number }>): string {
	return points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ');
}

/** Grid shapes offered by the alignment step, in the order they are shown. */
export const GRID_SHAPES: readonly MapGridShape[] = ['square', 'hex'];
