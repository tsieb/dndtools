# Threat Model — Vault Privacy Modes (ADR-026)

Status: current for phase 1 (consent + gates only; both modes ride the E2EE transport). Phase 2
— the server-readable Cloud-Enhanced platform — is **unbuilt**, not pending: it is deferred to
roadmap epic CLD-6, past RC-1. The phase-2 checklist below is that epic's exit criterion, and
RC-CLD-6.5 is the only story that may flip the Cloud-Enhanced decision record to `approved: true`.

## Assets

| Asset                                                                     | Sensitivity                                                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Vault content (notes, secrets, hidden titles, handouts, maps, characters) | High — the DM's whole campaign, including player-hidden material        |
| Vault keyring (per-epoch AES-256 keys)                                    | Critical — decrypts every cloud artifact for the vault                  |
| Recovery-key file (passphrase-sealed keyring)                             | Critical — equivalent to the keyring once the passphrase is known       |
| Privacy-mode choice + consent record                                      | Medium — integrity matters (a flipped bit must not widen trust)         |
| Allowed server metadata (6 classes)                                       | Low — vault id, participant id, revision, size, content hash, timestamp |

## Trust boundaries by mode

### Private (E2EE) — `private-e2ee`

Unchanged from ADR-015/017. The server (sync-api Lambda, DynamoDB, S3, any AWS operator) sees
ciphertext plus the six allowed metadata classes, enforced by `assertServerSeesOnlyAllowedMetadata`
(SEC-009 AC4) client-side before upload and proven by the core test suites. Key custody is
client-held (OS credential store); compromise of the entire cloud store exposes only ciphertext +
documented metadata (SEC-012 AC3).

**New in ADR-026:** the recovery-key file. Threats and mitigations:

- **T1 — Recovery file theft.** The file alone is useless: the keyring is sealed with AES-256-GCM
  under a key derived from the user's passphrase (PBKDF2-SHA-256, 600,000 iterations, 16-byte random
  salt, fresh IV). Residual risk: a weak passphrase is brute-forceable offline — the UI enforces a
  minimum length and states the risk plainly.
- **T2 — Malicious/corrupted recovery file import.** The plaintext must parse into a
  schema-validated `VaultKeyring` (same strict decode path the OS-store read uses); GCM
  authentication rejects tampering; import never creates custody on a device without an OS
  credential store (fail closed).
- **T3 — Stale-file rollback.** Import merges epochs with existing-local-wins and the current epoch
  advancing to the newer of the two, so an old file cannot silently downgrade an active keyring or
  resurrect a rotated-away epoch key it does not contain.
- **T4 — Export as an exfiltration path.** Export requires the signed-in account, runs only on a
  device that already holds custody, and produces a file the user explicitly saves. It does not
  weaken SEC-004: nothing is logged, synced, or persisted outside the user-chosen file.

### Cloud-Enhanced — `cloud-enhanced` (phase 2 unbuilt, deferred to epic CLD-6; gate closed)

The consented boundary: **server-side feature code may read vault content.** Encryption in transit
(TLS) and at rest (SSE-KMS, provider-held keys) protects against storage-media and network
adversaries, **not** against the service operator or a compromise of the service's runtime role —
that residual exposure is precisely what the user consents to, and the consent copy must say so.

Phase-2 obligations (review checklist — all must hold before `approved: true`).

**Status 2026-09-16: phase 2 is deferred, and this checklist is the exit criterion of roadmap epic
CLD-6, signed in RC-CLD-6.5.** Six of the seven items below describe a system that does not exist in
the tree; the seventh has its configuration in place and its deployed-stage evidence outstanding. No
item can close before the platform it describes is built, so every box is open and stays open until
that epic runs. The RC-1 story that remains (RC-CLD-2.2) does not touch this list: it keeps the
decision record unapproved, proves the gate cannot be bypassed, and keeps the product copy honest
about a capability that is not in this edition.

Each item names the CLD-6 story that closes it, the evidence already in the tree, and what is open.
Line numbers were re-resolved on 2026-09-18, by opening each cited line, against the commit named
in the gate-closure check block below. A citation into a file that a later change touches has to be
re-read, not carried forward.

- [ ] Dedicated KMS key **configuration** per stage with key policy scoped to the sync-api role;
      CloudTrail configured for decrypt; no wildcard principals. _Closes in:_ RC-CLD-6.5 (deployed
      evidence); the configuration itself is RC-CLD-6.2's key.
      _Evidence (configuration only):_ `CloudEnhancedContentKey`
      (`infra/sync-api/template.yaml:170-219`) is unconditional for `dev` and `prod`, rotates
      (`:177`), and is retained on deletion and replacement (`:173-174`). The stage alias and SSM
      discovery path are at `:221-232`. `AccountAdmin` (`:181-210`) delegates only named management
      operations, never cryptographic use or `CreateGrant`. `AllowSyncFnDecrypt` (`:212-219`) gives
      `Decrypt`, `GenerateDataKey` and `DescribeKey` to this stack's `SyncFnRole` alone.
      Administrators can still change the policy and remain inside the consented operator trust
      boundary. `AuditTrail` (`infra/foundation/template.yaml:527-539`) records all management
      reads and writes with no KMS exclusion. `tests/unit/cloud-enhanced-kms.test.ts:43`, `:60`,
      `:73`, `:113` and `:121` guard these properties.
      _Open — and this is why the box is empty despite complete configuration:_ **no deployed-stage
      evidence exists.** No stage apply, deployed-policy read, access probe or delivered CloudTrail
      `Decrypt` event has been verified. Read-only `aws kms get-key-policy --profile dndtools`
      attempts on 2026-09-11 and 2026-09-16 failed on an expired SSO session, which needs an
      interactive browser login. A green unit test here proves the template, not the stage.
      RC-CLD-6.5 gathers that evidence for each stage that serves the path.
