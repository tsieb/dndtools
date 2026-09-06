/**
 * RC-UX-1.2 ratchet for `no-literal-jsx-text`.
 *
 * Each entry is a file that still renders untranslated user-visible text, and the number of
 * strings it is allowed to keep. The rule fails when a file exceeds its number *and* when it
 * comes in under it — a migrated screen has to lower or delete its entry in the same commit, so
 * this list can only ever get shorter.
 *
 * Adding a file here is not a way to land new untranslated copy. New screens carry no entry, so
 * the first literal they render fails the gate.
 *
 * RC-UX-1.2 emptied this list: every file that renders user-visible text reads it out of
 * `apps/gm-react/src/i18n/messages`. It stays here as the ratchet's floor — the rule fails on the
 * first literal any file reintroduces, and nothing may be added back.
 */
export const allow = {};
