# Codeflow

A local CLI tool that reads a Node.js / JavaScript / TypeScript codebase, builds a relationship graph, stores it in Neo4j + SQLite, and visualises it in a WebGL UI.

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Parsing, storage, query engine | ✅ Complete |
| 2 | Svelte UI, Sigma.js graph, WebSocket | ✅ Complete |
| 3 | Claude AI integration, natural language search | 🔜 Next |

## Prerequisites

- **Node.js** 20+
- **Neo4j** running locally on `bolt://localhost:7687`

> Install Neo4j Desktop from https://neo4j.com/download or via Homebrew:
> ```bash
> brew install neo4j
> neo4j start
> ```

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and set Neo4j credentials
cp .env.example .env

# 3. Build (optional — only needed for production)
npm run build
```

## Workflow

### Step 1 — Scan a codebase

Point Codeflow at any Node.js / TypeScript project to populate the graph:

```bash
npm run scan ~/path/to/your/project
```

Options:
```bash
npm run scan ~/path/to/project -- --watch   # scan + watch for changes
npm run watch ~/path/to/project             # watch only (no initial scan)
```

### Step 2 — Start the servers

```bash
# Both together (recommended)
npm run dev:all

# Or separately
npm run dev:server   # Express + WebSocket on :5174
npm run dev:ui       # Vite dev server on :5173
```

Then open **http://localhost:5173** in your browser.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run scan <path>` | Scan a project and build the graph |
| `npm run watch <path>` | Watch a project for file changes |
| `npm run dev:all` | Start UI + server together |
| `npm run dev:server` | Start backend only |
| `npm run dev:ui` | Start frontend only |
| `npm run lint` | Run ESLint on all TS and Svelte files |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run type-check` | TypeScript type check without emitting |
| `npm run build` | Production build |
| `npm run clean` | Remove dist and SQLite database |

## Configuration

`codeflow.config.json` in your project root (optional):

```json
{
  "root": "./src",
  "ignore": ["legacy", "vendor"],
  "maxDepth": null,
  "language": null
}
```

## Environment

```bash
NEO4J_URL=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
SQLITE_PATH=./data/codeflow.db
```

## Architecture

See `CLAUDE.md` for full architecture documentation: ID strategy, node/edge types, database schemas, Query Engine API, and phase design.

## License

MIT
