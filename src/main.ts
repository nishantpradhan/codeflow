import './styles/global.scss'
import App from './ui/components/App.svelte'

const app = new App({
  target: document.getElementById('app')!
})

export default app
