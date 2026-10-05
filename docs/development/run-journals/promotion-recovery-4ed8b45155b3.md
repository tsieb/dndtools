# promotion-recovery-4ed8b45155b3 — visual gate timeouts came from host-wide stalls, not the change

## Failure

- Promotion gates for `4ed8b451` (fingerprint `a1dc3aef9694`) passed every `CI:` command, then
  failed `Visual regression (pinned container)` (attempt `86f8bcba`, container `jolly_maxwell`):
  8 failed, 481 passed in 21.4 min.
- Not one failure is a pixel diff. Every one is a timeout on a page that never finished loading:
  - `shell-polish` high-contrast and `wiki-reader` tavern (desktop): `page.goto` hit the 30 s test
    timeout. Both workers failed in the same second (01:34:40).
  - `char-builder` dungeon and high-contrast (rail): the route still showed the "Loading your
    vault…" fallback after 30 s. Both workers failed in the same second (01:35:33).
  - `play-polish` dungeon, `golden-routes` high-contrast `/`, `graph-polish` scholar and
    `wiki-reader` scholar: the 5 s `toHaveScreenshot` deadline ran out before the element was
    found or stable. These were at 01:32:45, 01:38:46, 01:40:22 and 01:42:09.
- `4ed8b451` adds two lines to `src/cloud/offline.gate.test.ts` (a unit-test allowlist) plus a run
  journal, and its parent `5bcd0e60` changes only `canvas/useLayoutHistory`. None of the failing
  routes renders differently because of either commit.

## Diagnosis

- A second promotion's full visual suite (attempt `b9699a7f`, container `modest_kapitsa`) ran at
  the same time: it started at 01:25:39, ours at 01:26:05. It failed the same way, with 3 timeouts
  and no pixel diffs. Two of its failures (01:35:31, 01:35:32) fell within two seconds of ours.
- At 02:43, when I started, the 15-minute load average was ~12 on 16 cores and swap was full
  (7 of 7 GiB). Other promotions' host e2e runs were active then too. I have no load sample from
  inside the failure window itself.
- Host heartbeat: mongod's `ftdc` thread logs an SELinux denial to the journal once a second. Its
  gaps between 01:20 and 01:50 were 01:34:09→01:34:14, 01:34:23→01:34:35 (12 s), 01:35:14→01:35:18,
  01:40:47→01:40:52 and 01:46:22→01:46:27. The host as a whole stopped running for those windows.
  Both 30 s `goto` timeouts (started ~01:34:10) span the 01:34 freeze. The paired 01:35:3x
  failures in both containers span 01:35:14. The other suite's 01:40:52 failure ends the
  01:40:47 gap.
- Network change is ruled out. The only NetworkManager event was a DHCP lease renewal at 01:28:43,
  which leaves interfaces unchanged. The container also runs with `--network=none` (`deec5c9d`),
  so host interface changes cannot reach its Chromium.

## Reproduction

- Re-ran the gate command on this branch (`2fc53970`, which contains `4ed8b451` plus the
  RC-CHR-6.2 series) in the pinned container:
  - Focused, the five failing spec files on all three projects: 66 passed, 0 failed, 1.7 min.
  - Full `apps/gm-react/tests/visual/run-in-container.sh` (02:45:53–02:58): **489 passed,
    0 failed, exit 0, 11.9 min.** The heartbeat had no gap over 2 s (725 beats). One other
    visual container overlapped from 02:54:18.
- The recorded failure does not reproduce on this code without the host stalls. The same
  heartbeat check gives the comparison: the failing run had a 12 s and four ~5 s freezes, and
  the passing run had none.

## Resolution

- No code, baseline, assertion, timeout, retry or workflow change. Making the deadlines longer
  would only hide whole-host freezes, so they stay as they are.
- Operator follow-up (outside this repo and this task's authority): stop scheduling two full
  visual suites at once while swap is exhausted. Each container peaked at 2.1–2.4 GB, and the two
  ran in lockstep for 21 minutes. A host-wide lock in `run-in-container.sh` would serialise them,
  but it would also lengthen every waiting gate past its budget, so the dispatcher's slot budget
  is the better place for it.
- Logs from this run: `/tmp/promo-4ed8b451-focused.log` and `/tmp/promo-4ed8b451-full.log`.
