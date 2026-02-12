# Testing Strategy

This document defines the testing approach, tooling, conventions, and coverage requirements for DND Tools.

---

## Testing Philosophy

1. **Test behavior, not implementation**: Tests verify what the code does, not how it does it. Refactoring internals should not break tests.
2. **Test at the right level**: Use the cheapest test that gives confidence. Unit tests for logic, integration tests for storage, E2E tests for critical user flows.
3. **Tests as documentation**: A well-named test suite describes the system's behavior. New developers should be able to understand a module by reading its tests.
4. **Fast feedback**: The full unit test suite must run in < 10 seconds. Slow tests kill developer productivity.

---

## Testing Pyramid

```
         ╱╲
        ╱  ╲       E2E Tests (Playwright)
       ╱    ╲      - Critical user journeys
      ╱──────╲     - 10-20 tests
     ╱        ╲
    ╱          ╲   Integration Tests (Vitest)
   ╱            ╲  - Storage, markdown pipeline, services
  ╱──────────────╲ - 30-50 tests
 ╱                ╲
╱                  ╲ Unit Tests (Vitest)
╱────────────────────╲ - Utils, pure functions, stores, plugins
                       - 100+ tests
```

| Level        | Tool       | Scope                              | Speed   | Count  |
| ------------ | ---------- | ---------------------------------- | ------- | ------ |
| Unit         | Vitest     | Pure functions, utilities, stores  | < 5s    | Many   |
| Integration  | Vitest     | Storage layer, markdown pipeline   | < 10s   | Medium |
| Component    | Vitest + @testing-library/svelte | UI components | < 10s | Medium |
| E2E          | Playwright | Full user flows in browser         | < 60s   | Few    |
| MCP          | Vitest     | MCP tools, FileSystemAdapter       | < 10s   | Medium |

---

## Tooling

### Vitest (Unit + Integration + Component)

**Why Vitest**:
- Native Vite integration — same config, same transforms, same aliases (`$lib/`)
- Jest-compatible API — familiar `describe`, `it`, `expect` syntax
- Built-in TypeScript support — no separate compilation step
- Fast — uses Vite's module system for instant transforms
- Built-in code coverage via v8 or istanbul

**Configuration** (`vitest.config.ts` or in `vite.config.ts`):
```typescript
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'jsdom', // For component tests
    globals: true,        // Allows describe/it/expect without import
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/lib/**'],
      exclude: ['src/lib/types/**', '**/*.test.ts'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

### Playwright (E2E)

**Why Playwright**:
- Tests run in real browsers (Chromium, Firefox, WebKit)
- Excellent IndexedDB support — critical for testing our storage layer
- Auto-waiting reduces flaky tests
- Mobile viewport emulation for responsive testing
- Trace viewer for debugging failures

**Configuration** (`playwright.config.ts`):
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
```

### @testing-library/svelte (Component Tests)

- User-centric queries: `getByRole`, `getByText`, `getByLabelText`
- Discourages testing implementation details
- Pairs with Vitest for the test runner

---

## Test Organization

### File Structure

```
src/
├── lib/
│   ├── utils/
│   │   ├── slug.ts
│   │   └── slug.test.ts          # Co-located unit test
│   ├── markdown/
│   │   ├── pipeline.ts
│   │   ├── pipeline.test.ts      # Co-located unit test
│   │   └── plugins/
│   │       ├── wikilinks.ts
│   │       └── wikilinks.test.ts # Co-located unit test
│   ├── storage/
│   │   ├── adapter.ts
│   │   └── adapter.test.ts       # Integration test (uses fake-indexeddb)
│   └── stores/
│       ├── notes.ts
│       └── notes.test.ts         # Store behavior test
mcp/
├── storage.test.ts               # FileSystemAdapter integration tests
├── tools.test.ts                 # MCP tool handler tests
└── test-helpers.ts               # MCP test client factory
tests/
├── unit/                         # Unit tests not co-located with source
│   └── ...
├── e2e/                          # Playwright E2E tests
│   ├── note-crud.spec.ts
│   ├── note-linking.spec.ts
│   ├── search.spec.ts
│   └── navigation.spec.ts
├── fixtures/                     # Shared test data
│   ├── notes.ts                  # Sample note objects
│   └── markdown-samples.ts       # Sample markdown strings
└── helpers/                      # Shared test utilities
    ├── storage-mock.ts           # Mock storage adapter
    └── render-helpers.ts         # Component rendering helpers
```

