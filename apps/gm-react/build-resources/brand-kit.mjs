#!/usr/bin/env node
/**
 * RC-DSN-3.3 — the Lamplight brand asset kit, rendered from the locked mark.
 *
 * Every icon, splash, installer bitmap and share card the release packages carry is derived here
 * from the design system's `assets/logo.svg` (vendored at docs/design-package/assets/logo.svg). The
 * mark is never redrawn: its disc and fold are read out of that file, placed on the design-system
 * tile (ground #0e0a06, radius 20.3%, mark box 65.6% of the tile — the numbers public/icon.svg
 * uses) and scaled as a whole, so `stroke-width` stays 5.5 grid units at every size. Only the
 * canvas around the tile changes from platform to platform:
 *
 *   full-bleed tile   build-resources/icon.png + icon.ico, public/icon-{192,512}.png, favicon.ico,
 *                     and the legacy (API 24/25) Android launcher PNGs;
 *   macOS grid        icon.icns and the Linux icons/ set — the tile inset to 824/1024 with the
 *                     platform drop shadow, so it sits at the size of its Dock neighbours;
 *   square ground     public/icon-maskable-*.png and apple-touch-icon.png, where the platform cuts
 *                     its own mask and transparent corners would render black;
 *   adaptive layers   the Android foreground and themed-icon vectors: the same 65.6% of the 72dp
 *                     masked viewport, asserted inside the 66dp safe zone every launcher keeps.
 *
 * Usage, from apps/gm-react:
 *   node build-resources/brand-kit.mjs                    re-render every asset in place
 *   node build-resources/brand-kit.mjs --preview <png>    also write an adaptive-icon mask sheet
 *
 * Rendering is headless Chromium (Playwright is already a dev dependency), so the wordmark is set in
 * the same self-hosted Cinzel the app ships. The ICO, ICNS and BMP containers are assembled here —
 * no ImageMagick, iconutil or wine needed on the machine that regenerates the kit.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = resolve(APP, '../../docs/design-package/assets/logo.svg');
const BUILD = join(APP, 'build-resources');
const PUBLIC = join(APP, 'public');
const RES = join(APP, 'android/app/src/main/res');

/** The design-system tile, identical to public/icon.svg: ground, corner radius, mark box. */
const TILE = { ground: '#0e0a06', radius: 208 / 1024, mark: 672 / 1024 };
/** `--color-bg` (tavern): the ground the app boots on, so every splash and installer paints it. */
const SURFACE = '#14100b';
const TEXT_PRIMARY = '#f2e8d8';
const TEXT_SECONDARY = '#bcab92';
const ACCENT = '#e0b06f';
/** Brand.jsx's wordmark falloff — "light" decays left to right and never below its last stop. */
const FALLOFF = 'linear-gradient(90deg,#f4dbaa 0%,#dcae69 45%,#b58e56 80%,#9d7a4f 100%)';
/** macOS icon grid: an 824pt body centred on the 1024pt canvas, the gutter left for the shadow. */
const MAC_BODY = 824 / 1024;
/** Android adaptive icon: 108dp layers, 72dp shown through the mask, 66dp safe for any mask. */
const ADAPTIVE = { canvas: 108, viewport: 72, safe: 66 };
/**
 * The DMG's Finder labels are drawn by macOS in black (light appearance) or white (dark), never in
 * a colour we pick. The table they sit on is the one luminance (Y ≈ 0.18) where both hold 4.5:1;
 * it stays flat through the label row and only falls off into shadow below it.
 */
const DMG_TABLE = '#8b7050';

const FONTS = [
	['Cinzel', 700, '@fontsource/cinzel/files/cinzel-latin-700-normal.woff2'],
	['Inter', 400, '@fontsource/inter/files/inter-latin-400-normal.woff2'],
];

// ─── The mark, read from the design system ──────────────────────────────────────────────────────

