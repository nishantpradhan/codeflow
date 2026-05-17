// ============================================================
// shared/ui-types.ts
// Phase 2 — UI-specific types for frontend/backend communication
// ============================================================

import type { GraphNode, NodeId, EdgeType, SubGraph } from './types'

// ============================================================
// GRAPH RENDERING (Sigma.js)
// ============================================================

export interface SigmaNode {
  key: NodeId
  label: string
  size: number
  color: string
  type: string  // node type for styling
  isEntryPoint?: boolean
  x?: number
  y?: number
}

export interface SigmaEdge {
  source: NodeId
  target: NodeId
  type: EdgeType
  weight: number
}

export interface GraphViewData {
  nodes: SigmaNode[]
  edges: SigmaEdge[]
  rootId: NodeId
  depth: number
}

// ============================================================
// UI STATE
// ============================================================

export interface GraphViewState {
  selectedNodeId: NodeId | null
  hoveredNodeId: NodeId | null
  zoom: number
  pan: { x: number; y: number }
  lod: 'modules' | 'files' | 'functions'  // Level of Detail
  theme: 'light' | 'dark'
}

export interface NodeDetailsPanel {
  nodeId: NodeId
  node: GraphNode
  calls: GraphNode[]
  calledBy: GraphNode[]
  imports: GraphNode[]
  importedBy: GraphNode[]
  codePreview: string | null
}

// ============================================================
// SEARCH & FILTERING
// ============================================================

export interface SearchQuery {
  text: string
  type?: string  // filter by node type
  limit?: number
}

export interface SearchResult {
  nodeId: NodeId
  label: string
  type: string
  path: string
  matches: number  // how many patterns/imports matched
  reason?: string  // context builder: why this node is included
}

export interface FilterOptions {
  nodeTypes?: string[]
  edgeTypes?: EdgeType[]
  hideTests?: boolean
  hideConfig?: boolean
  minConnections?: number
}

// ============================================================
// WEBSOCKET MESSAGES
// ============================================================

export type ClientMessage =
  | SelectNodeMessage
  | HoverNodeMessage
  | ZoomMessage
  | PanMessage
  | SearchMessage
  | FilterMessage
  | LoadSubgraphMessage
  | ChangeThemeMessage
  | ChangeLODMessage
  | FlowSelectMessage

export interface FlowSelectMessage {
  type: 'flow_select'
  nodeId: NodeId
}

export interface SelectNodeMessage {
  type: 'select_node'
  nodeId: NodeId
}

export interface HoverNodeMessage {
  type: 'hover_node'
  nodeId: NodeId | null
}

export interface ZoomMessage {
  type: 'zoom'
  level: number
}

export interface PanMessage {
  type: 'pan'
  x: number
  y: number
}

export interface SearchMessage {
  type: 'search'
  query: SearchQuery
}

export interface FilterMessage {
  type: 'filter'
  options: FilterOptions
}

export interface LoadSubgraphMessage {
  type: 'load_subgraph'
  nodeId: NodeId
  depth: number
}

export interface ChangeThemeMessage {
  type: 'change_theme'
  theme: 'light' | 'dark'
}

export interface ChangeLODMessage {
  type: 'change_lod'
  lod: 'modules' | 'files' | 'functions'
}

export interface FlowLayoutData {
  seedNodes: string[]
  expandedNodes: string[]
  edges: Array<{ source: string; target: string; type: string }>
  scores: Record<string, number>
  reasons: Record<string, string>
}

export interface FlowContextMessage {
  type: 'flow_context'
  data: FlowLayoutData
}

export type ServerMessage =
  | SubgraphLoadedMessage
  | SearchResultsMessage
  | FlowContextMessage
  | FileChangedMessage
  | ErrorMessage
  | StateUpdateMessage

export interface SubgraphLoadedMessage {
  type: 'subgraph_loaded'
  data: GraphViewData
  nodeId: NodeId
  depth: number
}

export interface SearchResultsMessage {
  type: 'search_results'
  results: SearchResult[]
  query: string
}

export interface FileChangedMessage {
  type: 'file_changed'
  event: 'add' | 'change' | 'unlink'
  filePath: string
  affectedNodeIds: NodeId[]
}

