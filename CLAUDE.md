# Codeflow — Architecture & Context

> This file is the single source of truth for the Codeflow project.
> Read this fully before writing any code.

---

## What Is Codeflow

A **local CLI tool** that reads a Node.js / JavaScript / TypeScript codebase
from the filesystem, builds a graph of its structure and relationships,
stores it in Neo4j + SQLite, and exposes it via a Query Engine.

It is NOT a web app. It runs entirely on the developer's machine.
Code never leaves the machine except to the Claude/GPT API (Phase 3).

---

## Current Phase — Phase 3

**Build the AI integration layer.**

### Phase 1 scope (✅ COMPLETED)
- ✅ Tree-sitter → parse files into AST
- ✅ ast-grep → extract meaningful patterns
- ✅ SQLite → cache raw AST + core nodes
- ✅ Neo4j → store graph relationships
- ✅ Query Engine → abstraction over both databases
- ✅ File watcher → incremental updates on file change

### Phase 2 scope (✅ COMPLETED)
- ✅ Svelte UI chrome (SPA)
- ✅ WebSocket server for real-time updates
- ✅ Sigma.js WebGL graph rendering
- ✅ Subgraph loading (user clicks node → load neighbors)
- ✅ Node detail panel
- ✅ Search + filtering
- ✅ Dark mode / theme toggle
- ✅ Toolbar (zoom, LOD, theme)
- ✅ Responsive layout

### Phase 3 scope (IN PROGRESS)
- Context builder pipeline
- Claude API integration
- Natural language search bar
- AI enrichment layer (separate from core data)
- Prompt caching for efficient API usage
- Code understanding + suggestions

---

## Folder Structure

```
codeflow/
│
├── shared/
│   └── types.ts                    ✅ DONE
│
├── src/
│   ├── cli/
│   │   ├── index.ts                ✅ DONE
│   │   ├── scanner.ts              ✅ DONE
│   │   └── watcher.ts              ✅ DONE
│   │
│   ├── parser/
│   │   ├── treeSitter.ts           ✅ DONE
│   │   ├── astGrep.ts              ✅ DONE
│   │   ├── hashFile.ts             ✅ DONE
│   │   └── languageDetect.ts       ✅ DONE
│   │
│   ├── storage/
│   │   ├── sqlite.ts               ✅ DONE
│   │   ├── neo4j.ts                ✅ DONE
│   │   └── migrations/
│   │       └── init.sql            ✅ DONE
│   │
│   ├── query/
│   │   └── queryEngine.ts          ✅ DONE
│   │
│   └── ui/                         ← Phase 2
│       ├── App.svelte
│       ├── graph/GraphRenderer.svelte
│       └── ...
│
├── data/                           ← auto created at runtime
│   └── codeflow.db                 ← SQLite database file
│
├── CLAUDE.md                       ← this file
├── .env                            ✅ DONE
├── .env.example                    ✅ DONE
├── .gitignore                      ✅ DONE
├── codeflow.config.json
├── package.json                    ✅ DONE
└── tsconfig.json                   ✅ DONE
```

---

## Build Order — Phase 1 (✅ COMPLETE)

| # | File | Status |
|---|---|---|
| 1 | `shared/types.ts` | ✅ Done |
| 2 | `src/parser/hashFile.ts` | ✅ Done |
| 3 | `src/parser/languageDetect.ts` | ✅ Done |
| 4 | `src/cli/scanner.ts` | ✅ Done |
| 5 | `src/parser/treeSitter.ts` | ✅ Done |
| 6 | `src/parser/astGrep.ts` | ✅ Done |
| 7 | `src/storage/migrations/init.sql` | ✅ Done |
| 8 | `src/storage/sqlite.ts` | ✅ Done |
| 9 | `src/storage/neo4j.ts` | ✅ Done |
| 10 | `src/query/queryEngine.ts` | ✅ Done |
| 11 | `src/cli/watcher.ts` | ✅ Done |
| 12 | `src/cli/index.ts` | ✅ Done |

## Build Order — Phase 2 (✅ COMPLETE)

