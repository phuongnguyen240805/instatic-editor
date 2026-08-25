import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore } from 'zustand/vanilla'
import { AgentStoreProvider } from '@admin/ai/AgentStoreContext'
import { MemoryRouter, useLocation } from '@admin/lib/routing'
import type { AgentSlice } from '@site/agent'
import { AgentPanel } from '@site/panels/AgentPanel'

const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createAgentStore(overrides: Partial<AgentSlice> = {}) {
  return createStore<AgentSlice>()((set) => ({
    isAgentOpen: true,
    isAgentStreaming: false,
    agentMessages: [],
    agentError: null,
    agentConversationId: null,
    agentActiveCredentialId: null,
    agentActiveModelId: null,
    agentConversations: [],
    openAgent: () => set({ isAgentOpen: true }),
    closeAgent: () => set({ isAgentOpen: false }),
    toggleAgent: () => set((state) => ({ isAgentOpen: !state.isAgentOpen })),
    sendAgentMessage: async () => {},
    abortAgent: () => {},
    clearAgentMessages: () => set({ agentMessages: [], agentError: null }),
    loadAgentConversations: async () => {},
    loadAgentConversation: async () => {},
    startNewAgentConversation: () => set({ agentMessages: [], agentError: null }),
    deleteAgentConversation: async () => {},
    setAgentProvider: async (credentialId, modelId) => {
      set({ agentActiveCredentialId: credentialId, agentActiveModelId: modelId, agentError: null })
    },
    loadScopeDefault: async () => {},
    ...overrides,
  }))
}

function renderAgentPanel(overrides: Partial<AgentSlice> = {}) {
  const store = createAgentStore(overrides)
  return render(
    <MemoryRouter initialEntries={['/admin/site']}>
      <AgentStoreProvider store={store}>
        <AgentPanel variant="docked" />
        <RouteProbe />
      </AgentStoreProvider>
    </MemoryRouter>,
  )
}

function RouteProbe() {
  const location = useLocation()
  return <output aria-label="current route">{location.pathname}</output>
}

describe('AgentPanel', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    globalThis.fetch = originalFetch
  })

  it('surfaces a large setup empty state and header shortcut when no credentials exist', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/admin/api/ai/credentials')) {
        return jsonResponse({ credentials: [] })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    renderAgentPanel()

    await waitFor(() => {
      expect(screen.getByText('Connect an AI provider')).toBeTruthy()
    })

    const headerButton = screen.getByTestId('agent-settings-header-button')
    expect(headerButton.tagName).toBe('BUTTON')
    expect(headerButton.textContent?.trim()).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Open AI settings' }))
    await waitFor(() => {
      expect(screen.getByLabelText('current route').textContent).toBe('/admin/ai')
    })

    expect(screen.getByText('No credentials yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Model' })).toBeNull()
  })

  it('shows the build prompt when a provider is active (default preloaded)', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/admin/api/ai/credentials')) {
        return jsonResponse({
          credentials: [{
            id: 'cred_1',
            providerId: 'openai',
            authMode: 'apiKey',
            displayLabel: 'OpenAI',
            baseUrl: null,
            keyFingerprintCurrent: true,
            createdAt: '2026-06-01T10:00:00.000Z',
            lastUsedAt: null,
          }],
        })
      }
      if (url.includes('/admin/api/ai/providers/')) {
        return jsonResponse({ models: [] })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    // Active credential + model stands in for a preloaded scope default.
    renderAgentPanel({ agentActiveCredentialId: 'cred_1', agentActiveModelId: 'gpt-4o' })

    await waitFor(() => {
      expect(screen.getByText("Describe what you want to build and I'll do it for you.")).toBeTruthy()
    })

    expect(screen.queryByText('Connect an AI provider')).toBeNull()
    expect(screen.queryByText('Choose a model to get started')).toBeNull()
    const textarea = screen.getByLabelText('Message to AI assistant') as HTMLTextAreaElement
    expect(textarea.disabled).toBe(false)
    // Settings and new-chat shortcuts are always available in the header,
    // independent of credential state.
    expect(screen.getByTestId('agent-settings-header-button')).toBeTruthy()
    expect(screen.getByTestId('agent-new-chat-header-button')).toBeTruthy()
  })

  it('prompts to choose a model when credentials exist but no default is set', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/admin/api/ai/credentials')) {
        return jsonResponse({
          credentials: [{
            id: 'cred_1',
            providerId: 'openai',
            authMode: 'apiKey',
            displayLabel: 'OpenAI',
            baseUrl: null,
            keyFingerprintCurrent: true,
            createdAt: '2026-06-01T10:00:00.000Z',
            lastUsedAt: null,
          }],
        })
      }
      if (url.includes('/admin/api/ai/providers/')) {
        return jsonResponse({ models: [] })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    // No active credential/model and no default loaded → must choose a model.
    renderAgentPanel()

    await waitFor(() => {
      expect(screen.getByText('Choose a model to get started')).toBeTruthy()
    })

    expect(screen.queryByText('Connect an AI provider')).toBeNull()
    // The composer is locked until a model is chosen, so the user can't fall
    // into the old send-time "no provider" surprise.
    const textarea = screen.getByLabelText('Message to AI assistant') as HTMLTextAreaElement
    expect(textarea.disabled).toBe(true)
    // The empty state links to AI settings to set a default.
    expect(screen.getByRole('button', { name: 'Set a default in AI settings' })).toBeTruthy()
  })

  it('preloads the scope default on open', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/admin/api/ai/credentials')) {
        return jsonResponse({ credentials: [] })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    let called = 0
    renderAgentPanel({ loadScopeDefault: async () => { called += 1 } })

    await waitFor(() => expect(called).toBeGreaterThan(0))
  })

  it('keeps the composer usable once a provider is active despite a stale no-provider error', async () => {
    // Reproduces issue #2: a prior send left a sticky "No AI provider
    // configured" error; the user then picked a model (active credential +
    // model staged). The setup lockout must NOT show — the composer is usable.
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/admin/api/ai/credentials')) {
        return jsonResponse({
          credentials: [{
            id: 'cred_1',
            providerId: 'anthropic',
            authMode: 'apiKey',
            displayLabel: 'Anthropic',
            baseUrl: null,
            keyFingerprintCurrent: true,
            createdAt: '2026-06-01T10:00:00.000Z',
            lastUsedAt: null,
          }],
        })
      }
      if (url.includes('/admin/api/ai/providers/')) {
        return jsonResponse({ models: [] })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    renderAgentPanel({
      agentActiveCredentialId: 'cred_1',
      agentActiveModelId: 'claude-sonnet-4-6',
      agentError: 'No AI provider configured for the content workspace.',
    })

    await waitFor(() => {
      expect(screen.getByText("Describe what you want to build and I'll do it for you.")).toBeTruthy()
    })

    // The setup empty state must not appear, and the composer textarea must be
    // enabled (not disabled by the stale error).
    expect(screen.queryByText('Connect an AI provider')).toBeNull()
    const textarea = screen.getByLabelText('Message to AI assistant') as HTMLTextAreaElement
    expect(textarea.disabled).toBe(false)
  })
})
