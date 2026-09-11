# ADR-007: Cloud Backend Architecture (AWS Cognito + S3 + API Gateway)

- Status: Accepted
- Date: 2026-03-01 (implemented 2026-07; evidence updated 2026-09-11)
- Deciders: Engineering
- Consulted: Product, Security
- Supersedes: N/A

## Context

Current product behavior is local-only with no user accounts or cloud storage. Future roadmap milestones include opt-in cloud sync and remote collaboration. A backend strategy is needed now to guide interface design, threat modeling updates, and migration sequencing while preserving local-first defaults.

Implementation status: the backend exists as the SAM stacks in `infra/` (identity, turn, app-api, signaling, sync-api, web-hosting) and is deployed to dev and prod. Local-only remains the default and every cloud capability is opt-in.

## Decision

Adopt AWS Cognito + S3 + API Gateway as the target cloud architecture:

- Cognito for authentication and identity management.
- S3 and DynamoDB for versioned, encrypted sync artifacts and account data.
- API Gateway (HTTP and WebSocket) plus Lambda for sync, signaling, and the app-api.
- Local-first remains the default; cloud features are opt-in and additive.

## Consequences

### Positive

- Clear managed-service path for identity, storage durability, and API scaling.
- Strong alignment with planned sync/collaboration roadmap.
- Reduced operational burden compared to fully self-hosted identity + storage stack.

### Negative

- Increased infrastructure complexity versus local-only mode.
- Vendor coupling to AWS service ecosystem.
- Expanded security surface requiring strict token/storage/transport controls.

## Rejected Alternatives

| Alternative         | Why Rejected                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase            | Fast developer experience, but less aligned with planned object-storage and identity strategy at target scale profile.                |
| Firebase            | Strong realtime features, but tighter coupling to product-specific data models and less direct fit for planned vault object strategy. |
| Self-hosted backend | Maximum control, but significantly higher operational and security burden for this stage.                                             |

## Migration Impact

- Cloud rollout must preserve local-only usability and safe failure modes when network services are unavailable.
- Security and privacy docs must expand to cover token handling, remote sync threats, and server-side abuse controls.
- Data model and sync APIs need explicit versioning to avoid lockstep client/server upgrades.

## Rollback Plan

- Trigger: unacceptable reliability/security outcomes during cloud rollout.
- Rollback action: disable cloud entry points and continue local-only mode while remediating backend issues.
- Data safety: keep local vault as source of truth; avoid destructive cloud-first migration steps.
- Risk: temporary loss of sync/collaboration functionality for connected users.

## Verification and Evidence

- `infra/README.md` (stacks, accounts, deploy order)
- `packages/cloud-fns/src/` (the Lambda handlers)
- `docs/security/README.md`
- ADR-015, ADR-017, ADR-020, ADR-026 (the security model and the app-api built on this decision)
