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
  let initialCameraState: any = null

  const outerTypes = new Set(['file', 'function'])
  const outerNodes = new Set<string>()
  const hoverState = { key: null as string | null }

  function buildGraph(GraphClass: any, nodes: any[], edges: any[]) {
    const g = new GraphClass()

    const byType: Record<string, any[]> = {}
    for (const node of nodes) {
      if (!byType[node.type]) byType[node.type] = []
      byType[node.type].push(node)
    }

    const radii: Record<string, number> = { project: 0, module: 150, folder: 300, file: 450, function: 600 }

    for (const node of nodes) {
      if (g.hasNode(node.key)) continue
      const group = byType[node.type]
      const idx = group.indexOf(node)
      const total = group.length
      const baseRadius = radii[node.type] ?? 300
      const angle = total > 1 ? (2 * Math.PI * idx) / total : 0

      // Only alternate nodes if type has many nodes (5+) to avoid clutter
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
        if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue
        g.addEdge(edge.source, edge.target, { size: 1, color: edgeColor })
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
        labelColor: { color: isDark ? '#f3f4f6' : '#000000' },
        allowInvalidContainer: true,
        nodeReducer: (node: string, data: any) => {
          return { ...data, forceLabel: true }
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

<div class="graph-renderer" bind:this={container} />
