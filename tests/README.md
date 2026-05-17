# Codeflow Test Suite

## Requirements

- **Node 20** — native modules (`tree-sitter`, `better-sqlite3`) require Node 20. Use `.nvmrc`:
  ```bash
  nvm use
  ```
- **Neo4j** — integration tests require Neo4j running (via Docker)

---

## Running Tests

### Unit + Parser tests (no Docker needed)
```bash
nvm use 20
npm test
```

### Integration tests (requires Neo4j)
```bash
# Terminal 1 — start Neo4j only
docker compose up neo4j

# Terminal 2 — scan to populate graph, then test
npm run scan -- ./src --no-watch
npm test
```

### All tests inside Docker (full suite)
```bash
docker compose run --rm test
```
Scans the target codebase, populates Neo4j, then runs all tests.

### Run one test file
```bash
npm test tests/functionExtraction.test.ts
npm test tests/callsEdges.test.ts
npm test tests/backend/sqlite.test.ts
```

### Skip scan, run tests only (Neo4j already populated)
```bash
docker compose run --rm test npm test
```

---

## Test Files

| File | Needs Neo4j | What it covers |
|---|---|---|
| `functionExtraction.test.ts` | No | Parser extracts correct function names, imports > 0, no modifiers or params as names |
| `callsEdges.test.ts` | Yes | CALLS edges exist in Neo4j, `getNodeRelations` returns correct data, recursive functions don't phantom-link cross-file, `src:folder` bridge node exists |
| `lexicalSearch.test.ts` | No | Lexical scoring tiers: exact 1.0 / startsWith 0.9 / contains 0.75 / path-only 0.25 / none 0.1 |
| `hybridSearch.test.ts` | No | Score fusion (0.65 lex + 0.35 sem), adaptive gap filter (0.9 / 0.75 / 0.55), dedup by (label,path) |
| `backend/sqlite.test.ts` | No | SQLite AST cache, cache records, patterns, statistics |
| `backend/graphApi.test.ts` | No | REST endpoints return correct shape, node relations endpoint |
| `backend/queryEngine.test.ts` | No | QueryEngine methods return expected results; `getFocusedSubgraph` returns correct edge types, no orphans, caps at 30 nodes |
| `frontend/stores.test.ts` | No | Svelte stores update correctly |
| `frontend/Toolbar.test.ts` | No | Toolbar component interactions |

---

## Bug History & Why These Tests Exist

### Function name extraction (fixed 2026-05-16)

**Bug:** `src/parser/treeSitter.ts` used `node.child(1)?.text` to extract function names. For functions with modifiers like `private async function myFunc()`, this returned `async` instead of `myFunc`. Also extracted parameter names (`options`, `functionId`) and class properties (`neo4j`, `sqlite`) as function names.

**Root cause:** Hardcoded child index assumed no modifiers. Class `method_definition` nodes were matched without checking for `formal_parameters`, so class properties were treated as methods.

**Fix:** Use `formal_parameters` as an anchor — scan children before it for the name. Skip `method_definition` nodes that have no `formal_parameters` (those are class properties, not methods).

**Tests that prevent regression:**
- `functionExtraction.test.ts` — runs `parseFile()` against real files and asserts:
  - Names like `runScan`, `getSubgraph`, `hashFile` are present
  - Names like `async`, `private`, `options`, `neo4j` are absent
  - Parse output: functions and imports both `> 0` per file

### CALLS edges empty in NodePanel (fixed 2026-05-16)

**Bug:** Calls/Called By sections in NodePanel were empty even after CALLS edges were created in Neo4j. Two causes:
1. Function names were wrong (see above), so `fnNameIndex` lookups failed
2. Recursive self-calls were excluded: `candidates.find(id => id !== sourceId)` skipped any call where source === target

**Fix:** Allow self-referential CALLS edges when the only candidate is the source itself:
```ts
candidates.find(id => id !== sourceId) ?? (candidates.includes(sourceId) ? sourceId : undefined)
```

**Tests that prevent regression:**
- `callsEdges.test.ts` — queries live Neo4j and asserts:
  - `runScan` node exists and has outgoing CALLS edges
  - Call targets have valid function names (not parameters)
  - Class properties are not present as function nodes
  - Total CALLS edges in graph > 0