- [ ] Plaintext path accepts uploads **only** for vaults whose server-side mode registration says
      `cloud-enhanced`; an E2EE vault's envelope is never readable regardless of a client bug.
      _Closes in:_ RC-CLD-6.1 (the server-side mode authority) and RC-CLD-6.2 (the route).
      _Evidence:_ `isPlaintextUploadPermitted` and `assertPlaintextUploadPermitted`
      (`packages/core/src/security/cloud-security-model.ts:438-462`) refuse absent and private
      registrations, unapproved records, E2EE-shaped records and — since 2026-09-16 — records that
      were never sanctioned (`:444`), so a route cannot hand itself an `approved: true` look-alike
      (`packages/core/tests/security-cloud-security-model.test.ts:157-191`). They still take the
      registered mode from the caller. RC-AI-4.1's indexer asks a server `authorize` port for it
      (`packages/cloud-fns/src/copilot/indexer.ts:11-14`, `:43`); no adapter implements that port.
      _Open:_ the server side. `packages/cloud-fns/src/sync/handler.ts:374-402` routes ciphertext
      operations and snapshots only. No plaintext route or registration store exists, and the only
      mode writer is the client's localStorage setter (`apps/gm-react/src/cloud/vaultMode.ts:29`).
      A route must load the authenticated owner's registration, reject failed or missing reads and
      client-supplied mode overrides, and enforce the gate before storing content. Race tests must
      show a concurrent mode change cannot authorize a stale plaintext write.
- [ ] Tenant isolation identical to the E2EE path (Cognito sub scoping on every row/object key).
      _Closes in:_ RC-CLD-6.1 and RC-CLD-6.2 (every new row, object and key prefix), then RC-CLD-6.4
      per feature.
      _Evidence (E2EE path only):_ the sync handler keys rows as `${sub}#${vaultId}` and objects
      as `${sub}/${vaultId}` from the authenticated Cognito sub
      (`packages/cloud-fns/src/sync/handler.ts:372-373`).
      `packages/cloud-fns/src/sync/handler.test.ts:1156` shows a different user sees nothing.
      _Open:_ no plaintext registration, content store or index exists to isolate. Reads, writes,
      indexes and deletion each need their own cross-tenant tests once implemented.
- [ ] Server-side feature code (RAG indexer, search) runs with read-only scoped access and never
      writes derived plaintext into a broader-scoped store. _Closes in:_ RC-CLD-6.4.
      _Evidence (contract only):_ the RC-AI-4.1 indexer rechecks the shipped record, the DM role and
      the server registration before the snapshot read, before each 32-chunk embedding batch and
      before replacement (`packages/cloud-fns/src/copilot/indexer.ts:39-46`, `:56-85`).
      `packages/cloud-fns/src/copilot/indexer.test.ts:37` shows zero I/O under the shipped record;
      `:149`, `:160`, `:171`, `:183`, `:196` and `:220` cover revocation, authorization failure,
      release-gate closure, scope binding and a rejected atomic write.
      _Open:_ read-only scoping and the ban on broader-scoped stores are properties of adapters, IAM
      roles and storage, none of which exist. Public marketplace/wiki publication is a separate
      consent boundary and does not satisfy this item.
- [ ] Mode switch = re-upload migration; the old-mode artifacts are deleted after the new-mode copy
      verifies. Cloud-Enhanced → Private switch copy states that previously-server-readable content
      was readable while the mode was active. _Closes in:_ RC-CLD-6.3.
      _Evidence:_ `apps/gm-react/src/screens/settings/SyncPrivacy.tsx:38` calls the localStorage
      setter (`apps/gm-react/src/cloud/vaultMode.ts:29`) and nothing else. Since RC-CLD-2.2 the
      switch copy no longer claims a re-upload or prior server reads, because neither exists in this
      edition; RC-CLD-6.3 writes the disclosure this item asks for once the migration is real.
      _Open:_ server mode transition, verified re-upload, write fencing and old-mode cleanup. A
      failed or interrupted migration must preserve the prior usable copy without claiming the
      privacy switch completed.
- [ ] Deletion (account or vault) purges plaintext artifacts and derived indexes/embeddings.
      _Closes in:_ RC-CLD-6.3 (the purge protocol) and RC-CLD-6.4 (each derived store).
      _Evidence (ciphertext only):_ vault deletion purges object versions and sync rows behind a
      purge marker (`deleteVault`, `packages/cloud-fns/src/sync/handler.ts:1056-1140`, marker written
      at `:1102-1119`), and account deletion checks that marker (`cloudBackupPurgeVerified`,
      `packages/cloud-fns/src/app-api/handler.ts:1638`, checked at `:1683`). The indexer contract clears deleted content
      on an empty snapshot (`packages/cloud-fns/src/copilot/indexer.test.ts:70`); that is per-content
      removal, not purge.
      _Open:_ neither purge covers a Cloud-Enhanced content store or derived index. Wire every new
      store into the purge protocol and prove partial failures cannot produce a completed marker.