| # | File | Status |
|---|---|---|
| 1 | `shared/ui-types.ts` | ✅ Done |
| 2 | `src/server/wsServer.ts` | ✅ Done |
| 3 | `src/server/graphApi.ts` | ✅ Done |
| 4 | `src/ui/stores.ts` | ✅ Done |
| 5 | `src/ui/App.svelte` | ✅ Done |
| 6 | `src/ui/GraphRenderer.svelte` | ✅ Done |
| 7 | `src/ui/NodePanel.svelte` | ✅ Done |
| 8 | `src/ui/SearchBar.svelte` | ✅ Done |
| 9 | `src/ui/Toolbar.svelte` | ✅ Done |
| 10 | `src/server/index.ts` | ✅ Done |

---

## Key Architecture Decisions

### IDs — deterministic, never UUID
```
format:  path:name:lineStart
example: src/auth/middleware/authenticate.js:authenticateMiddleware:12

for project/module/folder (no line number):
format:  path:type
example: src/auth:module
```

### Node Types — V1 only (5 types)
```
project    → one per repo
module     → top level domain folder
folder     → subdirectory
file       → source file
function   → function or method
```
Do NOT add Route, Model, Config, Test nodes yet. That is V2.

### Edge Types — V1 only (4 types)
```
CONTAINS   → structural hierarchy
IMPORTS    → file imports file
CALLS      → function calls function
EXTENDS    → class extends class
```
Do NOT add QUERIES, GUARDS, TESTS edges yet. That is V2.

### Core data vs AI data — strictly separated
```
Core node  → structural data from parser (stable)
AI layer   → enrichment stored separately (recomputable)
```
Never mix description, complexity, tags into core node interfaces.
AI enrichment types will be added in Phase 3 only.

### No redundant reverse edges
```
❌ calledBy: string[]   on FunctionNode  — DELETE if seen
✅ Query Neo4j instead: MATCH (f)<-[:CALLS]-(caller) RETURN caller
```
Never store what the graph can derive.

### Lazy loading — strict rule
```
Load ONLY what user clicks
NEVER prefetch level 2-5 until user is on level 1
NEVER load children until parent is clicked
```

### Node visibility — never hide visited nodes
```
Once a node is visible → always visible
Collapse = hide children temporarily, parent stays visible
Re-expanding collapsed node = instant, no API call
```

### Graph chunking — LOD per zoom (Phase 2)
```
Zoom level 1  →  modules only        ~5-10 nodes
Zoom level 2  →  files               ~50-100 nodes
Zoom level 3  →  functions           ~500 nodes
Zoom level 4  →  detail + neighbours
```

### Context builder pipeline (Phase 3)
```
1. Input (user query)
2. Query graph via Query Engine
3. Select relevant nodes
4. Rank by relevance score
5. Trim to token budget (8,000 tokens)
6. Build prompt
```
This is the moat of the product. Build it last, on real data.

---

## Phase 2 Architecture — Visualization Layer

### Backend (Express/WebSocket)
```
src/server/
├── index.ts              ← Express app + WebSocket server
├── graphApi.ts           ← REST API for graph queries
├── wsServer.ts           ← WebSocket handlers for real-time updates
└── middleware/
    └── auth.ts           ← user/session (if needed)
```

### Frontend (SvelteKit)
```
src/ui/
├── App.svelte            ← main layout + router
├── routes/
│   ├── +page.svelte      ← graph view
│   └── +layout.svelte    ← app shell
├── components/
│   ├── GraphRenderer.svelte   ← Sigma.js wrapper
│   ├── NodePanel.svelte       ← detail view on selection
│   ├── SearchBar.svelte       ← search + filter
│   ├── Toolbar.svelte         ← zoom, layout, settings
│   └── ThemeToggle.svelte     ← dark mode
└── stores.ts             ← Svelte stores (selected node, zoom level, etc.)
```

### Data Flow
```
User Action (click node)
    ↓
Svelte Store update
    ↓
GraphRenderer re-renders
    ↓
On zoom/pan: fetch neighboring nodes via REST
    ↓
WebSocket pushes updates (file changes in real-time)
    ↓
Sigma.js re-layout + animate
```