/** Parse the disc and the fold out of logo.svg; anything but the known shape stops the kit. */
function readMark(file) {
	const source = readFileSync(file, 'utf8');
	const attributes = (tag) => {
		const found = source.match(new RegExp(`<${tag}\\b([^>]*?)/?>`));
		if (!found) throw new Error(`brand-kit: ${file} has no <${tag}>`);
		return Object.fromEntries(
			[...found[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
		);
	};
	if (attributes('svg').viewBox !== '0 0 64 64') {
		throw new Error(`brand-kit: ${file} is no longer on the 64 grid — review the kit by hand`);
	}
	const circle = attributes('circle');
	const path = attributes('path');
	if (path['stroke-linejoin'] !== 'round' || path['stroke-linecap'] !== 'round') {
		// The safe-zone arithmetic below treats every vertex as a disc of half the stroke width.
		throw new Error(`brand-kit: ${file} fold is no longer round-capped — review the kit by hand`);
	}
	const tokens = path.d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
	const points = [];
	for (let i = 0; i < tokens.length; i += 3) {
		if (tokens[i] !== (i === 0 ? 'M' : 'L')) {
			throw new Error(
				`brand-kit: ${file} fold is no longer an M/L polyline — review the kit by hand`,
			);
		}
		points.push([Number(tokens[i + 1]), Number(tokens[i + 2])]);
	}
	return {
		disc: { cx: Number(circle.cx), cy: Number(circle.cy), r: Number(circle.r), fill: circle.fill },
		fold: { d: path.d, points, width: Number(path['stroke-width']), stroke: path.stroke },
	};
}

const MARK = readMark(LOGO);

/** The mark as an SVG fragment filling a `size` box at (x, y); `color` flattens it (themed icons). */
function markSvg({ x = 0, y = 0, size, color }) {
	const { disc, fold } = MARK;
	return (
		`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64">` +
		`<circle cx="${disc.cx}" cy="${disc.cy}" r="${disc.r}" fill="${color ?? disc.fill}"/>` +
		`<path d="${fold.d}" fill="none" stroke="${color ?? fold.stroke}" stroke-width="${fold.width}"` +
		` stroke-linejoin="round" stroke-linecap="round"/></svg>`
	);
}

/** The mark's geometry placed in a `box` at `origin` (canvas units), for vectors and safe zones. */
function placeMark(box, origin) {
	const scale = box / 64;
	const at = (value) => origin + value * scale;
	return {
		disc: { cx: at(MARK.disc.cx), cy: at(MARK.disc.cy), r: MARK.disc.r * scale },
		points: MARK.fold.points.map(([x, y]) => [at(x), at(y)]),
		width: MARK.fold.width * scale,
	};
}

/** Farthest ink from `centre`. Round caps and joins make that a vertex plus half the stroke. */
function inkRadius({ disc, points, width }, centre) {
	const distance = (x, y) => Math.hypot(x - centre, y - centre);
	return Math.max(
		distance(disc.cx, disc.cy) + disc.r,
		...points.map(([x, y]) => distance(x, y) + width / 2),
	);
}

// ─── Tile art ───────────────────────────────────────────────────────────────────────────────────

/**
 * The design-system tile on a 1024 canvas. `shape` is the ground's outline (`rounded` is the tile
 * itself), `body` shrinks the tile inside the canvas, `shadow` adds the macOS drop shadow.
 */
function tileArt({ shape = 'rounded', body = 1, shadow = false } = {}) {
	const edge = 1024 * body;
	const origin = (1024 - edge) / 2;
	const markBox = edge * TILE.mark;
	const filter = shadow ? ' filter="url(#shadow)"' : '';
	const ground = {
		rounded: `<rect x="${origin}" y="${origin}" width="${edge}" height="${edge}" rx="${edge * TILE.radius}" fill="${TILE.ground}"${filter}/>`,
		circle: `<circle cx="512" cy="512" r="${edge / 2}" fill="${TILE.ground}"${filter}/>`,
		square: `<rect width="1024" height="1024" fill="${TILE.ground}"/>`,
	}[shape];
	const defs = shadow
		? '<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">' +
			'<feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.35"/>' +
			'</filter></defs>'
		: '';
	return (
		defs +
		ground +
		markSvg({ x: origin + (edge - markBox) / 2, y: origin + (edge - markBox) / 2, size: markBox })
	);
}

const svgAt = (size, art) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${art}</svg>`;

/** The wordmark exactly as BrandWordmark sets it: Cinzel 700, uppercase, 0.075em, falloff tail. */
function wordmark(size) {
	return (
		`<span style="font:700 ${size}px Cinzel;letter-spacing:.075em;text-transform:uppercase;` +
		`white-space:nowrap;color:${TEXT_PRIMARY};padding-left:.075em">Lamp<span style="` +
		`background-image:${FALLOFF};-webkit-background-clip:text;background-clip:text;` +
		`color:transparent">light</span></span>`
	);
}

