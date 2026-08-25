import { afterEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Tooltip } from '@ui/components/Tooltip'

afterEach(cleanup)

describe('Tooltip', () => {
  it('renders the trigger as-is without a tooltip when not hovered', () => {
    render(
      <Tooltip content="Hello tooltip">
        <button>Trigger</button>
      </Tooltip>,
    )

    // Tooltip bubble must not be in the DOM before any interaction.
    expect(screen.queryByRole('tooltip')).toBeNull()
    // The trigger itself must still render.
    expect(screen.getByRole('button', { name: 'Trigger' })).toBeDefined()
  })

  it('shows the tooltip on mouseenter and hides on mouseleave', () => {
    render(
      <Tooltip content="Tooltip content">
        <button>Trigger</button>
      </Tooltip>,
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })

    fireEvent.mouseEnter(trigger)

    const bubble = screen.getByRole('tooltip')
    expect(bubble).toBeDefined()
    expect(bubble.textContent).toContain('Tooltip content')

    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('disabled prop skips wrapping — no portal, no role=tooltip ever appears', () => {
    render(
      <Tooltip content="Never shown" disabled>
        <button>Trigger</button>
      </Tooltip>,
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })

    // No tooltip before or after hover because the Tooltip is disabled.
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('applies aria-describedby to the trigger when shown and removes it on hide', () => {
    render(
      <Tooltip content="Describe me">
        <button>Trigger</button>
      </Tooltip>,
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    expect(trigger.getAttribute('aria-describedby')).toBeNull()

    fireEvent.mouseEnter(trigger)

    const tooltipId = screen.getByRole('tooltip').id
    expect(tooltipId).toBeTruthy()
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltipId)

    fireEvent.mouseLeave(trigger)
    expect(trigger.getAttribute('aria-describedby')).toBeNull()
  })

  it('hides on Escape keydown', () => {
    render(
      <Tooltip content="Press Escape to close">
        <button>Trigger</button>
      </Tooltip>,
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })

    fireEvent.mouseEnter(trigger)
    expect(screen.getByRole('tooltip')).toBeDefined()

    // Global keydown on document.body bubbles to window where our listener lives.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