### Sigma.js Integration
```
- Nodes: colored by type (project=blue, file=green, function=orange)
- Edges: thickness = weight (stronger connections = thicker)
- Hover: highlight neighbors
- Click: select node → open detail panel → load level 2
- Zoom: LOD rendering (hide functions when zoomed out)
- Double-click: center camera on node
- Drag: pan canvas
```

### Phase 2 Exit Criteria (✅ COMPLETE)

```
✅ UI renders graph from Neo4j
✅ Click node → load neighbors (subgraph query)
✅ Search + filtering infrastructure in place
✅ Real-time updates via WebSocket
✅ Dark mode toggle works
✅ Graph rendering with Sigma.js
✅ Responsive layout (desktop/mobile)
✅ Zoom controls + LOD switching
✅ Node detail panel with incoming/outgoing edges
✅ Toolbar with all controls
✅ WebSocket server running
✅ REST API endpoints for graph queries
✅ SvelteKit app structure
✅ All 10 Phase 2 files implemented
```

### Node Detail Panel (✅ COMPLETE)

**What it does:** When user clicks a node on the graph, a right-side panel opens showing:
- **Metadata** — node type, path, language, line count, flags (exported/async/method)
- **Code Preview** — actual source code excerpt for function nodes (reads from filesystem)
- **Relationships**:
  - **Calls** — functions this function calls (CALLS edges outgoing)
  - **Called By** — functions that call this function (CALLS edges incoming)
  - **Imports** — files this file imports (IMPORTS edges outgoing)
  - **Imported By** — files that import this file (IMPORTS edges incoming)

**Architecture:**

Backend (`src/server/graphApi.ts`):
- `GET /api/graph/node/:nodeId` endpoint
- Uses `queryEngine.getNodeRelations(nodeId)` to fetch typed relationships
- Reads source file and extracts code lines for functions
- Returns: `{ node, calls, calledBy, imports, importedBy, codePreview }`

QueryEngine (`src/query/queryEngine.ts`):
- `getNodeRelations(nodeId)` — separates CALLS from IMPORTS edges
- Uses `getSubgraph({ nodeId, depth: 1, edgeTypes })` to filter by edge type
- Returns: `{ calls, calledBy, imports, importedBy }` as `GraphNode[]` arrays

Frontend (`src/ui/components/NodePanel.svelte`):
- Displays metadata grid dynamically based on node type
- Shows code preview in `<pre><code>` block (dark theme, monospace, scrollable)
- Renders each relationship section only when non-empty
- Clicking neighbors triggers navigation (re-selects that node)

**Data requirements:**
- Graph must have IMPORTS edges (file→file imports) — created by scanner
- Graph must have CALLS edges (function→function calls) — created by scanner
- Source files must be readable from filesystem (for code preview)

**Known limitations:**
- Only shows 1-hop relationships (direct imports/calls only)
- Module/folder nodes don't have direct IMPORTS — only files do
- Code preview requires source file access (skips silently if file not found)

### Phase 3 Exit Criteria

Do not ship until ALL of these pass:

```
⬜ Context builder tokenizes graph nodes
⬜ Claude API integration with caching
⬜ Natural language search (find by description)
⬜ AI suggestions for related code
⬜ Conversation history in sidebar
⬜ Code generation within context
⬜ Streaming responses from API
⬜ Token budget display
⬜ Search by intent ("what calls this?", "where is auth?")
```

---

## Tech Stack

### Phase 1 (✅ COMPLETE)
| Tool | Purpose |
|---|---|
| TypeScript | language throughout |
| Node.js 20+ | runtime |
| tree-sitter | AST parsing |
| tree-sitter-javascript | JS grammar |
| tree-sitter-typescript | TS grammar |
| @ast-grep/napi | pattern extraction |
| better-sqlite3 | SQLite driver |
| neo4j-driver | Neo4j driver |
| chokidar | file watching |
| chalk | terminal colors |
| ora | terminal spinner |
| commander | CLI argument parsing |
| glob | file pattern matching |
| dotenv | env variables |

