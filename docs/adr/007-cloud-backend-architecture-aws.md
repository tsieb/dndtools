# ADR-007: Cloud Backend Architecture (AWS Cognito + S3 + API Gateway)

- Status: Accepted
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Product, Security
- Supersedes: N/A

## Context

Current product behavior is local-only with no user accounts or cloud storage. Future roadmap milestones include opt-in cloud sync and remote collaboration. A backend strategy is needed now to guide interface design, threat modeling updates, and migration sequencing while preserving local-first defaults.

Current implementation status:

- No cloud backend is deployed in the current product baseline.
- Local-only storage and workflows are the only shipped mode.

## Decision

Adopt AWS Cognito + S3 + API Gateway as the target cloud architecture:

- Cognito for authentication and identity management.
- S3 for vault object storage and versioned sync artifacts.
- API Gateway-backed service layer for sync/session APIs.
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

- `docs/MASTER_PLAN.md`
- `docs/SECURITY.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
