The wrapper re-ran the gates on your COMMITTED tree and they FAILED, so nothing has been integrated
yet. The failing output is at the end of this message. Your journal is at {{JOURNAL}}.

Fix the failure in this worktree, re-run the failing gate (and `pnpm typecheck` + `pnpm lint` if you
touched code) in the foreground on the final tree, run `pnpm format:fix:changed`, and COMMIT the fix
as a new commit (`fix(<scope>): {{ITEM_ID}} …`). Do not amend or rewrite existing commits. Do not
push. If the failure is genuinely pre-existing on `origin/{{BRANCH}}` and unrelated to your change,
prove it (read the test, compare with `git log`) and say so in the journal — but the tree you leave
must still pass.
