The wrapper tried to rebase your commits onto `origin/{{BRANCH}}` and hit a conflict; the rebase is
in progress in this worktree (`git status` shows it). Resolve the conflicts in favour of a tree that
keeps BOTH your story's change and what landed upstream, `git add` the files, then `git rebase
--continue` (this is the one time you may). Then re-run the gates that matter for the merged result
(`pnpm typecheck`, `pnpm lint`, the affected tests) in the foreground and leave the tree clean. Do
not push. Story: {{ITEM_ID}}. Journal: {{JOURNAL}}. The rebase output follows.
