<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { GraphNode } from '../../shared/types'

  export let node: GraphNode
  export let neighbors: { incoming: GraphNode[]; outgoing: GraphNode[] }

  const dispatch = createEventDispatcher()

  function selectNode(nodeId: string) {
    dispatch('selectNode', nodeId)
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

  function getNodeTypeColor(type: string): string {
    const colors: Record<string, string> = {
      project: '#3b82f6',
      module: '#06b6d4',
      folder: '#8b5cf6',
      file: '#10b981',
      function: '#f59e0b'
    }
    return colors[type] || '#9ca3af'
  }

  $: lineCount = 'lineCount' in node ? (node as any).lineCount : undefined
  $: fileCount = 'fileCount' in node ? (node as any).fileCount : undefined
  $: isExported = 'isExported' in node ? (node as any).isExported : false
  $: isAsync = 'isAsync' in node ? (node as any).isAsync : false
  $: isMethod = 'isMethod' in node ? (node as any).isMethod : false
</script>

<div class="node-panel">
  <div class="panel-header">
    <button class="close-btn" on:click={() => dispatch('close')}>✕</button>
  </div>

  <div class="node-info">
    <div class="node-header">
      <div class="node-icon">{getNodeIcon(node.type)}</div>
      <div>
        <h2>{node.label}</h2>
        <p class="node-type">{node.type}</p>
      </div>
    </div>

    <div class="node-details">
      <div class="detail-row">
        <span class="label">Path:</span>
        <span class="value">{node.path}</span>
      </div>

      {#if lineCount !== undefined}
        <div class="detail-row">
          <span class="label">Lines:</span>
          <span class="value">{lineCount}</span>
        </div>
      {/if}

      {#if fileCount !== undefined}
        <div class="detail-row">
          <span class="label">Files:</span>
          <span class="value">{fileCount}</span>
        </div>
      {/if}

      {#if 'isExported' in node}
        <div class="detail-row">
          <span class="label">Exported:</span>
          <span class="value">{isExported ? '✓' : '✗'}</span>
        </div>
      {/if}

      {#if 'isAsync' in node}
        <div class="detail-row">
          <span class="label">Async:</span>
          <span class="value">{isAsync ? '✓' : '✗'}</span>
        </div>
      {/if}

      {#if 'isMethod' in node}
        <div class="detail-row">
          <span class="label">Method:</span>
          <span class="value">{isMethod ? '✓' : '✗'}</span>
        </div>
      {/if}
    </div>
  </div>

  <div class="neighbors-section">
    <h3>Incoming ({neighbors.incoming.length})</h3>
    <div class="neighbor-list">
      {#each neighbors.incoming as neighbor (neighbor.id)}
        <button
          class="neighbor-item"
          on:click={() => selectNode(neighbor.id)}
          style="border-left-color: {getNodeTypeColor(neighbor.type)}"
        >
          <span class="icon">{getNodeIcon(neighbor.type)}</span>
          <span class="name">{neighbor.label}</span>
        </button>
      {/each}
      {#if neighbors.incoming.length === 0}
        <p class="empty">No incoming connections</p>
      {/if}
    </div>
  </div>

  <div class="neighbors-section">
    <h3>Outgoing ({neighbors.outgoing.length})</h3>
    <div class="neighbor-list">
      {#each neighbors.outgoing as neighbor (neighbor.id)}
        <button
          class="neighbor-item"
          on:click={() => selectNode(neighbor.id)}
          style="border-left-color: {getNodeTypeColor(neighbor.type)}"
        >
          <span class="icon">{getNodeIcon(neighbor.type)}</span>
          <span class="name">{neighbor.label}</span>
        </button>
      {/each}
      {#if neighbors.outgoing.length === 0}
        <p class="empty">No outgoing connections</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .node-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 1rem;
    padding: 1rem;
    overflow-y: auto;
  }

  .panel-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: -0.5rem;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #9ca3af;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
    transition: background-color 0.2s;
  }

  .close-btn:hover {
    background-color: #e5e7eb;
  }

  :global(.dark) .close-btn:hover {
    background-color: #374151;
  }

  .node-info {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
    background: #f9fafb;
  }

  :global(.dark) .node-info {
    border-color: #374151;
    background: #111827;
  }

  .node-header {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1rem;
    align-items: flex-start;
  }

  .node-icon {
    font-size: 2rem;
    line-height: 1;
  }

  h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .node-type {
    margin: 0.25rem 0 0 0;
    font-size: 0.875rem;
    color: #6b7280;
  }

  :global(.dark) .node-type {
    color: #9ca3af;
  }

  .node-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
  }

  .label {
    color: #6b7280;
    font-weight: 500;
  }

  :global(.dark) .label {
    color: #9ca3af;
  }

  .value {
    color: #1f2937;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 0.8125rem;
  }

  :global(.dark) .value {
    color: #e5e7eb;
  }

  .neighbors-section {
    flex: 1;
    min-height: 0;
  }

  h3 {
    margin: 1rem 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  :global(.dark) h3 {
    color: #9ca3af;
  }

  .neighbor-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow-y: auto;
    max-height: 150px;
  }

  .neighbor-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-left: 3px solid transparent;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: background-color 0.2s, border-color 0.2s;
    text-align: left;
    font-size: 0.875rem;
  }

  :global(.dark) .neighbor-item {
    background: #1f2937;
    border-color: #374151;
  }

  .neighbor-item:hover {
    background-color: #f3f4f6;
    border-color: #d1d5db;
  }

  :global(.dark) .neighbor-item:hover {
    background-color: #111827;
    border-color: #4b5563;
  }

  .icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .empty {
    color: #9ca3af;
    font-size: 0.875rem;
    margin: 0.5rem 0;
  }
</style>
