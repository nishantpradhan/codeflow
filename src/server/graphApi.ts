import { Router } from 'express'
import type { Request, Response } from 'express'
import { promises as fs } from 'fs'
import { join } from 'path'
import { QueryEngine } from '../query/queryEngine'
import type { GraphViewData, SigmaNode, SigmaEdge, NodeDetailsResponse, SearchResponse } from '../../shared/ui-types'
import type { SubGraph, GraphNode } from '../../shared/types'

export function createGraphRouter(queryEngine: QueryEngine): Router {
  const router = Router()

  // ============================================================
  // Graph Queries
  // ============================================================

  router.get('/subgraph/:nodeId', async (req: Request, res: Response) => {
    try {
      const { nodeId } = req.params
      const depth = parseInt(req.query.depth as string) || 2

      const result = await queryEngine.getSubgraph({
        nodeId,
        depth
      })

      const sigma = convertToSigma(result.data)

      res.json({
        success: true,
        data: {
          subgraph: result.data,
          sigma,
          nodeDetails: Object.fromEntries(
            result.data.nodes.map(node => [node.id, node])
          )
        }
      })
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          message: (error as Error).message,
          code: 'SUBGRAPH_ERROR'
        }
      })
    }
  })

  router.get('/node/:nodeId', async (req: Request, res: Response) => {
    try {
      const { nodeId } = req.params

      const node = await queryEngine.getNode(nodeId)
      if (!node) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Node not found',
            code: 'NOT_FOUND'
          }
        })
      }

      const relations = await queryEngine.getNodeRelations(nodeId)

      let codePreview: string | null = null
      // Read code preview for function nodes
      if (node.type === 'function' && 'lineStart' in node && 'lineEnd' in node) {
        try {
          const filePath = join(process.cwd(), node.path)
          const content = await fs.readFile(filePath, 'utf-8')
          const lines = content.split('\n')
          const start = Math.max(0, (node as any).lineStart - 1)
          const end = Math.min(lines.length, (node as any).lineEnd)
          codePreview = lines.slice(start, end).join('\n')
        } catch (_) {
          // Silent fail — code preview just won't be available
        }
      }

      const response: NodeDetailsResponse = {
        node,
        calls: relations.calls,
        calledBy: relations.calledBy,
        imports: relations.imports,
        importedBy: relations.importedBy,
        codePreview
      }

      res.json({
        success: true,
        data: response
      })
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          message: (error as Error).message,
          code: 'NODE_ERROR'
        }
      })
    }
  })

  router.get('/call-graph/:functionId', async (req: Request, res: Response) => {
    try {
      const { functionId } = req.params
      const depth = parseInt(req.query.depth as string) || 2

      const result = await queryEngine.getCallGraph(functionId, depth)

      res.json({
        success: true,
        data: result.data
      })
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          message: (error as Error).message,
          code: 'CALL_GRAPH_ERROR'
        }
      })
    }
  })

  router.get('/dependencies/:fileId', async (req: Request, res: Response) => {
    try {
      const { fileId } = req.params

      const result = await queryEngine.getDependencies(fileId)

      const nodes: GraphNode[] = []
      for (const nodeId of result.data) {
        const node = await queryEngine.getNode(nodeId)
        if (node) nodes.push(node)
      }

      res.json({
        success: true,
        data: {
          fileId,
          dependencies: nodes
        }
      })
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          message: (error as Error).message,
          code: 'DEPENDENCIES_ERROR'
        }
      })
    }
  })

  router.get('/dependents/:nodeId', async (req: Request, res: Response) => {
    try {
      const { nodeId } = req.params
      const depth = parseInt(req.query.depth as string) || 1

      const result = await queryEngine.getDependents({ nodeId, depth })

      const nodes: GraphNode[] = []
      for (const id of result.data) {
        const node = await queryEngine.getNode(id)
        if (node) nodes.push(node)
      }

      res.json({
        success: true,
        data: {
          nodeId,
          dependents: nodes
        }
      })
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          message: (error as Error).message,
          code: 'DEPENDENTS_ERROR'
        }
      })
    }
  })

  // ============================================================
  // Analysis Queries
  // ============================================================

  router.get('/circular-deps', async (req: Request, res: Response) => {
    try {
      const result = await queryEngine.getCircularDeps()

      res.json({
        success: true,
        data: {
          cycles: result.data,
          count: result.data.length
        }
      })
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          message: (error as Error).message,
          code: 'CIRCULAR_DEPS_ERROR'
        }
      })
    }
  })

  router.get('/dead-code', async (req: Request, res: Response) => {
    try {
      const result = await queryEngine.getDeadCode()

      const nodes: GraphNode[] = []
      for (const nodeId of result.data) {
        const node = await queryEngine.getNode(nodeId)
        if (node) nodes.push(node)
      }

      res.json({
        success: true,
        data: {
          deadCode: nodes,
          count: nodes.length
        }
      })
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          message: (error as Error).message,
          code: 'DEAD_CODE_ERROR'
        }
      })
    }
  })

  router.get('/most-connected', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10

      const result = await queryEngine.getMostConnected(limit)

      const withDetails = await Promise.all(
        result.data.map(async item => ({
          node: await queryEngine.getNode(item.id),
          connectionCount: item.connectionCount
        }))
      )

      res.json({
        success: true,
        data: {
          nodes: withDetails
        }
      })
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          message: (error as Error).message,
          code: 'MOST_CONNECTED_ERROR'
        }
      })
    }
  })

  // ============================================================
  // Search (placeholder)
  // ============================================================

  router.post('/search', async (req: Request, res: Response) => {
    try {
      const { query, type, limit } = req.body

      // Search implementation would go here
      // For Phase 2, returning empty results as placeholder

      const response: SearchResponse = {
        results: [],
        totalCount: 0,
        executionTime: 0
      }

      res.json({
        success: true,
        data: response
      })
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          message: (error as Error).message,
          code: 'SEARCH_ERROR'
        }
      })
    }
  })

  // Get root project node
  router.get('/root', async (req: Request, res: Response) => {
    try {
      const depth = parseInt(req.query.depth as string) || 1
      const result = await queryEngine.getRootProject(depth)
      if (!result) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'No project node found',
            code: 'NO_PROJECT'
          }
        })
      }

      const sigma = convertToSigma(result)
      res.json({
        success: true,
        data: {
          subgraph: result,
          sigma,
          nodeDetails: Object.fromEntries(
            result.nodes.map(node => [node.id, node])
          )
        }
      })
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          message: (error as Error).message,
          code: 'ROOT_ERROR'
        }
      })
    }
  })

  return router
}

