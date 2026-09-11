# Memory Index

Reset on 2026-09-11: the July 2026 deploy-state notes predate the prod account, ADR-033, and the
first production promotion (v0.3.7, 2026-09-09), so they were retired. `infra/README.md` carries the
current account, profile, deploy-order, and cost facts. Record only what a live audit revealed that
the README does not say, one line per memory.

- Drift signal without AWS credentials: `gh run list --workflow=deploy.yml` and
  `gh run view <id> --json jobs` name which stacks deployed; read those before any `aws` call.