/** BrandLockup's proportions: mark twice the word size, a gap of two thirds of it. */
function lockup(wordSize) {
	return (
		`<div style="display:inline-flex;align-items:center;gap:${(wordSize * 2) / 3}px">` +
		`<svg width="${wordSize * 2}" height="${wordSize * 2}" viewBox="0 0 64 64" style="display:block">` +
		`${markSvg({ size: 64 })}</svg>${wordmark(wordSize)}</div>`
	);
}

/** Lamplight's light: a warm pool behind the mark, the only ornament the compositions get. */
const glow = (at, reach) =>
	`radial-gradient(${reach} at ${at}, rgba(224,176,111,.17), rgba(224,176,111,0) 70%)`;

// ─── Compositions ───────────────────────────────────────────────────────────────────────────────

function ogImage() {
	return (
		`<div style="width:1200px;height:630px;box-sizing:border-box;display:flex;flex-direction:column;` +
		`align-items:center;justify-content:center;gap:40px;padding:0 150px;text-align:center;` +
		`background:${glow('50% 44%', 'ellipse 55% 65%')},${SURFACE}">${lockup(64)}` +
		`<p style="margin:0;font:400 30px/1.4 Inter;color:${TEXT_SECONDARY}">` +
		`A local-first campaign workspace for preparing and running tabletop RPG sessions.</p></div>`
	);
}

/** macOS DMG window: 540×380, app at (140, 188), Applications at (400, 188), 96px icons. */
function dmgBackground() {
	const arrow =
		`<svg width="540" height="380" style="position:absolute;inset:0" viewBox="0 0 540 380">` +
		`<path d="M222 188H316M302 174L318 188L302 202" fill="none" stroke="${ACCENT}" stroke-width="3"` +
		` stroke-linecap="round" stroke-linejoin="round" opacity=".85"/></svg>`;
	return (
		`<div style="position:relative;width:540px;height:380px;overflow:hidden;` +
		`background:${glow('50% 38%', 'ellipse 60% 55%')},${SURFACE}">` +
		`<div style="position:absolute;top:40px;left:0;right:0;display:flex;justify-content:center">${lockup(20)}</div>` +
		`<div style="position:absolute;left:0;right:0;top:238px;bottom:0;` +
		`background:linear-gradient(${DMG_TABLE} 0 20%,#3a2e20 100%);` +
		`box-shadow:inset 0 2px 0 rgba(244,219,170,.28)"></div>${arrow}</div>`
	);
}

/** NSIS welcome/finish sidebar: 164×314, drawn beside the wizard's white text pane. */
function nsisSidebar() {
	return (
		`<div style="width:164px;height:314px;box-sizing:border-box;padding-top:70px;display:flex;` +
		`flex-direction:column;align-items:center;gap:20px;` +
		`background:${glow('50% 26%', 'circle 120px')},${SURFACE}">` +
		`<svg width="72" height="72" viewBox="0 0 64 64" style="display:block">${markSvg({ size: 64 })}</svg>` +
		`${wordmark(14)}</div>`
	);
}

