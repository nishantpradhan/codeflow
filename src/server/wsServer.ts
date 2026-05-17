import { WebSocketServer, WebSocket } from 'ws'
import { Server as HttpServer } from 'http'
import type {
  ClientMessage,
  ServerMessage,
  SubgraphLoadedMessage,
  SearchResultsMessage,
  FileChangedMessage,
  ErrorMessage,
  GraphViewData,
  SigmaNode,
  SigmaEdge
} from '../../shared/ui-types'
import { QueryEngine } from '../query/queryEngine'
import { HybridSearch } from '../ai/hybridSearch'
import type { GraphNode, NodeId, SubGraph } from '../../shared/types'

export class WSServer {
  private wss: WebSocketServer
  private queryEngine: QueryEngine
  private hybridSearch: HybridSearch
  private clients: Map<WebSocket, ClientState> = new Map()

  constructor(httpServer: HttpServer, queryEngine: QueryEngine, hybridSearch: HybridSearch) {
    this.queryEngine = queryEngine
    this.hybridSearch = hybridSearch
    this.wss = new WebSocketServer({ server: httpServer })

    this.wss.on('connection', (ws: WebSocket) => {
      this._handleConnection(ws)
    })
  }

  private _handleConnection(ws: WebSocket): void {
    const clientState: ClientState = {
      ws,
      selectedNode: null,
      viewState: {
        selectedNodeId: null,
        hoveredNodeId: null,
        zoom: 1,
        pan: { x: 0, y: 0 },
        lod: 'files',
        theme: 'light'
      }
    }

    this.clients.set(ws, clientState)

    ws.on('message', (data: any) => {
      this._handleMessage(ws, data)
    })

    ws.on('close', () => {
      this.clients.delete(ws)
    })

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error.message)
      this._sendError(ws, error.message)
    })
  }

  private async _handleMessage(ws: WebSocket, data: any): Promise<void> {
    try {
      const message = JSON.parse(data.toString()) as ClientMessage

      switch (message.type) {
        case 'select_node':
          await this._handleSelectNode(ws, message.nodeId)
          break
        case 'hover_node':
          await this._handleHoverNode(ws, message.nodeId)
          break
        case 'zoom':
          this._handleZoom(ws, message.level)
          break
        case 'pan':
          this._handlePan(ws, message.x, message.y)
          break
        case 'search':
          await this._handleSearch(ws, message.query)
          break
        case 'filter':
          this._handleFilter(ws, message.options)
          break
        case 'load_subgraph':
          await this._handleLoadSubgraph(ws, message.nodeId, message.depth)
          break
        case 'change_theme':
          this._handleChangeTheme(ws, message.theme)
          break
        case 'change_lod':
          this._handleChangeLOD(ws, message.lod)
          break
        default:
          this._sendError(ws, 'Unknown message type')
      }
    } catch (error) {
      this._sendError(ws, (error as Error).message)
    }
  }

  private async _handleSelectNode(ws: WebSocket, nodeId: NodeId): Promise<void> {
    const clientState = this.clients.get(ws)
    if (!clientState) return

    clientState.viewState.selectedNodeId = nodeId
    clientState.selectedNode = await this.queryEngine.getNode(nodeId)

    try {
      const result = await this.queryEngine.getFocusedSubgraph(nodeId)
      const sigma = this._convertToSigma(result.data)
      const message: SubgraphLoadedMessage = {
        type: 'subgraph_loaded',
        data: sigma,
        nodeId,
        depth: result.data.depth
      }
      ws.send(JSON.stringify(message))
    } catch (error) {
      this._sendError(ws, (error as Error).message)
    }
  }

  private async _handleHoverNode(ws: WebSocket, nodeId: NodeId | null): Promise<void> {
    const clientState = this.clients.get(ws)
    if (!clientState) return

    clientState.viewState.hoveredNodeId = nodeId
  }

  private _handleZoom(ws: WebSocket, level: number): void {
    const clientState = this.clients.get(ws)
    if (!clientState) return

    clientState.viewState.zoom = level
  }

  private _handlePan(ws: WebSocket, x: number, y: number): void {
    const clientState = this.clients.get(ws)
    if (!clientState) return

    clientState.viewState.pan = { x, y }
  }

  private async _handleSearch(
    ws: WebSocket,
    query: any
  ): Promise<void> {
    try {
      const queryText = typeof query === 'string' ? query : query.text
      const mode: 'name' | 'imports' | 'calls' = typeof query === 'object' && query.mode ? query.mode : 'name'

      type ResultRow = { nodeId: NodeId; label: string; type: string; path: string; matches: number }
      let results: ResultRow[]
      if (mode === 'name') {
        const hits = await this.hybridSearch.search(queryText, 10)
        results = hits.map(hit => ({
          nodeId: hit.nodeId as NodeId,
          label: hit.label,
          type: hit.type,
          path: hit.path,
          matches: Math.round(hit.score * 100)
        }))
      } else {
        // Relationship mode: find the SINGLE best target node, then return who relates to it.
        // Always include the target as the first result so the user sees what was matched —
        // otherwise empty importers/callers makes searchResults empty, which falls back to
        // the non-search LOD view (looks like the graph is "flooded" with IMPORTS edges).
        const targets = await this.hybridSearch.search(queryText, 1)
        const rels: ResultRow[] = []

        if (targets.length > 0) {
          const target = targets[0]
          // First result: the target itself
          rels.push({
            nodeId: target.nodeId as NodeId,
            label: target.label,
            type: target.type,
            path: target.path,
            matches: Math.round(target.score * 100)
          })

          const relations = await this.queryEngine.getNodeRelations(target.nodeId as NodeId)
          const nodes = mode === 'imports' ? relations.importedBy : relations.calledBy
          for (const node of nodes) {
            if (node.id === target.nodeId) continue
            rels.push({
              nodeId: node.id as NodeId,
              label: node.label,
              type: node.type,
              path: node.path,
              matches: Math.round(target.score * 100)
            })
            if (rels.length >= 10) break
          }
        }
        results = rels
      }

      const message: SearchResultsMessage = {
        type: 'search_results',
        results,
        query: queryText
      }
      ws.send(JSON.stringify(message))
    } catch (error) {
      this._sendError(ws, (error as Error).message)
    }
  }

  private _handleFilter(ws: WebSocket, options: any): void {
    const clientState = this.clients.get(ws)
    if (!clientState) return

    // Filter state would be stored and applied to subgraph queries
  }

  private async _handleLoadSubgraph(
    ws: WebSocket,
    nodeId: NodeId,
    depth: number
  ): Promise<void> {
    try {
      const result = await this.queryEngine.getSubgraph({
        nodeId,
        depth
      })

      const sigma = this._convertToSigma(result.data)

      const message: SubgraphLoadedMessage = {
        type: 'subgraph_loaded',
        data: sigma,
        nodeId,
        depth
      }

      ws.send(JSON.stringify(message))
    } catch (error) {
      this._sendError(ws, (error as Error).message)
    }
  }

  private _handleChangeTheme(ws: WebSocket, theme: 'light' | 'dark'): void {
    const clientState = this.clients.get(ws)
    if (!clientState) return

    clientState.viewState.theme = theme
  }

  private _handleChangeLOD(
    ws: WebSocket,
    lod: 'modules' | 'files' | 'functions'
  ): void {
    const clientState = this.clients.get(ws)
    if (!clientState) return

    clientState.viewState.lod = lod
  }

  // ============================================================
  // Broadcast Methods
  // ============================================================

  broadcastFileChange(event: 'add' | 'change' | 'unlink', filePath: string, affectedNodeIds: NodeId[]): void {
    const message: FileChangedMessage = {
      type: 'file_changed',
      event,
      filePath,
      affectedNodeIds
    }

    this._broadcast(message)
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private _sendError(ws: WebSocket, message: string): void {
    const errorMsg: ErrorMessage = {
      type: 'error',
      message,
      code: 'UNKNOWN'
    }
    ws.send(JSON.stringify(errorMsg))
  }

  private _broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message)
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    }
  }

  private _convertToSigma(subgraph: SubGraph): GraphViewData {
    const nodes: SigmaNode[] = subgraph.nodes.map(node => {
      const color = this._getNodeColor(node.type)
      const size = this._getNodeSize(node.type)

      return {
        key: node.id,
        label: node.label,
        size,
        color,
        type: node.type
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

  private _getNodeColor(type: string): string {
    const colors: Record<string, string> = {
      project: '#3b82f6',
      module: '#06b6d4',
      folder: '#8b5cf6',
      file: '#10b981',
      function: '#f59e0b'
    }
    return colors[type] || '#9ca3af'
  }

  private _getNodeSize(type: string): number {
    const sizes: Record<string, number> = {
      project: 30,
      module: 25,
      folder: 20,
      file: 15,
      function: 10
    }
    return sizes[type] || 12
  }

  private async _getNeighbors(nodeId: NodeId): Promise<{
    incoming: GraphNode[]
    outgoing: GraphNode[]
  }> {
    const incoming = await this.queryEngine.getDependents({ nodeId, depth: 1 })
    const outgoing = await this.queryEngine.getDependencies(nodeId)

    const incomingNodes: GraphNode[] = []
    const outgoingNodes: GraphNode[] = []

    for (const id of incoming.data) {
      const node = await this.queryEngine.getNode(id)
      if (node) incomingNodes.push(node)
    }

    for (const id of outgoing.data) {
      const node = await this.queryEngine.getNode(id)
      if (node) outgoingNodes.push(node)
    }

    return {
      incoming: incomingNodes,
      outgoing: outgoingNodes
    }
  }
}

// ============================================================
// Internal Types
// ============================================================

interface ClientState {
  ws: WebSocket
  selectedNode: GraphNode | null
  viewState: {
    selectedNodeId: NodeId | null
    hoveredNodeId: NodeId | null
    zoom: number
    pan: { x: number; y: number }
    lod: 'modules' | 'files' | 'functions'
    theme: 'light' | 'dark'
  }
}