### Cross-file phantom CALLS edges (fixed 2026-05-17)

**Bug:** Functions with the same name in different files (e.g. six `visit` functions across `treeSitter.ts` and `astGrep.ts`) were incorrectly wired together. A call to `visit()` inside `treeSitter.ts` would create a CALLS edge to the `visit` node in `astGrep.ts` because `fnNameIndex` matched by name only, globally.

**Root cause:** `src/cli/index.ts` third pass built a name→[fnId] index with no file scope. The first non-self candidate was picked regardless of which file it lived in.

**Fix:** Prefer same-file candidates first; fall back to other files only when no same-file match exists:
```ts
const sameFile = candidates.filter(id => id.startsWith(sourceFileId + ':') && id !== sourceId)
const otherFile = candidates.filter(id => !id.startsWith(sourceFileId + ':') && id !== sourceId)
const targetId = sameFile[0] ?? otherFile[0] ?? (candidates.includes(sourceId) ? sourceId : undefined)
```

**Tests that prevent regression:**
- `callsEdges.test.ts` — `visit in astGrep.ts is only called by functions in the same file`

**Requires rescan:** `docker compose down -v && docker compose up app`

---

### Focused subgraph traversal — wrong edge types and orphan nodes (fixed 2026-05-17)

**Bug:** Clicking a node loaded a generic depth-2 subgraph with all edge types mixed. Functions showed CONTAINS/IMPORTS edges cluttering the call tree. File nodes lost their parent module connection when filtered to IMPORTS only. Orphan nodes (connected only via filtered-out edges) appeared floating with no connections.

**Root cause:** `_handleSelectNode` in `wsServer.ts` did nothing on select; `App.svelte` manually called `loadSubgraph(nodeId, 2)` with no type awareness.

**Fix:** `QueryEngine.getFocusedSubgraph(nodeId)` dispatches by node type:
- `function` → CALLS depth 1 + parent CONTAINS edge (which file owns it)
- `file` → IMPORTS depth 1 + parent CONTAINS edge (which module owns it)
- `module`/`folder` → CONTAINS depth 1

After edge filtering, nodes with no remaining edges are pruned (orphan removal). Result capped at 30 nodes.

**Tests that prevent regression:**
- `backend/queryEngine.test.ts` — six tests covering all node types, orphan removal, and 30-node cap

---

---

### Semantic search module highlighting — false positives (ongoing, 2026-05-17)

**Feature:** When a user types a query in the search bar, the graph highlights matching nodes at whatever LOD is active (modules/files/functions). Results come from cosine similarity against embeddings stored in SQLite (`nomic-embed-text` via Ollama).

**Problem:** At modules LOD, the highlighted modules were wrong. Typing "storage" highlighted `ai` and `ui` modules alongside `storage`. Typing "server" highlighted nothing at all.

**Root cause — score compression:** `nomic-embed-text` cosine similarity scores cluster in a narrow 58–65% band for all results. There is no clean score gap between "relevant" and "adjacent" results, making a fixed threshold unreliable.

**Root cause — false positives in search:** `sqliteVectorStore.ts` (in `ai` module) and `stores.ts` (in `ui` module) both mention storage concepts in their embeddings, so they score ~60% for the query "storage" — similar to the actual `src/storage/` files.

**Root cause — module promotion logic:** The highlight derivation in `App.svelte` promoted every result's parent module to the highlighted set. A single false positive (`sqliteVectorStore.ts`) was enough to light up the entire `ai` module.

**Approaches tried (in order):**

1. **Fixed score threshold (≥65%)** — blocked all results for "server" (all scored 59–60%), highlighted nothing. Rejected.

2. **File-type-only module promotion** — only file nodes (not functions) triggered module highlights. Blocked all module highlights since search returns mostly function nodes. Rejected.

3. **Count-based (≥2 results per module)** — if 2+ results point to the same module, highlight it; lone false positives don't promote their module. Works for "server" (6/10 results from `src/server/`). Works for "storage" (1 result from `ai`, 3+ from `storage`). **Currently in production.**

**Known limitation of count-based approach:** It's a heuristic, not a semantic signal. A query that returns exactly 1 relevant result from the right module won't highlight that module. The real fix is hybrid retrieval (Phase 3 Task 4).

