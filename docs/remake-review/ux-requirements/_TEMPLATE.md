# UX Requirements — <Domain Title>

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md` first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `<DOMAIN-IDs e.g. CANVAS-001..018>`
> **Owner surface(s):** `<routes / components this governs>`

---

## 1. Scope

- **Covers:** <one paragraph on what UI surfaces/flows this doc governs>
- **Does NOT cover:** <explicit boundary; point to the sibling doc that owns it>
- **Related functional requirements:** `../requirements/<NN-file>.md` — list the IDs and one-line each.
- **Related UX docs:** cross-link sibling UX docs (e.g. `01-visual-design-system.md`, `03-accessibility.md`).

## 2. UX goals for this surface

State the design intent, then explicitly address **each parameter** from the package rubric (§ Overview) as it applies here:

| Parameter | Goal for this surface |
|---|---|
| Visual appeal | |
| Information scent | |
| Navigability | |
| Intuition / learnability | |
| Accessibility | |
| Adaptability (platform profiles) | |
| Effective emphasis (visual hierarchy) | |
| Feedback & responsiveness | |
| Error prevention & recovery | |
| Consistency | |

## 3. Researched best practices

Evidence-based findings with **inline numbered citations `[n]`** resolved in § Sources. Every finding must end with a concrete *implication for this product* (one sentence, actionable). Prefer primary sources: Apple HIG, Material 3, Fluent/Windows, WCAG 2.2 / WAI-ARIA APG, NN/g, and domain-leading product documentation.

## 4. Reference implementations (exemplars)

A table of real, named products with **working URLs**, and what specifically to borrow vs. avoid:

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|

Then 2–3 short "north-star" narratives: for each, the single most important thing this product should learn from it.

## 5. UX/UI requirements

Numbered, testable, prescriptive. One block per requirement, using this exact shape:

### UX-<DOMAIN>-NNN — <short imperative title>
- **Requirement:** <imperative, specific statement>
- **Rationale:** <why; cite best practice `[n]` or exemplar>
- **Spec:** <concrete details — layout, sizes (px/rem), spacing, density, copy/microcopy, defaults>
- **States:** default / hover / focus-visible / active / selected / disabled / loading / empty / error — as applicable, each described
- **Platform profiles:** Desktop / Tablet / Mobile behavior (what changes, what stays identical)
- **Input:** pointer · touch · keyboard (list **exact shortcuts**) · pen (where relevant)
- **Accessibility:** role/name/state, focus management, live-region announcements, contrast, target size
- **Acceptance criteria:** Given/When/Then bullets — binary pass/fail
- **Priority:** Must-have / Should-have / Could-have

> Aim for prescriptive numbers, not vague adjectives. "≥44×44 CSS px touch target, 8px min gap" beats "large enough."

## 6. Component & state specifications

Anatomy + full state matrix for the **key components** of this surface (callouts, panels, toolbars, cards, etc.). Use tables. Include focus/keyboard behavior per component.

## 7. Layout & responsive behavior

Per platform profile (Desktop ≥1024px · Tablet 600–1024px · Mobile <600px — align to `PLAT` requirements). Include ASCII wireframe sketches where they add clarity. State what is *the same command/result* across profiles vs. what is a *density-reduced surface* (per the requirements' `Mobile: slim` convention).

## 8. Motion & feedback

Concrete durations (ms), easing curves, what animates and what must not, and the `prefers-reduced-motion` fallback for each.

## 9. Accessibility requirements (surface-specific)

Beyond the global `03-accessibility.md` — the specifics this surface must satisfy (e.g., canvas keyboard model, map alt-text strategy, live combat announcements). Map to WCAG 2.2 SC where applicable.

## 10. Anti-patterns & explicit limitations

**Required section.** What NOT to do, each with the researched reason. These are hard limits, not suggestions. Include patterns this product must reject even though competitors use them.

## 11. Success metrics

Measurable targets (task success rate, time-on-task, error rate, time-to-first-value, perceived-performance thresholds, etc.) with a number where possible.

## 12. Open questions & risks

Unresolved design decisions, dependencies on other surfaces, and risks to flag for the human designer/owner.

---

## Sources

Numbered to match `[n]` citations. Format: `[n] Title — Publisher — URL`. Real, resolvable URLs only.
