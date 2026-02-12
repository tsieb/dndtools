# Technology Stack

This document details every technology choice for DND Tools, the rationale behind each decision, and the constraints that guided the selection.

---

## Primary Constraint: Lightweight Performance

The app must load and run well on weak devices — budget Android tablets, older Chromebooks, low-RAM laptops. Every technology choice is filtered through this constraint:

- **Initial JS bundle**: < 100KB gzipped
- **Time to interactive**: < 2 seconds on 3G / low-end device
- **Runtime memory**: < 50MB for a vault of 500 notes
- **No heavy frameworks**: Ruled out React (40KB+), Angular (100KB+), and most UI libraries

---

## Framework: SvelteKit

**Choice**: [SvelteKit](https://kit.svelte.dev/) (Svelte 5; runes are optional and can be adopted incrementally)

**Why Svelte**:
- **No runtime**: Svelte compiles components to vanilla JavaScript at build time. Zero framework overhead at runtime. The "framework" disappears in production.
- **Tiny output**: A typical Svelte component compiles to ~2-5KB. Comparable React components are 10-20KB+ with runtime.
- **Reactive by default**: Fine-grained reactivity without virtual DOM diffing. Only the exact DOM nodes that change get updated. This is critical for performance on weak devices.
- **Built-in stores**: Lightweight, subscribe-based state management included. No need for Redux, Zustand, or other state libraries.
- **Simple mental model**: Templates look like HTML. Logic is plain JavaScript. Low learning curve for future contributors.

**Why SvelteKit (not just Svelte)**:
- **File-based routing**: Routes map to file structure. No router configuration.
- **Code splitting**: Automatic per-route code splitting out of the box.
- **SSR/SSG/SPA modes**: Local-first target is SPA mode (`adapter-static`). Can switch to SSR when cloud features are added.
- **Built on Vite**: Fast HMR, modern build pipeline, excellent plugin ecosystem.

**Alternatives considered**:
| Alternative  | Reason rejected                                                   |
| ------------ | ----------------------------------------------------------------- |
| React + Next | 40KB+ runtime; virtual DOM overhead; heavier bundles              |
| Preact       | Smaller React, but still has virtual DOM; ecosystem gaps          |
| SolidJS      | Good performance, but smaller ecosystem and less mature tooling   |
| Astro        | Great for content sites, but weaker for app-like interactivity    |
| Vanilla JS   | No component model; would reinvent too much                       |

---

## Language: TypeScript

**Choice**: TypeScript 5.x in strict mode

**Configuration** (key tsconfig settings):
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Why strict TypeScript**:
- Catches entire categories of bugs at compile time
- Self-documenting code via types
- Excellent editor support (autocomplete, refactoring)
- Essential for AI-assisted development — agents can reason about types
- Svelte has first-class TypeScript support

---

## Styling: Tailwind CSS v4

**Choice**: [Tailwind CSS v4](https://tailwindcss.com/)

**Why Tailwind**:
- **Zero unused CSS**: Tailwind v4 scans source files and generates only the classes used. Production CSS is typically 5-15KB gzipped.
- **No CSS-in-JS runtime**: Unlike styled-components or Emotion, Tailwind adds no JavaScript. Pure CSS.
- **Consistent design system**: Spacing, colors, and typography are constrained to a design token scale. Prevents visual inconsistency.
- **Responsive + dark mode**: Built-in responsive breakpoints and dark mode variant.
- **Co-located styling**: Classes live in the template, right next to the structure. No context-switching between files.
- **v4 improvements**: CSS-first configuration, automatic content detection, native cascade layers.

**Design tokens to define** (in `tailwind.config.ts` or CSS `@theme`):
- Color palette: D&D-thematic (parchment, ink, leather, gold accents)
- Font stack: System fonts only (no web font downloads) with a serif option for note content
- Spacing scale: Default Tailwind scale (4px base)
- Border radius: Subtle rounding (4px default)

**Alternatives considered**:
| Alternative       | Reason rejected                                           |
| ----------------- | --------------------------------------------------------- |
| Plain CSS/SCSS    | No design system enforcement; inconsistency risk          |
| CSS Modules       | Good scoping, but no utility system; more boilerplate     |
| UnoCSS            | Similar to Tailwind but less ecosystem/documentation      |
| styled-components | Runtime CSS-in-JS; adds JS bundle weight                  |

---

## Markdown Processing: unified Ecosystem

**Choice**: [unified](https://unifiedjs.com/) with remark (markdown) and rehype (HTML)

**Pipeline packages**:

| Package              | Role                                    | Size (min) |
| -------------------- | --------------------------------------- | ---------- |
| `unified`            | Pipeline orchestrator                   | ~3KB       |
| `remark-parse`       | Markdown → mdast (AST)                  | ~15KB      |
| `remark-stringify`   | mdast → Markdown (for round-tripping)   | ~5KB       |
| `remark-gfm`         | Tables, strikethrough, task lists       | ~3KB       |
| `remark-frontmatter` | YAML frontmatter parsing                | ~1KB       |
| `remark-rehype`      | mdast → hast (HTML AST) bridge          | ~2KB       |
| `rehype-stringify`   | hast → HTML string                      | ~3KB       |
| `rehype-sanitize`    | Sanitize output HTML (XSS prevention)   | ~2KB       |
| `rehype-slug`        | Auto-ID headings (for anchor links)     | ~1KB       |
| Custom plugin        | `[[wikilink]]` parsing and resolution   | ~1KB       |

**Why unified**:
- **Modular**: Only include the plugins you need. Each is a small, focused package.
- **AST-based**: Transforms operate on a structured tree, not string manipulation. Reliable and composable.
- **Extensible**: Adding new syntax (e.g., `[[wikilinks]]`, custom callouts) is a matter of writing a remark plugin.
- **Battle-tested**: Used by MDX, Gatsby, Docusaurus, and thousands of projects.
- **Two-way**: Can parse markdown to AST and serialize AST back to markdown. Useful for programmatic note manipulation.

**Alternatives considered**:
| Alternative    | Reason rejected                                              |
| -------------- | ------------------------------------------------------------ |
| marked         | Fast but string-based; no AST; hard to extend safely         |
| markdown-it    | Plugin system exists but less composable than unified         |
| Showdown       | Older, less maintained, no AST                               |
| MDX            | Overkill — we don't need JSX in markdown                     |

---

## Editor: CodeMirror 6

**Choice**: [CodeMirror 6](https://codemirror.net/)

**Why CodeMirror 6**:
- **Same engine as Obsidian**: Users familiar with Obsidian will feel at home. Proven for markdown editing.
- **Modular**: Import only the extensions you need. A minimal editor is ~30KB gzipped.
- **Mobile support**: Excellent touch/mobile input handling (important for tablet users).
- **Extensible**: Custom keybindings, syntax highlighting, autocomplete, and decorations via a clean extension API.
- **Accessible**: Built-in ARIA support, screen reader compatibility.
- **Performance**: Viewport-based rendering. Handles documents with thousands of lines smoothly.

**Extensions to use**:
- `@codemirror/lang-markdown` — Markdown syntax highlighting and structure
- `@codemirror/autocomplete` — `[[wikilink]]` completion for note titles
- `@codemirror/search` — Find and replace within a note
- `@codemirror/view` — Decorations for live preview (render links, images inline)
- Custom extension — Wikilink detection, click-to-navigate

**Loading strategy**: CodeMirror is lazy-loaded — only fetched when the user enters edit mode. The viewer uses pre-rendered HTML from the markdown pipeline, not CodeMirror.

**Alternatives considered**:
| Alternative    | Reason rejected                                               |
| -------------- | ------------------------------------------------------------- |
| ProseMirror    | More powerful for rich text, but more complex setup for markdown |
| Monaco (VSCode)| Extremely heavy (~2MB); designed for code, not prose          |
| Tiptap         | Built on ProseMirror; adds weight without clear benefit here  |
| Plain textarea | Too limited for syntax highlighting, autocomplete, etc.       |

---

## Local Storage: IndexedDB via Dexie.js

**Choice**: [Dexie.js](https://dexie.org/) (IndexedDB wrapper)

**Why IndexedDB**:
- **Large capacity**: Can store hundreds of MB (vs. localStorage's 5-10MB limit)
- **Structured data**: Supports indexes, compound queries, and cursor-based iteration
- **Async**: Non-blocking API doesn't freeze the UI during reads/writes
- **Available everywhere**: Supported in all modern browsers including mobile

**Why Dexie.js**:
- **Ergonomic API**: Promise-based, clean querying syntax. Raw IndexedDB API is verbose and error-prone.
- **Schema versioning**: Built-in migration system for schema changes between app versions.
- **Tiny**: ~17KB minified. Acceptable given the value it provides.
- **Transactions**: Automatic transaction management prevents data corruption.
- **Observable**: Dexie's liveQuery integrates with Svelte stores for reactive data binding.

**Alternatives considered**:
| Alternative         | Reason rejected                                         |
| ------------------- | ------------------------------------------------------- |
| Raw IndexedDB       | Verbose, error-prone, poor DX                           |
| localStorage        | 5-10MB limit; synchronous (blocks UI); string-only      |
| OPFS (Origin Private FS) | Limited browser support; overkill for structured data |
| SQLite (WASM)       | ~500KB WASM binary; too heavy for initial load           |
| PouchDB             | Includes CouchDB sync we don't need yet; larger         |

---

## Search: MiniSearch

**Choice**: [MiniSearch](https://lucaong.github.io/minisearch/)

**Why**:
- **Tiny**: ~7KB minified. Purpose-built for client-side full-text search.
- **Fast**: Indexes thousands of documents in milliseconds. Searches return in < 10ms.
- **Fuzzy search**: Tolerant of typos — critical for user-facing search.
- **Customizable**: Field boosting (title matches rank higher than body), custom tokenizers.
- **No server**: Runs entirely in the browser.

**Index fields**: `title` (boost: 3), `content` (boost: 1), `tags` (boost: 2), `folder` (boost: 1)

**Alternatives considered**:
| Alternative  | Reason rejected                                  |
| ------------ | ------------------------------------------------ |
| Lunr.js      | Similar but slightly larger and less maintained   |
| Fuse.js      | Fuzzy matching only; no full-text indexing        |
| FlexSearch   | Fast, but larger API surface and bundle size      |

---

## MCP Integration: Model Context Protocol SDK

**Choice**: [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)

**Why MCP**:
- **Standard protocol**: MCP is the emerging standard for connecting AI agents to external tools and data. Supported by Claude Code, Cursor, Windsurf, VS Code Copilot, and other agentic tools.
- **Structured tool access**: Exposes note CRUD, search, and linking as typed tools that AI assistants can call reliably — no fragile prompt-based file manipulation.
- **Resource subscriptions**: Agents can subscribe to note content and vault structure as MCP resources, enabling context-aware assistance.
- **Transport flexibility**: Supports stdio (for local CLI tools) and SSE (for network-accessible servers). Start with stdio, add SSE when cloud features arrive.
- **TypeScript-first**: The official SDK is TypeScript, matching the project stack.

**Why a dedicated MCP server (not just filesystem access)**:
- AI tools reading raw files miss the link graph, search index, and metadata layer
- The MCP server enforces the same data integrity rules as the web app (link extraction, frontmatter parsing, search indexing)
- Structured tools are more reliable than asking an agent to write markdown files correctly
- MCP resources provide curated context (vault structure, backlinks) that raw files cannot

**Alternatives considered**:
| Alternative              | Reason rejected                                          |
| ------------------------ | -------------------------------------------------------- |
| Raw filesystem access    | No link graph, no search, no validation, fragile         |
| Custom REST API          | Non-standard; each AI tool needs a custom integration    |
| Language Server Protocol | Designed for code editors, not note/data management      |

---

## Testing

### Unit Tests: Vitest

**Choice**: [Vitest](https://vitest.dev/)

- Native Vite integration (same config, same transforms)
- Jest-compatible API (familiar syntax)
- Fast: uses Vite's module system, no separate compilation step
- Built-in TypeScript support

### E2E Tests: Playwright

**Choice**: [Playwright](https://playwright.dev/)

- Multi-browser testing (Chromium, Firefox, WebKit)
- Excellent for testing IndexedDB-backed apps
- Auto-waiting, reliable selectors
- Supports mobile viewport emulation (critical for our use case)

### Component Tests: Vitest + @testing-library/svelte

- Test Svelte components in a JSDOM environment
- User-centric testing philosophy (test behavior, not implementation)

---

## Package Manager: pnpm

**Choice**: [pnpm](https://pnpm.io/)

**Why**:
- **Strict**: Prevents phantom dependencies (packages that work by accident because a dependency's dependency happens to be hoisted). Catches issues early.
- **Fast**: Content-addressable storage means packages are downloaded once globally and hard-linked into projects.
- **Disk-efficient**: Shared store prevents duplicating packages across projects.
- **Lockfile**: Deterministic installs via `pnpm-lock.yaml`.

---

## Linting & Formatting

### ESLint (Flat Config)

- `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` for TypeScript
- `eslint-plugin-svelte` for Svelte component linting
- Flat config format (eslint.config.js) — modern, composable

### Prettier

- Consistent code formatting across all files
- Integrated with ESLint via `eslint-config-prettier` (disables conflicting rules)
- Format on save in editor; format check in CI

**Key Prettier settings**:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [
    { "files": "*.svelte", "options": { "parser": "svelte" } }
  ]
}
```

---

## Build & Deploy

### Vite (via SvelteKit)

- Used implicitly through SvelteKit
- Development: instant HMR, sub-second rebuilds
- Production: tree-shaking, minification, code splitting, asset hashing

### SvelteKit Adapter: adapter-static

- For the current local-first phase, the app is a static SPA
- Outputs to a `build/` directory: `index.html` + hashed JS/CSS chunks
- Can be served from any static file server, CDN, or `file://` protocol
- When server features are needed, swap to `adapter-node` or `adapter-auto`

### CI/CD (future)

- GitHub Actions for: lint, typecheck, test, build, deploy
- Deploy target: Cloudflare Pages, Netlify, or Vercel (all have generous free tiers for static sites)

---

## Dependency Budget

To enforce the lightweight constraint, all dependencies are tracked against a budget:

| Category         | Budget (min+gzip) | Current estimate |
| ---------------- | ------------------ | ---------------- |
| Framework        | 0KB (compiled)     | 0KB              |
| Markdown pipeline| 25KB               | ~20KB            |
| Editor (lazy)    | 40KB               | ~30KB            |
| Storage (Dexie)  | 10KB               | ~8KB             |
| Search           | 5KB                | ~4KB             |
| Utilities        | 5KB                | ~2KB             |
| CSS (Tailwind)   | 10KB               | ~8KB             |
| **Total initial**| **< 100KB**        | **~42KB**        |

Note: CodeMirror editor is lazy-loaded and excluded from the initial bundle budget.

The MCP server runs as a separate Node.js process and does **not** contribute to the browser bundle. Its dependencies (`@modelcontextprotocol/sdk`, `chokidar` for file watching) are Node.js-only and excluded from the budget above.

**Adding new dependencies**:
1. Check size on [bundlephobia.com](https://bundlephobia.com)
2. If > 20KB minified, document the justification
3. Consider if a lighter alternative or custom implementation exists
4. If it's only needed for one feature, ensure it's lazy-loaded