### Naming Conventions

- **Unit/integration test files**: `*.test.ts` (co-located with source)
- **E2E test files**: `*.spec.ts` (in `tests/e2e/`)
- **Test descriptions**: Use present-tense sentences describing behavior

```typescript
describe('slug utility', () => {
  it('converts spaces to hyphens', () => { ... });
  it('removes special characters', () => { ... });
  it('handles empty strings gracefully', () => { ... });
});

describe('NoteStore', () => {
  describe('creating a note', () => {
    it('generates a unique ID', () => { ... });
    it('sets createdAt and updatedAt to current time', () => { ... });
    it('persists the note to storage', () => { ... });
  });

  describe('deleting a note', () => {
    it('soft-deletes by setting deleted flag', () => { ... });
    it('preserves the note in storage for recovery', () => { ... });
  });
});
```

---

## Test Categories & Requirements

### Unit Tests

**What to test**:
- All functions in `$lib/utils/`
- All remark/rehype plugins in `$lib/markdown/plugins/`
- Store logic (state transitions, derived computations)
- Type guard functions
- Data transformation and formatting functions

**What NOT to unit test**:
- Svelte template rendering (use component tests)
- IndexedDB operations (use integration tests)
- Navigation flows (use E2E tests)
- Simple type definitions or constants

**Patterns**:

```typescript
// Testing a pure utility function
import { slugify } from '$lib/utils/slug';

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('my note title')).toBe('my-note-title');
  });

  it('removes non-alphanumeric characters', () => {
    expect(slugify("Barthen's Provisions!")).toBe('barthens-provisions');
  });

  it('collapses consecutive hyphens', () => {
    expect(slugify('hello---world')).toBe('hello-world');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });
});
```

### Integration Tests

**What to test**:
- `IndexedDBAdapter` CRUD operations (using `fake-indexeddb`)
- Full markdown pipeline (input → output)
- Search indexing and querying
- Link extraction and graph building

**Setup for IndexedDB tests**:

```typescript
import 'fake-indexeddb/auto'; // Polyfill IndexedDB in Node
import { IndexedDBAdapter } from '$lib/storage/adapter';

describe('IndexedDBAdapter', () => {
  let adapter: IndexedDBAdapter;

  beforeEach(async () => {
    adapter = new IndexedDBAdapter();
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
    // Clear the fake IndexedDB between tests
    indexedDB.deleteDatabase('dndtools');
  });

  it('saves and retrieves a note', async () => {
    const note = createTestNote({ title: 'Test Note' });
    await adapter.saveNote(note);
    const retrieved = await adapter.getNote(note.id);
    expect(retrieved).toEqual(note);
  });

  it('returns null for non-existent note', async () => {
    const result = await adapter.getNote('non-existent' as NoteId);
    expect(result).toBeNull();
  });
});
```

### Component Tests

**What to test**:
- Component renders correct content for given props
- User interactions trigger expected events
- Conditional rendering based on state
- Accessibility attributes (roles, labels)

**Patterns**:

```typescript
import { render, screen, fireEvent } from '@testing-library/svelte';
import NoteCard from '$lib/components/common/NoteCard.svelte';

describe('NoteCard', () => {
  const note = createTestNote({ title: 'Dragon Encounter', folder: '/sessions' });

  it('displays the note title', () => {
    render(NoteCard, { props: { note } });
    expect(screen.getByText('Dragon Encounter')).toBeInTheDocument();
  });

  it('displays the folder path', () => {
    render(NoteCard, { props: { note } });
    expect(screen.getByText('/sessions')).toBeInTheDocument();
  });

  it('fires select event on click', async () => {
    const { component } = render(NoteCard, { props: { note } });
    const handler = vi.fn();
    component.$on('select', handler);

    await fireEvent.click(screen.getByRole('article'));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('has accessible article role', () => {
    render(NoteCard, { props: { note } });
    expect(screen.getByRole('article')).toBeInTheDocument();
  });
});
```

### E2E Tests

**What to test**:
- Critical user journeys only (high-value, high-risk flows)
- Multi-step interactions that cross component/page boundaries
- Behavior that depends on browser APIs (IndexedDB, routing)

**Core E2E test scenarios**:

