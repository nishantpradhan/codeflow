# Codeflow

A local CLI tool that reads a Node.js / JavaScript / TypeScript codebase, builds a graph of its structure and relationships, stores it in Neo4j + SQLite, and exposes it via a Query Engine.

## Architecture

Codeflow is built in three phases:

### Phase 1 — Foundation (✅ COMPLETE)
- File scanning with intelligent ignore patterns
- AST parsing with tree-sitter (JavaScript & TypeScript)
- Pattern extraction with ast-grep
- SQLite caching for fast rebuilds
- Neo4j graph storage with 5 node types and 4 edge types
- Query Engine for graph traversal
- File watcher for incremental updates

### Phase 2 — Visualization (IN PROGRESS)
- WebGL graph rendering with Sigma.js
- Svelte UI with interactive exploration
- Real-time updates via WebSocket
- Search and filtering
- Level-of-Detail (LOD) rendering

### Phase 3 — AI Integration (Not Started)
- Claude API integration for natural language search
- Context builder for token-efficient prompts
- Code understanding enrichment layer

## Quick Start

### Prerequisites
- Node.js 20+
- Neo4j running locally (or update `.env` with remote URL)
- SQLite (built-in)

### Installation
```bash
npm install
npm run build
```

### Usage

#### Scan a project
```bash
npm run scan ~/path/to/project
```

#### Watch for changes
```bash
npm run scan ~/path/to/project -- --watch
```

#### Just watch (no initial scan)
```bash
npm run watch ~/path/to/project
```

### Configuration

Create `codeflow.config.json` in your project root:
```json
{
  "root": "./src",
  "ignore": ["legacy", "vendor"],
  "maxDepth": null,
  "language": null
}
```

### Environment

Copy `.env.example` to `.env` and update with your Neo4j credentials:
```bash
NEO4J_URL=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

## Development

### Type checking
```bash
npm run type-check
```

### Clean up
```bash
npm run clean
```

## Architecture Files

See `CLAUDE.md` for complete architecture documentation, including:
- ID generation strategy (deterministic, never UUID)
- Node and edge types
- Database schemas (Neo4j and SQLite)
- Query Engine API
- Phase 2 and Phase 3 design

## License

MIT