function splash(width, height, density) {
	const tile = 120 * density;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
		`<rect width="${width}" height="${height}" fill="${SURFACE}"/>` +
		`<svg x="${(width - tile) / 2}" y="${(height - tile) / 2}" width="${tile}" height="${tile}" viewBox="0 0 1024 1024">` +
		`${tileArt()}</svg></svg>`
	);
}

// ─── Android vectors ────────────────────────────────────────────────────────────────────────────

const ADAPTIVE_BOX = ADAPTIVE.viewport * TILE.mark;
const ADAPTIVE_MARK = placeMark(ADAPTIVE_BOX, (ADAPTIVE.canvas - ADAPTIVE_BOX) / 2);
const ADAPTIVE_INK = inkRadius(ADAPTIVE_MARK, ADAPTIVE.canvas / 2);
if (ADAPTIVE_INK > ADAPTIVE.safe / 2) {
	throw new Error(
		`brand-kit: adaptive foreground ink reaches ${ADAPTIVE_INK}dp, past the 33dp safe zone`,
	);
}

const num = (value) => String(Number(value.toFixed(4)));
const argb = (hex) => `#FF${hex.slice(1).toUpperCase()}`;

function vectorDrawable(comment, { disc, points, width }, discColor, foldColor) {
	const r = num(disc.r);
	const discPath = `M${num(disc.cx - disc.r)},${num(disc.cy)} a${r},${r} 0 1,0 ${num(2 * disc.r)},0 a${r},${r} 0 1,0 ${num(-2 * disc.r)},0 Z`;
	const foldPath = points.map(([x, y], i) => `${i ? 'L' : 'M'}${num(x)},${num(y)}`).join(' ');
	return `<?xml version="1.0" encoding="utf-8"?>
<!--
    Generated by apps/gm-react/build-resources/brand-kit.mjs from the design system's
    assets/logo.svg (RC-DSN-3.3). Edit the generator, not this file.

${comment.map((line) => `    ${line}`).join('\n')}
-->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${ADAPTIVE.canvas}dp"
    android:height="${ADAPTIVE.canvas}dp"
    android:viewportWidth="${ADAPTIVE.canvas}"
    android:viewportHeight="${ADAPTIVE.canvas}">
    <path
        android:fillColor="${discColor}"
        android:pathData="${discPath}" />
    <path
        android:pathData="${foldPath}"
        android:strokeColor="${foldColor}"
        android:strokeWidth="${num(width)}"
        android:strokeLineJoin="round"
        android:strokeLineCap="round" />
</vector>
`;
}

const GEOMETRY_NOTE = [
	`The mark's 64 grid is scaled as a whole to ${num(ADAPTIVE_BOX)}dp, 65.6% of the 72dp masked`,
	`viewport (the design-system tile's proportion), so the stroke stays 5.5 grid units. Its`,
	`farthest ink is ${num(ADAPTIVE_INK)}dp from centre, inside the 33dp safe-zone radius.`,
];

const FOREGROUND_XML = vectorDrawable(
	[
		'Lamplight adaptive-icon foreground, also the Android 12+ splash icon. The ground is',
		'@color/ic_launcher_background, the design-system tile colour.',
		...GEOMETRY_NOTE,
	],
	ADAPTIVE_MARK,
	argb(MARK.disc.fill),
	argb(MARK.fold.stroke),
);

const MONOCHROME_XML = vectorDrawable(
	[
		'Lamplight themed-icon layer. The system tints this by alpha, so the disc and the fold are',
		'flat white and the launcher recolours them together. Same geometry as the foreground.',
		...GEOMETRY_NOTE,
	],
	ADAPTIVE_MARK,
	'#FFFFFFFF',
	'#FFFFFFFF',
);

// ─── Containers: PNG in, ICO / ICNS / BMP out ───────────────────────────────────────────────────

