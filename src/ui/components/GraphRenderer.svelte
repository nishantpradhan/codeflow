<script lang="ts">
  import './GraphRenderer.scss'
  import { createEventDispatcher, onMount } from 'svelte'
  import type { GraphViewData, GraphViewState, FlowLayoutData } from '../../../shared/ui-types'
  import type { NodeId } from '../../../shared/types'

  export let data: GraphViewData
  export let state: GraphViewState
  export let lod: string = 'modules'
  export let cameraZoom: number | null = null
  export let resetCameraFlag: number = 0
  export let highlightedNodes: Set<string> = new Set()
  export let flowContext: FlowLayoutData | null = null

  const dispatch = createEventDispatcher()

  let container: HTMLDivElement
  let sigma: any = null
  let initialCameraState: any = null

  const outerTypes = new Set(['file', 'function'])
  const outerNodes = new Set<string>()
  const hoverState = { key: null as string | null }
  const searchState = { highlighted: new Set<string>(), visible: new Set<string>() }

  const EDGE_STYLES: Record<string, { color: string; size: number }> = {
    CONTAINS: { color: '#6b7280', size: 1   },
    IMPORTS:  { color: '#06b6d4', size: 2   },
    CALLS:    { color: '#f59e0b', size: 2   },
    EXTENDS:  { color: '#a78bfa', size: 3   }
  }

  function getEdgeStyle(type: string) {
    return EDGE_STYLES[type] ?? EDGE_STYLES.CONTAINS
  }

  function getNodeIcon(type: string): string {
    const icons: Record<string, string> = {
      project: '📦',
      module: '📁',
      folder: '📂',
      file: '📄',
      function: '⚙️'
    }
    return icons[type] || '●'
  }

  function buildGraph(GraphClass: any, nodes: any[], edges: any[]) {
    const g = new GraphClass()

    const byType: Record<string, any[]> = {}
    for (const node of nodes) {
      if (!byType[node.type]) byType[node.type] = []
      byType[node.type].push(node)
    }

    const radii: Record<string, number> = { project: 0, module: 150, folder: 80, file: 450, function: 600 }

    const shouldDisplayNode = (node: any): boolean => {
      if (node.type === 'project') return false
      // src:folder bridges project→modules and is always visible regardless of LOD
      if (node.key === 'src:folder') return true
      if (lod === 'modules') return node.type === 'module'
      if (lod === 'files') return node.type !== 'function'
      return true
    }

    for (const node of nodes) {
      if (g.hasNode(node.key)) continue
      if (!shouldDisplayNode(node)) continue

      const group = byType[node.type]
      const idx = group.indexOf(node)
      const total = group.length
      const baseRadius = radii[node.type] ?? 300
      const angle = total > 1 ? (2 * Math.PI * idx) / total : 0

      const minNodesForAlternation = 5
      const shouldAlternate = total >= minNodesForAlternation
      let radius = baseRadius

      if (shouldAlternate) {
        const isOuter = idx % 2 === 0
        const radiusVariation = baseRadius * 0.15
        radius = isOuter ? baseRadius + radiusVariation : baseRadius - radiusVariation
      }

      if (outerTypes.has(node.type)) outerNodes.add(node.key)

      g.addNode(node.key, {
        label: node.label,
        icon: getNodeIcon(node.type),
        size: node.size,
        color: node.color,
        x: node.x ?? Math.cos(angle) * radius,
        y: node.y ?? Math.sin(angle) * radius
      })
    }

    for (const edge of edges) {
      try {
        if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue
        const style = getEdgeStyle(edge.type)
        g.addEdge(edge.source, edge.target, { size: style.size, color: style.color, edgeType: edge.type })
      } catch (_) {
        // skip duplicate edges
      }
    }

    return g
  }

  onMount(async () => {
    if (!container) return

    await new Promise(resolve => requestAnimationFrame(resolve))
    if (!container) return

    try {
      const Sigma = (await import('sigma')).default
      const Graph = (await import('graphology')).default

      const graph = buildGraph(Graph, data.nodes, data.edges)

      const isDark = state.theme === 'dark'
      sigma = new Sigma(graph, container, {
        renderLabels: true,
        enableWebGL: true,
        defaultNodeColor: '#999',
        defaultEdgeColor: isDark ? '#4b5563' : '#ccc',
        labelRenderedSizeThreshold: -Infinity,
        labelSize: 12,
        labelWeight: 'normal',
        labelColor: { color: isDark ? '#f3f4f6' : '#111827' },
        allowInvalidContainer: true,
        nodeReducer: (node: string, data: any) => {
          if (searchState.highlighted.size > 0) {
            if (searchState.highlighted.has(node)) {
              return { ...data, forceLabel: true, size: data.size * 1.4, zIndex: 10 }
            }
            // 1-hop neighbors of highlighted nodes: shown as small dim context with labels
            if (searchState.visible.has(node)) {
              return { ...data, forceLabel: true, color: isDark ? '#374151' : '#d1d5db', size: data.size * 0.4 }
            }
            // Everything else: hidden
            return { ...data, hidden: true }
          }
          return { ...data, forceLabel: true }
        },
        edgeReducer: (edge: string, data: any) => {
          const source = graph.source(edge)
          const target = graph.target(edge)
          const edgeType = data.edgeType || 'CONTAINS'

          // Hover takes top priority
          if (hoverState.key) {
            if (source === hoverState.key || target === hoverState.key) {
              return { ...data, size: data.size * 2, zIndex: 100, opacity: 1 }
            }
            return { ...data, color: isDark ? '#2d3748' : '#e5e7eb', size: data.size * 0.3, zIndex: 0, opacity: 0.15 }
          }

          // Search:
          // - both endpoints highlighted → boldest (thicker)
          // - one endpoint highlighted, other is neighbor → bright (original color, normal size)
          // - both endpoints neighbors (no highlight) → hidden
          if (searchState.highlighted.size > 0) {
            const sH = searchState.highlighted.has(source)
            const tH = searchState.highlighted.has(target)
            if (sH && tH) {
              return { ...data, size: data.size * 1.5, zIndex: 10, opacity: 1 }
            }
            if (sH || tH) {
              return { ...data, size: data.size * 1.1, zIndex: 5, opacity: 1 }
            }
            return { ...data, hidden: true }
          }

          // LOD-based edge emphasis
          let baseOpacity = 1
          let baseSize = data.size
          if (lod === 'functions') {
            if (edgeType === 'CALLS') { baseSize = data.size * 1.2 }
            else if (edgeType === 'IMPORTS') { baseOpacity = 0.25; baseSize = data.size * 0.4 }
          } else if (lod === 'files') {
            if (edgeType === 'IMPORTS') { baseSize = data.size * 1.2 }
            else if (edgeType === 'CALLS') { baseOpacity = 0.15; baseSize = data.size * 0.2 }
          }

          return { ...data, size: baseSize, opacity: baseOpacity }
        },
        labelRenderer: (context: CanvasRenderingContext2D, data: any, settings: any) => {
          if (!data.label) return
          const size: number = settings.labelSize ?? 12
          const font: string = settings.labelFont ?? 'sans-serif'
          const weight: string = settings.labelWeight ?? 'normal'
          const labelColor = isDark ? '#f3f4f6' : '#111827'
          const icon = data.icon ?? '●'
          const x = data.x + data.size + 3
          const y = data.y + size / 3

          context.font = `${weight} ${size}px ${font}`
          context.fillStyle = data.color
          context.fillText(icon, x, y)

          const iconWidth = context.measureText(icon + ' ').width
          context.fillStyle = labelColor
          context.fillText(data.label, x + iconWidth, y)
        }
      })

      initialCameraState = { ...sigma.getCamera().getState() }

      sigma.on('clickNode', ({ node }: any) => {
        if (node === 'src:folder') return
        dispatch('selectNode', node)
      })
      sigma.on('enterNode', ({ node }: any) => {
        hoverState.key = node
        sigma.refresh()
        dispatch('hoverNode', node)
      })
      sigma.on('leaveNode', () => {
        hoverState.key = null
        sigma.refresh()
        dispatch('hoverNode', null)
      })

      let cameraDebounce: ReturnType<typeof setTimeout> | null = null
      sigma.getCamera().on('updated', () => {
        if (cameraDebounce) clearTimeout(cameraDebounce)
        cameraDebounce = setTimeout(() => {
          const camera = sigma.getCamera()
          dispatch('zoom', Math.min(1, 1 / camera.ratio))
          dispatch('pan', { x: camera.x, y: camera.y })
        }, 100)
      })
    } catch (error) {
      console.error('Failed to initialize Sigma:', error)
    }
  })

  $: if (sigma && cameraZoom !== null) {
    sigma.getCamera().setState({ ratio: 1 / cameraZoom })
  }

  $: if (sigma && initialCameraState && resetCameraFlag > 0) {
    sigma.getCamera().animate(initialCameraState, { duration: 300 })
  }

  $: if (sigma) {
    searchState.highlighted = highlightedNodes
    // Compute 1-hop neighbors so they can be shown as dim context around highlights
    const visible = new Set<string>(highlightedNodes)
    if (highlightedNodes.size > 0) {
      const graph = sigma.getGraph()
      for (const nodeId of highlightedNodes) {
        if (!graph.hasNode(nodeId)) continue
        graph.forEachNeighbor(nodeId, (n: string) => visible.add(n))
      }
    }
    searchState.visible = visible
    sigma.refresh()
  }

  // Hierarchical layout for flow mode — BFS rank assignment, no external deps
  let _savedPositions = new Map<string, { x: number; y: number }>()

  function _computeFlowLayout(ctx: FlowLayoutData): Map<string, { x: number; y: number }> {
    const LAYER_GAP = 180
    const NODE_GAP = 200

    // BFS from seeds following forward edges to assign layer ranks
    const ranks = new Map<string, number>()
    for (const id of ctx.seedNodes) ranks.set(id, 0)

    const queue = [...ctx.seedNodes]
    while (queue.length > 0) {
      const cur = queue.shift()!
      const curRank = ranks.get(cur) ?? 0
      for (const edge of ctx.edges) {
        if (edge.source === cur && !ranks.has(edge.target)) {
          ranks.set(edge.target, curRank + 1)
          queue.push(edge.target)
        }
      }
    }

    // Expanded nodes not reached by BFS land one rank past the deepest seed layer
    const maxSeedRank = ctx.seedNodes.reduce((m, id) => Math.max(m, ranks.get(id) ?? 0), 0)
    for (const id of ctx.expandedNodes) {
      if (!ranks.has(id)) ranks.set(id, maxSeedRank + 1)
    }

    // Group by rank, compute positions
    const byRank = new Map<number, string[]>()
    for (const [id, rank] of ranks) {
      if (!byRank.has(rank)) byRank.set(rank, [])
      byRank.get(rank)!.push(id)
    }

    const positions = new Map<string, { x: number; y: number }>()
    for (const [rank, ids] of byRank) {
      ids.forEach((id, i) => {
        positions.set(id, {
          x: (i - (ids.length - 1) / 2) * NODE_GAP,
          y: rank * LAYER_GAP
        })
      })
    }
    return positions
  }

  $: if (sigma && flowContext && highlightedNodes.size > 0) {
    const graph = sigma.getGraph()
    // Save original positions before first layout
    if (_savedPositions.size === 0) {
      for (const nodeId of highlightedNodes) {
        if (graph.hasNode(nodeId)) {
          _savedPositions.set(nodeId, {
            x: graph.getNodeAttribute(nodeId, 'x'),
            y: graph.getNodeAttribute(nodeId, 'y')
          })
        }
      }
    }
    const positions = _computeFlowLayout(flowContext)
    for (const [nodeId, pos] of positions) {
      if (graph.hasNode(nodeId)) {
        graph.setNodeAttribute(nodeId, 'x', pos.x)
        graph.setNodeAttribute(nodeId, 'y', pos.y)
      }
    }
    sigma.refresh()
  } else if (sigma && !flowContext && _savedPositions.size > 0) {
    // Restore positions when flow mode is cleared
    const graph = sigma.getGraph()
    for (const [nodeId, pos] of _savedPositions) {
      if (graph.hasNode(nodeId)) {
        graph.setNodeAttribute(nodeId, 'x', pos.x)
        graph.setNodeAttribute(nodeId, 'y', pos.y)
      }
    }
    _savedPositions = new Map()
    sigma.refresh()
  }
