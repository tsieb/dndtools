---
name: audit-deferrals-closed-2026-07-11
description: Re-audit on feat/full-e2e-readiness — all 6 honest deferrals from 2026-07-10 now DONE (core+UI+tests verified), plus I11 audio presets/scene cards
metadata:
  type: project
---

# Deferrals re-audit — 2026-07-11 (branch feat/full-e2e-readiness @ eb6be9b)

Supersedes the "6 honest deferrals" list in [[audit-release-readiness-2026-07-10]]. All six now GENUINELY functional (core command registered in dispatch switch + UI dispatches it + passing test). Verdicts + evidence:

1. **AI BYO-key transport (ADR-021 Accepted)** — DONE. `apps/gm-react/src/ai/transport.ts` real `fetch` to Anthropic `/v1/messages` (x-api-key + anthropic-dangerous-direct-browser-access) & OpenAI-compat `{baseUrl}/chat/completions` Bearer. Settings.tsx:65-66 imports, :1634 `runAssistantExchange({send: req=>sendAiChat(config,req)})`. Fail-closed when unconfigured (providerConfig.ts:170). Tests: gm-react src/ai/*.test.ts 40/40.
2. **Co-DM elevated role (ADR-022 Accepted)** — DONE. core `permission.assign-role` (dispatch.ts:440, commands/assign-role.ts), viewModels.ts ElevatedData built only for `co-dm && hasDmAuthority` (:162). Settings.tsx:883 dispatches permission.assign-role with coDmSeatLimit; seat gating :708. Test: packages/core tests/co-dm-role.test.ts 19/19.
3. **Campaign wiki hosting** — DONE. cloud-fns app-api/handler.ts GET/PUT/DELETE /wiki + GET /wikis/{id} public reader (:228-232,:195); appApi.ts publishWiki/unpublishWiki (:228-247). Community.tsx publish UI (:20), WikiReader.tsx + App.tsx:197 `/wiki` route. Test: app-api handler.test.ts 40/40 (wiki+email covered).
4. **Structured equipment/currency/encumbrance (I10 S10.1.3/S10.4.2)** — DONE. core character-inventory.ts, commands character.upsert-equipment-item/set-currency (dispatch.ts:572,578), computeEncumbrance derived-on-read. Player.tsx PlayerEquipment panel (:165 encumbrance, :303). Test: character-inventory.test.ts 19/19.
5. **SES-emailed invites (best-effort)** — DONE. handler.ts sendInviteEmail (:541) via SESv2 SendEmailCommand, status sent/not-configured/failed; appApi createInvite email param (:123). Settings.tsx email field :662, dispatched :719, toast :723. infra/app-api/template.yaml ses:SendEmail scoped to FromAddress condition (:152). Fail-safe: link+QR always work.
6. **Custom vault-object types** — DONE (comment at Extensions.tsx:76 is STALE — says "Core has no define-object-type command"; it does). core content.define/update/delete-object-type (dispatch.ts:612+), CustomObjectTypes component dispatches all three (Extensions.tsx:1127-1153). Tests: content-custom-object-type.test.ts (in audio+custom+perm batch 53/53).

Plus:
- **I11 Epic 11.3 audio presets/scene packages** — DONE. core audio.save/apply/delete-preset (dispatch.ts:678), Audio.tsx Presets tab (:203,:426 apply,:444 save). Test: audio-presets.test.ts (in 53/53 batch).
- **I11 Epic 11.2 scene cards** — DONE. core scene-card.create/update/delete/restore/activate/set-visibility/set-transition/enqueue/dequeue/advance (dispatch.ts:398-414), SceneCardsPanel.tsx dispatches all. Test: scene-card.test.ts 11/11.

**Integration green this session:** root `pnpm typecheck` exit 0 (core+gm-react). Broad screens/ sweep for coming-soon/not-supported/dead-end: only noise (input placeholders) + intentional design (SceneEditor:443 binding-backed content shown LOCKED by design; Characters.tsx:78 combat.start is convenience-dispatch that surfaces core rejection; Atlas.tsx:39 no raster engine per ADR-014). NO real remaining gaps.

Stale-comment ledger drift (code done, comment says no): Extensions.tsx:76.
