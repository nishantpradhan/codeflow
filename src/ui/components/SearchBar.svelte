<script lang="ts">
  import './SearchBar.scss'
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  let query = ''
  let nodeTypeFilter = ''

  function handleSearch() {
    if (query.trim()) {
      dispatch('search', query)
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  function handleFilter(type: string) {
    nodeTypeFilter = nodeTypeFilter === type ? '' : type
    dispatch('filter', {
      nodeTypes: nodeTypeFilter ? [nodeTypeFilter] : []
    })
  }

  function clear() {
    query = ''
  }
</script>

<div class="search-container">
  <div class="search-input-wrapper">
    <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
      <path
        fill-rule="evenodd"
        d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
        clip-rule="evenodd"
      />
    </svg>
    <input
      type="text"
      placeholder="Search files, functions..."
      bind:value={query}
      on:keydown={handleKeydown}
      class="search-input"
    />
    {#if query}
      <button class="clear-btn" on:click={clear}>✕</button>
    {/if}
  </div>

  <div class="filters">
    {#each ['file', 'function', 'module'] as type}
      <button
        class="filter-btn"
        class:active={nodeTypeFilter === type}
        on:click={() => handleFilter(type)}
      >
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </button>
    {/each}
  </div>
</div>