- [ ] The `assertServerVisibilityForRecord` relaxation is **identity-gated**: it opens only for a
      record instance this codebase sanctioned, only once that record is approved, and the set of
      files permitted to sanction one is pinned by an audit scan. _Closes in:_ RC-CLD-6.2 (the first
      real call site) and RC-CLD-6.5 (sign-off).

      > **Open because of the 2026-09-16 deferral, not a defect.** The phase-1 half of this item is
      > enforced and tested (below), and RC-CLD-2.2 made it the RC-1 acceptance test. It cannot close
      > here because it must finally be judged against a server route holding a server-loaded
      > registration, which does not exist, and the barrel export described below is a decision for
      > the story that builds that route. It was checked `[x]` from 2026-09-16 until the deferral
      > reopened every box.

      > **Restated 2026-09-16.** This item previously read "reachable only via
      > `securityDecisionRecordForVaultMode('cloud-enhanced')` and only once the record is approved",
      > and was checked off against the weaker property above. That was an overstatement and the
      > `[x]` was not honest against the original wording — see "Why this item was restated" below,
      > which records the gap, why the stronger property was not achievable in phase 1, and what a
      > reviewer must re-examine when the plaintext route lands.

      _Evidence:_ the selector is at
      `packages/core/src/security/cloud-security-decision.ts:121-127` and the Cloud-Enhanced record
      ships `approved: false` (`:107`).
      `packages/core/tests/security-vault-privacy-modes.test.ts:86`, `:91` and `:110` show that
      `not-approved` is the record's only problem, that its release gate is blocked, and that server
      visibility fails closed. `assertServerVisibilityForRecord`
      (`packages/core/src/security/cloud-security-model.ts:386`) has no call site outside core's
      exports and tests. Both plaintext-gate call sites use the shipped record:
      `apps/gm-react/src/cloud/copilot.ts:36` through the selector, and
      `packages/cloud-fns/src/copilot/indexer.ts:31-37` by importing the record directly.

      Until 2026-09-16 this item held **by inspection only**, and that was a real hole: the helpers
      accepted any caller-built record, so
      `{ ...DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD, approved: true }` passed
      `validateCloudSecurityRecord` and opened the relaxation while the shipped record still said
      `approved: false`. The phase-1 posture was therefore enforced by convention at the call sites,
      not by the gate. Closed by making record identity load-bearing: `sanctionSecurityDecisionRecord`
      and `isSanctionedSecurityDecisionRecord`
      (`packages/core/src/security/cloud-security-model.ts:355`, `:367`) hold a `WeakSet` (`:322`) of
      the records this codebase has sanctioned, and both trust-widening paths now require membership —
      the relaxation branch at `:396` and the plaintext gate at `:444`. The two shipped records are
      minted through that chokepoint (`packages/core/src/security/cloud-security-decision.ts:70`,
      `:105`). Sanctioning approves nothing: the Cloud-Enhanced record is sanctioned *and* still
      `approved: false`, so every gate stays closed and this change is a pure tightening.

      Tests (all mutation-checked; scan roots widened and re-checked on 2026-09-16):
      `packages/core/tests/security-vault-privacy-modes.test.ts:133` — a forged approved look-alike is
      refused by the relaxation; `:142` — both selector records are sanctioned and a clone is not;
      `:158-225` — the RC-CLD-2.2 block (see the gate-closure section below); `:346` — a source
      scan asserts that only the declaring module, the barrel and
      `cloud-security-decision.ts` mention `sanctionSecurityDecisionRecord` in product source;
      `:350` — a companion scan pins the four **test** files that mint sanctioned records to an
      enumerated list, so the product-source scan's `*.test.ts` exclusion is no longer an unbounded
      blind spot; and `packages/core/tests/security-cloud-security-model.test.ts:176` — the same
      forgery refused by `isPlaintextUploadPermitted` / `assertPlaintextUploadPermitted`.

      Mutation results (2026-09-16): removing either sanctioned-record check fails the two forgery
      tests; a `sanctionSecurityDecisionRecord` mention added at `scripts/__sanction_probe.ts` fails
      the product-source scan (it did **not** fail before the roots were widened — `scripts/` was
      unscanned); and one added at `tools/__sanction_probe.test.ts` fails the test-file scan. Both
      probes were deleted after the check. The pre-existing Copilot tests that simulate the
      post-review posture (`packages/cloud-fns/src/copilot/indexer.test.ts:13`,
      `apps/gm-react/src/cloud/copilot.test.ts:13`) had to be changed to sanction their simulated
      records — before this change both were minting exactly the forged record shape described above.

      **Why this item was restated, and what is NOT enforced.**
      `sanctionSecurityDecisionRecord` is exported from the package barrel
      (`packages/core/src/index.ts:3202`), so **any** caller that can import `@dndtools/core` can mint
      a record the relaxation accepts — including a future cloud-fns route, in one line. The original
      wording ("reachable only via `securityDecisionRecordForVaultMode`") therefore does not hold, and
      claiming it by construction would have been false. The barrel export is not incidental: the
      Copilot unit tests in `packages/cloud-fns` and `apps/gm-react` must simulate the post-review
      posture, and the shipped record is frozen at `approved: false`, so phase 1 has no way to
      exercise an approved record without a mintable one. Making the relaxation accept *only* the two
      selector instances would make the post-review posture untestable until the record actually
      flips.
      What is enforced by construction is narrower and worth stating exactly: widening trust now
      requires an **explicit, named, greppable call**, never an anonymous object spread, and the files
      allowed to make that call are pinned by the `:346`/`:350` scans. That is containment plus a
      review tripwire, not a type-level impossibility. Its limits, for the reviewer who inherits this:
      the scans are substring matches on the identifier, so an alias re-export could evade them; they
      cover in-repo TypeScript only (`apps`, `config`, `infra`, `packages`, `scripts`, `tests`,
      `tools` — widened from `packages`/`apps` on 2026-09-16), so an **external** consumer of
      `@dndtools/core` is outside their reach entirely; and they are a test, so they bind only code
      that runs in CI. Re-verify every call site against the server-loaded mode when a plaintext route
      lands. No runtime exposure exists today: the shipped record is `approved: false`, so every gate
      is shut regardless.

      _Open (tracked, not blocking this item):_ if phase 2 wants the strong original property, the
      route is to stop exporting `sanctionSecurityDecisionRecord` from the barrel and give the two
      Copilot test suites a test-only entry point instead. That is a public-API change affecting two
      packages and belongs with the change that builds the plaintext route, not here.

