import neo4j, { Driver, Session } from 'neo4j-driver'
import type {
  GraphNode,
  GraphEdge,
  ProjectNode,
  ModuleNode,
  FolderNode,
  FileNode,
  FunctionNode,
  NodeId,
  EdgeType
} from '../../shared/types'
import { makeEdgeId } from '../../shared/types'

export class Neo4jDB {
  private driver: Driver
  private url: string
  private user: string
  private password: string

  constructor(url: string, user: string, password: string) {
    this.url = url
    this.user = user
    this.password = password
    this.driver = neo4j.driver(url, neo4j.auth.basic(user, password))
  }

  async init(): Promise<void> {
    const session = this.driver.session()
    try {
      // Create constraints
      await session.run(
        'CREATE CONSTRAINT project_id IF NOT EXISTS FOR (n:Project) REQUIRE n.id IS UNIQUE'
      )
      await session.run(
        'CREATE CONSTRAINT module_id IF NOT EXISTS FOR (n:Module) REQUIRE n.id IS UNIQUE'
      )
      await session.run(
        'CREATE CONSTRAINT folder_id IF NOT EXISTS FOR (n:Folder) REQUIRE n.id IS UNIQUE'
      )
      await session.run(
        'CREATE CONSTRAINT file_id IF NOT EXISTS FOR (n:File) REQUIRE n.id IS UNIQUE'
      )
      await session.run(
        'CREATE CONSTRAINT function_id IF NOT EXISTS FOR (n:Function) REQUIRE n.id IS UNIQUE'
      )

      // Create indexes for common queries
      await session.run(
        'CREATE INDEX file_language IF NOT EXISTS FOR (n:File) ON (n.language)'
      )
      await session.run(
        'CREATE INDEX function_exported IF NOT EXISTS FOR (n:Function) ON (n.isExported)'
      )
    } finally {
      await session.close()
    }
  }

  async close(): Promise<void> {
    await this.driver.close()
  }

  // ============================================================
  // Node operations
  // ============================================================

  async createNode(node: GraphNode): Promise<void> {
    const session = this.driver.session()
    try {
      const properties = this.nodeToProperties(node)

      await session.run(
        `MERGE (n:${node.type} { id: $id })
         SET n += $properties`,
        { id: node.id, properties }
      )
    } finally {
      await session.close()
    }
  }

  async updateNode(node: GraphNode): Promise<void> {
    const session = this.driver.session()
    try {
      const properties = this.nodeToProperties(node)

      await session.run(
        `MATCH (n:${node.type} { id: $id })
         SET n += $properties`,
        { id: node.id, properties }
      )
    } finally {
      await session.close()
    }
  }

  async getNode(nodeId: NodeId, nodeType?: string): Promise<GraphNode | null> {
    const session = this.driver.session()
    try {
      const query = nodeType
        ? `MATCH (n:${nodeType} { id: $id }) RETURN n`
        : `MATCH (n { id: $id }) RETURN n`

      const result = await session.run(query, { id: nodeId })
      const record = result.records[0]
      if (!record) return null

      const node = record.get('n')
      return this.propertiesToNode(node.properties, node.labels[0])
    } finally {
      await session.close()
    }
  }

  async deleteNode(nodeId: NodeId): Promise<void> {
    const session = this.driver.session()
    try {
      await session.run(
        `MATCH (n { id: $id })
         DETACH DELETE n`,
        { id: nodeId }
      )
    } finally {
      await session.close()
    }
  }

  // ============================================================
  // Edge operations
  // ============================================================

  async createEdge(edge: GraphEdge): Promise<void> {
    const session = this.driver.session()
    try {
      const edgeProps = {
        id: edge.id,
        weight: edge.weight,
        label: edge.label,
        ...(edge.lineNumber && { lineNumber: edge.lineNumber }),
        createdAt: edge.createdAt.toISOString()
      }

      await session.run(
        `MATCH (source { id: $sourceId })
         MATCH (target { id: $targetId })
         MERGE (source)-[r:${edge.type} { id: $edgeId }]->(target)
         SET r += $props`,
        {
          sourceId: edge.source,
          targetId: edge.target,
          edgeId: edge.id,
          props: edgeProps
        }
      )
    } finally {
      await session.close()
    }
  }

  async updateEdge(edge: GraphEdge): Promise<void> {
    const session = this.driver.session()
    try {
      const edgeProps = {
        weight: edge.weight,
        label: edge.label,
        ...(edge.lineNumber && { lineNumber: edge.lineNumber })
      }

      await session.run(
        `MATCH (source { id: $sourceId })-[r:${edge.type}]->(target { id: $targetId })
         SET r += $props`,
        {
          sourceId: edge.source,
          targetId: edge.target,
          props: edgeProps
        }
      )
    } finally {
      await session.close()
    }
  }

