<script lang="ts">
  import './GraphRenderer.scss'
  import { createEventDispatcher, onMount } from 'svelte'
  import type { GraphViewData, GraphViewState } from '../../../shared/ui-types'
  import type { NodeId } from '../../../shared/types'

  export let data: GraphViewData
  export let state: GraphViewState
  export let cameraZoom: number | null = null
  export let resetCameraFlag: number = 0

  const dispatch = createEventDispatcher()

  let container: HTMLDivElement
  let sigma: any = null

  function buildGraph(GraphClass: any, nodes: any[], edges: any[]) {
    const graph = new GraphClass()

    // Group nodes by type to spread them in concentric rings
    const byType: Record<string, any[]> = {}
    for (const node of nodes) {
      if (!byType[node.type]) byType[node.type] = []
      byType[node.type].push(node)
    }

    const radii: Record<string, number> = { project: 0, module: 150, folder: 300, file: 450, function: 600 }

    for (const node of nodes) {
      if (graph.hasNode(node.key)) continue
      const group = byType[node.type]
      const idx = group.indexOf(node)
      const total = group.length
      const radius = radii[node.type] ?? 300
      const angle = total > 1 ? (2 * Math.PI * idx) / total : 0
      graph.addNode(node.key, {
        label: node.label,
        size: node.size,
        color: node.color,
        x: node.x ?? Math.cos(angle) * radius,
        y: node.y ?? Math.sin(angle) * radius
      })
    }

    const isDark = nodes.length > 0 && document.documentElement.classList.contains('dark')
    const edgeColor = isDark ? '#4b5563' : '#d1d5db'

    for (const edge of edges) {
      try {
        if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue
        graph.addEdge(edge.source, edge.target, {
          size: 1,
          color: edgeColor
        })
      } catch (_) {
        // skip duplicate edges
      }
    }

    return graph
  }

  onMount(async () => {
    if (!container) return

    await new Promise(resolve => requestAnimationFrame(resolve))

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
        labelDensity: 1,
        labelGridCellSize: 20,
        labelColor: { color: isDark ? '#f3f4f6' : '#111827' },
        allowInvalidContainer: true
      })

      sigma.on('clickNode', ({ node }: any) => dispatch('selectNode', node))
      sigma.on('enterNode', ({ node }: any) => dispatch('hoverNode', node))
      sigma.on('leaveNode', () => dispatch('hoverNode', null))
      sigma.getCamera().on('updated', () => {
        const camera = sigma.getCamera()
        const zoom = Math.min(1, 1 / camera.ratio)
        dispatch('zoom', zoom)
        dispatch('pan', { x: camera.x, y: camera.y })
      })
    } catch (error) {
      console.error('Failed to initialize Sigma:', error)
    }
  })

  // React to zoom slider changes — Sigma ratio is inverse of zoom
  $: if (sigma && cameraZoom !== null) {
    sigma.getCamera().setState({ ratio: 1 / cameraZoom })
  }

  // React to reset camera button
  $: if (sigma && resetCameraFlag > 0) {
    sigma.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 })
  }
</script>

<div class="graph-renderer" bind:this={container} />