**Fix — hybrid retrieval (Phase 3 Task 4, completed 2026-05-17):**
- `src/ai/lexicalSearch.ts` — Cypher `CONTAINS` query on `label` and `path`, scored by match quality (exact=1.0, startsWith=0.9, contains=0.75, path-only=0.5)
- `src/ai/hybridSearch.ts` — runs lexical + semantic in parallel, merges by nodeId (LEXICAL_WEIGHT=0.65, SEMANTIC_WEIGHT=0.35), deduplicates by (label, path), returns top 10
- `Neo4jDB.searchNodes()` — new method for lexical Cypher query
- Replaces all count/threshold heuristics with a principled two-signal approach
- "server" now scores 0.9× lexical (label startsWith "server") → highlights server module correctly regardless of semantic score distribution

**Duplicate function nodes (fixed 2026-05-17):**

Nested closures with the same name (e.g. five `visit` functions inside `extractImports`, `extractExports`, etc. in `treeSitter.ts`) each got their own graph node, causing duplicates in search results and the graph.

**Fix:** Deduplicate by function name within each file before writing to Neo4j — `seenFnNames` Set resets per file in the scanner loop. First occurrence (lowest line number) wins.

**Self-loop CALLS edges removed (2026-05-17):**

Recursive functions (e.g. `visit` in `astGrep.ts`) created self-loop CALLS edges (`visit → visit`). These showed up in both CALLS and CALLED BY in NodePanel, adding noise.

**Fix:** Removed the self-loop fallback from CALLS resolution:
```ts
// Before
const targetId = sameFile[0] ?? otherFile[0] ?? (candidates.includes(sourceId) ? sourceId : undefined)
// After
const targetId = sameFile[0] ?? otherFile[0]
```

**Planned:** Add `isRecursive: boolean` flag to `FunctionNode` (detect at parse time if `fn.calls` contains `fn.name`) and display it in NodePanel metadata.

---

### `src:folder` bridge node + depth fix (2026-05-17)

**Feature:** Make the `src` directory a real, searchable graph node instead of a UI-only synthetic one. Previously the renderer drew a fake `src:folder` node to bridge the (hidden) project node to modules, but it didn't exist in Neo4j so search could never find it.

**Change:**
- Scanner (`src/cli/index.ts`) now creates a `FolderNode` with id `src:folder` and rewires module CONTAINS edges through it: `Project → src:folder → Module → File → Function`.
- Renderer (`GraphRenderer.svelte`) removed the synthetic node creation + edge rewriting; `src:folder` comes from Neo4j naturally and is forced visible at all LODs.

**Bug introduced + fixed same day:** Functions disappeared from the graph after adding `src:folder`. The hierarchy gained a level (project → src:folder → module → file → function = depth 4), but `App.svelte` was still querying depth=3. Fixed by bumping LOD depth values by 1: `{ modules: 2, files: 3, functions: 4 }`.

**Tests that prevent regression:** `callsEdges.test.ts` — `src:folder node exists` + `src:folder is the parent of modules`.

---

### Recursive call cross-file phantom edge (2026-05-17)

**Bug:** After function name dedup per file, recursive functions created phantom cross-file CALLS edges. Scenario: `treeSitter.ts:visit` calls `visit` (itself). Candidates = `[treeSitter.ts:visit:50, astGrep.ts:visit:56]`. The `sameFile` filter excludes self → empty. The `?? otherFile[0]` fallback then wired the recursive call to `astGrep.ts:visit:56`.

**Fix:** Only fall back to other-file candidates when there are zero same-file candidates (including self). If same-file candidates exist but are all self, the call is recursive — don't link to another file's function.

```ts
const sameFileCandidates = candidates.filter(id => id.startsWith(sourcePath + ':'))
const sameFile = sameFileCandidates.filter(id => id !== sourceId)
const otherFile = candidates.filter(id => !id.startsWith(sourcePath + ':') && id !== sourceId)
const targetId = sameFile[0] ?? (sameFileCandidates.length === 0 ? otherFile[0] : undefined)
```

**Tests:** `callsEdges.test.ts` — `recursive function does NOT create a cross-file phantom CALLS edge` + the existing `visit in astGrep.ts is only called by same-file functions`.

