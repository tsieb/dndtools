# DND Tools 0.2.0 — UI/UX Diagnosis (current build)

> **Purpose.** Evidence-backed diagnosis of the *rendered* application, scoped to the two areas the
> product owner flagged as fundamentally flawed: **information architecture** and **visual design /
> theming**. The companion `01-design-brief.md` turns this into a redesign brief for an external
> design tool (claude.ai/design). The canvas-first command-center *paradigm* is explicitly **in
> scope to keep** — it was not flagged.

**Method.** Built the current working tree (`feat/unify-widget-platform`) and captured viewport
screenshots of the primary surfaces on desktop (1280×720) and mobile (Pixel 5), in both the light
(parchment) and dark (tavern) themes, via the existing Playwright harness. Each surface was graded
against the project's **own** quality bar — the parameter rubric and the squint/grayscale tests in
`../ux-requirements/00-overview-and-principles.md` — not against personal taste. Evidence images are
in `./evidence/`.

> **Empty-vault caveat.** The Command Center auto-seeds a system template (so its home screenshots
> are a real populated state) and the Atlas has 3 seeded maps, but Knowledge, Session, and the
> Characters roster were captured **empty** (no notes / encounters / party members). The findings
> below are therefore split deliberately: the **cross-cutting flaws (§2) are content-independent**
> design facts that hold no matter how much data is loaded (hierarchy, color, control *styling*,
> chrome, labels); the **per-surface notes (§3) are flagged where they describe an empty state**, so
> "never designed" never rests on "no data yet."

---

## 1. Headline

