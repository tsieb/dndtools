/**
 * Campaign Copilot RAG de-risk prototype (cloud-tier roadmap P1 #4, "de-risk first").
 *
 * Measures, on the real seeded demo campaign (Saltreach), the two questions the roadmap
 * says to answer BEFORE building the managed Copilot:
 *   1. answer quality — does retrieval-augmented generation over vault content produce
 *      correct, grounded answers with a small top-k? (retrieval hit rate + graded answers)
 *   2. token cost — how many tokens does a Copilot query actually consume, and what does
 *      that cost on the candidate managed engines (Gemini Flash tiers, with/without
 *      context caching)?
 *
 * Deliberately mirrors the roadmap's serverless architecture: brute-force cosine over
 * embeddings (no vector DB), chunk-per-content-item. Generation + embeddings run on the
 * local Ollama daemon (qwen2.5:7b + nomic-embed-text) as a conservative quality floor —
 * a managed Flash-class model is strictly stronger than a local 7B.
 *
 * Run:  pnpm exec tsx scripts/rag-derisk.ts [--no-llm]   (writes JSON results to stdout;
 *       --no-llm measures retrieval + cost only, skipping local generation)
 */
import {
	dispatchCommand,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../packages/core/src/index';
import {
	DM_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../packages/core/src/testing/fixtures';
import { seedDemoContent } from '../apps/gm-react/src/runtime/demo-seed';

// ---------------------------------------------------------------------------------------
// 1 · Corpus: run the real demo seeder against a headless core runtime and read the state.
// ---------------------------------------------------------------------------------------

async function buildCorpusState(): Promise<CoreStateSlice> {
	const players = ['actor-player', 'actor-player-2', 'actor-player-3'].map((id, i) => ({
		id,
		role: 'player' as const,
		displayName: `Player ${i + 1}`,
	}));
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, ...players);
	const runtime = {
		get state(): CoreStateSlice {
			return state;
		},
		defaultActorId: DM_ACTOR.id,
		async dispatch(command: CoreCommand): Promise<CommandResult> {
			const result = dispatchCommand(state, env, command);
			state = result.nextState;
			return result;
		},
	};
	await seedDemoContent(runtime);
	return state;
}

export interface Chunk {
	id: string;
	source: string;
	text: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

/** Flatten every text-bearing seeded artifact into retrieval chunks (one per item). */
export function chunksFromState(state: CoreStateSlice): Chunk[] {
	const chunks: Chunk[] = [];
	const push = (id: string, source: string, text: string) => {
		const t = text.replace(/\s+/g, ' ').trim();
		if (t.length > 40) chunks.push({ id, source, text: t });
	};
	const content = state.content as unknown as Record<string, unknown>;
	for (const [key, value] of Object.entries(content)) {
		if (!isRecord(value)) continue;
		// content slices hold maps of id → item across several collections; walk generically.
		for (const [id, item] of Object.entries(value)) {
			if (!isRecord(item)) continue;
			const title = typeof item.title === 'string' ? item.title : '';
			const body = typeof item.body === 'string' ? item.body : '';
			const fields = isRecord(item.fields)
				? Object.entries(item.fields)
						.filter(([, v]) => typeof v === 'string')
						.map(([k, v]) => `${k}: ${v as string}`)
						.join('. ')
				: '';
			if (title || body || fields)
				push(`content/${key}/${id}`, title || key, `${title}. ${body} ${fields}`);
		}
	}
	const characters = state.characters as unknown as { characters?: Record<string, unknown> };
	for (const [id, c] of Object.entries(characters.characters ?? {})) {
		if (!isRecord(c)) continue;
		const combat = isRecord(c.combat) ? c.combat : {};
		const data = isRecord(c.data) ? c.data : {};
		const bits = [
			`Character: ${String(c.name ?? '')}`,
			`kind: ${String(c.kind ?? '')}`,
			data.class ? `class: ${String(data.class)}` : '',
			data.background ? `background: ${String(data.background)}` : '',
			combat.maxHp !== undefined ? `max HP ${String(combat.maxHp)}, AC ${String(combat.ac)}` : '',
			typeof c.notes === 'string' ? c.notes : '',
		];
		push(`character/${id}`, String(c.name ?? id), bits.filter(Boolean).join('. '));
	}
	return chunks;
}

// ---------------------------------------------------------------------------------------
// 2 · Retrievers: lexical BM25 baseline vs embeddings + brute-force cosine (the roadmap
//     architecture). Both are exactly what a scale-to-zero Lambda could run.
// ---------------------------------------------------------------------------------------

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9']+/)
		.filter((w) => w.length > 1);
}

export function bm25Rank(chunks: Chunk[], query: string, k = 3): Chunk[] {
	const docs = chunks.map((c) => tokenize(c.text));
	const avgLen = docs.reduce((a, d) => a + d.length, 0) / docs.length;
	const df = new Map<string, number>();
	for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
	const q = tokenize(query);
	const scores = docs.map((d) => {
		const tf = new Map<string, number>();
		for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
		let score = 0;
		for (const term of q) {
			const f = tf.get(term) ?? 0;
			if (!f) continue;
			const idf = Math.log(
				1 + (docs.length - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5),
			);
			score += (idf * f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.length / avgLen)));
		}
		return score;
	});
	return scores
		.map((s, i) => ({ s, i }))
		.sort((a, b) => b.s - a.s)
		.slice(0, k)
		.map(({ i }) => chunks[i]);
}

