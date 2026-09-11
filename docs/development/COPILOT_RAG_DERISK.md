# Campaign Copilot: RAG measurement and managed contract

The cloud roadmap's first paid feature is a managed AI over the whole campaign. This records the
measurement that de-risked its architecture and the contract prepared for it. The build itself
stays gated on the Cloud-Enhanced phase-2 review ([ADR-026](../adr/026-opt-in-vault-privacy-modes.md),
[`../security/vault-privacy-modes-threat-model.md`](../security/vault-privacy-modes-threat-model.md)).

## 1. Measurement (2026-07-23, `scripts/rag-derisk.ts`)

```bash
pnpm exec tsx scripts/rag-derisk.ts          # needs local Ollama: qwen2.5:7b + nomic-embed-text
pnpm exec tsx scripts/rag-derisk.ts --no-llm # retrieval and cost only
```

Corpus: the seeded demo campaign run through a headless core, every text-bearing artifact one chunk
(14 chunks, ~630 tokens). Architecture under test: embeddings plus brute-force cosine, top-3
context, grounded-only prompting, a local 7B model as a conservative floor, with a BM25 baseline.
Twelve questions a DM asks mid-session, graded mechanically.

| Metric                             | BM25 | Embeddings (nomic-embed-text) |
| ---------------------------------- | :--: | :---------------------------: |
| Retrieval hit@1                    | 83%  |              92%              |
| Retrieval hit@3                    | 100% |              92%              |
| Grounded correct answers (7B, k=3) |  —   |          92% (11/12)          |

Average prompt ~234 input tokens, answer ~14 output tokens. The one failure was a fact buried in a
long faction sheet that BM25 found and cosine missed; the grounded prompt then said "not in the
notes" rather than hallucinating. The union of both retrievers scores 100% hit@3. Projected cost on
a Flash-class managed model is ~$0.0002 per query, roughly 150× cheaper than whole-vault context and
40× cheaper than cached context; embedding a 10k-chunk vault is a one-time cents-scale cost and
brute-force cosine over it is milliseconds in a Lambda, so no vector database is needed.

Conclusions: the architecture is validated; use hybrid retrieval; chunk structured sheets by field;
grounded prompting fails safe.

## 2. What shipped locally (RC-AI-3.2)

`packages/core/src/queries/search-hybrid.ts` fuses a TF-IDF retriever and a cosine retriever by
weighted reciprocal rank over the actor-visible search corpus; vectors come from the shell
(`apps/gm-react/src/ai/embeddings.ts`, Ollama `POST /api/embeddings`) and are cached per note
revision. Structured sheets contribute their fields (`secret`, `goals`, `leader`), which alone moved
hit@3 on the demo vault from 9/12 to 11/12. `apps/gm-react/src/ai/semanticSearch.test.ts` replays
the twelve questions offline with a hashed-bag-of-words stand-in and scores 11/11 over the
searchable domains; the twelfth answer is a character sheet, which is not a search domain.

## 3. Managed contract (RC-AI-4.1, gated)

`packages/cloud-fns/src/copilot/contract.ts` defines wire version 1: a question carries only
`vaultId`, `revision`, and bounded text, never actor identity, privacy mode, commands, or content;
an answer carries the revision and at most three chunk citations, and an answered response requires
citations. `apps/gm-react/src/cloud/copilot.ts` reuses the core record selector and plaintext gate
before invoking any transport, validates responses, forwards cancellation, and discards answers
after a mode revocation; it presents the Private-vault, pending-review, and missing-transport states.
`packages/cloud-fns/src/copilot/indexer.ts` specifies the server adapter ports: DM membership and
Cloud-Enhanced registration re-checked before every embedding batch and before an atomic,
revision-conditional replacement; empty snapshots remove old content; revocation stops work and
never resurrects a removed index. Every adapter must enforce current access at its own I/O boundary.

Deployment boundary: no adapter, server-readable store, model provider, or route ships. The
existing app-api handler and its table and bucket hold published content only and must not gain
private vault access. Keep the serverless model (request-driven Lambda, on-demand storage,
brute-force cosine plus lexical retrieval); no provisioned concurrency, no continuously running
indexer, no vector database. Nothing here can bypass the core release gate.