### RC-CLD-2.2 gate closure — 2026-09-18

**The record stays `approved: false`, and nothing in RC-1 may change that.** This is RC-CLD-2.2 as
re-scoped on 2026-09-16 (roadmap commit `9c3f201e`, which reached the integration branch at
`4e8d6c05`; this candidate is built on that commit). The
checklist above is untouched in substance: every item is open and names the CLD-6 story that closes
it. What RC-1 does guarantee, and the evidence for each claim:

1. **The shipped record is unapproved, and only RC-CLD-6.5 may approve it.**
   `packages/core/src/security/cloud-security-decision.ts:107` ships `approved: false`. The JSDoc
   above it now names RC-CLD-6.5 as the only story allowed to flip it.
   `packages/core/tests/security-vault-privacy-modes.test.ts:175` fails if it flips, with a message
   naming RC-CLD-6.5 and this checklist. That is a test plus a roadmap rule, not a lock: a change can
   edit both the record and the test. The failure message tells whoever does it who is allowed to.
2. **An approval cannot be manufactured outside the shipped selector.** `:185` shows the shipped
   record is frozen and cannot be approved in place. `:193` builds four approved look-alikes of the
   shipped record (an object spread, a JSON round-trip, a `structuredClone`, and a frozen copy). Every
   one passes `validateCloudSecurityRecord`, and every one is refused by the SEC-009 relaxation
   (content and metadata) and by the plaintext-upload gate, even when the vault's registration says
   `cloud-enhanced`. A server-side registration therefore cannot stand in for the review. `:213`
   shows the selector hands out only the sanctioned, unapproved instance. Mutation check,
   2026-09-18: deleting the sanctioned-record check in `isPlaintextUploadPermitted`
   (`packages/core/src/security/cloud-security-model.ts:444`) fails all four `:193` cases. The source
   was restored afterwards.
   **The exact scope of this claim.** An explicit `sanctionSecurityDecisionRecord(...)` call can
   still mint an approved record, because that function is on the package barrel
   (`packages/core/src/index.ts:3202`) for the Copilot tests in two other packages. The `:346` and
   `:350` source scans pin which files may make that call. So the enforced property is: outside
   those pinned files, no in-repo TypeScript can hold an approved Cloud-Enhanced record that opens a
   server-readable path. It is not a type-level impossibility, and it does not reach an external
   consumer of `@dndtools/core`. Item 7 carries the barrel decision to RC-CLD-6.2.
3. **No surface promises a capability the gate withholds.** Every Cloud-Enhanced surface now says
   the data is still end-to-end encrypted and the server features are not in this edition. The
   surfaces are the onboarding privacy choice, the Settings › Sync privacy panel, both switch
   dialogs, the consent toast and the vault-privacy help tip. The copy is in
   `apps/gm-react/src/i18n/messages/en.ts` and `es.ts`, under seven keys:
   `onboarding.privacy.cloudDesc`, `help.tip.vaultPrivacy.body`, and the `settings.privacy.` keys
   `helpCloud`, `dialogCloudDescription`, `bodyToCloud`, `bodyToPrivate` and `consentRecorded`. Besides the
   "upcoming features" promise, two false statements came out of the switch dialogs.
   "Switching modes later re-uploads your vault" described a migration that does not exist (item 5).
   "Content the service could read … may already have been read" described server reads that never
   happened, because nothing was server-readable. The new copy says consent does not widen
   anything today and that the owner will be asked again before anything becomes readable, which
   is RC-CLD-6.3's re-consent rule. The privacy policy (`apps/gm-react/src/screens/legal/legalContent.ts:121`)
   already said this and was not changed. The Private copy ("stay unavailable to this vault") was
   also left alone, because it is true of Private in any edition.
   The browser proof is `apps/gm-react/tests/e2e/cloud-enhanced-honest-limit.spec.ts`. It walks each
   surface, requires both statements, and rejects the promise phrasings.
4. **Ownership overlap, flagged rather than hidden.** The story owns `SyncPrivacy.tsx` for "copy
   only", but that file holds catalog keys, not strings. Meeting the copy acceptance meant editing
   the EN/ES catalogs and adding one e2e spec, and neither path is in the story's Owns list. The
   onboarding string also sits on the RC-UX-5.3 / ADR-042 onboarding surface. `SyncPrivacy.tsx`
   itself is unchanged. The edits are string-for-string replacements of the seven keys above, so a
   concurrent change to any of them will conflict loudly rather than merge silently.

