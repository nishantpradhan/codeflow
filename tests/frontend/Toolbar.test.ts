// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Toolbar from '../../src/ui/components/Toolbar.svelte'
import type { GraphViewState } from '../../shared/ui-types'

const makeState = (overrides: Partial<GraphViewState> = {}): GraphViewState => ({
  selectedNodeId: null,
  hoveredNodeId: null,
  zoom: 1,
  pan: { x: 0, y: 0 },
  lod: 'modules',
  theme: 'light',
  ...overrides
})

describe('Toolbar', () => {
  // ── Rendering ────────────────────────────────────────────────

  describe('rendering', () => {
    it('displays the current zoom percentage', () => {
      const { getByText } = render(Toolbar, { props: { state: makeState({ zoom: 0.5 }) } })
      expect(getByText(/50%/)).toBeInTheDocument()
    })

    it('caps zoom display at 100%', () => {
      const { getByText } = render(Toolbar, { props: { state: makeState({ zoom: 2 }) } })
      expect(getByText(/100%/)).toBeInTheDocument()
    })

    it('renders all three LOD buttons', () => {
      const { getByText } = render(Toolbar, { props: { state: makeState() } })
      expect(getByText('Modules')).toBeInTheDocument()
      expect(getByText('Files')).toBeInTheDocument()
      expect(getByText('Functions')).toBeInTheDocument()
    })

    it('marks the active LOD button', () => {
      const { getByText } = render(Toolbar, { props: { state: makeState({ lod: 'files' }) } })
      const filesBtn = getByText('Files')
      expect(filesBtn).toHaveClass('active')
      expect(getByText('Modules')).not.toHaveClass('active')
    })

    it('shows moon icon in light mode', () => {
      const { getByTitle } = render(Toolbar, { props: { state: makeState({ theme: 'light' }) } })
      expect(getByTitle('Dark mode')).toBeInTheDocument()
    })

    it('shows sun icon in dark mode', () => {
      const { getByTitle } = render(Toolbar, { props: { state: makeState({ theme: 'dark' }) } })
      expect(getByTitle('Light mode')).toBeInTheDocument()
    })
  })

  // ── Events ───────────────────────────────────────────────────

  describe('events', () => {
    it('dispatches resetCamera when the target button is clicked', async () => {
      const handler = vi.fn()
      const { component, getByTitle } = render(Toolbar, { props: { state: makeState() } })
      component.$on('resetCamera', handler)

      await fireEvent.click(getByTitle('Reset camera'))

      expect(handler).toHaveBeenCalledOnce()
    })

    it('dispatches lodChange with correct lod when Files is clicked', async () => {
      const handler = vi.fn()
      const { component, getByText } = render(Toolbar, { props: { state: makeState() } })
      component.$on('lodChange', handler)

      await fireEvent.click(getByText('Files'))

      expect(handler).toHaveBeenCalledOnce()
      expect(handler.mock.calls[0][0].detail).toBe('files')
    })

    it('dispatches lodChange with "functions" when Functions is clicked', async () => {
      const handler = vi.fn()
      const { component, getByText } = render(Toolbar, { props: { state: makeState() } })
      component.$on('lodChange', handler)

      await fireEvent.click(getByText('Functions'))

      expect(handler.mock.calls[0][0].detail).toBe('functions')
    })

    it('dispatches themeChange with "dark" when in light mode', async () => {
      const handler = vi.fn()
      const { component, getByTitle } = render(Toolbar, { props: { state: makeState({ theme: 'light' }) } })
      component.$on('themeChange', handler)

      await fireEvent.click(getByTitle('Dark mode'))

      expect(handler).toHaveBeenCalledOnce()
      expect(handler.mock.calls[0][0].detail).toBe('dark')
    })

    it('dispatches themeChange with "light" when in dark mode', async () => {
      const handler = vi.fn()
      const { component, getByTitle } = render(Toolbar, { props: { state: makeState({ theme: 'dark' }) } })
      component.$on('themeChange', handler)

      await fireEvent.click(getByTitle('Light mode'))

      expect(handler.mock.calls[0][0].detail).toBe('light')
    })

    it('dispatches zoomChange with numeric value when slider moves', async () => {
      const handler = vi.fn()
      const { component, getByRole } = render(Toolbar, { props: { state: makeState() } })
      component.$on('zoomChange', handler)

      const slider = getByRole('slider')
      await fireEvent.input(slider, { target: { value: '0.6' } })

      expect(handler).toHaveBeenCalledOnce()
      expect(handler.mock.calls[0][0].detail).toBe(0.6)
    })
  })

  // ── Zoom slider bounds ────────────────────────────────────────

  describe('zoom slider', () => {
    it('has min 0.1 and max 1', () => {
      const { getByRole } = render(Toolbar, { props: { state: makeState() } })
      const slider = getByRole('slider')
      expect(slider).toHaveAttribute('min', '0.1')
      expect(slider).toHaveAttribute('max', '1')
    })

    it('clamps slider value to max 1 even when zoom > 1', () => {
      const { getByRole } = render(Toolbar, { props: { state: makeState({ zoom: 1.5 }) } })
      const slider = getByRole('slider')
      expect(Number(slider.getAttribute('value'))).toBeLessThanOrEqual(1)
    })
  })
})