| Test                       | What it covers                                            |
| -------------------------- | --------------------------------------------------------- |
| Note CRUD flow             | Create → edit → save → view → delete → restore            |
| Note linking               | Create link → click link → verify backlink                |
| Search                     | Create notes → search → verify results                    |
| Navigation                 | Sidebar nav → breadcrumbs → back/forward → quick switcher |
| Import/Export              | Export vault → clear data → import → verify               |
| Responsive layout          | Mobile viewport → sidebar drawer → bottom nav             |
| Offline functionality      | Create note → go offline → edit → verify persistence      |
| Theme switching            | Toggle dark mode → verify styles persist across reload    |

**Example E2E test**:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Note CRUD', () => {
  test('creates, edits, and views a note', async ({ page }) => {
    await page.goto('/');

    // Create a new note
    await page.click('[data-testid="new-note-button"]');
    await page.fill('[data-testid="note-title-input"]', 'Goblin Ambush');
    await page.fill('.cm-content', '# Encounter Details\n\nThe goblins attack at dawn.');

    // Wait for auto-save
    await expect(page.locator('[data-testid="save-status"]')).toHaveText(/saved/i);

    // Navigate away and back
    await page.click('[data-testid="home-link"]');
    await page.click('text=Goblin Ambush');

    // Verify content
    await expect(page.locator('h1')).toContainText('Encounter Details');
    await expect(page.locator('main')).toContainText('The goblins attack at dawn.');
  });
});
```

### MCP Server Tests

**What to test**:
- `FileSystemAdapter` CRUD operations (using a temporary directory)
- MCP tool handlers (input validation, correct delegation to storage/services)
- Link extraction and indexing on note create/update via MCP
- Search integration (notes created via MCP are searchable)
- Error handling (missing notes, invalid input, filesystem errors)

**Setup for FileSystemAdapter tests**:

```typescript
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystemAdapter } from '../mcp/storage';

describe('FileSystemAdapter', () => {
  let adapter: FileSystemAdapter;
  let vaultDir: string;

  beforeEach(async () => {
    vaultDir = await mkdtemp(join(tmpdir(), 'dndtools-test-'));
    adapter = new FileSystemAdapter(vaultDir);
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
    await rm(vaultDir, { recursive: true });
  });

  it('saves a note as a markdown file with frontmatter', async () => {
    const note = createTestNote({ title: 'Test Note', folder: '/' as FolderId });
    await adapter.saveNote(note);
    const retrieved = await adapter.getNote(note.id);
    expect(retrieved?.title).toBe('Test Note');
  });

  it('resolves wikilinks by title', async () => {
    const note = createTestNote({ title: 'Phandalin' });
    await adapter.saveNote(note);
    const resolved = await adapter.resolveTitle('Phandalin');
    expect(resolved?.id).toBe(note.id);
  });
});
```

**MCP tool handler tests**:

```typescript
import { createMcpTestClient } from '../mcp/test-helpers';

describe('MCP create_note tool', () => {
  it('creates a note and returns its ID', async () => {
    const client = await createMcpTestClient();
    const result = await client.callTool('create_note', {
      title: 'Goblin Ambush',
      content: '# Encounter\n\nThe goblins attack at dawn.',
      tags: ['encounter', 'combat'],
    });
    expect(result.noteId).toBeDefined();

    const note = await client.callTool('read_note', { id: result.noteId });
    expect(note.title).toBe('Goblin Ambush');
  });

  it('extracts wikilinks on creation', async () => {
    const client = await createMcpTestClient();
    await client.callTool('create_note', {
      title: 'Session 1',
      content: 'The party visited [[Phandalin]].',
    });
    const backlinks = await client.callTool('get_backlinks', { title: 'Phandalin' });
    expect(backlinks).toHaveLength(1);
  });
});
```

---

## Test Data

### Fixtures

Shared test data lives in `tests/fixtures/`:

```typescript
// tests/fixtures/notes.ts
import type { FolderId, Note, NoteId } from '$lib/types/note';

export function createTestNote(overrides: Partial<Note> = {}): Note {
  return {
    id: `test-${crypto.randomUUID()}` as NoteId,
    title: 'Test Note',
    content: '# Test Note\n\nThis is a test note.',
    folder: '/' as FolderId,
    tags: [],
    frontmatter: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deleted: false,
    deletedAt: null,
    ...overrides,
  };
}