**Asks from the 2026-09-16 gate review.**

- _Bind the check block to the reviewed commit._ The block below names the commit it ran on and
  the tree it covers.
- _Keep item 1's deployed-evidence caveat visible._ Item 1 now has an empty box, and its _Open_
  paragraph leads with the missing deployed evidence. A reader can no longer mistake configured for
  releasable.
- _Barrel export of `sanctionSecurityDecisionRecord`._ Carried in item 7 to RC-CLD-6.2 and 6.5,
  with no change here. Removing it would break the Copilot tests in `packages/cloud-fns` and
  `apps/gm-react`, which are outside this story.

**Correction to the second pass's check block.** The 2026-09-16 second pass recorded
`pnpm test:app` as 126 files and 1343 passed. The gate review re-ran it on `c3f45a6d` and got 127
files and 1368 passed. The difference is exactly
`apps/gm-react/src/app/widgets/builtin/Note.test.tsx` (1 file, 25 tests), which does not exist at
`41ebc122`. So the second pass ran its checks before the branch moved onto `d4729e8f`, not on the
tree it was filed under. No failure was hidden, but the block was not evidence for `c3f45a6d`. It
is left as written below and corrected here.

**Discrepancy, unresolved and outside this story's paths.** `docs/planning/RC_ROADMAP.md` records
RC-CLD-2.5 as "Done, and it stays gated. The client half ships fail-closed". A search on
2026-09-18 for `keyless` and `RC-CLD-2.5` across `apps/gm-react/src`, `apps/gm-react/tests`,
`packages/cloud-fns/src` and `packages/core/src` finds only an AI-provider comment
(`apps/gm-react/src/ai/providerConfig.test.ts:572`) and a JSDoc mention
(`packages/core/src/security/cloud-security-decision.ts:35`). No keyless-browser client code or
e2e turned up. The gate is closed either way, so nothing is exposed, but the roadmap's "done"
still does not match the tree.

<!-- RC-CLD-2.2 CHECKS -->

### Phase-2 scope disposition — 2026-09-16

**The review was asked for before the thing it reviews existed.** The 2026-09-08 disposition says as
much in its own terms: six items wait on "the PR that implements the server plaintext path". No such
PR is planned anywhere in the RC-1 roadmap, and no story in it builds a server-side mode authority, a
server-readable content path, a mode-transition migration, a purge protocol for derived data, or the
features that were the point. Two dispatcher attempts at RC-CLD-2.2 failed on that mismatch rather
than on anything a reviewer could fix.

The plan now separates the two halves. The platform is roadmap **epic CLD-6**, sized as a platform and
placed after RC-1; this checklist is its exit criterion and RC-CLD-6.5 is the only story permitted to
approve the record. The RC-1 story keeps its name, RC-CLD-2.2, and a smaller job: the decision record
ships unapproved, the permission helpers refuse an approval that did not come from the shipped
selector, this document says the capability is unbuilt rather than pending, and every Cloud-Enhanced
surface tells the user the transport is still end-to-end encrypted and the features are not in this
edition.

Nothing shipped regresses. RC-CLD-2.5 (keyless browser access) and RC-AI-4.1 (managed Copilot) were
built fail-closed behind this gate and stay that way; a closed gate withholds a capability that has no
implementation to withhold.

One consequence is recorded here because it is easy to lose. ADR-042 (RC-UX-5.3) makes Cloud-Enhanced
the default mode for the Beginner and Standard tiers while the gate is closed. Those vaults are E2EE
in fact, and their owners have consented to a label, not to server reads. Opening the path later must
therefore ask them again: RC-CLD-6.3 carries the rule that no existing vault's boundary widens without
fresh consent, and no story in CLD-6 may treat the tiered default as that consent.

### RC-CLD-2.2 status — 2026-09-16 (second pass, after gate review)

> _Historical record, superseded by the gate closure and the scope disposition above._ Its
> recommendation to re-scope RC-CLD-2.2 was adopted (roadmap commit `9c3f201e`). Line numbers are
> as of `c3f45a6d`; the resolved citations are in the checklist. Each handoff below now belongs to
> the CLD-6 story named in brackets. Its check block did not bind to the commit it was filed under;
> see "Correction to the second pass's check block" in the gate-closure section.

**Approval still withheld. `approved: false` stands.** This pass did not attempt to close more
checklist items; it corrected the evidence record itself, which a prior gate review found
unreliable in three places. An approval artifact whose citations do not resolve is not usable
evidence, so fixing it took priority over new implementation.

**What this pass changed.**

1. **Corrected stale evidence pointers.** Item 7 cited
   `packages/core/tests/security-vault-privacy-modes.test.ts:77`, `:82` and `:101`. None of those is a
   test declaration: `:77` is a statement inside the _Private E2EE_ gate test (which opens at `:74`),
   `:82` is blank, and `:101` is a `).not.toThrow();` line inside the E2EE-boundary test (`:98`) —
   each off by exactly the six import lines the same commit added to the top of that file. The intended tests are at `:83`, `:88` and
   `:107`; item 7 now cites those. Item 2's citations into `cloud-security-model.ts` were stale by a
   further 20 lines after this pass's JSDoc edit and were re-resolved (`:437-461`, `:443`), as was its
   `security-cloud-security-model.test.ts` range (`:157-191`, previously `:153-187`, whose start line
   was inside a record literal rather than at a test). Items 4 and 6 were stale the same way and for
   the same reason — RC-CLD-2.2's own commit `244cf6db` edited
   `packages/cloud-fns/src/copilot/indexer.test.ts` while the checklist preamble asserted nothing in
   `packages/cloud-fns` had changed. Every line number in the checklist has now been re-resolved by
   opening the cited line; the three that pointed at `};`, `});` and a `return` statement are fixed
   (`:37`, `:70`, and the enumerated `:149`–`:220` range).
