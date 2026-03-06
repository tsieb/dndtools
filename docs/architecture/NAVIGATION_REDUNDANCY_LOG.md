# Navigation Redundancy Inventory And Elimination Log

This audit records current navigation/action entry points and defines the single resolved location for each behavior.

Legend:

- Classification: `global`, `local`, `contextual`, `action`, `utility`
- Verdict: `keep as-is`, `move`, `consolidate`, `remove`

## Decision Table

| Entry point                          | Current behavior                   | Classification | Verdict     | Resolved location                                           |
| ------------------------------------ | ---------------------------------- | -------------- | ----------- | ----------------------------------------------------------- |
| Sidebar: `Home`                      | Go to vault overview               | global         | remove      | Replace with primary section `Knowledge` root               |
| Sidebar: `Player Screen`             | Open player screen                 | global         | move        | Session section local/utility area as `Player Screen`       |
| Sidebar: `All Notes`                 | Open notes list                    | global         | consolidate | `Knowledge` global section destination                      |
| Sidebar: `Search`                    | Open search page                   | global         | consolidate | `Knowledge` local browse/search surface                     |
| Sidebar: `Graph`                     | Open graph view                    | global         | consolidate | `Knowledge` local navigation                                |
| Sidebar: `Maps`                      | Open maps                          | global         | consolidate | `Atlas` global section destination                          |
| Sidebar: `Timeline`                  | Open timeline                      | global         | consolidate | `Campaign` global section destination                       |
| Sidebar: `Session Board`             | Open board                         | global         | consolidate | `Session` global section destination                        |
| Sidebar: `Encounter Builder`         | Open encounter builder             | global         | consolidate | `Session` local destination                                 |
| Sidebar: `Combat`                    | Open combat tracker                | global         | consolidate | `Session` local destination                                 |
| Sidebar header: `New Note`           | Create note                        | action         | move        | Section-scoped primary action in `Knowledge` local panel    |
| Sidebar header: `From Template`      | Create from template               | action         | move        | Section-scoped `Knowledge` action area                      |
| Sidebar header: `Dice Tray`          | Open dice tray                     | action         | consolidate | `Session` section only                                      |
| Sidebar nav: `Dice Tray`             | Open dice tray                     | action         | remove      | Removed duplicate; keep one session placement               |
| TopBar: `Search (Ctrl+P)`            | Open quick switcher/palette        | utility        | keep as-is  | TopBar command palette trigger                              |
| TopBar: `Open dice tray`             | Open dice tray                     | action         | move        | Remove from TopBar; keep in Session local navigation        |
| TopBar: `Settings` icon              | Open settings                      | utility        | consolidate | Keep one settings global destination; remove duplicate icon |
| Sidebar footer: `Settings`           | Open settings                      | utility        | consolidate | Canonical global destination in primary nav                 |
| TopBar: `Refresh vault`              | Force refresh                      | utility        | remove      | Remove manual refresh button (auto-refresh behavior)        |
| TopBar: `DM/Player mode`             | Toggle persona mode                | utility        | move        | Sidebar footer persona switcher                             |
| Mobile bottom nav: `Notes`           | Open notes/home                    | global         | consolidate | `Knowledge` primary section                                 |
| Mobile bottom nav: `Search`          | Open search                        | global         | consolidate | `Knowledge` local surface entry                             |
| Mobile bottom nav: `Graph`           | Open graph or player               | global         | remove      | Replace with five-section primary nav model                 |
| Mobile bottom nav: `Session`         | Open session board                 | global         | consolidate | `Session` primary section                                   |
| Mobile bottom nav: `Settings`        | Open settings                      | utility        | keep as-is  | Remains settings global destination on mobile               |
| Sidebar widget: `Open timeline view` | Jump to timeline from open threads | contextual     | keep as-is  | Contextual link into `/campaign/timeline`                   |
| In-page: map hierarchy breadcrumbs   | Navigate map ancestry              | contextual     | keep as-is  | Atlas contextual navigation                                 |
| Location bar breadcrumbs             | Navigate route ancestry            | contextual     | keep as-is  | Global breadcrumb component sourced from route metadata     |
| Table of contents nav                | Jump within note headings          | contextual     | keep as-is  | Content-local navigation                                    |
| Related note jumps                   | Jump to referenced notes           | contextual     | keep as-is  | Content contextual panel                                    |

## Duplicate Hotspots Resolved

### Dice Tray

- Current locations: Sidebar header, Sidebar nav, TopBar button, keyboard shortcut.
- Resolution: one persistent UI location in `Session` local nav; keyboard shortcut remains global utility.

### Settings

- Current locations: TopBar icon, Sidebar footer, mobile nav item.
- Resolution: one primary global settings destination (desktop and mobile); remove decorative duplicates.

### Search

- Current locations: Sidebar global link, TopBar trigger, mobile nav, dedicated route.
- Resolution: TopBar command palette trigger + Knowledge-local search view. Remove duplicate shell links that behave identically.

## Implementation Sequencing

1. Epic 13.2: apply global nav consolidations and TopBar scope reduction.
2. Epic 13.3: move section-local actions/panels into section-local navigation.
3. Epic 13.5: finalize command palette and search ownership boundaries.
