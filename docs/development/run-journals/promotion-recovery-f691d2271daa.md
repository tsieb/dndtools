# promotion-recovery-f691d2271daa — `CI: lint` timed out once; not reproducible, no code change

## Failure

- Promotion gates for `f691d227` (fingerprint `483eaa69b014`) passed `CI: gates`,
  `CI: security:secrets` and `CI: format:check:changed`, then failed `CI: lint` with exit 124
  (`timed_out: true`). The attempt (`8862e91f`) started 14:25 and was killed at the 3600 s attempt
  timeout at 15:27. Its log ends right after `lint:raw-style-count` printed
  `Raw style values: 2575 across 260 files`, so `eslint .` was running when it was killed. No
  eslint diagnostic was printed, and the promotion worktree never got a
  `node_modules/.cache/eslint/` directory, so eslint did not finish even one cached pass.

## Diagnosis

- All 37 passing `pnpm lint` gate attempts on 2026-09-22, across task and promotion
  worktrees, finished in 12–76 s. The one-hour run is the only outlier.
- Re-ran the exact eslint command in the promotion worktree itself (`f691d227`, its own
  `node_modules`), with the cache sent to an outside directory so dispatcher state stayed
  unmodified and cleared before each run. Both runs exited 0 in 20.8 s and 20.7 s, using about 800 MB
  RSS. `git status` in that worktree stayed clean.
- Ran full `pnpm lint` on this branch (`52161311`, whose only change from `f691d227` is a markdown
  run journal that eslint does not lint) with a cold cache: exit 0 in 32 s. Raw-style count,
  eslint, `lint:boundary`, `lint:emphasis` and `a11y:contrast` all passed.
- The systemd journal has no OOM or tmpfs-quota event in the window. `a11y:contrast` and the other lint
  steps never started, so this was a stall inside the eslint process, not a lint failure. The same
  command is deterministic and fast at the same SHA on the same tree.

## Resolution

- None needed in the repo. Lint rules, the allow-lists and the gate command are unchanged.
  Re-running the promotion gates on `f691d227` or a later head should pass `CI: lint`. If it hangs
  again, capture evidence from the live eslint process (`ps`, `/proc/<pid>/stack`, or a
  `kill -USR1` inspector attach) before the attempt timeout kills it, because the post-mortem
  log has nothing past the raw-style count.
