---
name: audit-release-readiness-2026-07-10
description: Full release-readiness audit of gm-react after completion-pass merge (95c9ff5) — verdicts + ledger-drift findings
metadata:
  type: project
---

# Release-readiness audit — 2026-07-10 (main @ 95c9ff5, post completion-pass)

Scope: whole app. User bar = zero missing features EXCEPT (a) signed desktop builds, (b) payment processing.

**Verified green this session:** `pnpm typecheck` (core+gm-react, exit 0) · `pnpm build` ✓ · SYNC-017/SEC-009 gate tests 34/34 (`packages/core`, `npx vitest run tests/sync-cloud-sync-gate + security-cloud-security-model + security-vault-crypto`). No TODO/FIXME/unimplemented/dead-onClick in product code. mockCampaign = 0 imports. All 18 screens core-wired.

**§0★★★ completion claims VERIFIED real (dispatch grep):** map.generate-layers (MapBuilder MAP-004), map.append-fog rect/polygon/stroke, character.update-attacks, character.set-sharing, widget.package.switch-system (previewSystemSwitch dry-run, Extensions), map.commit-import (core dispatch.ts:420), D&D Beyond import (app/charImport/ddbJson.ts), community marketplace (cloud/appApi.ts + infra/app-api), AI tab → mcp.* slice (Settings.tsx:1376+), Upgrade → entitlements simulated.

**Honest deferrals labeled in-UI, OUTSIDE user's OOS (user must decide):**
1. AI provider transport — MCP policy/binding layer complete but NO provider can connect; deferred by ADR-014. I5 marked COMPLETED (=policy layer). Biggest "does-nothing-end-to-end".
2. Co-DM/Trusted role — no core role above `player` (PlayerView shown-locked); yet advertised in pricing entitlements.ts ("co-DM seats"). I7 DEFERRED.
3. Community wiki hosting — publish=local preview, no backend (Community.tsx:33). I12 DEFERRED. (Marketplace publish/install IS real.)
4. Custom vault-object types — no core define-object-type cmd; registry read-only (Extensions.tsx:1041 "not supported yet").
5. SES-emailed invites — links+QR work, email deferred.
6. Structured equipment/currency/encumbrance — labeled honest gap Player.tsx:58 (I10 S10.1.3/S10.4.2).

OUT OF SCOPE (allowed): payment processor (Upgrade UI intact, simulated) · signed desktop builds.

## Ledger drift found
- **Initiative status lines STALE** (dir: doc under-claims, code done). I8/I10/I11 "NOT STARTED", I7/I12 "DEFERRED" while app ships large portions. Frozen pre-React-completion. Real current ledger = FEATURE-GAPS §0★★★.
- **feature-audit tooling drift**: `scripts/validate/feature-audit.ts` extracts the STALE §0★★ (2026-07-04) "honest stubs remaining" list, not §0★★★ (2026-07-10). Reports 9 "known remaining stubs" that are actually CLOSED+verified. Extractor matches wrong heading.
- FEATURE-GAPS.md top "Audited: 2026-06-20" misleading (that's the historical §1–§9 date; §0★★★ is current).