export const sampleNotes = {
  npc: createTestNote({
    title: 'Barthen',
    content: '# Barthen\n\nOwner of [[Barthens Provisions]] in [[Phandalin]].',
    tags: ['npc', 'phandalin'],
  }),
  location: createTestNote({
    title: 'Phandalin',
    content: '# Phandalin\n\nA small frontier town. Home to [[Barthen]] and [[Sildar]].',
    tags: ['location', 'town'],
  }),
  session: createTestNote({
    title: 'Session 1',
    content: '# Session 1\n\nThe party arrived in [[Phandalin]] and met [[Barthen]].',
    tags: ['session'],
  }),
};
```

### Markdown Samples

```typescript
// tests/fixtures/markdown-samples.ts
export const markdownSamples = {
  basic: '# Hello World\n\nThis is a paragraph.',
  withWikilinks: 'Visit [[Phandalin]] and talk to [[Barthen]].',
  withFrontmatter: '---\ntitle: Test\ntags: [npc]\n---\n\n# Content',
  withGfm: '| Name | HP |\n|------|----|\n| Goblin | 7 |',
  withCode: '```javascript\nconsole.log("hello");\n```',
  withCallout: '> [!note] DM Note\n> Secret information here.',
  maliciousXss: '# Hello <script>alert("xss")</script>',
  complex: `---
title: Complex Note
tags: [test, example]
---

# Complex Note

This note links to [[Other Note|another note]] and has:

- A list
- With **bold** and *italic*
- And a [[Broken Link]]

> A blockquote

\`\`\`python
def hello():
    print("world")
\`\`\`

| Column 1 | Column 2 |
|----------|----------|
| Data     | More     |
`,
};
```

---

## Mocking Strategy

### Storage Mock

```typescript
// tests/helpers/storage-mock.ts
import type { StorageAdapter } from '$lib/storage/types';

export function createMockStorage(
  initialNotes: Note[] = []
): StorageAdapter {
  const notes = new Map(initialNotes.map(n => [n.id, n]));

  return {
    async getNote(id) { return notes.get(id) ?? null; },
    async getAllNotes() { return [...notes.values()]; },
    async saveNote(note) { notes.set(note.id, note); },
    async deleteNote(id) { notes.delete(id); },
    // ... implement remaining methods
    async initialize() {},
    async close() {},
  };
}
```

### External Dependency Mocking

- Mock `crypto.randomUUID` for deterministic test IDs
- Mock `Date.now` for deterministic timestamps (use `vi.useFakeTimers()`)
- Mock `matchMedia` for theme tests in JSDOM environment
- Use `fake-indexeddb` for storage integration tests

---

## Coverage Requirements

### Thresholds

| Metric      | Minimum | Target |
| ----------- | ------- | ------ |
| Statements  | 80%     | 90%    |
| Branches    | 75%     | 85%    |
| Functions   | 80%     | 90%    |
| Lines       | 80%     | 90%    |

### Coverage Priorities

**Must be well-tested (≥ 90%)**:
- `$lib/storage/` — Data persistence is critical
- `$lib/markdown/plugins/` — Incorrect parsing corrupts user content
- `$lib/utils/` — Pure functions are easy to test thoroughly
- `$lib/services/` — Business logic must be correct
- `mcp/` — MCP tools and FileSystemAdapter handle user data

**Should be tested (≥ 70%)**:
- `$lib/stores/` — State management logic
- `$lib/components/` — Key interactive components

**Excluded from coverage**:
- `$lib/types/` — Type-only files
- `src/routes/` — Route pages (tested via E2E)
- Configuration files

---

## CI Integration

### GitHub Actions Workflow

```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test -- --coverage
      - run: pnpm build

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

### CI Requirements for Merge

All of these must pass before a PR can merge:
1. ESLint — zero errors
2. TypeScript — zero type errors
3. Unit tests — all passing
4. Coverage — meets minimum thresholds
5. E2E tests — all passing
6. Build — produces valid output

---

## Running Tests

```bash
# All unit/integration tests (single run)
pnpm test

# Unit/integration tests (watch mode)
pnpm test:watch

# Unit/integration tests with coverage
pnpm test -- --coverage

# Run a specific test file
pnpm test src/lib/utils/slug.test.ts

# Run tests matching a pattern
pnpm test -- -t "wikilink"

# E2E tests (all browsers)
pnpm test:e2e

# E2E tests (specific browser)
pnpm test:e2e -- --project=chromium

# E2E tests (headed mode for debugging)
pnpm test:e2e -- --headed

# E2E tests (specific file)
pnpm test:e2e tests/e2e/note-crud.spec.ts

# Full validation suite (lint + typecheck + test + build)
pnpm check
```