---

### Hybrid search refinement (2026-05-17)

Three iterations of fixing flooded / noisy search results, ending in an adaptive gap filter.

**Iterations:**
1. **Fixed gap filter (top × 0.6)** — works for clear lexical winners but lets semantic noise through when top is also semantic-ish (e.g. "embedder" included `runScan` because it semantically relates to embedding).
2. **Two-tier adaptive (top.lexicalScore ≥ 0.7 → 0.75 else 0.55)** — fixed embedder noise. But "storage" still flooded: the storage module scored 0.65 (1.0 × 0.65 lex weight), threshold 0.49, and `propertiesToNode` / `init` etc. inside `src/storage/` scored ~0.50 (0.5 lex path-match × 0.65 + semantic).
3. **Three-tier + path-match score halved (current)** — when top is an exact label match (lex 1.0) be very strict (0.9 threshold); also lowered path-only match score from 0.5 → 0.25 so storage-folder functions don't compete with the storage module itself.

**Final scoring tiers in `lexicalSearch.ts`:**

| match | score |
|---|---|
| exact label | 1.0 |
| label startsWith | 0.9 |
| label contains | 0.75 |
| path contains only | 0.25 |
| Neo4j CONTAINS matched but neither label nor path | 0.1 |

**Final gap filter in `hybridSearch.ts`:**

| top.lexicalScore | factor | use case |
|---|---|---|
| ≥ 1.0 | 0.9 | exact label match — only same-quality results |
| ≥ 0.7 | 0.75 | strong lexical — cut semantic-only noise |
| else | 0.55 | semantic-only query — keep multiple results |

**Tests:** `lexicalSearch.test.ts` (scoring tiers) + `hybridSearch.test.ts` (fusion, gap filter, dedup).

---

### Search highlight UX evolution (2026-05-17)

The search highlight logic in `App.svelte` went through several iterations as edge cases surfaced. Worth recording so we don't undo a fix.

**Iteration 1 — top-5 + parent-file + parent-module promotion.** Floods unrelated modules. Searching "scanner" lit up the whole `cli` module because multiple functions in `src/cli/scanner.ts` matched.

**Iteration 2 — drop module promotion entirely.** Better, but at modules LOD there was nothing to see when searching for a function/file.

**Iteration 3 — type filter (File/Function/Module) affects graph highlights.** User reported: clicking "File" filter un-highlighted the `types` module they just selected. Filters shouldn't strip user-selected nodes.

**Iteration 4 — type filter affects dropdown only, plus pinned-highlight store.** Clicking a search result calls `setPinnedHighlight(nodeId)`. The pinned node is always included in highlights regardless of filter state. New queries / search clear reset the pin.

**Iteration 5 — repurpose top-right buttons as relationship mode** (Name / Imports / Calls). The old type filter served little purpose after the gap filter shrank dropdown noise. Relationship mode is more useful: type "scanner" + click `Imports` → finds top match `scanner.ts` + returns files that import it.

**Iteration 6 — LOD-aware promotion + hide non-visible nodes.**
- At Functions LOD → no promotion needed (the function is already visible).
- At Files LOD → promote function results to parent file.
- At Modules LOD → promote top result to parent module.
- Hide everything not in `highlighted ∪ 1-hop-neighbors` so the focus area is readable. Bright edges between highlighted nodes (1.5×), bright edges to neighbors (1.1×), no edges between two neighbors.

**Relationship mode subtlety — always include the target.** Initial relationship-mode implementation returned only `importedBy` / `calledBy`. When that was empty, `searchResults` became empty, which dropped highlights, which made the graph fall back to its full non-search LOD view — looked like the graph was "flooded" with IMPORTS edges. Fix: always include the target node itself as the first result, so there's always at least one highlight indicating what was matched.

---

## Adding New Tests

When touching `src/parser/treeSitter.ts`:
1. Add a case to `functionExtraction.test.ts` using a real file from the codebase
2. Assert the expected function name is present and unexpected names are absent

When touching `src/cli/index.ts` (CALLS edge creation):
1. Add an integration test in `callsEdges.test.ts`
2. Run with Neo4j: `docker compose up neo4j && npm run scan -- ./src --no-watch && npm test`
