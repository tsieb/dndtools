# Managed Copilot deployment boundary

RC-AI-4.1 prepares a client and indexer contract, not a deployed service. The Cloud-Enhanced
record remains unapproved. Do not enable server-readable vault access or change the current
app-api table/bucket policy: those resources contain published content, never private vault data.

A future phase-2 implementation must follow ADR-026 and the contract in
`docs/development/COPILOT_RAG_DERISK.md`. It needs authenticated server membership and consent
registration adapters, actor-scoped reads, revision-conditional index replacement, and deletion /
revocation enforcement before any route becomes available. The existing app-api handler and Lambda
build entrypoints are outside RC-AI-4.1 ownership and require a handoff before route integration.

Indexer authorization is refreshed before each model batch and final replacement. Its embedding
port carries the account/vault/actor scope; model adapters must check current access before sending
text. Storage adapters must enforce current membership and consent at the read boundary and
atomically with revision-conditional replacement. They must reject work that races revocation and
must not recreate a revoked index. These are adapter obligations, not implemented storage guarantees;
orchestration rechecks alone cannot close a race inside an adapter or delete an existing index.

Keep the accepted serverless deployment model: request-driven Lambda, on-demand storage, and
brute-force cosine plus lexical retrieval. Do not add provisioned concurrency, a continuously
running indexer, or a vector database. No infrastructure resources are added by this contract work;
there is no deployment or approval switch here that can bypass the core release gate.
