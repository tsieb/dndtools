# Planning

This section holds the roadmap, the planning methodology, and the initiative breakdown.

## Index

| Document | What it is |
| --- | --- |
| [ROADMAP.md](ROADMAP.md) | Current baseline + near/mid-term themes for the React GM app and cloud backend |
| [PLANNING_TIERS.md](PLANNING_TIERS.md) | The goal-hierarchy methodology (how work is decomposed from strategy to atomic steps) |
| [initiatives/README.md](initiatives/README.md) | The initiative index (I1–I20): vision, guiding principles, and the dependency map |

## How to read the initiatives

The initiative files (`initiatives/I*.md`) are the **planning backlog**. They mix shipped and
aspirational work and are organized as Initiative → Epic → Story. They are a direction-setting
document, not a claim that every listed item is implemented.

- **Foundational initiatives** (I1 Platform Foundation, I2 Engineering Excellence, I3 Core Knowledge
  Architecture, I4 Session Command Center) established the core/command/persistence architecture and
  the quality automation that ship today.
- **Cross-device play** (I6 Multi-Platform Distribution, I7 Collaborative Infrastructure) corresponds
  to the shipped Electron desktop shell, LAN/serverless remote play, and the opt-in AWS cloud backend.
- **The UX refactor cluster** (I13–I20) shapes the React shell, IA/navigation, and design system;
  I13 (IA/navigation) is the prerequisite for the rest.
- Remaining initiatives (I5 AI partnership, I8 extensibility, I9/I19 maps, I10 player suite, I11
  audio, I12 community, I18 accessibility, I21 realignment audit) are the active/aspirational backlog.

For the authoritative picture of **what is actually built vs stubbed**, use
[`../requirements/FEATURE-GAPS.md`](../requirements/FEATURE-GAPS.md) and the `pnpm feature-audit`
drift report — not the initiative narratives.
