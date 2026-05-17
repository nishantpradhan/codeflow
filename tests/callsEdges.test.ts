import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Neo4jDB } from '../src/storage/neo4j'
import { SQLiteDB } from '../src/storage/sqlite'
import { QueryEngine } from '../src/query/queryEngine'
import { resolve } from 'path'

const NEO4J_URL = process.env.NEO4J_URL || 'bolt://localhost:7687'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password'
const SQLITE_PATH = process.env.SQLITE_PATH || resolve(__dirname, '../data/codeflow.db')

let neo4j: Neo4jDB
let queryEngine: QueryEngine
let skipIntegration = false

beforeAll(async () => {
  try {
    neo4j = new Neo4jDB(NEO4J_URL, NEO4J_USER, NEO4J_PASSWORD)
    const sqlite = new SQLiteDB(SQLITE_PATH)
    queryEngine = new QueryEngine(neo4j, sqlite)
    await neo4j.init()
  } catch {
    skipIntegration = true
    console.warn('⚠  Neo4j not available — skipping integration tests. Run: docker compose run test')
  }
})

afterAll(async () => {
  if (neo4j) await neo4j.close()
})

describe('CALLS Edges — Neo4j Integration', () => {
  it('runScan node exists in graph', async () => {
    if (skipIntegration) return
    const node = await queryEngine.getNode('src/cli/index.ts:runScan:70')
    expect(node).not.toBeNull()
    expect(node!.type).toBe('function')
  })

  it('runScan has outgoing CALLS edges', async () => {
    if (skipIntegration) return
    const relations = await queryEngine.getNodeRelations('src/cli/index.ts:runScan:70')
    expect(relations.calls.length).toBeGreaterThan(0)
  })

  it('graph contains CALLS edges overall', async () => {
    if (skipIntegration) return
    // Verify the scan created CALLS edges — at minimum runScan should call other functions
    const result = await queryEngine.getSubgraph({ nodeId: 'src/cli/index.ts:runScan:70', depth: 1 })
    const callsEdges = result.data.edges.filter(e => e.type === 'CALLS')
    expect(callsEdges.length).toBeGreaterThan(0)
  })

  it('CALLS edge targets have valid function names (not parameters)', async () => {
    if (skipIntegration) return
    const relations = await queryEngine.getNodeRelations('src/cli/index.ts:runScan:70')
    const invalidNames = ['options', 'params', 'nodeId', 'functionId', 'config']

    for (const called of relations.calls) {
      const funcName = called.id.split(':')[1]
      expect(invalidNames).not.toContain(funcName)
    }
  })

  it('class properties are not present as function nodes', async () => {
    if (skipIntegration) return
    const neo4jField = await queryEngine.getNode('src/query/queryEngine.ts:neo4j:18')
    const sqliteField = await queryEngine.getNode('src/query/queryEngine.ts:sqlite:19')
    expect(neo4jField).toBeNull()
    expect(sqliteField).toBeNull()
  })

  it('getNodeRelations returns empty calls for non-function nodes', async () => {
    if (skipIntegration) return
    const relations = await queryEngine.getNodeRelations('src/cli:module')
    expect(relations.calls).toHaveLength(0)
    expect(relations.calledBy).toHaveLength(0)
  })

  it('visit in astGrep.ts is only called by functions in the same file', async () => {
    if (skipIntegration) return
    // visit is defined in multiple files — same-file-first resolution must prevent
    // cross-file phantom edges (astGrep.ts:visit should not show callers from treeSitter.ts)
    const result = await queryEngine.getSubgraph({ nodeId: 'src/parser/astGrep.ts:visit:56', depth: 1, edgeTypes: ['CALLS'] })
    const callerEdges = result.data.edges.filter(e => e.target === 'src/parser/astGrep.ts:visit:56')
    for (const edge of callerEdges) {
      expect(edge.source).toContain('src/parser/astGrep.ts')
    }
  })

  it('total CALLS edges in graph is greater than 0', async () => {
    if (skipIntegration) return
    const result = await queryEngine.getSubgraph({ nodeId: 'src/cli/index.ts:runScan:70', depth: 1 })
    const callsEdges = result.data.edges.filter(e => e.type === 'CALLS')
    expect(callsEdges.length).toBeGreaterThan(0)
  })

  it('recursive function does NOT create a cross-file phantom CALLS edge', async () => {
    if (skipIntegration) return
    // visit in treeSitter.ts calls itself recursively. After dedup there's only one
    // visit node in treeSitter.ts, so sameFile candidates exclude self → empty.
    // The fix: don't fall back to other-file when same-file candidates exist (= self).
    // Pre-fix bug: treeSitter.ts:visit would get a phantom CALLS → astGrep.ts:visit.
    const treeSitterFunctions = await queryEngine.getSubgraph({ nodeId: 'src/parser/treeSitter.ts:file', depth: 1, edgeTypes: ['CONTAINS'] })
    const visitNode = treeSitterFunctions.data.nodes.find(n => n.label === 'visit' && n.path === 'src/parser/treeSitter.ts')
    if (!visitNode) return // file structure changed — skip

    const relations = await queryEngine.getNodeRelations(visitNode.id)
    for (const target of relations.calls) {
      expect(target.path).toBe('src/parser/treeSitter.ts')
    }
  })
})

describe('Graph structure — src:folder bridge', () => {
  it('src:folder node exists', async () => {
    if (skipIntegration) return
    const srcFolder = await queryEngine.getNode('src:folder')
    expect(srcFolder).not.toBeNull()
    expect(srcFolder!.type).toBe('folder')
    expect(srcFolder!.label).toBe('src')
  })

  it('src:folder is the parent of modules (not the project directly)', async () => {
    if (skipIntegration) return
    // With the src:folder bridge: Project → src:folder → Module → File → Function.
    // CLI module's parent should be src:folder.
    const result = await queryEngine.getSubgraph({ nodeId: 'src/cli:module', depth: 1, edgeTypes: ['CONTAINS'] })
    const incoming = result.data.edges.filter(e => e.target === 'src/cli:module')
    const hasSrcFolderParent = incoming.some(e => e.source === 'src:folder')
    expect(hasSrcFolderParent).toBe(true)
  })
})
