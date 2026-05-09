import { writable, readable, derived } from 'svelte/store'
import type { GraphViewState, GraphViewData, NodeDetailsPanel, SearchResult, AppStore } from '../../shared/ui-types'
import type { NodeId } from '../../shared/types'

// ============================================================
// Core State Stores
// ============================================================

export const graphState = writable<GraphViewState>({
  selectedNodeId: null,
  hoveredNodeId: null,
  zoom: 1,
  pan: { x: 0, y: 0 },
  lod: 'files',
  theme: 'light'
})

export const selectedNodeDetails = writable<NodeDetailsPanel | null>(null)

export const currentSubgraph = writable<GraphViewData | null>(null)

export const searchResults = writable<SearchResult[]>([])

export const isLoading = writable(false)

export const error = writable<string | null>(null)

// ============================================================
// WebSocket Connection Store
// ============================================================

export const wsConnected = writable(false)

export const wsError = writable<string | null>(null)

// ============================================================
// Derived Stores
// ============================================================

export const selectedNodeId = derived(graphState, $state => $state.selectedNodeId)

export const zoom = derived(graphState, $state => $state.zoom)

export const lod = derived(graphState, $state => $state.lod)

export const theme = derived(graphState, $state => $state.theme)

export const pan = derived(graphState, $state => $state.pan)

export const hasSelectedNode = derived(selectedNodeDetails, $details => $details !== null)

// ============================================================
// Action Functions (sent to WebSocket)
// ============================================================

export function selectNode(nodeId: NodeId, ws: WebSocket | null): void {
  graphState.update(state => ({
    ...state,
    selectedNodeId: nodeId
  }))

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'select_node',
      nodeId
    }))
  }
}

export function hoverNode(nodeId: NodeId | null, ws: WebSocket | null): void {
  graphState.update(state => ({
    ...state,
    hoveredNodeId: nodeId
  }))

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'hover_node',
      nodeId
    }))
  }
}

export function setZoom(level: number, ws: WebSocket | null): void {
  graphState.update(state => ({
    ...state,
    zoom: level
  }))

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'zoom',
      level
    }))
  }
}

export function setPan(x: number, y: number, ws: WebSocket | null): void {
  graphState.update(state => ({
    ...state,
    pan: { x, y }
  }))

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'pan',
      x,
      y
    }))
  }
}

export function setLOD(lod: 'modules' | 'files' | 'functions', ws: WebSocket | null): void {
  graphState.update(state => ({
    ...state,
    lod
  }))

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'change_lod',
      lod
    }))
  }
}

export function setTheme(theme: 'light' | 'dark', ws: WebSocket | null): void {
  graphState.update(state => ({
    ...state,
    theme
  }))

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'change_theme',
      theme
    }))
  }

  // Update document class for Tailwind dark mode
  if (typeof document !== 'undefined') {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }
}

export function loadSubgraph(nodeId: NodeId, depth: number, ws: WebSocket | null): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    isLoading.set(true)
    ws.send(JSON.stringify({
      type: 'load_subgraph',
      nodeId,
      depth
    }))
  }
}

export function search(query: string, ws: WebSocket | null): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    isLoading.set(true)
    ws.send(JSON.stringify({
      type: 'search',
      query: {
        text: query,
        limit: 50
      }
    }))
  }
}

export function clearSelectedNode(): void {
  graphState.update(state => ({
    ...state,
    selectedNodeId: null
  }))
  selectedNodeDetails.set(null)
}

export function clearError(): void {
  error.set(null)
}

// ============================================================
// State Update Functions (called from WebSocket messages)
// ============================================================

export function updateSubgraph(data: GraphViewData): void {
  currentSubgraph.set(data)
  isLoading.set(false)
}

export function updateSearchResults(results: SearchResult[]): void {
  searchResults.set(results)
  isLoading.set(false)
}

export function updateNodeDetails(details: NodeDetailsPanel | null): void {
  selectedNodeDetails.set(details)
}

export function setWsConnected(connected: boolean): void {
  wsConnected.set(connected)
}

export function setWsError(err: string | null): void {
  wsError.set(err)
}

export function setError(err: string): void {
  error.set(err)
  isLoading.set(false)
}

export function setLoading(loading: boolean): void {
  isLoading.set(loading)
}

// ============================================================
// Helper Functions
// ============================================================

export function getStore(): Readonly<AppStore> {
  let state: AppStore | undefined = undefined
  const unsubscribe = (
    graphState as any
  ).subscribe((value: GraphViewState) => {
    state = state || ({} as AppStore)
    state.graphState = value
  })

  ;(currentSubgraph as any).subscribe((value: GraphViewData | null) => {
    state = state || ({} as AppStore)
    state.currentSubgraph = value
  })

  ;(selectedNodeDetails as any).subscribe((value: NodeDetailsPanel | null) => {
    state = state || ({} as AppStore)
    state.selectedNodeDetails = value
  })

  ;(searchResults as any).subscribe((value: SearchResult[]) => {
    state = state || ({} as AppStore)
    state.searchResults = value
  })

  ;(isLoading as any).subscribe((value: boolean) => {
    state = state || ({} as AppStore)
    state.isLoading = value
  })

  ;(error as any).subscribe((value: string | null) => {
    state = state || ({} as AppStore)
    state.error = value
  })

  unsubscribe()
  return state || ({} as AppStore)
}
