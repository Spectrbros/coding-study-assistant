// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge, Button, Field, IconButton, Input, Spinner, Switch } from '@renderer/components/ui/ui'

describe('ui primitives', () => {
  it('renders a button and disables it while loading', () => {
    render(<Button loading>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute('type')).toBe('button')
  })

  it('exposes an accessible label for icon buttons', () => {
    render(
      <IconButton label="Close">
        <span aria-hidden>×</span>
      </IconButton>
    )
    expect(screen.getByRole('button', { name: 'Close' })).not.toBeNull()
  })

  it('associates a field label with its input', () => {
    render(
      <Field label="Project name" hint="Required">
        <Input id="project-name" />
      </Field>
    )
    expect(screen.getByLabelText(/Project name/)).not.toBeNull()
    expect(screen.getByText('Required')).not.toBeNull()
  })

  it('renders badges and an accessible spinner', () => {
    render(<Badge tone="success">Done</Badge>)
    expect(screen.getByText('Done')).not.toBeNull()
    render(<Spinner />)
    expect(screen.getByRole('status')).not.toBeNull()
  })

  it('reports switch changes to the caller', () => {
    let value = false
    render(
      <Switch
        checked={false}
        label="Thinking"
        onChange={(next) => {
          value = next
        }}
      />
    )
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    checkbox.click()
    expect(value).toBe(true)
  })
})
