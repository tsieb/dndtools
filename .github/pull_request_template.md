## Tier

- [ ] Epic PR targeting `initiative/*`
- [ ] Initiative PR targeting `master`

## Reference

Epic / Initiative:
Story / Scope:

---

## Summary

<!-- 2-4 sentences: what changed and why -->

---

## Epic PR Checklist

- [ ] `pnpm test:smoke` passes
- [ ] Story or epic acceptance criteria are met
- [ ] New behavior has regression coverage at the correct layer
- [ ] Only initiative-scope files are included

## Initiative PR Checklist

- [ ] `pnpm audit:full` passes or the equivalent CI jobs are green
- [ ] `quality` CI status is green
- [ ] Performance baselines are unchanged or intentionally updated
- [ ] Docs are updated for workflow, contract, or architecture changes
- [ ] No known regressions remain

## Documentation Updated

- [ ] Relevant docs updated
- [ ] Any `TODO(APP)` annotations include required metadata
- [ ] Any long-lived deferments are linked in `DEBT.md`

## Follow-up

<!-- List deferred work or write "None" -->
