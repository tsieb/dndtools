/**
 * Capped Levenshtein edit distance between two strings. Returns the exact distance when it is `<= max`,
 * otherwise `max + 1` (it bails as soon as an entire DP row exceeds the cap, so a far-apart pair is cheap).
 * Pure and deterministic — the shared basis for graph link-suggestion + repair fuzzy matching.
 */
export function editDistance(a: string, b: string, max: number): number {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > max) return max + 1;
	const prev = new Array<number>(b.length + 1);
	const curr = new Array<number>(b.length + 1);
	for (let j = 0; j <= b.length; j += 1) prev[j] = j;
	for (let i = 1; i <= a.length; i += 1) {
		curr[0] = i;
		let rowMin = curr[0]!;
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
			if (curr[j]! < rowMin) rowMin = curr[j]!;
		}
		// Whole row already exceeds the cap — no path can come back under it; bail deterministically.
		if (rowMin > max) return max + 1;
		for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]!;
	}
	return prev[b.length]!;
}
