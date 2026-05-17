import type { HybridSearch } from './hybridSearch'
import type { QueryEngine } from '../query/queryEngine'
import type { GraphEdge, NodeId, EdgeType } from '../../shared/types'

export type ContextGraph = {
  seedNodes: string[]
  expandedNodes: string[]
  edges: GraphEdge[]
  scores: Record<string, number>
  reasons: Record<string, string>
}

type LOD = 'modules' | 'files' | 'functions'

const EXPAND_DECAY = 0.6
const MAX_SEEDS = 5
const MAX_CONTEXT_NODES = 30

function edgeTypesForLOD(lod: LOD): EdgeType[] {
  if (lod === 'functions') return ['CALLS']
  if (lod === 'files') return ['IMPORTS']
  return ['CONTAINS']
}

export class ContextBuilder {
  constructor(
    private hybridSearch: HybridSearch,
    private queryEngine: QueryEngine
  ) {}

  async build(query: string, lod: LOD = 'files'): Promise<ContextGraph> {
    const seeds = await this.hybridSearch.search(query, MAX_SEEDS)
    if (seeds.length === 0) {
      return { seedNodes: [], expandedNodes: [], edges: [], scores: {}, reasons: {} }
    }

    const scores: Record<string, number> = {}
    const reasons: Record<string, string> = {}
    const seedIds = new Set<string>()

    for (const seed of seeds) {
      seedIds.add(seed.nodeId)
      scores[seed.nodeId] = seed.score
      reasons[seed.nodeId] = `matched '${query}' (score: ${seed.score.toFixed(2)})`
    }

    return this._expand(seedIds, scores, reasons, lod)
  }

  async buildFromNode(nodeId: string, lod: LOD = 'files'): Promise<ContextGraph> {
    const node = await this.queryEngine.getNode(nodeId as NodeId)
    const label = node?.label ?? nodeId
    const seedIds = new Set([nodeId])
    const scores: Record<string, number> = { [nodeId]: 1.0 }
    const reasons: Record<string, string> = { [nodeId]: `selected '${label}'` }

    return this._expand(seedIds, scores, reasons, lod)
  }

  private async _expand(
    seedIds: Set<string>,
    scores: Record<string, number>,
    reasons: Record<string, string>,
    lod: LOD
  ): Promise<ContextGraph> {
    const allEdges = new Map<string, GraphEdge>()
    const expandedIds = new Set<string>()

    // Track functions discovered via CONTAINS so we can expand their CALLS in a second pass
    const functionSeeds = new Set<string>()

    // First pass: expand outward from each seed
    await Promise.all([...seedIds].map(async seedId => {
      const seedScore = scores[seedId] ?? 1.0
      const seedNode = await this.queryEngine.getNode(seedId as NodeId)
      const seedLabel = seedNode?.label ?? seedId

      // For Functions LOD include CONTAINS so file seeds resolve their functions
      const firstPassTypes: EdgeType[] = lod === 'functions'
        ? ['CALLS', 'CONTAINS']
        : edgeTypesForLOD(lod)

      const { data } = await this.queryEngine.getSubgraph({
        nodeId: seedId as NodeId,
        depth: 1,
        edgeTypes: firstPassTypes
      })

      for (const edge of data.edges) {
        if (edge.source !== seedId) continue

        // CONTAINS: only include function-type targets, skip module/folder/file
        if (edge.type === 'CONTAINS') {
          const targetNode = data.nodes.find(n => n.id === edge.target)
          if (!targetNode || targetNode.type !== 'function') continue
          functionSeeds.add(edge.target)
        }

        allEdges.set(edge.id, edge)
        const neighborId = edge.target
        if (seedIds.has(neighborId)) continue

        const neighborScore = seedScore * EXPAND_DECAY
        if (!scores[neighborId] || scores[neighborId] < neighborScore) {
          scores[neighborId] = neighborScore
          reasons[neighborId] = _edgeReason(edge, seedLabel)
        }
        expandedIds.add(neighborId)
      }
    }))

    // Second pass (Functions LOD only): expand CALLS from functions discovered via CONTAINS
    // This handles the case of clicking a file node — we get its functions, then their callees
    if (lod === 'functions' && functionSeeds.size > 0) {
      await Promise.all([...functionSeeds].map(async fnId => {
        const fnScore = scores[fnId] ?? EXPAND_DECAY
        const fnNode = await this.queryEngine.getNode(fnId as NodeId)
        const fnLabel = fnNode?.label ?? fnId

        const { data } = await this.queryEngine.getSubgraph({
          nodeId: fnId as NodeId,
          depth: 1,
          edgeTypes: ['CALLS']
        })

        for (const edge of data.edges) {
          if (edge.source !== fnId) continue
          allEdges.set(edge.id, edge)
          const neighborId = edge.target
          if (seedIds.has(neighborId) || expandedIds.has(neighborId)) continue

          const neighborScore = fnScore * EXPAND_DECAY
          if (!scores[neighborId] || scores[neighborId] < neighborScore) {
            scores[neighborId] = neighborScore
            reasons[neighborId] = `called by ${fnLabel}`
          }
          expandedIds.add(neighborId)
        }
      }))
    }

    // Prune: seeds always survive, expanded sorted by score and capped
    const sortedExpanded = [...expandedIds].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
    const slotsForExpanded = MAX_CONTEXT_NODES - seedIds.size
    const keptExpanded = new Set(sortedExpanded.slice(0, Math.max(0, slotsForExpanded)))
    const kept = new Set([...seedIds, ...keptExpanded])

    const edges = [...allEdges.values()].filter(
      e => kept.has(e.source) && kept.has(e.target)
    )

    return {
      seedNodes: [...seedIds],
      expandedNodes: [...keptExpanded],
      edges,
      scores,
      reasons
    }
  }
}

function _edgeReason(edge: GraphEdge, seedLabel: string): string {
  if (edge.type === 'CALLS') return `called by ${seedLabel}`
  if (edge.type === 'IMPORTS') return `imported by ${seedLabel}`
  if (edge.type === 'CONTAINS') return `function in ${seedLabel}`
  return `connected to ${seedLabel}`
}
