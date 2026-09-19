/* eslint-disable dsn/no-raw-style-values -- PDF paper colors must be literal canvas colors, independent of the screen theme. */
/** Rasterize at 2× for Unicode-safe native exports without a WebView print dependency. */
export function sheetPdf(canvas: HTMLCanvasElement, name: string, rows: string[]): Blob {
	canvas.width = 1190;
	canvas.height = 1684;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('PDF rendering is unavailable. Try another device.');
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#111';
	ctx.font = 'bold 36px sans-serif';
	ctx.fillText(name, 72, 90, 1046);
	ctx.font = '22px sans-serif';
	ctx.fillText('Character sheet · Compact summary', 72, 132);
	rows.forEach((row, i) => ctx.fillText(row, 72, 190 + i * 34, 1046));
	ctx.font = '18px sans-serif';
	ctx.fillText(
		'Long sections are abbreviated with …; full details remain in the character sheet.',
		72,
		1598,
		1046,
	);
	const jpeg = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]), (c) =>
		c.charCodeAt(0),
	);
	const encoder = new TextEncoder();
	const parts: Uint8Array<ArrayBuffer>[] = [];
	let length = 0;
	const offsets = [0];
	const add = (part: string | Uint8Array<ArrayBuffer>) => {
		const bytes = typeof part === 'string' ? encoder.encode(part) : part;
		parts.push(bytes);
		length += bytes.length;
	};
	const object = (id: number, content: string) => {
		offsets[id] = length;
		add(`${id} 0 obj\n${content}\nendobj\n`);
	};
	add('%PDF-1.4\n');
	object(1, '<< /Type /Catalog /Pages 2 0 R >>');
	object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
	object(
		3,
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Sheet 4 0 R >> >> /Contents 5 0 R >>',
	);
	offsets[4] = length;
	add(
		`4 0 obj\n<< /Type /XObject /Subtype /Image /Width 1190 /Height 1684 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
	);
	add(jpeg);
	add('\nendstream\nendobj\n');
	const stream = 'q 595 0 0 842 0 0 cm /Sheet Do Q\n';
	object(5, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
	const xref = length;
	add('xref\n0 6\n0000000000 65535 f \n');
	offsets.slice(1).forEach((offset) => add(`${String(offset).padStart(10, '0')} 00000 n \n`));
	add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
	return new Blob(parts, { type: 'application/pdf' });
}
