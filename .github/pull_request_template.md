## Story Reference

Epic: <!-- e.g., Epic 2.1 -->
Story: <!-- e.g., S2.1.1 — Core CI workflow -->

---

## Summary

<!-- 2–4 sentences: what changed and why -->

---

## Validation Checklist

- [ ] `pnpm check` passes (lint + typecheck + unit tests)
- [ ] `pnpm format:check` passes
- [ ] `pnpm test:e2e` passes (if `src/`, `electron/`, or `mcp/` changed)
- [ ] `pnpm desktop:build` succeeds (if `electron/` or `mcp/` changed)
- [ ] No new `any` types introduced
- [ ] No runtime boundary violations (no Node APIs in renderer, no Svelte imports in MCP)

---

## Documentation Updated

- [ ] Docs updated for any changed contracts, types, or user-visible behavior
- [ ] Any `TODO(APP)` annotations include reason and target files

---

## Known Gaps / Follow-up

<!-- List any deferred items with reason, or write "None" -->