  async deleteEdge(
    sourceId: NodeId,
    edgeType: EdgeType,
    targetId: NodeId
  ): Promise<void> {
    const session = this.driver.session()
    try {
      await session.run(
        `MATCH (source { id: $sourceId })-[r:${edgeType}]->(target { id: $targetId })
         DELETE r`,
        { sourceId, targetId }
      )
    } finally {
      await session.close()
    }
  }

  // ============================================================
  // Query operations
  // ============================================================

  async getSubgraph(
    nodeId: NodeId,
    depth: number
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const session = this.driver.session()
    try {
      const nodeResult = await session.run(
        `MATCH (root { id: $nodeId })-[*0..${depth}]-(n)
         RETURN DISTINCT n`,
        { nodeId }
      )

      const nodes = nodeResult.records.map(r => {
        const node = r.get('n')
        return this.propertiesToNode(node.properties, node.labels[0])
      })

      // Only return edges where both endpoints are within the subgraph
      const edgeResult = await session.run(
        `MATCH (root { id: $nodeId })-[*0..${depth}]-(n)
         WITH collect(DISTINCT n) as subgraphNodes
         UNWIND subgraphNodes as n1
         MATCH (n1)-[r]->(n2)
         WHERE n2 IN subgraphNodes
         RETURN DISTINCT r, n1, n2`,
        { nodeId }
      )

      const edges = edgeResult.records.map(r => {
        const rel = r.get('r')
        const n1 = r.get('n1')
        const n2 = r.get('n2')
        return this.relationshipToEdge(rel, n1.properties.id, n2.properties.id)
      })

      return { nodes, edges }
    } finally {
      await session.close()
    }
  }

