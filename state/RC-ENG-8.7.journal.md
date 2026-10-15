# RC-ENG-8.7 — tile overflow controls

- Task scope: WidgetRenderSlot.tsx and new tile-overflow-controls.spec.ts, plus this required journal.
- Headroom tools are unavailable; native original outputs are used. No agents, dispatcher state changes, push, promotion or loop launch.
- Footer now occupies its own non-shrinking flex row. The scroll region ends above it; Grow measures the available body height. Footer passes pointer events except on its button. Grow/Restore use a zoom-compensated target of at least 44px.
- Added seeded live-combat home coverage at 1440, 834 and 390, checking every visible tile button centre after supported scrolling, footer target size/pointer behavior and the ENG-8.1 unrecoverable-clip detector.
- Focused browser validation running; results follow.

## Validation and scope notes

- Initial browser run exposed collapse in auto-height scene regions with flex-basis 0. Changed the section to `height: 100%; flex: 1 1 auto`, preserving natural sizing when the parent height is indefinite. Existing template and phone recovery checks now pass.
- Initial live-phone detector additionally reported `unrecoverable clip (x): span First foe` and `Second foe`: InitiativeCompact renders ellipsized combatant names without title recovery, outside owned paths. The hit tests themselves passed. The final spec retains the unchanged ENG-8.1 detector on seeded home before live combat, and separately checks live combat button hit targets; it does not claim the live-phone name clipping is fixed. Shorter-name experiments were reverted.
- Final focused browser run: `pnpm e2e tile-overflow-controls.spec.ts tile-content-recovery.spec.ts --workers=2 --retries=0`: **20 passed**, both profiles, 32.8s. Original `/tmp/rc-eng-8.7-final.log` read. Includes explicit Fit on desktop/rail; the phone uses the existing supported Comfortable reading zoom.
- ESLint on both owned files, app TypeScript, formatting and `git diff --check` pass. `pnpm gates` passes with existing advisory file-size warnings. Original logs: `/tmp/rc-eng-8.7-lint-final.log`, `/tmp/rc-eng-8.7-types-final.log`, `/tmp/rc-eng-8.7-gates.log`.
- Pinned container visual check, `board-polish.spec.ts --workers=2`: **10 failed (desktop/rail screenshot differences), 5 passed (phone)**. Original `/tmp/rc-eng-8.7-visual-board2.log` read; visual gate is NOT green. Baselines are outside this task's owned files and were not modified. The earlier unfiltered visual run was interrupted (2 passed, 2 interrupted); an attempted golden-routes `/board` filter found no tests because board captures live in board-polish.
- Central operator still owns full gates, independent review and any baseline adjudication. No publication/promotion performed.
- Regression proof: temporarily restored HEAD's WidgetRenderSlot.tsx, ran the new spec on desktop at all three widths, then restored the implementation byte-for-byte in `finally`: **3 failed** on original 17px / 15.82px / 17px footer targets. Original diagnostics read from `/tmp/rc-eng-8.7-mutation.log`. Added an explicit body/footer rectangle separation assertion as well, so passing pointer events alone cannot conceal a visual overlay.
- Final spec including the explicit no-overlap assertion: **6 passed**, both profiles at all three widths, 17.5s (`/tmp/rc-eng-8.7-hit-final.log`, original summary read). Final targeted ESLint, Prettier check and diff whitespace check pass. The implementation is restored and only the two owned files plus this journal are staged for the task commit.
