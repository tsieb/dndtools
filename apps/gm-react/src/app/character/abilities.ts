/**
 * Ability-score helpers shared by the two character surfaces — the owner sheet (`screens/player/`)
 * and the read-only player app (`screens/play/`). Both files carried byte-identical copies of these
 * three before RC-STB-2.1's sibling split; only these three were identical, so only these three
 * moved. The ability LABEL maps deliberately stay file-local: the owner sheet keys `ABIL_FULL` by
 * upper-case abbreviation and the player app keys it by lower-case id, and the two condition-alias
 * maps differ by an entry, so unifying them would change what each screen renders.
 */

/** Canonical ability order for every ability row/grid on both surfaces. */
export const ABIL_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/** Render a modifier with an explicit sign, the way a character sheet prints it. */
export const sgn = (n: number) => (n >= 0 ? '+' : '') + n;

/** 5e ability modifier; an absent score is treated as the 10 default, as both callers did. */
export const abilMod = (score: number | undefined) => Math.floor(((score ?? 10) - 10) / 2);
