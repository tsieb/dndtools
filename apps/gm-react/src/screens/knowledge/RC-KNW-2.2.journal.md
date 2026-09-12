# RC-KNW-2.2 run journal

- Plan: complete list metadata within knowledge ownership; run named phone acceptance and static checks; commit current branch.
- Edits: cards retain icon/title/visibility/two-line excerpt; add folder and at most two deduplicated tags from actor-filtered note fields/body. Explicit folder wins over imported source-path parent. Relative modified uses existing locale formatter; exact date remains in time title. Long content wraps within shrinking cards.
- Validation: app typecheck passed (exit 0); `authoring-layout.spec.ts --grep 320px --workers=1` passed all 6 desktop/mobile cases (exit 0). Exact Headroom originals retrieved. Targeted ESLint passed (exit 0).
- No dispatcher control changes, delegation, push or promotion.
