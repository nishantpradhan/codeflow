<script lang="ts">
  import '../styles.css'
  import App from '../ui/App.svelte'
</script>

<svelte:head>
  <title>Codeflow</title>
</svelte:head>

<div class="layout-root">
  <App />
</div>

<style>
  .layout-root {
    height: 100%;
    width: 100%;
  }
</style>