</script>

<div class="graph-renderer-wrap">
  <div class="graph-renderer" bind:this={container} />
  {#if flowContext}
    <div class="flow-layout-badge">
      <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11l-1.5-3.5L3 6l3.5-1.5L8 1z"/>
        <path d="M13 9l.75 1.75L15.5 11l-1.75.75L13 13.5l-.75-1.75L10.5 11l1.75-.75L13 9z" opacity="0.7"/>
      </svg>
      Hierarchical Layout
    </div>
  {/if}
  <div class="graph-legend">
    <div class="graph-legend__title">Nodes</div>
    {#each [
      { type: 'module',   label: 'Module',   color: '#06b6d4' },
      { type: 'folder',   label: 'Folder',   color: '#8b5cf6' },
      { type: 'file',     label: 'File',     color: '#10b981' },
      { type: 'function', label: 'Function', color: '#f59e0b' }
    ] as entry}
      <div class="graph-legend__item">
        <span class="graph-legend__dot" style="background:{entry.color}"></span>
        <span class="graph-legend__icon">{getNodeIcon(entry.type)}</span>
        <span class="graph-legend__label">{entry.label}</span>
      </div>
    {/each}

    <div class="graph-legend__divider"></div>
    <div class="graph-legend__title">Connections</div>
    {#each [
      { label: 'CONTAINS', color: '#6b7280', width: 1 },
      { label: 'IMPORTS',  color: '#06b6d4', width: 2 },
      { label: 'CALLS',    color: '#f59e0b', width: 2 },
      { label: 'EXTENDS',  color: '#a78bfa', width: 3 }
    ] as edge}
      <div class="graph-legend__item">
        <svg class="graph-legend__line" viewBox="0 0 28 10" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="5" x2="22" y2="5"
            stroke={edge.color}
            stroke-width={edge.width}
            stroke-linecap="round" />
          <polygon points="20,2 28,5 20,8" fill={edge.color} />
        </svg>
        <span class="graph-legend__label">{edge.label}</span>
      </div>
    {/each}
  </div>
</div>
