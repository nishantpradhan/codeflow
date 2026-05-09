# Phase 1 + 2 Integration Guide

This guide shows how to run the full Codeflow stack: CLI scanner + backend API + SvelteKit frontend.

## Prerequisites

1. **Node.js 20+** installed
2. **Neo4j** running locally (Docker recommended)
3. **Port 5173** (frontend) and **5174** (backend) available

## Quick Start

### 1. Start Neo4j (Docker)
```bash
docker run -d \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest
```

### 2. Scan a Project
```bash
npm run scan ~/path/to/nodejs/project
```

This will:
- Scan the filesystem
- Parse files with tree-sitter
- Extract patterns with ast-grep
- Store in SQLite cache
- Build graph in Neo4j

### 3. Start Backend Server
```bash
npm run dev:server
```

Server runs on **http://localhost:5174**

Endpoints available:
- `GET /api/health` — server status
- `GET /api/graph/subgraph/:nodeId` — fetch subgraph
- `GET /api/graph/node/:nodeId` — node details
- `GET /api/graph/dependencies/:fileId` — file dependencies
- `WS /ws` — real-time graph updates

### 4. Start Frontend (separate terminal)
```bash
npm run dev:ui
```

Frontend runs on **http://localhost:5173**

Open in browser → connects to backend API automatically

### 5. Test Integration
1. Click on nodes in the graph
2. Sidebar shows incoming/outgoing connections
3. Modify a file in the scanned project
4. Watch -> file changes push to UI in real-time

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  SvelteKit Frontend                 │
│         (Sigma.js graph + React controls)           │
│  Port: 5173 • Talks to backend via REST + WebSocket │
└─────────────────┬───────────────────────────────────┘
                  │ REST API + WebSocket
                  │
┌─────────────────┴───────────────────────────────────┐
│              Express Backend Server                 │
│  Port: 5174 • GraphQL-like API • WebSocket handler  │
└─────────────────┬───────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
   ┌────▼────┐         ┌───▼────┐
   │   Neo4j │         │ SQLite │
   │  Graph  │         │  Cache │
   └─────────┘         └────────┘
```

---

## Phase 1: CLI Scanner

The scanner is independent and runs before the backend:

```bash
npm run scan ~/your-project --watch
```

This:
1. Reads filesystem
2. Detects language (JS/TS)
3. Parses with tree-sitter
4. Extracts patterns with ast-grep
5. Stores in SQLite + Neo4j
6. Watches for changes (incremental updates)

---

## File Structure

```
codeflow/
├── src/
│   ├── cli/              # Phase 1 - CLI scanner & watcher
│   ├── parser/           # Phase 1 - AST parsing
│   ├── storage/          # Phase 1 - Database drivers
│   ├── query/            # Phase 1 - Query engine
│   ├── server/           # Phase 2 - Express + WebSocket
│   ├── ui/               # Phase 2 - Svelte components
│   └── routes/           # SvelteKit routes
├── shared/               # Shared TypeScript types
├── svelte.config.js      # SvelteKit config
├── vite.config.ts        # Vite build config
└── index.html            # SvelteKit entry point
```

---

## Troubleshooting

**Frontend can't connect to backend?**
- Check backend is running: `http://localhost:5174/api/health`
- Check proxy config in `vite.config.ts`
- Check CORS headers in `src/server/index.ts`

**Neo4j connection fails?**
- Ensure Neo4j is running: `docker ps | grep neo4j`
- Check credentials in `.env`: NEO4J_USER, NEO4J_PASSWORD
- Try: `bolt://localhost:7687` in `.env`

**SQLite locked?**
- Delete old database: `npm run clean`
- Rescan project: `npm run scan ~/project`

**Graph not rendering?**
- Check browser console for errors
- Verify WebSocket connection: DevTools → Network → ws://localhost:5174/ws
- Ensure Sigma.js is loaded

---

## Next Steps

Once stable:
- Run on a large Node.js project
- Test file watch + incremental updates
- Verify Neo4j graph structure
- Profile performance
- Then move to Phase 3 (AI integration)
