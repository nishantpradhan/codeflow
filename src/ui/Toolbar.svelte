<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { GraphViewState } from '../shared/ui-types'

  export let state: GraphViewState

  const dispatch = createEventDispatcher()

  function zoomIn() {
    dispatch('zoomIn')
  }

  function zoomOut() {
    dispatch('zoomOut')
  }

  function resetCamera() {
    dispatch('resetCamera')
  }

  function changeLOD(lod: 'modules' | 'files' | 'functions') {
    dispatch('lodChange', lod)
  }

  function toggleTheme() {
    const newTheme = state.theme === 'light' ? 'dark' : 'light'
    dispatch('themeChange', newTheme)
  }
</script>

<div class="toolbar">
  <div class="tool-group">
    <label for="zoom-level">Zoom: {Math.round(state.zoom * 100)}%</label>
    <input
      id="zoom-level"
      type="range"
      min="0.1"
      max="5"
      step="0.1"
      value={state.zoom}
      on:input={e => dispatch('zoomChange', parseFloat(e.currentTarget.value))}
      class="slider"
    />
  </div>

  <div class="tool-group">
    <span>LOD:</span>
    {#each ['modules', 'files', 'functions'] as lod}
      <button
        class="lod-btn"
        class:active={state.lod === lod}
        on:click={() => changeLOD(lod)}
      >
        {lod.charAt(0).toUpperCase()}
      </button>
    {/each}
  </div>

  <div class="tool-group">
    <button class="icon-btn" on:click={resetCamera} title="Reset camera">
      🎯
    </button>
  </div>

  <div class="tool-group">
    <button
      class="icon-btn theme-btn"
      on:click={toggleTheme}
      title={state.theme === 'light' ? 'Dark mode' : 'Light mode'}
    >
      {state.theme === 'light' ? '🌙' : '☀️'}
    </button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .tool-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  label {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }

  :global(.dark) label {
    color: #9ca3af;
  }

  .slider {
    width: 120px;
    height: 4px;
    border-radius: 2px;
    background: #e5e7eb;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  :global(.dark) .slider {
    background: #374151;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .slider::-webkit-slider-thumb:hover {
    background: #2563eb;
  }

  .slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: none;
    transition: background-color 0.2s;
  }

  .slider::-moz-range-thumb:hover {
    background: #2563eb;
  }

  .lod-btn {
    width: 32px;
    height: 32px;
    border-radius: 0.375rem;
    border: 1px solid #d1d5db;
    background: white;
    color: #6b7280;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  :global(.dark) .lod-btn {
    background: #1f2937;
    border-color: #374151;
    color: #9ca3af;
  }

  .lod-btn:hover {
    border-color: #9ca3af;
    color: #4b5563;
  }

  :global(.dark) .lod-btn:hover {
    border-color: #4b5563;
    color: #e5e7eb;
  }

  .lod-btn.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 0.375rem;
    border: 1px solid #d1d5db;
    background: white;
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  :global(.dark) .icon-btn {
    background: #1f2937;
    border-color: #374151;
  }

  .icon-btn:hover {
    border-color: #9ca3af;
    background: #f3f4f6;
  }

  :global(.dark) .icon-btn:hover {
    background: #111827;
    border-color: #4b5563;
  }

  .theme-btn {
    margin-left: auto;
  }

  @media (max-width: 768px) {
    .toolbar {
      gap: 1rem;
    }

    .tool-group {
      gap: 0.25rem;
    }

    label {
      font-size: 0.8rem;
    }

    .slider {
      width: 80px;
    }
  }
</style>
