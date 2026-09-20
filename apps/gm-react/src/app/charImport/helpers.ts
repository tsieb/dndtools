export function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function asFiniteNumber(v: unknown): number | undefined {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string' && v.trim() !== '') {
		const n = Number(v);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

export function asInt(v: unknown): number | undefined {
	const n = asFiniteNumber(v);
	return n === undefined ? undefined : Math.trunc(n);
}

export function nonEmptyString(v: unknown): string | undefined {
	return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

export const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