2. **Restated checklist item 7 to the property actually enforced**, and said plainly that the
   previous `[x]` overstated it. The item claimed the relaxation was reachable _only via_
   `securityDecisionRecordForVaultMode('cloud-enhanced')`. It is not: `sanctionSecurityDecisionRecord`
   is on the barrel (`packages/core/src/index.ts:3198`), so any importer can mint an acceptable
   record. The enforced property is identity-gating plus a pinned audit scan. See item 7's "Why this
   item was restated" for the gap, why the stronger property is not reachable while the shipped record
   is frozen at `approved: false`, and the public-API change phase 2 would need to get it.
3. **Widened the audit scan and closed its test-file blind spot.** The scan walked only `packages/`
   and `apps/`, leaving `scripts/`, `tools/`, `tests/`, `config/` and `infra/` unscanned; it now walks
   all seven in-repo TypeScript roots and asserts each exists, so a new root cannot silently become a
   hole. A second scan pins the four _test_ files that mint sanctioned records to an enumerated list,
   so the product-source scan's `*.test.ts` exclusion is bounded rather than invisible. Both were
   mutation-checked (see item 7); the `scripts/` probe notably did **not** fail before this change.
4. **Documented the module-identity coupling.** `SANCTIONED_DECISION_RECORDS` is module-level
   `WeakSet` state keyed on object identity, so membership does not survive a second bundled copy of
   `@dndtools/core`, a JSON round-trip through a Lambda request, or a `structuredClone`. A route that
   reconstitutes a record from a serialized form gets a refusal worded as a policy failure when the
   real cause is an identity mismatch. The direction is fail-closed, so this is a debuggability trap
   rather than a hole — now recorded in the JSDoc
   (`packages/core/src/security/cloud-security-model.ts:345-353`) and in the handoffs below.
5. **Corrected a false claim in the shipped source.** The `sanctionSecurityDecisionRecord` JSDoc
   asserted it was "deliberately NOT re-exported from the package barrel". It has been exported at
   `packages/core/src/index.ts:3198` the whole time, and the scan's own allowlist includes that file.
   A comment claiming a containment property the code does not have is worse than no comment, since
   it is exactly what a reviewer would rely on.

**Six items remain open**, all for the same reason: the server components do not exist. No plaintext
route, no mode-registration store, no feature adapters, no migration, no purge coverage. Those live
in `packages/cloud-fns` and `apps/gm-react`, outside this story's owned paths, so the approval flip
still belongs to the change that builds them and closes the last item. The handoffs below are
required work, not tested proposals:

- [RC-CLD-6.1, 6.2] HANDOFF RC-CLD-2.2 → `packages/cloud-fns/src/sync/handler.ts`: implement authenticated,
  tenant-scoped mode registration and plaintext storage; load registration on the server and fence
  writes against concurrent mode changes. Missing registration, storage errors and client mode
  overrides must not authorize writes. Cover tenant isolation for reads, writes and deletion.
  **Import the decision record from `@dndtools/core` — never accept it over the wire or rebuild it
  from a serialized form.** Sanctioning is object identity, so a deserialized record fails the gate
  with a message about sanctioning that will read like a policy refusal (see item 7).
- [RC-CLD-6.4] HANDOFF RC-CLD-2.2 → `packages/cloud-fns/src/copilot/indexer.ts`: supply production adapters for
  `authorize`, `readSnapshotForActor`, `embed` and `replaceIfCurrent`, with scoped storage/IAM and
  atomic revocation enforcement. The only `indexCopilotSnapshot` callers found are unit tests; the
  port declarations alone cannot close the feature-access obligation.
- [RC-CLD-6.3] HANDOFF RC-CLD-2.2 → `apps/gm-react/src/screens/settings/SyncPrivacy.tsx` and
  `apps/gm-react/src/cloud/vaultMode.ts`: connect consent to server registration and verified
  re-upload migration; fence old-mode writes and preserve the usable copy on interruption. Report
  completion only after verification and cleanup, with the prior-readability disclosure.
- [RC-CLD-6.3, 6.4] HANDOFF RC-CLD-2.2 → `packages/cloud-fns/src/sync/handler.ts` and
  `packages/cloud-fns/src/app-api/handler.ts`: include plaintext and derived stores in purge;
  partial failure must prevent the completed marker and account-deletion completion.