/** Decode the 8-bit, non-interlaced RGB(A) PNGs Chromium screenshots are, to RGBA pixels. */
function decodePng(png) {
	let offset = 8;
	let width = 0;
	let height = 0;
	let channels = 0;
	const idat = [];
	while (offset < png.length) {
		const length = png.readUInt32BE(offset);
		const type = png.toString('ascii', offset + 4, offset + 8);
		const data = png.subarray(offset + 8, offset + 8 + length);
		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			if (data[8] !== 8 || data[12] !== 0 || (data[9] !== 2 && data[9] !== 6)) {
				throw new Error('brand-kit: expected an 8-bit non-interlaced RGB(A) PNG');
			}
			channels = data[9] === 6 ? 4 : 3;
		} else if (type === 'IDAT') {
			idat.push(data);
		}
		offset += 12 + length;
	}
	const raw = inflateSync(Buffer.concat(idat));
	const stride = width * channels;
	const pixels = Buffer.alloc(width * height * 4);
	let previous = Buffer.alloc(stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
		for (let i = 0; i < stride; i++) {
			const a = i >= channels ? line[i - channels] : 0;
			const b = previous[i];
			const c = i >= channels ? previous[i - channels] : 0;
			let predictor;
			if (filter === 0) predictor = 0;
			else if (filter === 1) predictor = a;
			else if (filter === 2) predictor = b;
			else if (filter === 3) predictor = (a + b) >> 1;
			else if (filter === 4) {
				const p = a + b - c;
				const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
				predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			} else throw new Error(`brand-kit: unknown PNG filter ${filter}`);
			line[i] = (line[i] + predictor) & 0xff;
		}
		for (let x = 0; x < width; x++) {
			const to = (y * width + x) * 4;
			line.copy(pixels, to, x * channels, x * channels + 3);
			pixels[to + 3] = channels === 4 ? line[x * 4 + 3] : 255;
		}
		previous = line;
	}
	return { width, height, pixels };
}

/** An uncompressed 24-bit BMP — the only kind NSIS's Modern UI wizard bitmaps accept. */
function encodeBmp24({ width, height, pixels }) {
	const stride = Math.ceil((width * 3) / 4) * 4;
	const file = Buffer.alloc(54 + stride * height);
	file.write('BM', 0, 'ascii');
	file.writeUInt32LE(file.length, 2);
	file.writeUInt32LE(54, 10);
	file.writeUInt32LE(40, 14);
	file.writeInt32LE(width, 18);
	file.writeInt32LE(height, 22);
	file.writeUInt16LE(1, 26);
	file.writeUInt16LE(24, 28);
	file.writeUInt32LE(stride * height, 34);
	file.writeInt32LE(2835, 38);
	file.writeInt32LE(2835, 42);
	for (let y = 0; y < height; y++) {
		const row = 54 + (height - 1 - y) * stride;
		for (let x = 0; x < width; x++) {
			const from = (y * width + x) * 4;
			if (pixels[from + 3] !== 255) throw new Error('brand-kit: a BMP composition must be opaque');
			file[row + x * 3] = pixels[from + 2];
			file[row + x * 3 + 1] = pixels[from + 1];
			file[row + x * 3 + 2] = pixels[from];
		}
	}
	return file;
}

