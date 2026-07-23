# Campaign Copilot — RAG de-risk measurement

Roadmap P1 #4 (docs/development/CLOUD_TIER_ROADMAP.md) says: "De-risk first: prototype RAG on one
real campaign, measure answer quality + token cost." This is that measurement. Executed 2026-07-23
with `scripts/rag-derisk.ts`; re-run it any time with:

```bash
pnpm exec tsx scripts/rag-derisk.ts          # full run (needs local Ollama: qwen2.5:7b + nomic-embed-text)
pnpm exec tsx scripts/rag-derisk.ts --no-llm # retrieval + cost only
pnpm exec tsx scripts/rag-derisk.ts --dump   # print the extracted corpus
```

## Method

- **Corpus** — the real seeded demo campaign (Saltreach): `seedDemoContent` is executed against a
  headless core runtime (`dispatchCommand` + testing fixtures), and every text-bearing artifact in
  the resulting state (notes, faction sheets, timeline entries, characters) becomes one retrieval
  chunk. 14 chunks, ~630 tokens — deliberately the same extraction a sync-side indexer would do.
- **Architecture under test** — exactly the roadmap's serverless plan: embeddings + brute-force
  cosine (no vector DB), top-3 context, grounded-only prompting ("answer ONLY from the context").
  A lexical BM25 baseline runs beside it. Generation uses local `qwen2.5:7b` at temperature 0 as a
  **conservative floor** — any managed Flash-class engine is strictly stronger.
- **QA set** — 12 questions a DM actually asks mid-session (faction secrets, NPC stats, timeline
  facts), each with the expected source chunk and required answer facts, graded mechanically.

## Results (2026-07-23, 12 queries)

| Metric                             | BM25 (lexical) | Embeddings (nomic-embed-text) |
| ---------------------------------- | :------------: | :---------------------------: |
| Retrieval hit@1                    |      83%       |              92%              |
| Retrieval hit@3                    |    **100%**    |              92%              |
| Grounded correct answers (7B, k=3) |       —        |        **92%** (11/12)        |

- Avg prompt: **~234 input tokens**; avg answer: **~14 output tokens**; local 7B latency
  ~0.3–0.5 s/query.
- The single failure is instructive: _"What happens if the Bell rings twice?"_ — the fact is buried
  mid-way through the long Brine Hand faction sheet. Pure vector retrieval missed the chunk
  (BM25 found it); the grounded prompt then correctly said "not in the campaign notes" instead of
  hallucinating. **The union of both retrievers scores 100% hit@3.**

## Cost projection (managed engines, prices as of early 2026)

Per-query cost at the measured shape (~250 in / ~50 out tokens, generous):

| Engine                                                               | $/query               | Queries per $1 |
| -------------------------------------------------------------------- | --------------------- | -------------- |
| Gemini 2.5 Flash ($0.30/$2.50 per M)                                 | ~$0.0002              | ~5,000         |
| Gemini Flash-Lite ($0.10/$0.40 per M)                                | ~$0.00005             | ~22,000        |
| Whole-vault-in-context (100k-token campaign, Flash, no RAG)          | ~$0.03                | ~33            |
| Whole-vault-in-context + context caching (25% token price + storage) | ≥$0.0075 + storage/hr | ≤130           |

Embedding a large vault is a one-time ~cents-scale cost (10k chunks × ~200 tokens ≈ 2M embedding
tokens), and brute-force cosine over 10k×768 floats is milliseconds in a Lambda — the roadmap's
"no vector DB until revenue justifies it" stance holds with two orders of magnitude of headroom.

## Conclusions for the real Copilot

1. **The roadmap architecture is validated.** RAG + brute-force cosine + grounded prompting hits
   92% correct with a local 7B on 3-chunk context; cost per query is ~150× cheaper than
   whole-vault-in-context and ~40× cheaper than cached-context. Context caching does NOT change
   the verdict — RAG stays cheapest by a wide margin at realistic vault sizes.
2. **Use hybrid retrieval.** Take the union of BM25 and embedding top-k (both are trivially
   serverless); the measured failure mode (needle mid-way through a long sheet) is exactly what
   lexical retrieval catches.
3. **Sub-chunk long structured sheets.** Faction "secret" fields deserve their own chunks; one
   chunk per content item is the only thing between this prototype and 100% retrieval.
4. **Grounded prompting fails safe.** With retrieval missing, the model declined to answer rather
   than hallucinate — the behavior a DM-facing assistant must have.
5. Remains blocked on ADR-026 phase 2 (`approved: true` requires the security-review sign-off) —
   this measurement de-risks the build, it does not authorize server-side vault reads.
