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
    loadSubgraph,
    search,
    clearSelectedNode
  } from '../stores'
  import GraphRenderer from './GraphRenderer.svelte'
  import NodePanel from './NodePanel.svelte'
  import SearchBar from './SearchBar.svelte'
  import Toolbar from './Toolbar.svelte'

  let ws: WebSocket | null = null
  let mounted = false
  let cameraZoom: number | null = null
  let resetCameraFlag = 0

  onMount(async () => {
    mounted = true
    initWebSocket()

    // Load root project after a short delay to ensure backend is ready
    setTimeout(async () => {
      try {
        const response = await fetch('/api/graph/root?depth=1')
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

  function handleNodeSelect(event: CustomEvent) {
    const nodeId = event.detail
    selectNode(nodeId, ws)
    loadSubgraph(nodeId, 2, ws)
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

  function handleSearch(event: CustomEvent) {
    const query = event.detail
    search(query, ws)
  }

  function handleFilter(event: CustomEvent) {
    const options = event.detail
    // Filter logic would go here
  }

  function handleZoomChange(event: CustomEvent) {
    cameraZoom = event.detail
    setZoom(event.detail, ws)
  }

  function handleResetCamera() {
    resetCameraFlag += 1
  }

  const lodDepth: Record<string, number> = { modules: 1, files: 2, functions: 3 }

  async function handleLODChange(event: CustomEvent) {
    const lod = event.detail
    setLOD(lod, ws)
    const depth = lodDepth[lod] ?? 1
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
</script>

<div class="app {$graphState.theme}">
  <header class="header">
    <div class="header-content">
      <h1>Codeflow</h1>
      <SearchBar on:search={handleSearch} on:filter={handleFilter} />
    </div>
  </header>

  <main class="main-content">
    <div class="graph-container">
      {#if $currentSubgraph}
        {#key `${$graphVersion}-${$graphState.theme}`}
          <GraphRenderer
            data={$currentSubgraph}
            state={$graphState}
            cameraZoom={cameraZoom}
            resetCameraFlag={resetCameraFlag}
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

    {#if $selectedNodeDetails}
      <div class="node-panel-container">
        <NodePanel
          node={$selectedNodeDetails.node}
          neighbors={$selectedNodeDetails.neighbors}
          on:close={handleCloseNodePanel}
          on:selectNode={handleNodeSelect}
        />
      </div>
    {/if}
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

