// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import {
  graphState,
  currentSubgraph,
  selectedNodeDetails,
  isLoading,
  error,
  wsConnected,
  wsError,
  searchResults,
  graphVersion,
  selectedNodeId,
  zoom,
  lod,
  theme,
  pan,
  hasSelectedNode,
  selectNode,
  hoverNode,
  setZoom,
  setPan,
  setLOD,
  setTheme,
  updateSubgraph,
  updateSearchResults,
  clearSelectedNode,
  clearError,
  setError,
  setWsConnected,
  setWsError,
  setLoading,
  getStore
} from '../../src/ui/stores'
import type { GraphViewData } from '../../shared/ui-types'

const initialGraphState = {
  selectedNodeId: null,
  hoveredNodeId: null,
  zoom: 1,
  pan: { x: 0, y: 0 },
  lod: 'modules',
  theme: 'light'
}

const makeSubgraphData = (): GraphViewData => ({
  nodes: [{ key: 'src/index.ts', label: 'index.ts', size: 5, color: '#10b981', type: 'file' }],
  edges: [],
  rootId: 'src/index.ts' as any,
  depth: 1
})

beforeEach(() => {
  graphState.set({ ...initialGraphState } as any)
  currentSubgraph.set(null)
  selectedNodeDetails.set(null)
  isLoading.set(false)
  error.set(null)
  wsConnected.set(false)
  wsError.set(null)
  searchResults.set([])
  graphVersion.set(0)
})

describe('Initial state', () => {
  it('has correct default graphState', () => {
    const state = get(graphState)
    expect(state.selectedNodeId).toBeNull()
    expect(state.zoom).toBe(1)
    expect(state.lod).toBe('modules')
    expect(state.theme).toBe('light')
  })

  it('starts with no subgraph, no selected node, no error', () => {
    expect(get(currentSubgraph)).toBeNull()
    expect(get(selectedNodeDetails)).toBeNull()
    expect(get(error)).toBeNull()
    expect(get(isLoading)).toBe(false)
  })

  it('starts disconnected', () => {
    expect(get(wsConnected)).toBe(false)
    expect(get(wsError)).toBeNull()
  })
})

describe('Derived stores', () => {
  it('selectedNodeId reflects graphState', () => {
    graphState.update(s => ({ ...s, selectedNodeId: 'src/auth.ts' as any }))
    expect(get(selectedNodeId)).toBe('src/auth.ts')
  })

  it('zoom reflects graphState', () => {
    graphState.update(s => ({ ...s, zoom: 0.5 }))
    expect(get(zoom)).toBe(0.5)
  })

  it('lod reflects graphState', () => {
    graphState.update(s => ({ ...s, lod: 'files' }))
    expect(get(lod)).toBe('files')
  })

  it('theme reflects graphState', () => {
    graphState.update(s => ({ ...s, theme: 'dark' }))
    expect(get(theme)).toBe('dark')
  })

  it('pan reflects graphState', () => {
    graphState.update(s => ({ ...s, pan: { x: 100, y: 200 } }))
    expect(get(pan)).toEqual({ x: 100, y: 200 })
  })

  it('hasSelectedNode is false when no details', () => {
    expect(get(hasSelectedNode)).toBe(false)
  })

  it('hasSelectedNode is true when details are set', () => {
    selectedNodeDetails.set({ nodeId: 'src/auth.ts' as any, node: {} as any, neighbors: { incoming: [], outgoing: [] } })
    expect(get(hasSelectedNode)).toBe(true)
  })
})

describe('selectNode', () => {
  it('updates selectedNodeId in graphState', () => {
    selectNode('src/auth.ts' as any, null)
    expect(get(graphState).selectedNodeId).toBe('src/auth.ts')
  })

  it('does not throw when ws is null', () => {
    expect(() => selectNode('src/auth.ts' as any, null)).not.toThrow()
  })
})

describe('hoverNode', () => {
  it('updates hoveredNodeId', () => {
    hoverNode('src/db.ts' as any, null)
    expect(get(graphState).hoveredNodeId).toBe('src/db.ts')
  })

  it('clears hoveredNodeId when null is passed', () => {
    hoverNode('src/db.ts' as any, null)
    hoverNode(null, null)
    expect(get(graphState).hoveredNodeId).toBeNull()
  })
})

