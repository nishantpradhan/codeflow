import type {
  GraphNode,
  GraphEdge,
  SubGraph,
  NodeId,
  EdgeType,
  GetSubgraphOptions,
  GetDependentsOptions,
  QueryResult
} from '../../shared/types'
import { Neo4jDB } from '../storage/neo4j'
import { SQLiteDB } from '../storage/sqlite'

export class QueryEngine {
  private neo4j: Neo4jDB
  private sqlite: SQLiteDB

  constructor(neo4jDb: Neo4jDB, sqliteDb: SQLiteDB) {
    this.neo4j = neo4jDb
    this.sqlite = sqliteDb
  }

  // ============================================================
  // Main Query Methods
  // ============================================================

  async getSubgraph(
    options: GetSubgraphOptions
  ): Promise<QueryResult<SubGraph>> {
    const startTime = Date.now()

    const { nodes, edges } = await this.neo4j.getSubgraph(
      options.nodeId,
      options.depth
    )

    let filtered = edges
    if (options.edgeTypes && options.edgeTypes.length > 0) {
      filtered = edges.filter(e => options.edgeTypes!.includes(e.type))
    }

    const subgraph: SubGraph = {
      nodes,
      edges: filtered,
      rootId: options.nodeId,
      depth: options.depth
    }

    const durationMs = Date.now() - startTime

    return {
      data: subgraph,
      fromCache: false,
      durationMs
    }
  }

  async getDependencies(fileId: NodeId): Promise<QueryResult<NodeId[]>> {
    const startTime = Date.now()

    const dependencies = await this.neo4j.getDependencies(fileId)

    const durationMs = Date.now() - startTime

    return {
      data: dependencies,
      fromCache: false,
      durationMs
    }
  }

  async getDependents(
    options: GetDependentsOptions
  ): Promise<QueryResult<NodeId[]>> {
    const startTime = Date.now()

    const dependents = await this.neo4j.getDependents(
      options.nodeId,
      options.depth || 1
    )

    const durationMs = Date.now() - startTime

    return {
      data: dependents,
      fromCache: false,
      durationMs
    }
  }

  async getCallGraph(
    functionId: NodeId,
    depth: number = 2
  ): Promise<QueryResult<SubGraph>> {
    const startTime = Date.now()

    const { nodes, edges } = await this.neo4j.getCallGraph(functionId, depth)

    const callGraph: SubGraph = {
      nodes,
      edges: edges.filter(e => e.type === 'CALLS'),
      rootId: functionId,
      depth
    }

    const durationMs = Date.now() - startTime

    return {
      data: callGraph,
      fromCache: false,
      durationMs
    }
  }

  async getNodeRelations(
    nodeId: NodeId
  ): Promise<{
    calls: GraphNode[]
    calledBy: GraphNode[]
    imports: GraphNode[]
    importedBy: GraphNode[]
  }> {
    // Get CALLS edges — depth 1, both directions
    const { data: callsGraph } = await this.getSubgraph({ nodeId, depth: 1, edgeTypes: ['CALLS'] })
    const callsNodeMap = new Map(callsGraph.nodes.map(n => [n.id, n]))
    const calls = callsGraph.edges
      .filter(e => e.source === nodeId)
      .map(e => callsNodeMap.get(e.target))
      .filter((n): n is GraphNode => !!n)
    const calledBy = callsGraph.edges
      .filter(e => e.target === nodeId)
      .map(e => callsNodeMap.get(e.source))
      .filter((n): n is GraphNode => !!n)

    // Get IMPORTS edges — depth 1, both directions
    const { data: importsGraph } = await this.getSubgraph({ nodeId, depth: 1, edgeTypes: ['IMPORTS'] })
    const importsNodeMap = new Map(importsGraph.nodes.map(n => [n.id, n]))
    const imports = importsGraph.edges
      .filter(e => e.source === nodeId)
      .map(e => importsNodeMap.get(e.target))
      .filter((n): n is GraphNode => !!n)
    const importedBy = importsGraph.edges
      .filter(e => e.target === nodeId)
      .map(e => importsNodeMap.get(e.source))
      .filter((n): n is GraphNode => !!n)

    return { calls, calledBy, imports, importedBy }
  }

  async getCircularDeps(): Promise<QueryResult<NodeId[][]>> {
    const startTime = Date.now()

    const cycles = await this.neo4j.getCircularDeps()

    const durationMs = Date.now() - startTime

    return {
      data: cycles,
      fromCache: false,
      durationMs
    }
  }

  async getDeadCode(): Promise<QueryResult<NodeId[]>> {
    const startTime = Date.now()

    // Dead code: functions that are never called and not exported
    const functions = await this._getAllFunctions()
    const deadCode: NodeId[] = []

    for (const fn of functions) {
      const callers = await this.neo4j.getDependents(fn.id, 1)
      const isExported = fn.isExported
      const isMethod = fn.isMethod

      if (!isExported && !isMethod && callers.length === 0) {
        deadCode.push(fn.id)
      }
    }

    const durationMs = Date.now() - startTime

    return {
      data: deadCode,
      fromCache: false,
      durationMs
    }
  }

  async getMostConnected(
    limit: number = 10
  ): Promise<QueryResult<Array<{ id: NodeId; connectionCount: number }>>> {
    const startTime = Date.now()

    const mostConnected = await this.neo4j.getMostConnected(limit)

    const durationMs = Date.now() - startTime

    return {
      data: mostConnected,
      fromCache: false,
      durationMs
    }
  }

  // ============================================================
  // Utility Query Methods
  // ============================================================

  async getNode(nodeId: NodeId): Promise<GraphNode | null> {
    return await this.neo4j.getNode(nodeId)
  }

  async findNodesByType(
    nodeType: string
  ): Promise<GraphNode[]> {
    // Query Neo4j to find all nodes of a given type
    // This is a simple scan - in production would want pagination
    return []
  }

  async getImportedFiles(fileId: NodeId): Promise<NodeId[]> {
    return await this.neo4j.getDependencies(fileId)
  }

  async getFilesThatImport(fileId: NodeId): Promise<NodeId[]> {
    return await this.neo4j.getDependents(fileId, 1)
  }

  // ============================================================
  // Private Helper Methods
  // ============================================================

  private async _getAllFunctions(): Promise<any[]> {
    // Placeholder - would need a Neo4j query to get all functions
    // For now, return empty array
    return []
  }

  // ============================================================
  // Cache Methods (for future use)
  // ============================================================

  async clearCache(): Promise<void> {
    // Implementation depends on caching strategy
    // For Phase 1, caching is minimal
  }

  async getCacheStats(): Promise<{
    astCacheSize: number
    patternCount: number
    nodeCount: number
  }> {
    const astStats = this.sqlite.getASTCacheStats()
    const patternStats = this.sqlite.getPatternStats()

    return {
      astCacheSize: astStats.totalBytes,
      patternCount: patternStats.totalPatterns,
      nodeCount: 0 // Would need Neo4j query for actual count
    }
  }

  async getRootProject(depth: number = 1): Promise<SubGraph | null> {
    const projects = await this.neo4j.getNodesByType('project')
    if (projects.length === 0) return null

    const rootNode = projects[0]
    return this.getSubgraph({
      nodeId: rootNode.id,
      depth
    }).then(result => result.data)
  }
}