const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';

async function embed(texts: string[]): Promise<number[][]> {
	const res = await fetch(`${OLLAMA}/api/embed`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ model: 'nomic-embed-text', input: texts }),
	});
	if (!res.ok) throw new Error(`embed failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as { embeddings: number[][] };
	return data.embeddings;
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------------------------------------------------------------------------------------
// 3 · QA set: questions a DM actually asks mid-session, each with the chunk that holds
//     the answer and the key facts a correct answer must contain.
// ---------------------------------------------------------------------------------------

interface Qa {
	q: string;
	/** substring of the expected source chunk's id or source title */
	expect: string;
	/** every keyword group must appear (any one alternative per group) for a "grounded" grade */
	facts: string[][];
}

export const QA: Qa[] = [
	{ q: 'Who leads the Brine Hand cult?', expect: 'Brine Hand', facts: [['Sild']] },
	{
		q: 'What is the secret about Dockmaster Pell?',
		expect: 'Dockworkers',
		facts: [['leak'], ['tide schedule', 'tide']],
	},
	{
		q: 'What happened twenty-five years ago in Saltreach?',
		expect: 'Drowning of Saltreach',
		facts: [['tide rose', 'sank', 'drowned']],
	},
	{
		q: 'What lies beneath the old keep?',
		expect: 'Sunken Crypt',
		facts: [['antechamber', 'reliquary', 'breathes']],
	},
	{
		q: 'What does the Ashen Hand faction want to achieve?',
		expect: 'Ashen Hand',
		facts: [['raise'], ['drowned empire', 'empire']],
	},
	{
		q: 'Which sergeant did the Saltmarsh Watch lose to the cult?',
		expect: 'Saltmarsh Watch',
		facts: [['Vorlag']],
	},
	{ q: 'What is the armor class of The Hollow King?', expect: 'Hollow King', facts: [['19']] },
	{
		q: 'What class and background does Sera Duskwhisper have?',
		expect: 'Sera Duskwhisper',
		facts: [['rogue'], ['criminal']],
	},
	{
		q: 'Where does the party gather at the start of the campaign?',
		expect: 'Campaign Primer',
		facts: [['pier']],
	},
	{
		q: 'Who suspects there is still a cult sympathizer inside the town militia?',
		expect: 'Saltmarsh Watch',
		facts: [['Roese']],
	},
	{
		q: "Where is the Ashen Hand's next rite staged?",
		expect: 'Ashen Hand',
		facts: [['Sunken Crypt', 'crypt']],
	},
	{
		q: 'What happens if the Bell rings twice?',
		expect: 'Brine Hand',
		facts: [['Sild'], ['charge']],
	},
];

// ---------------------------------------------------------------------------------------
// 4 · Measurement
// ---------------------------------------------------------------------------------------

const tokens = (s: string) => Math.round(s.length / 4); // conservative ~4 chars/token

async function generate(prompt: string): Promise<{ answer: string; ms: number }> {
	const t0 = performance.now();
	const res = await fetch(`${OLLAMA}/api/generate`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			model: 'qwen2.5:7b',
			prompt,
			stream: false,
			options: { temperature: 0 },
		}),
	});
	if (!res.ok) throw new Error(`generate failed: ${res.status}`);
	const data = (await res.json()) as { response: string };
	return { answer: data.response, ms: performance.now() - t0 };
}

async function main(): Promise<void> {
	const noLlm = process.argv.includes('--no-llm');
	const state = await buildCorpusState();
	const chunks = chunksFromState(state);
	if (process.argv.includes('--dump')) {
		for (const c of chunks) console.log(`## ${c.id} (${c.source})\n${c.text}\n`);
		return;
	}
	console.log(
		`corpus: ${chunks.length} chunks, ${tokens(chunks.map((c) => c.text).join(' '))} tokens total`,
	);

	const chunkVecs = await embed(chunks.map((c) => c.text));
	const results: Record<string, unknown>[] = [];
	let bmHit1 = 0;
	let bmHit3 = 0;
	let emHit1 = 0;
	let emHit3 = 0;
	let grounded = 0;
	let inTok = 0;
	let outTok = 0;
	for (const qa of QA) {
		const bm = bm25Rank(chunks, qa.q, 3);
		const [qv] = await embed([qa.q]);
		const em = chunks
			.map((c, i) => ({ c, s: cosine(qv, chunkVecs[i]) }))
			.sort((a, b) => b.s - a.s)
			.slice(0, 3)
			.map(({ c }) => c);
		const match = (c: Chunk) => c.id.includes(qa.expect) || c.source.includes(qa.expect);
		bmHit1 += match(bm[0]) ? 1 : 0;
		bmHit3 += bm.some(match) ? 1 : 0;
		emHit1 += match(em[0]) ? 1 : 0;
		emHit3 += em.some(match) ? 1 : 0;

		let answer = '';
		let ms = 0;
		let ok = false;
		if (!noLlm) {
			const context = em.map((c, i) => `[${i + 1}] (${c.source}) ${c.text}`).join('\n');
			const prompt = `You are a D&D campaign assistant. Answer ONLY from the context. If the context does not contain the answer, say "not in the campaign notes".\n\nContext:\n${context}\n\nQuestion: ${qa.q}\nAnswer:`;
			inTok += tokens(prompt);
			({ answer, ms } = await generate(prompt));
			outTok += tokens(answer);
			const low = answer.toLowerCase();
			ok = qa.facts.every((group) => group.some((alt) => low.includes(alt.toLowerCase())));
			grounded += ok ? 1 : 0;
		}
		results.push({
			q: qa.q,
			bmTop: bm[0].source,
			emTop: em[0].source,
			hit3: em.some(match),
			grounded: ok,
			ms: Math.round(ms),
			answer: answer.slice(0, 220),
		});
	}
	const n = QA.length;
	console.log(
		JSON.stringify(
			{
				corpusChunks: chunks.length,
				retrieval: {
					bm25: { hit1: bmHit1 / n, hit3: bmHit3 / n },
					embeddings: { hit1: emHit1 / n, hit3: emHit3 / n },
				},
				generation: noLlm
					? 'skipped'
					: {
							grounded: grounded / n,
							avgInTokens: Math.round(inTok / n),
							avgOutTokens: Math.round(outTok / n),
						},
				perQuery: results,
			},
			null,
			2,
		),
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