/** A 32-bit ICO image (BGRA, bottom-up, AND mask set where fully transparent). */
function icoBitmap({ width, height, pixels }) {
	const maskStride = Math.ceil(width / 32) * 4;
	const colour = width * height * 4;
	const out = Buffer.alloc(40 + colour + maskStride * height);
	out.writeUInt32LE(40, 0);
	out.writeInt32LE(width, 4);
	out.writeInt32LE(height * 2, 8);
	out.writeUInt16LE(1, 12);
	out.writeUInt16LE(32, 14);
	out.writeUInt32LE(colour + maskStride * height, 20);
	for (let y = 0; y < height; y++) {
		const row = height - 1 - y;
		for (let x = 0; x < width; x++) {
			const from = (y * width + x) * 4;
			const to = 40 + (row * width + x) * 4;
			out[to] = pixels[from + 2];
			out[to + 1] = pixels[from + 1];
			out[to + 2] = pixels[from];
			out[to + 3] = pixels[from + 3];
			if (pixels[from + 3] === 0) out[40 + colour + row * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
		}
	}
	return out;
}

/** Windows ICO: bitmaps below 256px (what every shell and NSIS read), PNG for the 256px entry. */
function encodeIco(images) {
	const entries = images.map(({ size, png }) => ({
		size,
		data: size >= 256 ? png : icoBitmap(decodePng(png)),
	}));
	const header = Buffer.alloc(6 + 16 * entries.length);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(entries.length, 4);
	let offset = header.length;
	entries.forEach(({ size, data }, index) => {
		const at = 6 + 16 * index;
		header[at] = size >= 256 ? 0 : size;
		header[at + 1] = size >= 256 ? 0 : size;
		header.writeUInt16LE(1, at + 4);
		header.writeUInt16LE(32, at + 6);
		header.writeUInt32LE(data.length, at + 8);
		header.writeUInt32LE(offset, at + 12);
		offset += data.length;
	});
	return Buffer.concat([header, ...entries.map(({ data }) => data)]);
}

/** Apple ICNS with PNG payloads: 1x and 2x entries for every point size from 16 to 512. */
const ICNS_ENTRIES = [
	['icp4', 16],
	['icp5', 32],
	['icp6', 64],
	['ic07', 128],
	['ic08', 256],
	['ic09', 512],
	['ic10', 1024],
	['ic11', 32],
	['ic12', 64],
	['ic13', 256],
	['ic14', 512],
];

function encodeIcns(pngBySize) {
	const chunks = ICNS_ENTRIES.map(([type, size]) => {
		const head = Buffer.alloc(8);
		head.write(type, 0, 'ascii');
		head.writeUInt32BE(pngBySize.get(size).length + 8, 4);
		return Buffer.concat([head, pngBySize.get(size)]);
	});
	const body = Buffer.concat(chunks);
	const head = Buffer.alloc(8);
	head.write('icns', 0, 'ascii');
	head.writeUInt32BE(body.length + 8, 4);
	return Buffer.concat([head, body]);
}

// ─── Rendering ──────────────────────────────────────────────────────────────────────────────────

const FONT_FACES = FONTS.map(
	([family, weight, file]) =>
		`@font-face{font-family:'${family}';font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,` +
		`${readFileSync(join(APP, 'node_modules', file)).toString('base64')}) format('woff2')}`,
).join('');

async function createRenderer() {
	const browser = await chromium.launch();
	const contexts = new Map();
	/** Screenshot `markup` in a width×height viewport; `scale` renders a @2x (or @Nx) raster. */
	async function render(markup, width, height, { scale = 1, type = 'png' } = {}) {
		if (!contexts.has(scale))
			contexts.set(scale, await browser.newContext({ deviceScaleFactor: scale }));
		const page = await contexts.get(scale).newPage();
		try {
			await page.setViewportSize({ width, height });
			await page.setContent(
				`<!doctype html><meta charset="utf-8"><style>${FONT_FACES}` +
					`html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${markup}`,
			);
			await page.evaluate(() =>
				Promise.all([...document.fonts].map((face) => face.load())).then(() => undefined),
			);
			return await page.screenshot(
				type === 'png' ? { omitBackground: true, type } : { type, quality: 90 },
			);
		} finally {
			await page.close();
		}
	}
	return { render, close: () => browser.close() };
}

const written = [];
function write(file, data) {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, data);
	written.push([relative(APP, file), data.length]);
}

