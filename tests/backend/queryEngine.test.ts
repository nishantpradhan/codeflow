import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryEngine } from '../../src/query/queryEngine'
import type { SubGraph, GraphNode } from '../../shared/types'

const makeNode = (id: string, type = 'file'): GraphNode => ({
  id: id as any,
  type: type as any,
  label: id.split('/').pop() ?? id,
  name: id.split('/').pop() ?? id,
  path: id,
  isExported: false,
  isMethod: false
})

const makeSubgraph = (rootId: string, nodes: GraphNode[] = [], edges: any[] = []): SubGraph => ({
  rootId: rootId as any,
  depth: 1,
  nodes: nodes.length ? nodes : [makeNode(rootId)],
  edges
})

const mockNeo4j = {
  getSubgraph: vi.fn(),
  getDependencies: vi.fn(),
  getDependents: vi.fn(),
  getCallGraph: vi.fn(),
  getCircularDeps: vi.fn(),
  getMostConnected: vi.fn(),
  getNode: vi.fn(),
  getNodesByType: vi.fn()
}

const mockSqlite = {
  getASTCacheStats: vi.fn(),
  getPatternStats: vi.fn()
}

describe('QueryEngine', () => {
  let engine: QueryEngine

  beforeEach(() => {
    vi.clearAllMocks()
    engine = new QueryEngine(mockNeo4j as any, mockSqlite as any)
  })

  // ── getSubgraph ────────────────────────────────────────────────

  describe('getSubgraph', () => {
    it('returns nodes and edges from neo4j', async () => {
      const nodes = [makeNode('src/auth.ts'), makeNode('src/db.ts')]
      const edges = [{ source: 'src/auth.ts', target: 'src/db.ts', type: 'IMPORTS', weight: 1 }]
      mockNeo4j.getSubgraph.mockResolvedValue({ nodes, edges })

      const result = await engine.getSubgraph({ nodeId: 'src/auth.ts' as any, depth: 1 })

      expect(result.data.nodes).toHaveLength(2)
      expect(result.data.edges).toHaveLength(1)
      expect(result.data.rootId).toBe('src/auth.ts')
      expect(result.fromCache).toBe(false)
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('filters edges by type when edgeTypes is specified', async () => {
      const edges = [
        { source: 'a', target: 'b', type: 'IMPORTS', weight: 1 },
        { source: 'b', target: 'c', type: 'CALLS', weight: 1 },
        { source: 'c', target: 'd', type: 'IMPORTS', weight: 1 }
      ]
      mockNeo4j.getSubgraph.mockResolvedValue({ nodes: [], edges })

      const result = await engine.getSubgraph({
        nodeId: 'a' as any,
        depth: 2,
        edgeTypes: ['IMPORTS' as any]
      })

      expect(result.data.edges).toHaveLength(2)
      expect(result.data.edges.every(e => e.type === 'IMPORTS')).toBe(true)
    })

    it('returns all edges when edgeTypes is empty', async () => {
      const edges = [
        { source: 'a', target: 'b', type: 'IMPORTS', weight: 1 },
        { source: 'b', target: 'c', type: 'CALLS', weight: 1 }
      ]
      mockNeo4j.getSubgraph.mockResolvedValue({ nodes: [], edges })

      const result = await engine.getSubgraph({ nodeId: 'a' as any, depth: 1, edgeTypes: [] })
      expect(result.data.edges).toHaveLength(2)
    })
  })

  // ── getDependencies ────────────────────────────────────────────

  describe('getDependencies', () => {
    it('returns dependency IDs from neo4j', async () => {
      mockNeo4j.getDependencies.mockResolvedValue(['src/db.ts', 'src/utils.ts'])

      const result = await engine.getDependencies('src/auth.ts' as any)

      expect(mockNeo4j.getDependencies).toHaveBeenCalledWith('src/auth.ts')
      expect(result.data).toEqual(['src/db.ts', 'src/utils.ts'])
    })

    it('returns empty array when file has no dependencies', async () => {
      mockNeo4j.getDependencies.mockResolvedValue([])

      const result = await engine.getDependencies('src/leaf.ts' as any)
      expect(result.data).toHaveLength(0)
    })
  })

  // ── getDependents ──────────────────────────────────────────────

  describe('getDependents', () => {
    it('returns dependent IDs', async () => {
      mockNeo4j.getDependents.mockResolvedValue(['src/app.ts', 'src/server.ts'])

      const result = await engine.getDependents({ nodeId: 'src/db.ts' as any, depth: 1 })

      expect(mockNeo4j.getDependents).toHaveBeenCalledWith('src/db.ts', 1)
      expect(result.data).toHaveLength(2)
    })

    it('defaults depth to 1 when not provided', async () => {
      mockNeo4j.getDependents.mockResolvedValue([])

      await engine.getDependents({ nodeId: 'src/db.ts' as any })

      expect(mockNeo4j.getDependents).toHaveBeenCalledWith('src/db.ts', 1)
    })
  })

  // ── getCallGraph ───────────────────────────────────────────────

  describe('getCallGraph', () => {
    it('returns only CALLS edges', async () => {
      const edges = [
        { source: 'fn:a', target: 'fn:b', type: 'CALLS', weight: 1 },
        { source: 'fn:a', target: 'fn:c', type: 'EXTENDS', weight: 1 }
      ]
      mockNeo4j.getCallGraph.mockResolvedValue({ nodes: [], edges })

      const result = await engine.getCallGraph('fn:a' as any, 2)

      expect(result.data.edges).toHaveLength(1)
      expect(result.data.edges[0].type).toBe('CALLS')
    })

    it('defaults to depth 2', async () => {
      mockNeo4j.getCallGraph.mockResolvedValue({ nodes: [], edges: [] })

      await engine.getCallGraph('fn:main' as any)

      expect(mockNeo4j.getCallGraph).toHaveBeenCalledWith('fn:main', 2)
    })
  })

  // ── getCircularDeps ────────────────────────────────────────────

  describe('getCircularDeps', () => {
    it('returns cycles from neo4j', async () => {
      const cycles = [['src/a.ts', 'src/b.ts', 'src/a.ts']]
      mockNeo4j.getCircularDeps.mockResolvedValue(cycles)

      const result = await engine.getCircularDeps()

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveLength(3)
    })

    it('returns empty array when no cycles', async () => {
      mockNeo4j.getCircularDeps.mockResolvedValue([])
      const result = await engine.getCircularDeps()
      expect(result.data).toHaveLength(0)
    })
  })

  // ── getMostConnected ───────────────────────────────────────────

  describe('getMostConnected', () => {
    it('returns ranked nodes from neo4j', async () => {
      const ranked = [
        { id: 'src/db.ts', connectionCount: 15 },
        { id: 'src/utils.ts', connectionCount: 8 }
      ]
      mockNeo4j.getMostConnected.mockResolvedValue(ranked)

      const result = await engine.getMostConnected(5)

      expect(mockNeo4j.getMostConnected).toHaveBeenCalledWith(5)
      expect(result.data).toHaveLength(2)
      expect(result.data[0].connectionCount).toBe(15)
    })

    it('defaults to limit 10', async () => {
      mockNeo4j.getMostConnected.mockResolvedValue([])
      await engine.getMostConnected()
      expect(mockNeo4j.getMostConnected).toHaveBeenCalledWith(10)
    })
  })

  // ── getNode ────────────────────────────────────────────────────

  describe('getNode', () => {
    it('returns a node by ID', async () => {
      const node = makeNode('src/auth.ts')
      mockNeo4j.getNode.mockResolvedValue(node)

      const result = await engine.getNode('src/auth.ts' as any)

      expect(result).toEqual(node)
      expect(mockNeo4j.getNode).toHaveBeenCalledWith('src/auth.ts')
    })

    it('returns null for unknown node', async () => {
      mockNeo4j.getNode.mockResolvedValue(null)
      const result = await engine.getNode('nonexistent' as any)
      expect(result).toBeNull()
    })
  })

  // ── getCacheStats ──────────────────────────────────────────────

  describe('getCacheStats', () => {
    it('aggregates stats from sqlite', async () => {
      mockSqlite.getASTCacheStats.mockReturnValue({ totalRecords: 3, totalBytes: 4096 })
      mockSqlite.getPatternStats.mockReturnValue({ totalPatterns: 12, patternTypes: 4 })

      const stats = await engine.getCacheStats()

      expect(stats.astCacheSize).toBe(4096)
      expect(stats.patternCount).toBe(12)
    })
  })

  // ── getRootProject ─────────────────────────────────────────────

  describe('getRootProject', () => {
    it('returns null when no project nodes exist', async () => {
      mockNeo4j.getNodesByType.mockResolvedValue([])
      const result = await engine.getRootProject()
      expect(result).toBeNull()
    })

    it('queries subgraph for the first project node', async () => {
      const projectNode = makeNode('myapp:project', 'project')
      mockNeo4j.getNodesByType.mockResolvedValue([projectNode])
      mockNeo4j.getSubgraph.mockResolvedValue({ nodes: [projectNode], edges: [] })

      const result = await engine.getRootProject(2)

      expect(mockNeo4j.getNodesByType).toHaveBeenCalledWith('project')
      expect(mockNeo4j.getSubgraph).toHaveBeenCalledWith('myapp:project', 2)
      expect(result).not.toBeNull()
      expect(result!.rootId).toBe('myapp:project')
    })
  })
})