  async getDependencies(fileId: NodeId): Promise<NodeId[]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (file { id: $fileId })-[:IMPORTS]->(dependency)
         RETURN dependency.id as id`,
        { fileId }
      )

      return result.records.map(r => r.get('id') as NodeId)
    } finally {
      await session.close()
    }
  }

  async getDependents(nodeId: NodeId, depth: number = 1): Promise<NodeId[]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (node { id: $nodeId })<-[:IMPORTS|CALLS*1..${depth}]-(dependent)
         RETURN DISTINCT dependent.id as id`,
        { nodeId }
      )

      return result.records.map(r => r.get('id') as NodeId)
    } finally {
      await session.close()
    }
  }

  async getCallGraph(
    functionId: NodeId,
    depth: number = 2
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const session = this.driver.session()
    try {
      const nodeResult = await session.run(
        `MATCH (fn { id: $fnId })-[:CALLS*0..${depth}]-(n)
         RETURN DISTINCT n`,
        { fnId: functionId }
      )

      const nodes = nodeResult.records.map(r => {
        const node = r.get('n')
        return this.propertiesToNode(node.properties, node.labels[0])
      })

      const edgeResult = await session.run(
        `MATCH (fn { id: $fnId })-[:CALLS*0..${depth}]-(n)
         WITH collect(DISTINCT n) as subgraphNodes
         UNWIND subgraphNodes as n1
         MATCH (n1)-[r:CALLS]->(n2)
         WHERE n2 IN subgraphNodes
         RETURN DISTINCT r, n1, n2`,
        { fnId: functionId }
      )

      const edges = edgeResult.records.map(r => {
        const rel = r.get('r')
        const n1 = r.get('n1')
        const n2 = r.get('n2')
        return this.relationshipToEdge(rel, n1.properties.id, n2.properties.id)
      })

      return { nodes, edges }
    } finally {
      await session.close()
    }
  }

  async getCircularDeps(): Promise<NodeId[][]> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH p = (n)-[:IMPORTS|CALLS*2..]->(n)
         RETURN [node in nodes(p) | node.id] as cycle`
      )

      return result.records.map(r => r.get('cycle') as NodeId[])
    } finally {
      await session.close()
    }
  }

  async getMostConnected(limit: number = 10): Promise<Array<{
    id: NodeId
    connectionCount: number
  }>> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (n)-[r]-(m)
         WITH n, COUNT(DISTINCT r) as connCount
         RETURN n.id as id, connCount as connectionCount
         ORDER BY connCount DESC
         LIMIT $limit`,
        { limit }
      )

      return result.records.map(r => ({
        id: r.get('id') as NodeId,
        connectionCount: r.get('connectionCount') as number
      }))
    } finally {
      await session.close()
    }
  }

  async getNodesByType(nodeType: string): Promise<GraphNode[]> {
    const session = this.driver.session()
    try {
      const result = await session.run(`MATCH (n:\`${nodeType}\`) RETURN n`)
      return result.records.map(r => {
        const node = r.get('n')
        return this.propertiesToNode(node.properties, nodeType)
      })
    } finally {
      await session.close()
    }
  }

  // ============================================================
  // Utility methods
  // ============================================================

  private nodeToProperties(node: GraphNode): Record<string, any> {
    const common = {
      id: node.id,
      type: node.type,
      label: node.label,
      path: node.path,
      hash: node.hash,
      level: node.level,
      visited: node.visited,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString()
    }

    switch (node.type) {
      case 'project':
        return {
          ...common,
          name: (node as ProjectNode).name,
          language: (node as ProjectNode).language,
          entryPoint: (node as ProjectNode).entryPoint,
          packageManager: (node as ProjectNode).packageManager,
          dependencies: (node as ProjectNode).dependencies,
          devDependencies: (node as ProjectNode).devDependencies,
          scripts: JSON.stringify((node as ProjectNode).scripts)
        }
      case 'module':
        return {
          ...common,
          parentId: (node as ModuleNode).parentId,
          folderCount: (node as ModuleNode).folderCount,
          fileCount: (node as ModuleNode).fileCount
        }
      case 'folder':
        return {
          ...common,
          parentId: (node as FolderNode).parentId,
          fileCount: (node as FolderNode).fileCount
        }
      case 'file':
        return {
          ...common,
          parentId: (node as FileNode).parentId,
          language: (node as FileNode).language,
          lineCount: (node as FileNode).lineCount,
          imports: JSON.stringify((node as FileNode).imports),
          exports: JSON.stringify((node as FileNode).exports),
          isEntryPoint: (node as FileNode).isEntryPoint,
          isTest: (node as FileNode).isTest,
          isConfig: (node as FileNode).isConfig
        }
      case 'function':
        return {
          ...common,
          parentId: (node as FunctionNode).parentId,
          params: JSON.stringify((node as FunctionNode).params),
          returnType: (node as FunctionNode).returnType,
          isAsync: (node as FunctionNode).isAsync,
          isExported: (node as FunctionNode).isExported,
          isMethod: (node as FunctionNode).isMethod,
          className: (node as FunctionNode).className,
          lineStart: (node as FunctionNode).lineStart,
          lineEnd: (node as FunctionNode).lineEnd
        }
      default:
        return common
    }
  }

  private propertiesToNode(props: Record<string, any>, nodeType: string): GraphNode {
    const normalizedType = nodeType.charAt(0).toUpperCase() + nodeType.slice(1).toLowerCase()
    nodeType = normalizedType
    const common = {
      id: props.id as NodeId,
      type: props.type as any,
      label: props.label,
      path: props.path,
      hash: props.hash,
      level: props.level,
      visited: props.visited,
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt)
    }

    switch (nodeType) {
      case 'Project':
        return {
          ...common,
          type: 'project',
          name: props.name,
          language: props.language,
          entryPoint: props.entryPoint,
          packageManager: props.packageManager,
          dependencies: props.dependencies,
          devDependencies: props.devDependencies,
          scripts: JSON.parse(props.scripts)
        } as ProjectNode
      case 'Module':
        return {
          ...common,
          type: 'module',
          parentId: props.parentId,
          folderCount: props.folderCount,
          fileCount: props.fileCount
        } as ModuleNode
      case 'Folder':
        return {
          ...common,
          type: 'folder',
          parentId: props.parentId,
          fileCount: props.fileCount
        } as FolderNode
      case 'File':
        return {
          ...common,
          type: 'file',
          parentId: props.parentId,
          language: props.language,
          lineCount: props.lineCount,
          imports: JSON.parse(props.imports),
          exports: JSON.parse(props.exports),
          isEntryPoint: props.isEntryPoint,
          isTest: props.isTest,
          isConfig: props.isConfig
        } as FileNode
      case 'Function':
        return {
          ...common,
          type: 'function',
          parentId: props.parentId,
          params: JSON.parse(props.params),
          returnType: props.returnType,
          isAsync: props.isAsync,
          isExported: props.isExported,
          isMethod: props.isMethod,
          className: props.className,
          lineStart: props.lineStart,
          lineEnd: props.lineEnd
        } as FunctionNode
      default:
        return common as any
    }
  }

  private relationshipToEdge(rel: any, sourceId?: string, targetId?: string): GraphEdge {
    const source = (sourceId || rel.properties.sourceId || String(rel.start)) as NodeId
    const target = (targetId || rel.properties.targetId || String(rel.end)) as NodeId
    return {
      id: rel.properties.id || makeEdgeId(source, rel.type, target),
      source,
      target,
      type: rel.type as EdgeType,
      label: rel.properties.label || rel.type,
      weight: rel.properties.weight || 1,
      lineNumber: rel.properties.lineNumber,
      createdAt: new Date(rel.properties.createdAt || Date.now())
    }
  }
}
