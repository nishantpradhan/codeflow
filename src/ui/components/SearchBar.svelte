<script lang="ts">
  import './SearchBar.scss'
  import { createEventDispatcher } from 'svelte'
  import { search as sendSearch, searchResults, searchMode, setSearchMode, pinnedHighlight, setPinnedHighlight, isLoading } from '../stores'
  import type { SearchMode } from '../stores'
  import type { SearchResult } from '../../../shared/ui-types'

  export let ws: WebSocket | null = null

  const dispatch = createEventDispatcher()

  let query = ''
  let showDropdown = false
  let inputEl: HTMLInputElement
  let containerEl: HTMLDivElement

  function handleClickOutside(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) {
      showDropdown = false
    }
  }

  function handleSearch() {
    if (query.trim()) {
      // Clear previous pin — a new query shouldn't keep the previously selected node highlighted
      setPinnedHighlight(null)
      sendSearch(query, ws, $searchMode)
      showDropdown = true
    } else {
      clear()
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSearch()
    } else if (e.key === 'Escape') {
      clear()
    }
  }

  let modeSearchTimer: ReturnType<typeof setTimeout> | null = null

  function handleModeChange(mode: SearchMode) {
    setSearchMode(mode)
    if (!query.trim()) return

    // Debounce so rapid toggles don't fan out multiple requests / highlight churn.
    // Keep pinned highlight — switching modes is a refinement, not a new query.
    if (modeSearchTimer) clearTimeout(modeSearchTimer)
    modeSearchTimer = setTimeout(() => {
      sendSearch(query, ws, mode)
      showDropdown = true
    }, 180)
  }

  function clear() {
    query = ''
    showDropdown = false
    searchResults.set([])
    setSearchMode('name')
    setPinnedHighlight(null)
  }

  function handleResultClick(result: SearchResult) {
    dispatch('selectNode', result.nodeId)
    setPinnedHighlight(result.nodeId as string)
    showDropdown = false
  }

  // Show dropdown when results arrive (e.g. from async response)
  $: if ($searchResults.length > 0 && query) showDropdown = true

  const nodeTypeIcon: Record<string, string> = {
    project: '📦',
    module: '📁',
    folder: '📂',
    file: '📄',
    function: '⚙️'
  }

  const modes: Array<{ id: SearchMode; label: string; ai?: boolean }> = [
    { id: 'name', label: 'Name' },
    { id: 'imports', label: 'Imports' },
    { id: 'calls', label: 'Calls' },
    { id: 'flow', label: 'Flow', ai: true }
  ]

  $: filteredResults = $searchResults
  $: placeholder = $searchMode === 'name'
    ? 'Search files, functions...'
    : $searchMode === 'imports'
      ? 'Find files that import...'
      : $searchMode === 'calls'
        ? 'Find functions that call...'
        : 'Describe a flow or concept...'
</script>

<svelte:window on:mousedown={handleClickOutside} />

<div class="search-container" bind:this={containerEl}>
  <div class="search-input-area">
    <div class="search-input-wrapper">
      <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
          clip-rule="evenodd"
        />
      </svg>
      <input
        bind:this={inputEl}
        type="text"
        {placeholder}
        bind:value={query}
        on:keydown={handleKeydown}
        class="search-input"
        autocomplete="off"
      />
      {#if $isLoading && query}
        <span class="search-spinner">↻</span>
      {:else if query}
        <button class="clear-btn" on:click={clear}>✕</button>
      {/if}
    </div>

    {#if showDropdown && filteredResults.length > 0}
      <div class="search-results">
        {#each filteredResults as result (result.nodeId)}
          <button
            class="result-item"
            on:click={() => handleResultClick(result)}
          >
            <span class="result-icon">{nodeTypeIcon[result.type] ?? '●'}</span>
            <span class="result-body">
              <span class="result-label">{result.label}</span>
              {#if result.reason}
                <span class="result-reason">{result.reason}</span>
              {:else}
                <span class="result-path">{result.path}</span>
              {/if}
            </span>
            <span class="result-meta">
              <span class="result-type">{result.type}</span>
              <span class="result-score">{result.matches}%</span>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="filters">
    {#each modes as mode}
      <button
        class="filter-btn"
        class:active={$searchMode === mode.id}
        class:filter-btn--ai={mode.ai}
        on:click={() => handleModeChange(mode.id)}
        title={mode.id === 'name' ? 'Search by name' : mode.id === 'imports' ? 'Find what imports this' : mode.id === 'calls' ? 'Find what calls this' : 'AI-powered flow trace'}
      >
        {#if mode.ai}
          <svg class="ai-icon" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11l-1.5-3.5L3 6l3.5-1.5L8 1z"/>
            <path d="M13 9l.75 1.75L15.5 11l-1.75.75L13 13.5l-.75-1.75L10.5 11l1.75-.75L13 9z" opacity="0.7"/>
          </svg>
        {/if}
        {mode.label}
      </button>
    {/each}
  </div>
</div>
