/** Browser-side graph update capture. Failed commands or missing renders invalidate the batch. */
export async function captureGraphUpdates({
	actor: a,
	runs,
}: {
	actor: string;
	runs: number;
}): Promise<number[]> {
	const rt = (
		window as unknown as {
			__rt: { dispatch: (c: unknown) => Promise<{ status: string }> };
		}
	).__rt;
	const out: number[] = [];
	for (let i = 0; i < runs; i += 1) {
		const title = `Perf indexed note ${i}`;
		const started = performance.now();
		performance.mark('rc-perf:graph-indexing:start');
		const res = await rt.dispatch({
			type: 'content.create-item',
			actorId: a,
			payload: {
				kind: 'note',
				title,
				body: `Linked to [[Perf note 1]] and [[Perf note 2]].`,
				visibility: 'player-visible',
			},
		});
		if (res.status !== 'accepted') throw new Error('Graph fixture command rejected');
		// Wait for the graph rail to show the changed note — the affected-node update.
		// NOTE: no named inner function here. `tsx` compiles this file with esbuild's
		// keep-names transform, which rewrites a named function/arrow into a `__name(...)`
		// call — and `__name` does not exist inside the page, so the evaluate would throw.
		const deadline = performance.now() + 10_000;
		let rendered = false;
		while (performance.now() < deadline) {
			const main = document.querySelector('#main-content');
			const hit =
				!!main &&
				Array.from(main.querySelectorAll('button')).some((b) =>
					(b.textContent ?? '').includes(title),
				);
			if (hit) {
				rendered = true;
				break;
			}
			await new Promise<void>((done) => requestAnimationFrame(() => done()));
		}
		if (!rendered) throw new Error('Graph update did not render before the deadline');
		performance.mark('rc-perf:graph-indexing:reindexed');
		performance.measure(
			'rc-perf:graph-indexing',
			'rc-perf:graph-indexing:start',
			'rc-perf:graph-indexing:reindexed',
		);
		out.push(Math.round((performance.now() - started) * 1000) / 1000);
	}
	return out;
}