**The app was built *to the spec* but was never *designed*.** Every required element from the UX
package is present, labeled, and accessible — and the underlying token system, theme engine, and
shell architecture are genuinely well-engineered. But the rendered result has almost no visual
hierarchy, almost no use of color, near-native form controls on content surfaces, and an
everything-at-once home. It reads as a **cramped, monochrome admin dashboard** — the one outcome the
spec explicitly forbids (`16-ideal-gui-architecture.md §8.1`: "should not look like a generic admin
dashboard"; principle #10: "looks designed, not assembled").

This matters for the brief: paraphrasing the existing spec into a design tool will reproduce the
same result, because the spec is not what failed. The redesign must supply what the spec left to
"design judgment" — emphasis, mood, density, and component craft.

---

## 2. Cross-cutting flaws

### V1 — No emphasis hierarchy; the squint test fails everywhere (Visual) — **Critical**
The Command Center is a flat grid of ~10 equal-weight cards (Mission control, Data Hub, Player
Views, Session workflow, Getting started, Atlas, Combat, Search, Characters, Notes), all the same
size, border, and color. Squinting, nothing wins. Violates principle #6 ("exactly one primary
object per region") and §8.2 ("each region gets one primary focus" — for the CC that is *active
session / player-view state"*). _Evidence: `cc-light-desktop.png`, `cc-dark-desktop.png`._

### V2 — Color is essentially unused; grayscale test passes only because it's already gray (Visual) — **Critical**
The single muted-gold accent barely registers; there is no color encoding for state, severity, or
emphasis. The spec wants "color communicates state and severity, not decorate every component"
(§8.2) — but here there is almost no color *at all*, so state (combat active, sync, visibility,
turn) has no chromatic signal. _Evidence: every screenshot._

### V3 — Content surfaces use near-native, unstyled controls (Visual) — **Critical**
Knowledge, Session, and Characters render raw HTML form furniture: native `<select>` dropdowns, a
gray default "Create note" button, `<fieldset>`/`<legend>` borders on the encounter builder, bare
number inputs. The token system exists but these surfaces don't consume it, so they look broken next
to the (lightly) themed shell — worst in dark mode. _Evidence: `knowledge-dark-desktop.png`,
`session-desktop.png`._

### V4 — The intended "premium, warm, dark-first" mood never lands (Visual) — **High**
For a light-OS user the default is an **anemic parchment** with washed-out contrast (`system` →
light). The dark "tavern" theme is better but reads **cool/navy**, flat, and un-atmospheric — not
the "warm, dark-first, genre-appropriate, premium tool for a fantasy hobby" the spec promises
(§8.1, principle #10). No elevation, texture restraint, or accent warmth differentiates panels.
_Evidence: `cc-light-desktop.png` vs `cc-dark-desktop.png`._

### IA1 — The home is an everything-dashboard, not a focused live-play surface (IA) — **Critical**
The Command Center surfaces a Data Hub (with its *own* Scenes/Parties/Campaign tabs — duplicating
global nav destinations), Player Views, Session workflow, Getting Started, Atlas, Combat, Search,
Characters, and Notes simultaneously. It optimizes for *coverage*, not for the DM's hot path
("see current session state; advance combat; reveal content" — `16 §2.2`). Progressive disclosure
(principle #4) is inverted: everything is the first impression. _Evidence: `cc-light-desktop.png`._

### IA2 — Three competing command entry points; chrome crowds out content (IA) — **High**
The top bar carries brand + a dev tagline ("Scene-first command platform — local prototype") + three
separate command triggers (`⌘F Search`, `⌘O Go to`, `⌘K Actions`) + View-as + Preview-as + Help +
Pin. The spec wants **one** command palette as the shell utility (`16 §3.4`). Three is fragmented and
confusing. _Evidence: any desktop shot; acute on `cc-mobile.png`._

### IA3 — Mobile: chrome eats the entire first screen, with keyboard shortcuts on a touch device (IA) — **High**
On Pixel 5, the first viewport is *all chrome*: brand, tagline, back/forward, `⌘F Search`, `⌘O Go
to`, `⌘K Actions`, View-as, Preview-as, `?`, "Pin this" — the only "content" below the fold is a
status strip. Keyboard-shortcut glyphs (`⌘F`) are shown on a device with no keyboard. Violates "the
compact profile should not attempt to show the full desktop dashboard… single focused pane"
(`16 §3.3`). _Evidence: `cc-mobile.png`._

### IA4 — Labels leak internal taxonomy and disagree with each other (IA) — **Medium**
Nav says **Party**/**Notes**/**Home**; the pages they open are titled **Characters**/**Knowledge**/
**Command Center** — the same destination is named two ways (hurts information scent, principle #3).
Surfaces print engine jargon and raw IDs to users: "profile: compact", "Mission control profile:
expanded", "local prototype", and — confirmed in the Atlas page markup — `Open at
{map.defaultRegionId}` renders the literal region id (`Open at region-outpost-yard`). These are
content-independent (the template hard-codes the raw value). _Evidence: `atlas-desktop.png`,
`cc-mobile.png`, sidebar in any shot._

### IA5 — Always-on `Alt+N` shortcut chips add permanent visual noise (IA/Visual) — **Low**
Every sidebar item shows its `Alt+1…7` chip at all times (and on mobile, where they're meaningless).
Shortcut hints belong in a help surface / on-focus, not as permanent chrome. _Evidence: any sidebar
shot._

---

## 3. Per-surface notes

- **Command Center (home)** _(populated — auto-seeded)._ The most important surface and the weakest:
  see V1, V2, IA1. It's a dashboard rendered onto a canvas, not a designed live-play cockpit. The
  "Getting started / Finish setting up your vault" card is the only state-distinct element and it
  competes with everything.
- **Atlas** _(populated — 3 maps)._ Content-independent finding: the `map-row` markup has **no
  image/preview affordance at all** — a populated map list renders as underlined text `<a>` links +
  a description line + `Open at {regionId}`. For a spatial/visual domain, a map library with no
  visual map preview in its design (and a raw-ID action label) is a stark "visual design absent"
  example; the spec wants a visual map library (`16 §6.4`).
- **Knowledge** _(empty — no notes)._ Captured empty, so only the New-note form + Search +
  Structured-objects accordion show (the note *list* renders cards — `note-row` / `.scene-card` —
  when notes exist). The content-independent flaw is **V3**: the New-note `Create note` button and
  `Visibility` select are unstyled native controls, and the empty surface leads with forms rather
  than the "writing area should dominate" intent (`16 §6.7`). Re-shoot with a seeded note before
  treating the *list* as designed/undesigned.
- **Session** _(empty — no encounters)._ Captured empty, so the encounter **builder** is all that
  shows; an initiative tracker / current-turn view would appear with combat running. The
  content-independent flaw is **V3**: a raw `<fieldset>`/`<legend>` form with native number inputs
  and a gray default button — wrong register for a live-play **hot path** (spec priority #2) that
  must be glanceable and fast.
- **Characters** _(empty — no party)._ Comparatively the cleanest layout (two clear cards, decent
  serif headers), but still monochrome and form-heavy; the roster claim is empty-state. Note the
  odd IA even when empty: an "Add inventory item" form lives *inside* the Party roster card.

---

## 4. What is actually good (keep these)

- The **token architecture** (`apps/gm/src/routes/styles.css`): semantic tokens, 4px spacing scale,
  type scale, radius/elevation/z/motion tokens, five themes behind one `data-theme` swap. The
  redesign should **re-skin within this system**, not replace it.
- The **shell skeleton & a11y**: single route `h1`, landmarks, skip link, live-region announcer,
  scroll restoration, actor-filtered nav (no-leak). Structurally sound.
- The **IA backbone** (7 global sections + canvas-first) is defensible; the problem is *presentation
  and emphasis*, not the section set — though reconsidering nav labels/density is fair game.

---

## 5. Scope recommendation for the brief

Per design-tool best practice (tight brief > broad), the redesign brief targets the **three
highest-leverage surfaces**, in order:

1. **Command Center (home)** — fixes V1, V2, IA1; defines the emphasis system and mood the rest
   inherits.
2. **A content surface — Knowledge** — fixes V3 and the document-first regression; defines the
   designed-component vocabulary (fields, buttons, lists, editor).
3. **A live-play hot path — Session/Combat** — fixes V3 and proves glanceability under pressure.

Visual language (mood, palette-in-tokens, hierarchy, density) and IA decisions (home composition,
unified command entry, mobile reduction, label cleanup) are **portable** to the Svelte app; the
design tool's React output is a target to port, not ship.
