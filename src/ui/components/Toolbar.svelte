<script lang="ts">
  import './Toolbar.scss'
  import { createEventDispatcher } from 'svelte'
  import type { GraphViewState } from '../../../shared/ui-types'

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
    <label for="zoom-level">Zoom: {Math.min(100, Math.round(state.zoom * 100))}%</label>
    <input
      id="zoom-level"
      type="range"
      min="0.1"
      max="1"
      step="0.05"
      value={Math.min(1, state.zoom)}
      on:input={e => dispatch('zoomChange', parseFloat(e.currentTarget.value))}
      class="slider"
    />
    <button class="icon-btn" on:click={resetCamera} title="Reset camera">
      🎯
    </button>
  </div>

  <div class="tool-group">
    {#each ['modules', 'files', 'functions'] as lod}
      <button
        class="lod-btn"
        class:active={state.lod === lod}
        on:click={() => changeLOD(lod)}
      >
        {lod.charAt(0).toUpperCase() + lod.slice(1)}
      </button>
    {/each}
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

