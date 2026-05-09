<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import type { GraphViewData, GraphViewState } from '../shared/ui-types'
  import type { NodeId } from '../shared/types'

  export let data: GraphViewData
  export let state: GraphViewState

  const dispatch = createEventDispatcher()

  let container: HTMLDivElement
  let sigma: any = null

  onMount(async () => {
    if (!container) return

    // Dynamically import sigma.js
    try {
      const Sigma = (await import('sigma')).default
      const Graph = (await import('graphology')).default

      // Create graph from data
      const graph = new Graph()

      for (const node of data.nodes) {
        graph.addNode(node.key, {
          label: node.label,
          size: node.size,
          color: node.color,
          type: node.type
        })
      }

      for (const edge of data.edges) {
        graph.addEdge(edge.source, edge.target, {
          type: edge.type,
          weight: edge.weight
        })
      }

      // Initialize Sigma
      sigma = new Sigma(graph, container, {
        renderLabels: true,
        enableWebGL: true
      })

      // Event handlers
      sigma.on('clickNode', ({ node }: any) => {
        dispatch('selectNode', node)
      })

      sigma.on('enterNode', ({ node }: any) => {
        dispatch('hoverNode', node)
      })

      sigma.on('leaveNode', () => {
        dispatch('hoverNode', null)
      })

      // Camera events
      sigma.getCamera().on('updated', () => {
        const camera = sigma.getCamera()
        dispatch('zoom', camera.getZoom())
        dispatch('pan', {
          x: camera.x,
          y: camera.y
        })
      })
    } catch (error) {
      console.error('Failed to initialize Sigma:', error)
    }
  })
</script>

<div class="graph-renderer" bind:this={container} />

<style>
  .graph-renderer {
    width: 100%;
    height: 100%;
  }
</style>