- [RC-CLD-6.4, 6.5] HANDOFF RC-CLD-2.2 → RC-CLD-2.5 implementation and `apps/gm-react/tests/e2e/`: supply the
  keyless-browser path and its named e2e. A source search for `keyless` and `RC-CLD-2.5` across app
  source/tests and cloud functions still finds no keyless-vault implementation or e2e (the
  provider-config test's "keyless" comment concerns AI provider credentials). An approval-record
  mock or the removal of a test skip is not this acceptance.
- [RC-CLD-6.2, 6.5] HANDOFF RC-CLD-2.2 → phase-2 reviewer, if the strong form of item 7 is wanted: remove
  `sanctionSecurityDecisionRecord` from the barrel and give `packages/cloud-fns` and `apps/gm-react`
  a test-only entry point for simulating the post-review posture. Public-API change across two
  packages; belongs with the plaintext route, not with a docs pass.

**Checks run on 2026-09-16 (second pass)**, from the repository root unless noted. All are local;
none exercises a deployed stage or a browser:

- `pnpm typecheck`, `pnpm lint`, `pnpm build` — exit 0. (`pnpm gates` runs no compiler, so the
  compiler-backed three are run explicitly.)
- `pnpm --filter @dndtools/core exec vitest run` — 273 files, 4784 passed, 0 failed. (4783 in the
  first pass; +1 is the new test-file sanctioner scan.)
- `pnpm test:cloud` — 36 files, 482 passed, 0 failed.
- `pnpm exec vitest run tests/unit/cloud-enhanced-kms.test.ts` — 1 file, 5 passed, 0 failed.
- `pnpm test:app` — **126 files, 1343 passed, 0 failed, exit 0.**
- `pnpm --filter @dndtools/core exec vitest run tests/security-vault-privacy-modes.test.ts tests/security-cloud-security-model.test.ts`
  — 2 files, 33 passed (28 in the 2026-09-11 review, before item 7's tests were added).

> **Correction to the first pass's record.** The 2026-09-16 first pass recorded `pnpm test:app` as
> "1333 passed, 1 failed: `apps/gm-react/src/app/help/changelog.test.ts:85` … pre-existing and
> unrelated — it arrives with the base commit `66b7ab7f`". That block did not correspond to the tree
> it was filed under. The changelog failure had already been fixed by `32d9ed73` ("exclude unreleased
> notes from shipped release selection"), which `git merge-base --is-ancestor 32d9ed73 41ebc122`
> confirms is an ancestor of this branch's **base** commit, not a later one; and the passing count
> differed by 9. Re-run on the reviewed tree: 1343 passed, 0 failed. The direction of the error was
> benign — a failure was over-reported, not a real one hidden — but a check block that does not bind
> to the commit it is filed under is not evidence, and this document is the artifact a phase-2
> approval would be granted on. Recorded rather than silently deleted, because the prior pass's
> disposition cited it.

**Still unverified, and required before release.** No deployed-stage evidence exists for the KMS
item: a read-only `aws kms get-key-policy --profile dndtools` was attempted again on 2026-09-16 and
failed with `Error when retrieving token from sso: Token has expired and refresh failed`. Refreshing
it needs an interactive browser login, so this cannot be closed from an unattended run — it needs an
operator with a live `dndtools` SSO session. The acceptance step "the gated e2e (RC-CLD-2.5) passes
un-gated" still has no test to run (see the discrepancy below).

**Decision, and a recommendation on the story itself.** `approved: false` stands
(`packages/core/src/security/cloud-security-decision.ts:105`). Six of seven obligations are unmet and
the KMS item lacks deployed evidence.

The story's acceptance — "the record flips to `approved: true` in that change and the gated e2e
(RC-CLD-2.5) passes un-gated" — **cannot be met from this story's owned paths, and should not be
forced.** Flipping the record would open `evaluateCloudEnhancedRelease` and the server-visibility
relaxation for a feature with no server-side registration store, no plaintext route, no feature
adapters, no migration and no purge coverage, and with zero deployed-stage evidence for the KMS
item. That would convert a documentation gap into a live trust-boundary change, which is a strictly
worse outcome than an unmet acceptance criterion. The RC-CLD-2.5 e2e does not exist to run
un-gated either. **The correct resolution is to re-scope RC-CLD-2.2 to the evidence-and-review
artifact it actually is, and move the approval flip to the story that builds the server side.** That
is an owner decision, recorded here rather than taken unilaterally. The independent review remains
the sign-off.

### RC-CLD-2.2 review disposition — 2026-09-11 (re-opened)

> _Historical record, retained as written._ Line numbers in this section are as of 2026-09-11 and
> have since moved; the current resolved citations are in the checklist above. In particular the
> Cloud-Enhanced record's `approved: false` is now at
> `packages/core/src/security/cloud-security-decision.ts:105`, not `:103`.

**Changes required; phase-2 approval withheld.** All seven items now carry evidence. One holds at the
configuration level and still needs deployed-stage evidence. Six depend on server components that do
not exist: a registration store, a plaintext route and content store, feature adapters, migration,
and purge coverage. The record stays `approved: false`
(`packages/core/src/security/cloud-security-decision.ts:103`).

Those components belong in `packages/cloud-fns` and `apps/gm-react`, outside this story's owned
paths. The approval flip belongs in the change that builds them and closes the last item.

**Discrepancy.** §23 of `docs/planning/RC_ROADMAP.md` lists RC-CLD-2.5 (keyless browser access) as
`done`; that status was rendered from the dispatcher store in `16c8b2ca`. At `5e6064d9` no commit,
source file or Playwright spec implements keyless browser access. The specs that mention
Cloud-Enhanced or privacy modes are `onboarding-consent.spec.ts`, `help-tips.spec.ts` and
`responsive.spec.ts` under `apps/gm-react/tests/e2e/`, and none of them mentions keyless access. The
acceptance step "the gated e2e (RC-CLD-2.5) passes un-gated" has no test to run.

Checks run for this review on 2026-09-11, from the repository root unless noted. All are unit tests,
and none exercises a deployed stage:

- `pnpm exec vitest run tests/unit/cloud-enhanced-kms.test.ts`: 5 passed.
- `pnpm exec vitest run tests/security-vault-privacy-modes.test.ts tests/security-cloud-security-model.test.ts`
  from `packages/core`: 28 passed.
- `pnpm exec vitest run --config vitest.cloud.config.ts packages/cloud-fns/src/copilot packages/cloud-fns/src/sync/handler.test.ts`:
  83 passed.

Reviewed by **Claude Opus 5 (dndtools dispatcher, docs slot)** on **2026-09-11**. This records a
source and configuration review with unresolved findings, **not approval to release
Cloud-Enhanced**. The independent review remains the sign-off.

### RC-CLD-2.2 review disposition — 2026-09-08

**Changes required; phase-2 approval withheld.** One of seven checklist items has static
configuration evidence; six require the missing server implementation. The configured KMS item
also requires deployed-stage evidence before release sign-off. The decision record in
`packages/core/src/security/cloud-security-decision.ts` remains `approved: false`.

The preceding partial review checked off the unwired upload helper and the routing invariant.
Those checks are withdrawn: a caller-supplied string and a record validator do not establish an
HTTP authorization boundary. This review also removes the KMS account principal's `kms:*`
delegation, which previously allowed an IAM-authorized role to use the key despite the separate
sync-role grant. AWS documents the [account principal's IAM delegation semantics](https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-default.html)
and [grant-based key access](https://docs.aws.amazon.com/kms/latest/developerguide/grants.html).
The replacement policy preserves management access, including policy updates, aliases, and
rotation, while granting cryptographic use only to the sync role. The
[CloudTrail KMS documentation](https://docs.aws.amazon.com/kms/latest/developerguide/logging-using-cloudtrail.html)
supports the static audit-trail configuration check; it is not evidence of delivered stage events.

Reviewed by **gpt-6-astra (dndtools RC loop, slot 3)** on **2026-09-08**. This signature records a
source/configuration review with unresolved findings, **not approval to release Cloud-Enhanced**.
The PR that implements the server plaintext path must resolve the six open items, attach dev/prod
key-policy and decrypt-audit evidence, and sign the complete checklist before flipping the record
to `approved: true`. No future feature inherits an approval from this partial review.

## Consent integrity (ADR-042 tiered creation; phase-1 implementation pending)

[ADR-042](../adr/042-tiered-vault-privacy-default.md), accepted 2026-09-12 under RC roadmap §1.6
D3, amends ADR-026's universal forced choice. These are implementation obligations; the reviewed
onboarding still forces the original choices. Phase-2 approval above remains withheld.

- **T5 — Default mistaken for consent or applied to existing data.** Only new Beginner/Standard
  vaults receive the Cloud-Enhanced default, with a visible one-line disclosure that the server can
  read campaign content, including secrets, and a Settings link. Skip paths must still show it.
  Expert requires an explicit unselected choice and Private's recovery acknowledgment. The forced
  sample-or-fresh step disappears. Absence, legacy, invalid values and read failure still resolve to
  Private; upgrade, replay, tier changes and vault switching must preserve existing modes. Record
  the default and disclosure per new vault; never infer consent from interface tier or an absent
  flag. Residual risk: users can overlook disclosure; acceptance of this risk does not waive it.
- **T6 — Flag tampering widens trust.** Phase 1's unapproved record blocks server-readable release.
  Phase 2 must load authenticated per-vault registration server-side, fail closed on missing or
  failed reads, and fence concurrent mode changes (see checklist). The current single localStorage
  key in `cloud/vaultMode.ts` is UX state, not that authority or a per-vault consent ledger.
- **T7 — Consent theater or hidden privacy controls.** Until phase 2 is approved, disclose upcoming
  server readability and today's E2EE transport; do not claim cloud features are available. Settings
  must show effective mode and availability at all tiers and explain the route to Expert's Private
  choice. No paid plan is required. Validate the disclosure and Settings paths in browser tests;
  core gate tests cannot establish informed consent.
- **T8 — A local toggle falsely promises confidentiality.** Settings currently changes only a local
  preference. Cloud-Enhanced → Private migration of readable cloud data is not supported today.
  The accepted target requires client-held keys/recovery, write fencing, full encrypted re-upload,
  verification and deletion of old readable artifacts and derived indexes before completion.
  Disclose bandwidth/time, temporary storage, interrupted sync, lost server features and user-held
  recovery duties. Preserve the prior usable copy on failure. Never claim previous server access
  can be undone; disclose retention limits. Before phase 2, implement the migration or explicitly
  mark it unavailable. Private → Cloud-Enhanced still requires explicit consent, not a tier change.

Source review: 2026-09-12, commit `8b582677939ad2d89ff843affa60af78bd578ae9`; implementation links
and remaining validation are in [ADR-042](../adr/042-tiered-vault-privacy-default.md#verification-and-evidence).

## Out of scope

Remote-play P2P transport (separate ECDH/PIN model, ADR-cloud-backend hardening docs), marketplace
content (public by intent, ADR-020), BYO-key AI transport (ADR-021/025 — user's own key, content
sent only on explicit user action to the user's chosen provider).