const DENSITIES = [
	['mdpi', 1],
	['hdpi', 1.5],
	['xhdpi', 2],
	['xxhdpi', 3],
	['xxxhdpi', 4],
];
/** Legacy splash canvases (landscape, mdpi); portrait is the transpose, `drawable/` the mdpi land. */
const SPLASH_LAND = {
	mdpi: [480, 320],
	hdpi: [800, 480],
	xhdpi: [1280, 720],
	xxhdpi: [1600, 960],
	xxxhdpi: [1920, 1280],
};

async function main() {
	const previewAt = process.argv.indexOf('--preview');
	const previewFile = previewAt >= 0 ? resolve(process.argv[previewAt + 1] ?? '') : undefined;
	const maskableInk = inkRadius(placeMark(512 * TILE.mark, (512 - 512 * TILE.mark) / 2), 256);
	if (maskableInk > 0.4 * 512)
		throw new Error(`brand-kit: maskable ink reaches ${maskableInk}px of 204.8px`);

	const { render, close } = await createRenderer();
	try {
		const full = (size) => render(svgAt(size, tileArt()), size, size);
		const mac = (size) =>
			render(svgAt(size, tileArt({ body: MAC_BODY, shadow: true })), size, size);
		const square = (size) => render(svgAt(size, tileArt({ shape: 'square' })), size, size);
		const round = (size) => render(svgAt(size, tileArt({ shape: 'circle' })), size, size);

		// Desktop: Windows keeps the full-bleed tile, macOS and Linux the inset grid.
		write(join(BUILD, 'icon.png'), await full(1024));
		const ico = [];
		for (const size of [16, 20, 24, 32, 40, 48, 64, 256]) ico.push({ size, png: await full(size) });
		write(join(BUILD, 'icon.ico'), encodeIco(ico));
		const macSizes = new Map();
		for (const size of [16, 32, 64, 128, 256, 512, 1024]) macSizes.set(size, await mac(size));
		write(join(BUILD, 'icon.icns'), encodeIcns(macSizes));
		for (const size of [16, 32, 48, 64, 128, 256, 512]) {
			write(join(BUILD, 'icons', `${size}x${size}.png`), macSizes.get(size) ?? (await mac(size)));
		}
		write(join(BUILD, 'background.png'), await render(dmgBackground(), 540, 380));
		write(join(BUILD, 'background@2x.png'), await render(dmgBackground(), 540, 380, { scale: 2 }));
		write(
			join(BUILD, 'installerSidebar.bmp'),
			encodeBmp24(decodePng(await render(nsisSidebar(), 164, 314))),
		);

		// Web: favicon set, install icons, the iOS home-screen icon and the share card.
		const favicon = [];
		for (const size of [16, 32, 48]) favicon.push({ size, png: await full(size) });
		write(join(PUBLIC, 'favicon.ico'), encodeIco(favicon));
		write(join(PUBLIC, 'icon-192.png'), await full(192));
		write(join(PUBLIC, 'icon-512.png'), await full(512));
		write(join(PUBLIC, 'icon-maskable-192.png'), await square(192));
		write(join(PUBLIC, 'icon-maskable-512.png'), await square(512));
		write(join(PUBLIC, 'apple-touch-icon.png'), await square(180));
		// JPEG, not PNG: the service worker precaches every public PNG, and a share card is for
		// link crawlers, never for the offline shell.
		write(join(PUBLIC, 'og-image.jpg'), await render(ogImage(), 1200, 630, { type: 'jpeg' }));

		// Android: adaptive + themed vectors, legacy launcher PNGs, pre-12 splash bitmaps.
		write(join(RES, 'drawable/ic_launcher_foreground.xml'), FOREGROUND_XML);
		write(join(RES, 'drawable/ic_launcher_monochrome.xml'), MONOCHROME_XML);
		for (const [bucket, density] of DENSITIES) {
			write(join(RES, `mipmap-${bucket}/ic_launcher.png`), await full(48 * density));
			write(join(RES, `mipmap-${bucket}/ic_launcher_round.png`), await round(48 * density));
			const [width, height] = SPLASH_LAND[bucket];
			write(
				join(RES, `drawable-land-${bucket}/splash.png`),
				await render(splash(width, height, density), width, height),
			);
			write(
				join(RES, `drawable-port-${bucket}/splash.png`),
				await render(splash(height, width, density), height, width),
			);
		}
		const [width, height] = SPLASH_LAND.mdpi;
		write(join(RES, 'drawable/splash.png'), await render(splash(width, height, 1), width, height));

		if (previewFile) {
			writeFileSync(previewFile, await render(launcherPreview(), 1180, 300));
			console.log(`brand-kit: launcher preview → ${previewFile}`);
		}
	} finally {
		await close();
	}
}