describe('setZoom', () => {
  it('updates zoom level', () => {
    setZoom(0.75, null)
    expect(get(graphState).zoom).toBe(0.75)
  })

  it('accepts values between 0 and 1', () => {
    setZoom(0.1, null)
    expect(get(graphState).zoom).toBe(0.1)
    setZoom(1, null)
    expect(get(graphState).zoom).toBe(1)
  })
})

describe('setPan', () => {
  it('updates pan coordinates', () => {
    setPan(50, -30, null)
    expect(get(graphState).pan).toEqual({ x: 50, y: -30 })
  })
})

describe('setLOD', () => {
  it('switches to files', () => {
    setLOD('files', null)
    expect(get(graphState).lod).toBe('files')
  })

  it('switches to functions', () => {
    setLOD('functions', null)
    expect(get(graphState).lod).toBe('functions')
  })

  it('switches back to modules', () => {
    setLOD('functions', null)
    setLOD('modules', null)
    expect(get(graphState).lod).toBe('modules')
  })
})

describe('setTheme', () => {
  it('switches to dark', () => {
    setTheme('dark', null)
    expect(get(graphState).theme).toBe('dark')
  })

  it('switches back to light', () => {
    setTheme('dark', null)
    setTheme('light', null)
    expect(get(graphState).theme).toBe('light')
  })
})

describe('updateSubgraph', () => {
  it('sets currentSubgraph and increments graphVersion', () => {
    const data = makeSubgraphData()
    updateSubgraph(data)

    expect(get(currentSubgraph)).toEqual(data)
    expect(get(graphVersion)).toBe(1)
    expect(get(isLoading)).toBe(false)
  })

  it('increments graphVersion on each call', () => {
    updateSubgraph(makeSubgraphData())
    updateSubgraph(makeSubgraphData())
    expect(get(graphVersion)).toBe(2)
  })
})

describe('updateSearchResults', () => {
  it('sets results and clears loading', () => {
    isLoading.set(true)
    updateSearchResults([{ nodeId: 'src/auth.ts' as any, label: 'auth.ts', type: 'file', path: 'src/auth.ts', matches: 3 }])

    expect(get(searchResults)).toHaveLength(1)
    expect(get(isLoading)).toBe(false)
  })
})

describe('clearSelectedNode', () => {
  it('clears both selectedNodeId and selectedNodeDetails', () => {
    selectNode('src/auth.ts' as any, null)
    selectedNodeDetails.set({ nodeId: 'src/auth.ts' as any, node: {} as any, neighbors: { incoming: [], outgoing: [] } })

    clearSelectedNode()

    expect(get(graphState).selectedNodeId).toBeNull()
    expect(get(selectedNodeDetails)).toBeNull()
  })
})

describe('error handling', () => {
  it('setError sets the error message and stops loading', () => {
    isLoading.set(true)
    setError('Connection refused')

    expect(get(error)).toBe('Connection refused')
    expect(get(isLoading)).toBe(false)
  })

  it('clearError resets the error', () => {
    setError('Something went wrong')
    clearError()
    expect(get(error)).toBeNull()
  })
})

describe('WebSocket state', () => {
  it('setWsConnected updates the connected flag', () => {
    setWsConnected(true)
    expect(get(wsConnected)).toBe(true)
    setWsConnected(false)
    expect(get(wsConnected)).toBe(false)
  })

  it('setWsError sets and clears ws error', () => {
    setWsError('WebSocket connection failed')
    expect(get(wsError)).toBe('WebSocket connection failed')
    setWsError(null)
    expect(get(wsError)).toBeNull()
  })
})

describe('setLoading', () => {
  it('toggles the loading flag', () => {
    setLoading(true)
    expect(get(isLoading)).toBe(true)
    setLoading(false)
    expect(get(isLoading)).toBe(false)
  })
})

describe('getStore snapshot', () => {
  it('returns a consistent snapshot of all state', () => {
    const data = makeSubgraphData()
    updateSubgraph(data)
    setError('test error')

    const snapshot = getStore()

    expect(snapshot.currentSubgraph).toEqual(data)
    expect(snapshot.error).toBe('test error')
    expect(snapshot.isLoading).toBe(false)
  })
})
