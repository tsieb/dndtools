# RC-KNW-6.2 — One kind vocabulary across Notes, Story, Graph and search

## Session 1 — 2026-10-07

Started on `dispatch/dndtools/2680175096d5e223e4db` at `515d714c` (RC-CAN-7.6 on top; KNW-6.1,
6.3, 6.4 and POL-1.22/1.23 already in history) with a clean tree. No Headroom tools are exposed in
this session; command output is read directly or kept in `/tmp/rc-knw62-*.log`.

Inputs read: RC_ROADMAP KNW-6 epic, friction review `knowledge.md` (KNW-2/3/4/11/14), the KNW-6.1
and 6.4 journals, the manifest fence (`owns` + `companion_paths` + `journal_paths`).

### Where each surface names a kind today

| Surface                                  | Code                                                                               | Ashen Hand-style faction object reads     |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| Graph legend, canvas, results, inspector | `graph/presentation.ts` `KIND_LABEL[node.kind]`, `node.kind` = structural `object` | "Story entry"                             |
| Notes filter Kinds                       | `knowledge/filterModel.ts` `TYPE_LABEL` per search content type                    | "Story entries · n"                       |
| ⌘K palette                               | `shortcuts/palettePresentation.ts` `HIT_PRESENTATION.object`                       | group "Story entries", meta "Story entry" |
| `[[` autocomplete                        | `editor/Autocomplete.tsx` `wikilinkKindLabel`                                      | "Factions" (plural tab label, since 6.1)  |
| Sidebar Story line                       | `shell/Sidebar.tsx` `shell.countStory`                                             | notes counted as "threads"                |

### Plan

- Core: one `kindWordFor(kind, subtype)` in `graph-visualization-query.ts` → `note | quest |
faction | npc | map | place`. The graph view model's `node.kind` becomes that word (the structural
  kind moves to `node.entity`), so every graph surface that already keys on `node.kind` reads it.
- App: `kindLabel` + the label/plural tables in `graph/presentation.ts`; the palette, the Notes
  filter and the autocomplete call it.
