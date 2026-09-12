# Privacy modes

Your campaign can hold surprises, private notes, and months of work. Choose its privacy mode with that in mind.

## Private vault

Private cloud backups are encrypted on your devices, and the service does not hold the keys needed to read their campaign content. This does not mean the service sees no account or connection metadata. Server-powered campaign search, campaign AI, and opening a backup without your key are unavailable in this mode.

During setup, read the recovery explanation and type the confirmation shown. If every device holding your key is lost and you have no exported recovery key, the service cannot recover the private cloud copy for you.

## Cloud-Enhanced vault

Cloud-Enhanced records consent for future service-readable storage, encrypted in transit and at rest with service-managed keys. It is intended to support server-powered features.

**Those features are not available yet.** In this build, choosing Cloud-Enhanced records your consent while data continues through the end-to-end-encrypted pipeline. The service-readable mode remains blocked pending its security approval. Choosing it does not enable campaign AI, cloud search, or access from any browser today.

## Change the choice or save a recovery key

Open **Settings → Sync** to inspect the mode or request a switch. Read the dialog and type its confirmation phrase. Once service-readable storage becomes available, switching back cannot undo access that already happened.

The same area holds recovery-key export and import. These controls require a signed-in account and available key custody. When available, export a recovery file with a passphrase and keep both safe. On a replacement device, import that file using the same passphrase. A recovery key unlocks an encrypted backup; it is not itself a copy of your campaign or its media.

Vault privacy and player visibility are separate choices. A private cloud backup does not make a handout private from players you share it with. Check the player view before projecting material.

## Implementation references

Source review: 2026-09-12, repository baseline `b54cf4c7` (app 0.3.7). These are
local implementation and existing test references, not a claim that device, network,
or release-installation checks were run for this guide.

- [SyncPrivacy.tsx](../../apps/gm-react/src/screens/settings/SyncPrivacy.tsx)
- [vaultMode.ts](../../apps/gm-react/src/cloud/vaultMode.ts)
- [security-vault-privacy-modes.test.ts](../../packages/core/tests/security-vault-privacy-modes.test.ts)
