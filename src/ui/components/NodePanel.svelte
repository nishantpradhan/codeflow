<script lang="ts">
  import './NodePanel.scss'
  import { createEventDispatcher } from 'svelte'
  import type { GraphNode } from '../../../shared/types'

  export let node: GraphNode
  export let calls: GraphNode[] = []
  export let calledBy: GraphNode[] = []
  export let imports: GraphNode[] = []
  export let importedBy: GraphNode[] = []
  export let codePreview: string | null = null

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
  $: language = 'language' in node ? (node as any).language : undefined
  $: lineStart = 'lineStart' in node ? (node as any).lineStart : undefined
  $: lineEnd = 'lineEnd' in node ? (node as any).lineEnd : undefined
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

      {#if language !== undefined}
        <div class="detail-row">
          <span class="label">Language:</span>
          <span class="value">{language}</span>
        </div>
      {/if}

      {#if lineCount !== undefined}
        <div class="detail-row">
          <span class="label">Lines:</span>
          <span class="value">{lineCount}</span>
        </div>
      {/if}

      {#if lineStart !== undefined && lineEnd !== undefined}
        <div class="detail-row">
          <span class="label">Location:</span>
          <span class="value">{lineStart}–{lineEnd}</span>
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

  {#if codePreview}
    <div class="code-preview-section">
      <h3>Code</h3>
      <pre class="code-preview"><code>{codePreview}</code></pre>
    </div>
  {/if}

  {#if calls.length > 0 || node.type === 'function'}
    <div class="relations-section">
      <h3>Calls ({calls.length})</h3>
      <div class="relation-list">
        {#each calls as item (item.id)}
          <button
            class="relation-item"
            on:click={() => selectNode(item.id)}
            style="border-left-color: {getNodeTypeColor(item.type)}"
          >
            <span class="icon">{getNodeIcon(item.type)}</span>
            <span class="name">{item.label}</span>
          </button>
        {/each}
        {#if calls.length === 0}
          <p class="empty">No outgoing calls</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if calledBy.length > 0 || node.type === 'function'}
    <div class="relations-section">
      <h3>Called By ({calledBy.length})</h3>
      <div class="relation-list">
        {#each calledBy as item (item.id)}
          <button
            class="relation-item"
            on:click={() => selectNode(item.id)}
            style="border-left-color: {getNodeTypeColor(item.type)}"
          >
            <span class="icon">{getNodeIcon(item.type)}</span>
            <span class="name">{item.label}</span>
          </button>
        {/each}
        {#if calledBy.length === 0}
          <p class="empty">No incoming calls</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if imports.length > 0 || node.type === 'file' || node.type === 'module' || node.type === 'folder'}
    <div class="relations-section">
      <h3>Imports ({imports.length})</h3>
      <div class="relation-list">
        {#each imports as item (item.id)}
          <button
            class="relation-item"
            on:click={() => selectNode(item.id)}
            style="border-left-color: {getNodeTypeColor(item.type)}"
          >
            <span class="icon">{getNodeIcon(item.type)}</span>
            <span class="name">{item.label}</span>
          </button>
        {/each}
        {#if imports.length === 0}
          <p class="empty">No outgoing imports</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if importedBy.length > 0 || node.type === 'file' || node.type === 'module' || node.type === 'folder'}
    <div class="relations-section">
      <h3>Imported By ({importedBy.length})</h3>
      <div class="relation-list">
        {#each importedBy as item (item.id)}
          <button
            class="relation-item"
            on:click={() => selectNode(item.id)}
            style="border-left-color: {getNodeTypeColor(item.type)}"
          >
            <span class="icon">{getNodeIcon(item.type)}</span>
            <span class="name">{item.label}</span>
          </button>
        {/each}
        {#if importedBy.length === 0}
          <p class="empty">No incoming imports</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

