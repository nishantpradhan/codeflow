<script lang="ts">
  import './App.scss'
  import { onMount } from 'svelte'
  import {
    wsConnected,
    wsError,
    graphState,
    selectedNodeDetails,
    currentSubgraph,
    graphVersion,
    searchResults,
    pinnedHighlight,
    error,
    isLoading,
    setWsConnected,
    setWsError,
    setError,
    updateSubgraph,
    updateSearchResults,
    clearError,
    selectNode,
    hoverNode,
    setZoom,
    setPan,
    setLOD,
    setTheme,
    clearSelectedNode,
    updateNodeDetails
  } from '../stores'
  import GraphRenderer from './GraphRenderer.svelte'
  import NodePanel from './NodePanel.svelte'
  import Toolbar from './Toolbar.svelte'
  import SearchBar from './SearchBar.svelte'

  let ws: WebSocket | null = null
  let mounted = false
  let cameraZoom: number | null = null
  let resetCameraFlag = 0
  let projectName = 'Codeflow'

  onMount(async () => {
    mounted = true
    initWebSocket()

    // Load root project after a short delay to ensure backend is ready
    setTimeout(async () => {
      try {
        // depth=3 to include files (src:folder adds one level: project→src→module→file)
        const response = await fetch('/api/graph/root?depth=3')
        const data = await response.json()
        console.log('Root project response:', data)
        if (data.success && data.data) {
          updateSubgraph(data.data.sigma)
        }
      } catch (err) {
        console.error('Could not auto-load root project:', err)
      }
    }, 1000)
  })

  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`

    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setWsConnected(true)
      setWsError(null)
      console.log('WebSocket connected')
    }

    ws.onmessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data)

      switch (message.type) {
        case 'subgraph_loaded':
          updateSubgraph(message.data)
          break
        case 'search_results':
          updateSearchResults(message.results)
          break
        case 'file_changed':
          console.log('File changed:', message.filePath)
          // Optionally refresh affected nodes
          break
        case 'error':
          setError(message.message)
          break
        case 'state_update':
          // Handle state updates from server
          break
      }
    }

    ws.onerror = () => {
      setWsConnected(false)
      setWsError('WebSocket connection failed')
    }

    ws.onclose = () => {
      setWsConnected(false)
      // Attempt reconnect after 3 seconds
      setTimeout(() => {
        if (mounted) initWebSocket()
      }, 3000)
    }
  }

  async function handleNodeSelect(event: CustomEvent) {
    const nodeId = event.detail
    selectNode(nodeId, ws)

    try {
      const res = await fetch(`/api/graph/node/${encodeURIComponent(nodeId)}`)
      const data = await res.json()
      if (data.success && data.data) {
        updateNodeDetails({
          nodeId,
          node: data.data.node,
          calls: data.data.calls ?? [],
          calledBy: data.data.calledBy ?? [],
          imports: data.data.imports ?? [],
          importedBy: data.data.importedBy ?? [],
          codePreview: data.data.codePreview ?? null
        })
      }
    } catch (_) {
      // Silent fail — panel just won't open
    }
  }

  function handleNodeHover(event: CustomEvent) {
    const nodeId = event.detail
    hoverNode(nodeId, ws)
  }

  function handleZoom(event: CustomEvent) {
    const level = event.detail
    setZoom(level, ws)
  }

  function handlePan(event: CustomEvent) {
    const { x, y } = event.detail
    setPan(x, y, ws)
  }

  function handleZoomChange(event: CustomEvent) {
    cameraZoom = event.detail
    setZoom(event.detail, ws)
  }

  function handleResetCamera() {
    resetCameraFlag += 1
  }

  // src:folder adds one level between project and modules, so all depths are +1 vs before
  const lodDepth: Record<string, number> = { modules: 2, files: 3, functions: 4 }

  async function handleLODChange(event: CustomEvent) {
    const lod = event.detail
    setLOD(lod, ws)
    const lodDepthValue = lodDepth[lod] ?? 2
    const depth = Math.max(lodDepthValue, 3)
    try {
      const response = await fetch(`/api/graph/root?depth=${depth}`)
      const data = await response.json()
      if (data.success && data.data) {
        updateSubgraph(data.data.sigma)
      }
    } catch (err) {
      console.error('Failed to reload graph for LOD:', err)
    }
  }

  function handleThemeChange(event: CustomEvent) {
    const theme = event.detail
    setTheme(theme, ws)
  }

  function handleCloseNodePanel() {
    clearSelectedNode()
  }

  function sanitizeProjectName(name: string): string {
    return name
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim()
  }

  // Extract project name from current subgraph
  $: if ($currentSubgraph) {
    const projectNode = $currentSubgraph.nodes.find(n => n.type === 'project')
    if (projectNode) {
      projectName = sanitizeProjectName(projectNode.label)
    }
  }

  // Highlighted node IDs — LOD-aware promotion.
  // - Functions LOD: only direct result nodes; no promotion (function is visible).
  // - Files LOD: function results promote to their parent file (function nodes hidden at this LOD).
  // - Modules LOD: top result promotes to its parent module (only modules visible at this LOD).
  // Pinned highlight (user-clicked result) always stays lit.
  $: highlightedNodes = (() => {
    if ($searchResults.length === 0 && !$pinnedHighlight) return new Set<string>()
    const ids = new Set<string>()
    const lod = $graphState.lod

    for (const r of $searchResults) {
      ids.add(r.nodeId as string)
    }

    if (lod === 'files') {
      // Promote top function result to its parent file
      const topFn = $searchResults.find(r => r.type === 'function')
      if (topFn) ids.add(`${topFn.path}:file`)
    } else if (lod === 'modules') {
      // Promote top result to its parent module so something is visible at modules LOD
      const top = $searchResults[0]
      if (top) {
        const segs = top.path.split('/')
        if (segs.length >= 2) ids.add(`${segs[0]}/${segs[1]}:module`)
      }
    }

    if ($pinnedHighlight) ids.add($pinnedHighlight)

    return ids
  })()

  async function handleSearchSelectNode(event: CustomEvent) {
    await handleNodeSelect(event)
  }
</script>

<div class="app {$graphState.theme}">
  <div class="app-main">
    <header class="header">
      <div class="header-content">
        <h1><span class="header-label">Project:</span> {projectName}</h1>
        <SearchBar
          {ws}
          on:selectNode={handleSearchSelectNode}
        />
      </div>
    </header>

    <main class="main-content">
      <div class="graph-container">
        {#if $currentSubgraph}
          {#key `${$graphVersion}-${$graphState.theme}`}
            <GraphRenderer
              data={$currentSubgraph}
              state={$graphState}
              lod={$graphState.lod}
              cameraZoom={cameraZoom}
              resetCameraFlag={resetCameraFlag}
              {highlightedNodes}
              on:selectNode={handleNodeSelect}
              on:hoverNode={handleNodeHover}
              on:zoom={handleZoom}
              on:pan={handlePan}
            />
          {/key}
        {:else}
          <div class="empty-state">
            <p>No graph loaded. Select a node to begin.</p>
          </div>
        {/if}
      </div>
    </main>

    <footer class="footer">
      <Toolbar
        state={$graphState}
        on:zoomChange={handleZoomChange}
        on:resetCamera={handleResetCamera}
        on:lodChange={handleLODChange}
        on:themeChange={handleThemeChange}
      />
      <div class="status">
        {#if $wsError}
          <span class="status-error">⚠️ {$wsError}</span>
        {:else if $wsConnected}
          <span class="status-ok">✓ Connected</span>
        {:else}
          <span class="status-connecting">↻ Connecting...</span>
        {/if}

        {#if $error}
          <div class="error-banner">
            <p>{$error}</p>
            <button on:click={clearError}>Dismiss</button>
          </div>
        {/if}

        {#if $isLoading}
          <span class="status-loading">↻ Loading...</span>
        {/if}
      </div>
    </footer>
  </div>

  {#if $selectedNodeDetails}
    <div class="node-panel-container">
      <NodePanel
        node={$selectedNodeDetails.node}
        calls={$selectedNodeDetails.calls}
        calledBy={$selectedNodeDetails.calledBy}
        imports={$selectedNodeDetails.imports}
        importedBy={$selectedNodeDetails.importedBy}
        codePreview={$selectedNodeDetails.codePreview}
        on:close={handleCloseNodePanel}
        on:selectNode={handleNodeSelect}
      />
    </div>
  {/if}
</div>