export interface ErrorMessage {
  type: 'error'
  message: string
  code?: string
}

export interface StateUpdateMessage {
  type: 'state_update'
  state: Partial<GraphViewState>
}

// ============================================================
// REST API TYPES
// ============================================================

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    message: string
    code: string
  }
}

export interface SubgraphRequest {
  nodeId: NodeId
  depth: number
  edgeTypes?: EdgeType[]
}

export interface SubgraphResponse {
  subgraph: SubGraph
  sigma: GraphViewData
  nodeDetails: {
    [nodeId: string]: GraphNode
  }
}

export interface SearchRequest {
  query: string
  type?: string
  limit?: number
}

export interface SearchResponse {
  results: SearchResult[]
  totalCount: number
  executionTime: number
}

export interface NodeDetailsRequest {
  nodeId: NodeId
  depth?: number
}

export interface NodeDetailsResponse {
  node: GraphNode
  calls: GraphNode[]
  calledBy: GraphNode[]
  imports: GraphNode[]
  importedBy: GraphNode[]
  codePreview: string | null
}

// ============================================================
// SIGMA.JS CONFIGURATION
// ============================================================

export interface SigmaSettings {
  enableWebGL: boolean
  animationDuration: number
  nodeSize: {
    min: number
    max: number
  }
  edgeWidth: {
    min: number
    max: number
  }
  colors: {
    light: NodeColorMap
    dark: NodeColorMap
  }
}

export interface NodeColorMap {
  project: string
  module: string
  folder: string
  file: string
  function: string
}

// ============================================================
// STORE STATE (Svelte Stores)
// ============================================================

export interface AppStore {
  graphState: GraphViewState
  selectedNodeDetails: NodeDetailsPanel | null
  searchResults: SearchResult[]
  currentSubgraph: GraphViewData | null
  isLoading: boolean
  error: string | null
}

// ============================================================
// COMPONENT PROPS
// ============================================================

export interface GraphRendererProps {
  data: GraphViewData
  state: GraphViewState
  onSelectNode: (nodeId: NodeId) => void
  onHoverNode: (nodeId: NodeId | null) => void
  onZoom: (level: number) => void
  onPan: (x: number, y: number) => void
}

export interface NodePanelProps {
  node: GraphNode
  calls: GraphNode[]
  calledBy: GraphNode[]
  imports: GraphNode[]
  importedBy: GraphNode[]
  codePreview: string | null
  onSelectNode: (nodeId: NodeId) => void
  onClose: () => void
}

export interface SearchBarProps {
  onSearch: (query: SearchQuery) => void
  onFilter: (options: FilterOptions) => void
  results: SearchResult[]
  onSelectResult: (result: SearchResult) => void
}

export interface ToolbarProps {
  state: GraphViewState
  onZoomIn: () => void
  onZoomOut: () => void
  onResetCamera: () => void
  onToggleTheme: (theme: 'light' | 'dark') => void
  onChangeLOD: (lod: 'modules' | 'files' | 'functions') => void
}

// ============================================================
// THEME CONFIGURATION
// ============================================================

export interface Theme {
  name: 'light' | 'dark'
  colors: {
    background: string
    foreground: string
    border: string
    primary: string
    secondary: string
    accent: string
  }
  nodeColors: NodeColorMap
}

export const LIGHT_THEME: Theme = {
  name: 'light',
  colors: {
    background: '#ffffff',
    foreground: '#000000',
    border: '#e0e0e0',
    primary: '#3b82f6',
    secondary: '#10b981',
    accent: '#f59e0b'
  },
  nodeColors: {
    project: '#3b82f6',
    module: '#06b6d4',
    folder: '#8b5cf6',
    file: '#10b981',
    function: '#f59e0b'
  }
}

export const DARK_THEME: Theme = {
  name: 'dark',
  colors: {
    background: '#1f2937',
    foreground: '#f3f4f6',
    border: '#374151',
    primary: '#60a5fa',
    secondary: '#34d399',
    accent: '#fbbf24'
  },
  nodeColors: {
    project: '#60a5fa',
    module: '#22d3ee',
    folder: '#a78bfa',
    file: '#34d399',
    function: '#fbbf24'
  }
}
