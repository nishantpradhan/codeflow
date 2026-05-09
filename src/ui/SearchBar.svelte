<script lang="ts">
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

<style>
  .search-container {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex: 1;
    max-width: 600px;
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 0.5rem;
    transition: border-color 0.2s;
  }

  :global(.dark) .search-input-wrapper {
    background: #1f2937;
    border-color: #374151;
  }

  .search-input-wrapper:focus-within {
    border-color: #3b82f6;
    outline: 2px solid transparent;
    outline-offset: 2px;
  }

  .search-icon {
    width: 1.25rem;
    height: 1.25rem;
    color: #9ca3af;
    flex-shrink: 0;
  }

  .search-input {
    border: none;
    background: none;
    flex: 1;
    font-size: 0.95rem;
    outline: none;
  }

  .search-input::placeholder {
    color: #d1d5db;
  }

  :global(.dark) .search-input {
    color: #f3f4f6;
  }

  :global(.dark) .search-input::placeholder {
    color: #6b7280;
  }

  .clear-btn {
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    font-size: 1.25rem;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .clear-btn:hover {
    color: #6b7280;
  }

  .filters {
    display: flex;
    gap: 0.5rem;
  }

  .filter-btn {
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    background: white;
    color: #6b7280;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  :global(.dark) .filter-btn {
    background: #1f2937;
    border-color: #374151;
    color: #9ca3af;
  }

  .filter-btn:hover {
    border-color: #d1d5db;
    color: #4b5563;
  }

  :global(.dark) .filter-btn:hover {
    border-color: #4b5563;
    color: #e5e7eb;
  }

  .filter-btn.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }

  :global(.dark) .filter-btn.active {
    background: #3b82f6;
    border-color: #3b82f6;
  }
</style>