### Phase 2
| Tool | Purpose |
|---|---|
| Svelte 4 | UI components |
| SvelteKit | meta-framework (SSR, routing, etc.) |
| Sigma.js | WebGL graph rendering |
| WebSocket (ws) | real-time updates |
| Vite | build tool |
| Tailwind CSS | styling |
| D3.js (optional) | advanced layout algorithms |

### Phase 3 (not started)
| Tool | Purpose |
|---|---|
| Claude API | enrichment + search |
| Streaming API | real-time AI responses |
| Context Builder | token budget management |

---

## Environment Variables

```bash
# .env
NEO4J_URL=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
SQLITE_PATH=./data/codeflow.db
```

---

## Neo4j Schema — V1

### Node labels
```cypher
(:Project)
(:Module)
(:Folder)
(:File)
(:Function)
```

### Relationship types
```cypher
(:Project)  -[:CONTAINS]->  (:Module)
(:Module)   -[:CONTAINS]->  (:Folder)
(:Module)   -[:CONTAINS]->  (:File)
(:Folder)   -[:CONTAINS]->  (:File)
(:File)     -[:CONTAINS]->  (:Function)
(:File)     -[:IMPORTS]->   (:File)
(:Function) -[:CALLS]->     (:Function)
(:Function) -[:EXTENDS]->   (:Function)
```

### Constraints
```cypher
CREATE CONSTRAINT ON (n:Project)  ASSERT n.id IS UNIQUE;
CREATE CONSTRAINT ON (n:Module)   ASSERT n.id IS UNIQUE;
CREATE CONSTRAINT ON (n:Folder)   ASSERT n.id IS UNIQUE;
CREATE CONSTRAINT ON (n:File)     ASSERT n.id IS UNIQUE;
CREATE CONSTRAINT ON (n:Function) ASSERT n.id IS UNIQUE;
```

---

## SQLite Schema — V1

```sql
-- core parsed file data
CREATE TABLE ast_cache (
  path        TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  ast_json    TEXT NOT NULL,
  parsed_at   DATETIME NOT NULL,
  language    TEXT NOT NULL
);

-- extracted patterns from ast-grep
CREATE TABLE patterns (
  id          TEXT PRIMARY KEY,
  file_path   TEXT NOT NULL,
  pattern     TEXT NOT NULL,
  name        TEXT NOT NULL,
  line_start  INTEGER,
  line_end    INTEGER
);

-- cache record per node
CREATE TABLE cache_records (
  path        TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  node_id     TEXT NOT NULL,
  parsed_at   DATETIME NOT NULL
);
```

---

## Query Engine API — V1

```typescript
// All DB access goes through QueryEngine
// Nothing talks to Neo4j or SQLite directly

queryEngine.getSubgraph(nodeId, depth, edgeTypes?)
queryEngine.getDependencies(fileId)
queryEngine.getDependents(nodeId, depth?)
queryEngine.getCallGraph(fnId, depth?)
queryEngine.getCircularDeps()
queryEngine.getDeadCode()
queryEngine.getMostConnected(limit)
```

---

## Default Ignore List

```
node_modules, dist, build, .git, .next,
coverage, .cache, __pycache__, .turbo, out, tmp
```

User can extend via `codeflow.config.json`:
```json
{
  "root": "./src",
  "ignore": ["legacy", "vendor"]
}
```

---

## Phase 1 Exit Criteria (✅ COMPLETE)

```
✅ CLI runs on a real Node.js project
✅ SQLite populated with core nodes + AST cache
✅ Neo4j has correct nodes and relationships
✅ Query Engine returns correct call graph
✅ File change triggers partial update only (not full rebuild)
✅ Re-run CLI on unchanged project → zero re-parse (all cache hits)
✅ Deterministic IDs — same file always generates same node ID
✅ No UUID anywhere in the codebase
✅ All 12 Phase 1 files implemented and typed
✅ package.json, tsconfig.json, .env configured
```
