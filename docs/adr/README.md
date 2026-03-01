# Architecture Decision Records

This directory tracks major architecture decisions for DND Tools.

- Use [000-template.md](./000-template.md) for new ADRs.
- Record decisions that materially affect runtime boundaries, storage, security, or platform strategy.
- Update ADRs in the same change set when decision context or implementation changes.

## ADR Index

| ADR     | Status   | Summary                                                                                                                                              | File                                                                                                     |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| ADR-001 | Accepted | Filesystem ownership stays in trusted runtimes (Electron main and MCP sidecar), never renderer.                                                      | [001-electron-filesystem-ownership.md](./001-electron-filesystem-ownership.md)                           |
| ADR-002 | Accepted | MCP writes are staged by default with policy-controlled approval behavior.                                                                           | [002-staged-mcp-write-model.md](./002-staged-mcp-write-model.md)                                         |
| ADR-003 | Accepted | IPC uses explicit named channels with runtime schema validation and typed bridge methods.                                                            | [003-ipc-surface-strategy.md](./003-ipc-surface-strategy.md)                                             |
| ADR-004 | Accepted | Renderer persistence goes through a single `StorageAdapter` contract boundary.                                                                       | [004-storage-adapter-boundary.md](./004-storage-adapter-boundary.md)                                     |
| ADR-005 | Accepted | Markdown rendering uses one unified, sanitized pipeline shared across UI surfaces.                                                                   | [005-unified-markdown-pipeline.md](./005-unified-markdown-pipeline.md)                                   |
| ADR-006 | Accepted | Multi-platform strategy is Electron for desktop plus Capacitor for Android using shared renderer/domain layers.                                      | [006-multi-platform-approach-electron-capacitor.md](./006-multi-platform-approach-electron-capacitor.md) |
| ADR-007 | Accepted | Planned cloud backend architecture is AWS Cognito + S3 + API Gateway, while local-only remains default until rollout.                                | [007-cloud-backend-architecture-aws.md](./007-cloud-backend-architecture-aws.md)                         |
| ADR-008 | Accepted | MCP strategy favors semantic bundle tools backed by deterministic vault intelligence, with staged-write safety and contract-driven extension points. | [008-mcp-semantic-bundling-strategy.md](./008-mcp-semantic-bundling-strategy.md)                         |
