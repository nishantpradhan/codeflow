import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createGraphRouter } from '../../src/server/graphApi'
import type { SubGraph, GraphNode } from '../../shared/types'

const makeNode = (id: string, type = 'file', label?: string): GraphNode => ({
  id: id as any,
  type: type as any,
  label: label ?? id,
  name: label ?? id,
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

const mockEngine = {
  getSubgraph: vi.fn(),
  getNode: vi.fn(),
  getDependencies: vi.fn(),
  getDependents: vi.fn(),
  getCallGraph: vi.fn(),
  getCircularDeps: vi.fn(),
  getDeadCode: vi.fn(),
  getMostConnected: vi.fn(),
  getRootProject: vi.fn()
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/graph', createGraphRouter(mockEngine as any))
  return app
}

describe('Graph API', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildApp()
  })

  // ── GET /subgraph/:nodeId ──────────────────────────────────────

  describe('GET /api/graph/subgraph/:nodeId', () => {
    it('returns 200 with sigma-formatted data', async () => {
      const nodes = [makeNode('src/auth.ts', 'file', 'auth.ts')]
      const edges = [{ source: 'src/auth.ts', target: 'src/db.ts', type: 'IMPORTS', weight: 1 }]
      mockEngine.getSubgraph.mockResolvedValue({
        data: makeSubgraph('src/auth.ts', nodes, edges),
        fromCache: false,
        durationMs: 5
      })

      const res = await request(app).get('/api/graph/subgraph/src%2Fauth.ts')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.sigma.nodes).toHaveLength(1)
      expect(res.body.data.sigma.nodes[0].label).toBe('auth.ts')
      expect(res.body.data.sigma.nodes[0].color).toBeDefined()
      expect(res.body.data.sigma.edges).toHaveLength(1)
    })

    it('uses depth query param', async () => {
      mockEngine.getSubgraph.mockResolvedValue({
        data: makeSubgraph('src/auth.ts'),
        fromCache: false,
        durationMs: 5
      })

      await request(app).get('/api/graph/subgraph/src%2Fauth.ts?depth=3')

      expect(mockEngine.getSubgraph).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 3 })
      )
    })

    it('defaults to depth 2 when not provided', async () => {
      mockEngine.getSubgraph.mockResolvedValue({
        data: makeSubgraph('src/auth.ts'),
        fromCache: false,
        durationMs: 5
      })

      await request(app).get('/api/graph/subgraph/src%2Fauth.ts')

      expect(mockEngine.getSubgraph).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 2 })
      )
    })

    it('returns 400 when query engine throws', async () => {
      mockEngine.getSubgraph.mockRejectedValue(new Error('Neo4j timeout'))

      const res = await request(app).get('/api/graph/subgraph/bad-node')

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.message).toBe('Neo4j timeout')
      expect(res.body.error.code).toBe('SUBGRAPH_ERROR')
    })
  })

  // ── GET /node/:nodeId ──────────────────────────────────────────

  describe('GET /api/graph/node/:nodeId', () => {
    it('returns node details with incoming and outgoing edges', async () => {
      const node = makeNode('src/db.ts', 'file', 'db.ts')
      mockEngine.getNode.mockResolvedValueOnce(node)
      mockEngine.getDependents.mockResolvedValue({ data: ['src/auth.ts'], fromCache: false, durationMs: 1 })
      mockEngine.getDependencies.mockResolvedValue({ data: ['node_modules/pg'], fromCache: false, durationMs: 1 })
      mockEngine.getNode
        .mockResolvedValueOnce(makeNode('src/auth.ts', 'file', 'auth.ts'))
        .mockResolvedValueOnce(makeNode('node_modules/pg', 'file', 'pg'))

      const res = await request(app).get('/api/graph/node/src%2Fdb.ts')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.node.id).toBe('src/db.ts')
      expect(res.body.data.neighbors.incoming).toHaveLength(1)
      expect(res.body.data.neighbors.outgoing).toHaveLength(1)
    })

    it('returns 404 when node is not found', async () => {
      mockEngine.getNode.mockResolvedValue(null)

      const res = await request(app).get('/api/graph/node/missing-node')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })
  })

  // ── GET /dependencies/:fileId ──────────────────────────────────

  describe('GET /api/graph/dependencies/:fileId', () => {
    it('returns resolved dependency nodes', async () => {
      mockEngine.getDependencies.mockResolvedValue({
        data: ['src/utils.ts', 'src/config.ts'],
        fromCache: false,
        durationMs: 2
      })
      mockEngine.getNode
        .mockResolvedValueOnce(makeNode('src/utils.ts', 'file', 'utils.ts'))
        .mockResolvedValueOnce(makeNode('src/config.ts', 'file', 'config.ts'))

      const res = await request(app).get('/api/graph/dependencies/src%2Fauth.ts')

      expect(res.status).toBe(200)
      expect(res.body.data.dependencies).toHaveLength(2)
      expect(res.body.data.fileId).toBe('src/auth.ts')
    })

    it('returns empty array when no dependencies', async () => {
      mockEngine.getDependencies.mockResolvedValue({ data: [], fromCache: false, durationMs: 1 })

      const res = await request(app).get('/api/graph/dependencies/src%2Fleaf.ts')

      expect(res.status).toBe(200)
      expect(res.body.data.dependencies).toHaveLength(0)
    })
  })

  // ── GET /circular-deps ─────────────────────────────────────────

  describe('GET /api/graph/circular-deps', () => {
    it('returns detected cycles', async () => {
      mockEngine.getCircularDeps.mockResolvedValue({
        data: [['src/a.ts', 'src/b.ts', 'src/a.ts']],
        fromCache: false,
        durationMs: 3
      })

      const res = await request(app).get('/api/graph/circular-deps')

      expect(res.status).toBe(200)
      expect(res.body.data.cycles).toHaveLength(1)
      expect(res.body.data.count).toBe(1)
    })

    it('returns count 0 when no cycles', async () => {
      mockEngine.getCircularDeps.mockResolvedValue({ data: [], fromCache: false, durationMs: 1 })

      const res = await request(app).get('/api/graph/circular-deps')

      expect(res.body.data.count).toBe(0)
    })
  })

  // ── GET /most-connected ────────────────────────────────────────

  describe('GET /api/graph/most-connected', () => {
    it('returns nodes ranked by connection count', async () => {
      mockEngine.getMostConnected.mockResolvedValue({
        data: [
          { id: 'src/db.ts', connectionCount: 20 },
          { id: 'src/utils.ts', connectionCount: 10 }
        ],
        fromCache: false,
        durationMs: 4
      })
      mockEngine.getNode
        .mockResolvedValueOnce(makeNode('src/db.ts', 'file', 'db.ts'))
        .mockResolvedValueOnce(makeNode('src/utils.ts', 'file', 'utils.ts'))

      const res = await request(app).get('/api/graph/most-connected?limit=5')

      expect(res.status).toBe(200)
      expect(mockEngine.getMostConnected).toHaveBeenCalledWith(5)
      expect(res.body.data.nodes).toHaveLength(2)
      expect(res.body.data.nodes[0].connectionCount).toBe(20)
    })
  })

  // ── GET /root ──────────────────────────────────────────────────

  describe('GET /api/graph/root', () => {
    it('returns sigma-formatted root subgraph', async () => {
      const subgraph = makeSubgraph('myapp:project', [makeNode('myapp:project', 'project', 'myapp')])
      mockEngine.getRootProject.mockResolvedValue(subgraph)

      const res = await request(app).get('/api/graph/root?depth=1')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.sigma.nodes[0].color).toBe('#3b82f6') // project color
      expect(mockEngine.getRootProject).toHaveBeenCalledWith(1)
    })

    it('returns 404 when no project node exists', async () => {
      mockEngine.getRootProject.mockResolvedValue(null)

      const res = await request(app).get('/api/graph/root')

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NO_PROJECT')
    })
  })

  // ── POST /search ───────────────────────────────────────────────

  describe('POST /api/graph/search', () => {
    it('returns empty results (Phase 2 placeholder)', async () => {
      const res = await request(app)
        .post('/api/graph/search')
        .send({ query: 'authenticate', type: 'function', limit: 10 })

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(0)
      expect(res.body.data.totalCount).toBe(0)
    })
  })

  // ── Sigma conversion: labels, colors, sizes, edges ───────────

  describe('sigma conversion', () => {
    const nodeTypes = ['project', 'module', 'folder', 'file', 'function']
    const expectedColors: Record<string, string> = {
      project: '#3b82f6',
      module: '#06b6d4',
      folder: '#8b5cf6',
      file: '#10b981',
      function: '#f59e0b'
    }
    const expectedSizes: Record<string, number> = {
      project: 10,
      module: 8,
      folder: 6,
      file: 5,
      function: 4
    }

    describe('node labels', () => {
      it.each(nodeTypes)('maps label for %s nodes', async type => {
        const labelText = type === 'project' ? 'myapp' : type === 'module' ? 'auth' : type === 'folder' ? 'handlers' : type === 'function' ? 'authenticate' : 'index.ts'
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('root', [makeNode('root', type, labelText)]),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/root')

        expect(res.body.data.sigma.nodes[0].label).toBe(labelText)
      })

      it('maps node label directly to sigma label', async () => {
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('src/auth.ts', [makeNode('src/auth.ts', 'file', 'auth.ts')]),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/src%2Fauth.ts')

        expect(res.body.data.sigma.nodes[0].label).toBe('auth.ts')
      })

      it('preserves the full label string including dots and slashes', async () => {
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('root', [makeNode('root', 'file', 'user.service.ts')]),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/root')

        expect(res.body.data.sigma.nodes[0].label).toBe('user.service.ts')
      })

      it('maps labels for every node in a multi-node subgraph', async () => {
        const nodes = [
          makeNode('src/a.ts', 'file', 'a.ts'),
          makeNode('src/b.ts', 'file', 'b.ts'),
          makeNode('src/c.ts', 'file', 'c.ts')
        ]
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('src/a.ts', nodes),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/src%2Fa.ts')

        const labels = res.body.data.sigma.nodes.map((n: any) => n.label)
        expect(labels).toEqual(['a.ts', 'b.ts', 'c.ts'])
      })

      it('uses node ID as the sigma key', async () => {
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('src/auth.ts', [makeNode('src/auth.ts', 'file', 'auth.ts')]),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/src%2Fauth.ts')

        expect(res.body.data.sigma.nodes[0].key).toBe('src/auth.ts')
      })
    })

    describe('node colors', () => {
      const nonFileTypes = nodeTypes.filter(t => t !== 'file')

      it.each(nonFileTypes)('assigns correct color to %s nodes', async type => {
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('root', [makeNode('root', type)]),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/root')

        expect(res.body.data.sigma.nodes[0].color).toBe(expectedColors[type])
      })

      it('assigns folder-based color to file nodes', async () => {
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('src/auth/user.ts', [makeNode('src/auth/user.ts', 'file', 'user.ts')]),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/src%2Fauth%2Fuser.ts')

        const color = res.body.data.sigma.nodes[0].color
        // File colors come from folderColors palette (hex colors starting with #)
        expect(color).toMatch(/^#[0-9a-f]{6}$/i)
        expect(color).not.toBe(expectedColors.file) // Should not be default file color
      })

      it('assigns fallback color to unknown node type', async () => {
        const unknownNode = { ...makeNode('root', 'unknown' as any), type: 'unknown' as any }
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('root', [unknownNode]),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/root')

        expect(res.body.data.sigma.nodes[0].color).toBe('#9ca3af')
      })
    })

    describe('node sizes', () => {
      it.each(nodeTypes)('assigns correct size to %s nodes', async type => {
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('root', [makeNode('root', type)]),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/root')

        expect(res.body.data.sigma.nodes[0].size).toBe(expectedSizes[type])
      })
    })

    describe('edges', () => {
      it('maps edge source, target, type and weight to sigma edge', async () => {
        const nodes = [makeNode('src/auth.ts', 'file', 'auth.ts'), makeNode('src/db.ts', 'file', 'db.ts')]
        const edges = [{ source: 'src/auth.ts', target: 'src/db.ts', type: 'IMPORTS', weight: 2 }]
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('src/auth.ts', nodes, edges),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/src%2Fauth.ts')

        const edge = res.body.data.sigma.edges[0]
        expect(edge.source).toBe('src/auth.ts')
        expect(edge.target).toBe('src/db.ts')
        expect(edge.type).toBe('IMPORTS')
        expect(edge.weight).toBe(2)
      })

      it('handles multiple edges between different nodes', async () => {
        const nodes = [
          makeNode('src/a.ts', 'file', 'a.ts'),
          makeNode('src/b.ts', 'file', 'b.ts'),
          makeNode('src/c.ts', 'file', 'c.ts')
        ]
        const edges = [
          { source: 'src/a.ts', target: 'src/b.ts', type: 'IMPORTS', weight: 1 },
          { source: 'src/a.ts', target: 'src/c.ts', type: 'IMPORTS', weight: 1 },
          { source: 'src/b.ts', target: 'src/c.ts', type: 'CALLS', weight: 3 }
        ]
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('src/a.ts', nodes, edges),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/src%2Fa.ts')

        expect(res.body.data.sigma.edges).toHaveLength(3)
        const types = res.body.data.sigma.edges.map((e: any) => e.type)
        expect(types).toContain('IMPORTS')
        expect(types).toContain('CALLS')
      })

      it('returns empty edges array when subgraph has no edges', async () => {
        mockEngine.getSubgraph.mockResolvedValue({
          data: makeSubgraph('src/a.ts', [makeNode('src/a.ts', 'file', 'a.ts')], []),
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/src%2Fa.ts')

        expect(res.body.data.sigma.edges).toHaveLength(0)
      })

      it('includes rootId and depth in the sigma response', async () => {
        mockEngine.getSubgraph.mockResolvedValue({
          data: { ...makeSubgraph('src/auth.ts'), depth: 3 },
          fromCache: false,
          durationMs: 1
        })

        const res = await request(app).get('/api/graph/subgraph/src%2Fauth.ts')

        expect(res.body.data.sigma.rootId).toBe('src/auth.ts')
        expect(res.body.data.sigma.depth).toBe(3)
      })
    })
  })
})
