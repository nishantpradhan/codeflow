<script lang="ts">
  import './GraphRenderer.scss'
  import { createEventDispatcher, onMount } from 'svelte'
  import type { GraphViewData, GraphViewState } from '../../../shared/ui-types'
  import type { NodeId } from '../../../shared/types'

  export let data: GraphViewData
  export let state: GraphViewState
  export let lod: string = 'modules'
  export let cameraZoom: number | null = null
  export let resetCameraFlag: number = 0

  const dispatch = createEventDispatcher()

  let container: HTMLDivElement
  let sigma: any = null
  let initialCameraState: any = null

  const outerTypes = new Set(['file', 'function'])
  const outerNodes = new Set<string>()
  const hoverState = { key: null as string | null }

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

    // Create synthetic src folder node (since it's not in the graph but is the parent of modules)
    const srcFolderNode = {
      key: 'src:folder',
      label: 'src',
      type: 'folder',
      size: 8,
      color: '#8b5cf6'
    }

    // Add src folder to byType for proper layout calculation
    if (!byType['folder']) byType['folder'] = []
    byType['folder'].unshift(srcFolderNode)

    const radii: Record<string, number> = { project: 0, module: 150, folder: 300, file: 450, function: 600 }
    const srcFolderRadius = 80

    const shouldDisplayNode = (node: any): boolean => {
      if (node.type === 'project') return false
      if (node.key === srcFolderNode.key) return true
      if (lod === 'modules') return node.type === 'module'
      if (lod === 'files') return node.type !== 'function'
      return true
    }

    g.addNode(srcFolderNode.key, {
      label: srcFolderNode.label,
      icon: getNodeIcon('folder'),
      size: srcFolderNode.size * 2,
      color: srcFolderNode.color,
      x: srcFolderRadius,
      y: 0
    })

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

    const projectNodeId = nodes.find(n => n.type === 'project')?.key

    for (const edge of edges) {
      try {
        // Replace project-to-module and project-to-rootfile edges with src:folder as source
        let source = edge.source
        let target = edge.target
        if (source === projectNodeId) {
          source = 'src:folder'
        }

        if (!g.hasNode(source) || !g.hasNode(target)) continue
        const style = getEdgeStyle(edge.type)
        g.addEdge(source, target, { size: style.size, color: style.color, edgeType: edge.type })
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
          return { ...data, forceLabel: true }
        },
        edgeReducer: (edge: string, data: any) => {
          const source = graph.source(edge)
          const target = graph.target(edge)
          const edgeType = data.edgeType || 'CONTAINS'

          let baseOpacity = 1
          let baseSize = data.size

          // LOD-based edge emphasis
          if (lod === 'functions') {
            if (edgeType === 'CALLS') {
              baseOpacity = 1
              baseSize = data.size * 1.2
            } else if (edgeType === 'IMPORTS') {
              baseOpacity = 0.25
              baseSize = data.size * 0.4
            }
          } else if (lod === 'files') {
            if (edgeType === 'IMPORTS') {
              baseOpacity = 1
              baseSize = data.size * 1.2
            } else if (edgeType === 'CALLS') {
              baseOpacity = 0.15
              baseSize = data.size * 0.2
            }
          }

          if (hoverState.key) {
            if (source === hoverState.key || target === hoverState.key) {
              return {
                ...data,
                color: data.color,
                size: baseSize * 2,
                zIndex: 100,
                opacity: 1
              }
            } else {
              return {
                ...data,
                color: isDark ? '#2d3748' : '#e5e7eb',
                size: baseSize * 0.3,
                zIndex: 0,
                opacity: 0.15
              }
            }
          }

          return {
            ...data,
            size: baseSize,
            opacity: baseOpacity
          }
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

      sigma.on('clickNode', ({ node }: any) => dispatch('selectNode', node))
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
</script>

<div class="graph-renderer-wrap">
  <div class="graph-renderer" bind:this={container} />
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
