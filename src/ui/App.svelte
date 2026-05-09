<script lang="ts">
  import { onMount } from 'svelte'
  import {
    wsConnected,
    wsError,
    graphState,
    selectedNodeDetails,
    currentSubgraph,
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
  } from './stores'
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
        const response = await fetch('/api/graph/root')
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
        {#key `${$currentSubgraph}-${$graphState.theme}`}
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

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu',
      'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  }

  :global(.dark) {
    background-color: #1f2937;
    color: #f3f4f6;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    background: white;
    color: #000;
    transition: background-color 0.2s, color 0.2s;
  }

  .app.dark {
    background: #1f2937;
    color: #f3f4f6;
  }

  .header {
    border-bottom: 1px solid #e5e7eb;
    background: white;
    padding: 1rem;
  }

  .app.dark .header {
    border-bottom-color: #374151;
    background: #111827;
  }

  .header-content {
    max-width: 1600px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: bold;
    margin: 0;
    min-width: fit-content;
  }

  .main-content {
    display: flex;
    flex: 1;
    overflow: hidden;
    gap: 1px;
    background: #f3f4f6;
  }

  .app.dark .main-content {
    background: #374151;
  }

  .graph-container {
    flex: 1;
    overflow: hidden;
    background: white;
    position: relative;
  }

  .app.dark .graph-container {
    background: #1f2937;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #9ca3af;
    font-size: 1.1rem;
  }

  .node-panel-container {
    width: 360px;
    border-left: 1px solid #e5e7eb;
    background: white;
    overflow-y: auto;
  }

  .app.dark .node-panel-container {
    border-left-color: #374151;
    background: #111827;
  }

  .footer {
    border-top: 1px solid #e5e7eb;
    background: white;
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .app.dark .footer {
    border-top-color: #374151;
    background: #111827;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.875rem;
  }

  .status-ok {
    color: #10b981;
  }

  .status-error {
    color: #ef4444;
  }

  .status-connecting {
    color: #f59e0b;
  }

  .status-loading {
    color: #3b82f6;
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .error-banner {
    background: #fee2e2;
    color: #991b1b;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .app.dark .error-banner {
    background: #7f1d1d;
    color: #fecaca;
  }

  .error-banner p {
    margin: 0;
  }

  .error-banner button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 0.875rem;
    text-decoration: underline;
  }

  @media (max-width: 1024px) {
    .node-panel-container {
      position: fixed;
      right: 0;
      top: 60px;
      bottom: 50px;
      width: 360px;
      box-shadow: -2px 0 4px rgba(0, 0, 0, 0.1);
      z-index: 100;
    }
  }

  @media (max-width: 768px) {
    .header-content {
      flex-direction: column;
      gap: 1rem;
    }

    .node-panel-container {
      width: 100%;
      right: 0;
      left: 0;
      max-height: 50%;
    }
  }
</style>
