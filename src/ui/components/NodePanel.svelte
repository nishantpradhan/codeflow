<script lang="ts">
  import './NodePanel.scss'
  import { createEventDispatcher } from 'svelte'
  import type { GraphNode } from '../../../shared/types'

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