// ============================================================
// Helper Functions
// ============================================================

// Color palette for nodes
const COLOR_PALETTE = {
  project: '#3b82f6',      // blue
  module: '#06b6d4',       // cyan
  folder: '#8b5cf6',       // purple
  fileDefault: '#10b981',  // green
  function: '#f59e0b',     // orange
  fallback: '#9ca3af',     // gray
  // Folder-based file colors (cycled based on hash)
  folderColors: [
    '#ff6b6b',  // red
    '#4ecdc4',  // teal
    '#45b7d1',  // blue
    '#f9ca24',  // yellow
    '#6c5ce7',  // purple
    '#a29bfe',  // lavender
    '#fd79a8',  // pink
    '#fdcb6e',  // orange
    '#55efc4',  // mint
    '#74b9ff'   // sky blue
  ]
}

function hashStringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % COLOR_PALETTE.folderColors.length
  return COLOR_PALETTE.folderColors[index]
}

function extractFolderPath(nodeId: string): string {
  const pathPart = nodeId.split(':')[0]
  const parts = pathPart.split('/')
  return parts.slice(0, -1).join('/')
}

function convertToSigma(subgraph: SubGraph): GraphViewData {
  const nodes: SigmaNode[] = subgraph.nodes.map(node => {
    const color = getNodeColor(node.type, node.id)
    const size = getNodeSize(node.type)

    return {
      key: node.id,
      label: node.label,
      size,
      color,
      type: node.type,
      isEntryPoint: node.type === 'file' ? (node as any).isEntryPoint ?? false : undefined
    }
  })

  const edges: SigmaEdge[] = subgraph.edges.map(edge => ({
    source: edge.source,
    target: edge.target,
    type: edge.type,
    weight: edge.weight
  }))

  return {
    nodes,
    edges,
    rootId: subgraph.rootId,
    depth: subgraph.depth
  }
}

function getNodeColor(type: string, nodeId?: string): string {
  if (type === 'file' && nodeId) {
    const folderPath = extractFolderPath(nodeId)
    return hashStringToColor(folderPath)
  }

  const typeColorMap: Record<string, string> = {
    project: COLOR_PALETTE.project,
    module: COLOR_PALETTE.module,
    folder: COLOR_PALETTE.folder,
    file: COLOR_PALETTE.fileDefault,
    function: COLOR_PALETTE.function
  }

  return typeColorMap[type] || COLOR_PALETTE.fallback
}

function getNodeSize(type: string): number {
  const sizes: Record<string, number> = {
    project: 10,
    module: 8,
    folder: 6,
    file: 5,
    function: 4
  }
  return sizes[type] || 5
}