/**
 * The adaptive icon the way a launcher shows it, built from the vector files just written (their
 * `pathData`, not this script's numbers): full layers with the 72dp viewport and the 66dp safe
 * circle, then the circle, squircle, rounded-square and teardrop masks, then the themed icon.
 */
function launcherPreview() {
	const paths = (xml) => [...xml.matchAll(/android:pathData="([^"]+)"/g)].map((m) => m[1]);
	const [disc, fold] = paths(FOREGROUND_XML);
	const [monoDisc, monoFold] = paths(MONOCHROME_XML);
	const width = num(ADAPTIVE_MARK.width);
	const layer = (discFill, foldStroke, d = disc, f = fold) =>
		`<path d="${d}" fill="${discFill}"/><path d="${f}" fill="none" stroke="${foldStroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
	const masks = {
		circle: '<circle cx="54" cy="54" r="36"/>',
		squircle: '<path d="M54 18C82.8 18 90 25.2 90 54S82.8 90 54 90 18 82.8 18 54 25.2 18 54 18Z"/>',
		rounded: '<rect x="18" y="18" width="72" height="72" rx="12"/>',
		teardrop: '<path d="M54 18A36 36 0 0 1 90 54V82A8 8 0 0 1 82 90H54A36 36 0 0 1 54 18Z"/>',
	};
	const cell = (label, content) =>
		`<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:10px;font:400 13px Inter;color:${TEXT_SECONDARY}">${content}<figcaption>${label}</figcaption></figure>`;
	const masked = (name, ground, ink) =>
		cell(
			name,
			`<svg width="144" height="144" viewBox="18 18 72 72"><defs><clipPath id="m-${name}-${ground.slice(1)}">${masks[name]}</clipPath></defs>` +
				`<g clip-path="url(#m-${name}-${ground.slice(1)})"><rect width="108" height="108" fill="${ground}"/>${ink}</g></svg>`,
		);
	const layers = cell(
		'72dp viewport · 66dp safe zone',
		`<svg width="216" height="216" viewBox="0 0 108 108"><rect width="108" height="108" fill="${TILE.ground}"/>${layer(MARK.disc.fill, MARK.fold.stroke)}` +
			'<rect x="18" y="18" width="72" height="72" fill="none" stroke="#6fb3ff" stroke-width=".5" stroke-dasharray="2 2"/>' +
			'<circle cx="54" cy="54" r="33" fill="none" stroke="#ff6f91" stroke-width=".5" stroke-dasharray="2 2"/></svg>',
	);
	const themed = layer('#1e2a4a', '#1e2a4a', monoDisc, monoFold);
	return (
		`<div style="width:1180px;height:300px;box-sizing:border-box;padding:28px;display:flex;align-items:center;gap:28px;background:#2b2a33">` +
		layers +
		Object.keys(masks)
			.map((name) => masked(name, TILE.ground, layer(MARK.disc.fill, MARK.fold.stroke)))
			.join('') +
		masked('circle', '#c9d7ff', themed).replace('<figcaption>circle', '<figcaption>themed') +
		'</div>'
	);
}

await main();
for (const [file, bytes] of written) console.log(`${String(bytes).padStart(8)}  ${file}`);
